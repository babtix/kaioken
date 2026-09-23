import { relative, resolve } from "node:path";
import { effectiveConcurrency, parseMultiplier } from "@kaioken/model";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import {
	briefPath,
	buildBrief,
	groundingDefects,
	locate,
	planWiki,
	readBrief,
	readProvenance,
	readWikiPlan,
	readWikiState,
	type RunFailure,
	runWiki,
	summariseDefects,
	type WikiDocument,
	wikiDir,
	wikiPlanPath,
	writeBrief,
	writeProvenance,
	writeWikiDocument,
	writeWikiIndex,
	writeWikiPlan,
	writeWikiState,
} from "@kaioken/wiki";
import { ensureIndex } from "../artifacts.js";
import { refreshKnowledgeBlock } from "@kaioken/agentsmd";
import type { Flags } from "../main.js";
import { readRepoConcurrency, resolveModelClient } from "../model.js";
import { runUpdate } from "./update.js";

const WIKI_KEYWORDS = new Set(["retry", "force", "update"]);

/**
 * The wiki cascade: outline, then chapters and their subsections, each checked
 * against the structural index and shipped with its own defect report.
 *
 * `--plan` stops after the outline. That is the cheap editable checkpoint in
 * front of the expensive stage, and skipping it is how a bad decomposition
 * becomes twelve bad chapters.
 */
export async function runWikiCommand(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	// Keyword positionals: retry, force, update
	const nonKeywordArgs: string[] = [];
	for (const arg of flags.positional) {
		const lower = arg.toLowerCase();
		if (lower === "update") {
			return runUpdate(flags);
		}
		if (lower === "retry") {
			flags.retry = true;
		} else if (lower === "force") {
			flags.force = true;
		} else {
			nonKeywordArgs.push(arg);
		}
	}

	const rawMultiplier = nonKeywordArgs[0] ?? flags.multiplier;
	let multiplier = parseMultiplier(rawMultiplier);
	if (rawMultiplier !== undefined && multiplier === null) {
		process.stderr.write("kaioken wiki: multiplier must be x1..x10\n");
		return 1;
	}

	const scanResult = (await readScanArtifact(root)) ?? (await freshScan(root));
	const index = await ensureIndex(root);

	const existing = await readWikiPlan(root);

	if (flags.check) {
		if (!existing) {
			process.stderr.write("kaioken wiki --check: no wiki plan yet\n");
			return 1;
		}
		return reportPlan(root, existing, scanResult.files.map((f) => f.path), flags);
	}

	// A typo in a chapter id should not need a working API key to be caught.
	if (flags.module && existing && !existing.chapters.some((c) => c.id === flags.module)) {
		process.stderr.write(
			`kaioken wiki: no chapter with id "${flags.module}" — see ${relative(root, wikiPlanPath(root))}\n`,
		);
		return 1;
	}

	let retryDocs: string[] | undefined;

	if (flags.retry) {
		const state = await readWikiState(root);
		if (!state || state.failures.length === 0) {
			process.stdout.write("nothing to retry — the last wiki run completed\n");
			return 0;
		}

		if (multiplier === null || rawMultiplier === undefined) {
			multiplier = state.multiplier;
		}

		if (!existing) {
			process.stderr.write("kaioken wiki: cannot retry without a wiki plan\n");
			return 1;
		}

		// Resolve failed documents against the current plan.
		const validDocs: string[] = [];
		for (const failure of state.failures) {
			if (locate(existing, failure.document)) {
				validDocs.push(failure.document);
			} else {
				process.stdout.write(`  skipped ${failure.document} — no longer in the outline\n`);
			}
		}

		if (validDocs.length === 0) {
			await writeWikiState(root, { ...state, failures: [] });
			process.stdout.write("nothing to retry — no failed documents remain in the outline\n");
			return 0;
		}

		retryDocs = validDocs;
	}

	if (multiplier === null) {
		multiplier = 1;
	}

	const client = await resolveModelClient(flags);
	if (!client.ok) {
		process.stderr.write(`kaioken wiki: ${client.reason}\n`);
		return 1;
	}
	if (client.warning) process.stderr.write(`kaioken wiki: ${client.warning}\n`);

	// The outline is an editable artifact; regenerating one that a user may have
	// rewritten would discard exactly the correction this checkpoint exists for.
	let plan = existing;
	if (!plan || flags.force) {
		const proposed = await planWiki({
			scan: scanResult,
			index,
			client: client.client,
			multiplier,
		});
		plan = proposed.plan;
		const path = await writeWikiPlan(root, plan);
		process.stdout.write(`wrote ${relative(root, path)}\n`);
	} else {
		process.stdout.write(`using ${relative(root, wikiPlanPath(root))} (--force to re-outline)\n`);
	}

	if (flags.planOnly) {
		return reportPlan(root, plan, scanResult.files.map((f) => f.path), flags);
	}

	if (plan.chapters.every((c) => c.files.length === 0)) {
		process.stderr.write("kaioken wiki: the outline assigns no files to any chapter\n");
		return 1;
	}

	// Resolve the shared architecture brief.
	let brief: string | undefined;
	if (!flags.force) {
		brief = (await readBrief(root)) ?? undefined;
	}
	if (brief) {
		process.stdout.write(`using ${relative(root, briefPath(root))} (--force to regenerate)\n`);
	} else {
		try {
			brief = await buildBrief({
				scan: scanResult,
				index,
				client: client.client,
				multiplier,
				plan,
			});
			const bPath = await writeBrief(root, brief);
			process.stdout.write(`wrote ${relative(root, bPath)}\n`);
		} catch (error) {
			process.stderr.write(
				`kaioken wiki: warning: could not build architecture brief (${error instanceof Error ? error.message : String(error)})\n`,
			);
			brief = undefined;
		}
	}

	// Concurrency resolution.
	const requestedConcurrency = flags.concurrency ??
		(process.env["KAIOKEN_CONCURRENCY"] ? Number.parseInt(process.env["KAIOKEN_CONCURRENCY"], 10) : undefined) ??
		(await readRepoConcurrency(root));

	const { limit: concurrency, clamped } = effectiveConcurrency(requestedConcurrency, client.describe);
	if (clamped) {
		process.stdout.write("free-tier model — concurrency capped at 2 to avoid rate limits\n");
	}

	const written: WikiDocument[] = [];
	const onDocument = async (doc: WikiDocument) => {
		await writeWikiDocument(root, doc);
		written.push(doc);
		await persistProvenance(root, written, true);
	};

	const { documents, failures, plan: resolvedPlan } = await runWiki({
		root,
		plan,
		scan: scanResult,
		index,
		client: client.client,
		multiplier,
		brief,
		concurrency,
		...(flags.module ? { only: [flags.module] } : {}),
		...(retryDocs ? { onlyDocuments: retryDocs } : {}),
		onDocument,
		onProgress: (label, done, total) => {
			if (!flags.json) process.stdout.write(`  [${done}/${total}] ${label}\n`);
		},
	});

	// Persist run state for potential retry.
	await writeWikiState(root, {
		version: 1,
		updatedAt: new Date().toISOString(),
		model: client.describe,
		multiplier,
		failures,
	});

	if (documents.length === 0 && failures.length === 0) {
		process.stderr.write(
			flags.module
				? `kaioken wiki: no chapter with id "${flags.module}" — see ${relative(root, wikiPlanPath(root))}\n`
				: "kaioken wiki: the outline produced no writable chapter\n",
		);
		return 1;
	}

	if (documents.length > 0) {
		const isPartial = flags.module !== undefined || flags.retry || failures.length > 0;
		await persistProvenance(root, documents, isPartial);

		// Persist the sections the run actually used. Without this a later `update`
		// has to re-plan them, invents different ids, and orphans what is on disk.
		await writeWikiPlan(root, resolvedPlan);

		// Write the top-level README.md index in .kaioken/wiki/
		await writeWikiIndex(root, resolvedPlan);
	}

	return report(root, documents, failures, multiplier, flags);
}

async function freshScan(root: string) {
	const result = await scan(root);
	await writeScanArtifact(root, result);
	return result;
}

/**
 * Record what this run produced, without forgetting what it did not touch.
 *
 * A whole-wiki clean run legitimately replaces the index.
 * A partial run (scoped by module, retry, or with failures) merges with the existing index.
 */
export async function persistProvenance(
	root: string,
	documents: WikiDocument[],
	partial: boolean,
): Promise<void> {
	const fresh = documents.map((doc) => doc.provenance);

	if (!partial) {
		await writeProvenance(root, fresh);
		return;
	}

	const written = new Set(fresh.map((record) => record.document));
	const previous = (await readProvenance(root))?.documents ?? [];

	await writeProvenance(root, [
		...previous.filter((record) => !written.has(record.document)),
		...fresh,
	]);
}

function reportPlan(root: string, plan: ReturnType<typeof Object>, known: string[], flags: Flags): number {
	const outline = plan as { chapters: { id: string; title: string; goal: string; files: string[] }[] };
	const knownSet = new Set(known);

	if (flags.json) {
		process.stdout.write(`${JSON.stringify(outline, null, 2)}\n`);
		return 0;
	}

	const out: string[] = [`${outline.chapters.length} chapters`, ""];
	let bad = 0;

	for (const chapter of outline.chapters) {
		const unknown = chapter.files.filter((f) => !knownSet.has(f));
		bad += unknown.length;
		out.push(`  ${chapter.id.padEnd(24)} ${chapter.files.length} files — ${chapter.title}`);
		if (!chapter.goal) out.push("      (no goal stated)");
		for (const path of unknown.slice(0, 5)) out.push(`      no such file: ${path}`);
	}

	out.push("");
	out.push(
		bad === 0
			? `outline is valid — edit ${relative(root, wikiPlanPath(root))}, then run \`kaioken wiki\``
			: `${bad} chapter files do not exist — fix the outline before generating`,
	);

	process.stdout.write(`${out.join("\n")}\n`);
	return bad === 0 ? 0 : 1;
}

async function report(
	root: string,
	documents: WikiDocument[],
	failures: RunFailure[],
	multiplier: number,
	flags: Flags,
): Promise<number> {
	const totalGrounding = documents.reduce(
		(n, d) => n + groundingDefects(d.verification.defects).length,
		0,
	);
	// New chapters change what an agent reads before editing. The refresh is
	// free, and a no-op in a repository with no AGENTS.md.
	const refreshed = documents.length > 0 ? await refreshKnowledgeBlock(root) : false;

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					complete: failures.length === 0 && totalGrounding === 0,
					documents: documents.map((d) => ({
						path: d.path,
						title: d.title,
						verification: d.verification,
						provenance: d.provenance,
					})),
					failures,
					refreshedAgents: refreshed,
				},
				null,
				2,
			)}\n`,
		);
		return totalGrounding > 0 || failures.length > 0 ? 1 : 0;
	}

	const out: string[] = ["", `wrote ${documents.length} documents to ${relative(root, wikiDir(root))}`, ""];

	for (const doc of documents) {
		const grounding = groundingDefects(doc.verification.defects);
		const flag = grounding.length > 0 ? "!" : " ";
		out.push(
			`${flag} ${doc.path.padEnd(38)} ${doc.verification.grounded} grounded, ${grounding.length} unverifiable, ${Math.round(doc.verification.coverage * 100)}% coverage`,
		);
		// Unverifiable claims are named, not counted away: a confidently wrong
		// document is worse than a missing one.
		for (const defect of grounding.slice(0, 4)) {
			out.push(`      ${defect.kind}: ${defect.claim}`);
		}
	}

	if (failures.length > 0) {
		out.push("", `${failures.length} document${failures.length === 1 ? "" : "s"} failed during generation:`);
		for (const f of failures) {
			out.push(`  ! ${f.document} (${f.reason})`);
		}
		out.push("  run `kaioken wiki retry` to regenerate only the failed documents");
	}

	const kinds = summariseDefects(documents.flatMap((d) => d.verification.defects));
	out.push("", `defects by kind: ${JSON.stringify(kinds)}`);
	if (totalGrounding === 0) {
		out.push("every claim checks out against the structural index");
	} else {
		out.push(
			`${totalGrounding} claims could not be grounded — raise the multiplier to buy correction passes`,
		);
	}
	if (refreshed) out.push("", "refreshed the generated section of AGENTS.md");

	process.stdout.write(`${out.join("\n")}\n`);
	return totalGrounding > 0 || failures.length > 0 ? 1 : 0;
}
