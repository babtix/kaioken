import { relative, resolve } from "node:path";
import { parseMultiplier } from "@kaioken/model";
import { readScanArtifact, scan, writeScanArtifact } from "@kaioken/scan";
import {
	groundingDefects,
	planWiki,
	readProvenance,
	readWikiPlan,
	runWiki,
	summariseDefects,
	type WikiDocument,
	wikiDir,
	wikiPlanPath,
	writeProvenance,
	writeWikiDocument,
	writeWikiPlan,
} from "@kaioken/wiki";
import { ensureIndex } from "../artifacts.js";
import { refreshKnowledgeBlock } from "@kaioken/agentsmd";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";

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

	const multiplier = parseMultiplier(flags.positional[0] ?? flags.multiplier);
	if (multiplier === null) {
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

	const { documents, plan: resolvedPlan } = await runWiki({
		root,
		plan,
		scan: scanResult,
		index,
		client: client.client,
		multiplier,
		...(flags.module ? { only: [flags.module] } : {}),
		onProgress: (label, done, total) => {
			if (!flags.json) process.stdout.write(`  [${done + 1}/${total}] ${label}\n`);
		},
	});

	if (documents.length === 0) {
		// Reporting "every claim checks out" over an empty run would be a true
		// statement that misleads completely.
		process.stderr.write(
			flags.module
				? `kaioken wiki: no chapter with id "${flags.module}" — see ${relative(root, wikiPlanPath(root))}\n`
				: "kaioken wiki: the outline produced no writable chapter\n",
		);
		return 1;
	}

	for (const doc of documents) await writeWikiDocument(root, doc);
	await persistProvenance(root, documents, flags.module !== undefined);

	// Persist the sections the run actually used. Without this a later `update`
	// has to re-plan them, invents different ids, and orphans what is on disk.
	await writeWikiPlan(root, resolvedPlan);

	return report(root, documents, flags);
}

async function freshScan(root: string) {
	const result = await scan(root);
	await writeScanArtifact(root, result);
	return result;
}

/**
 * Record what this run produced, without forgetting what it did not touch.
 *
 * A whole-wiki run legitimately replaces the index: a `--force` re-outline
 * supersedes documents that no longer belong to any chapter, and dropping their
 * records is how they come to be reported as undocumented rather than as
 * knowledge the engine still stands behind.
 *
 * A `--module` run is the opposite case, and overwriting there was a silent
 * data loss: one chapter regenerates, and every *other* chapter's record
 * disappears with it. Nothing errors — the documents are still on disk — but
 * `status` can no longer say anything about them (they become `unknown`
 * freshness, having no recorded sources), `update` can no longer regenerate
 * them, and they vanish from the graph and any export. `update` has always
 * merged for exactly this reason.
 */
export async function persistProvenance(
	root: string,
	documents: WikiDocument[],
	scoped: boolean,
): Promise<void> {
	const fresh = documents.map((doc) => doc.provenance);

	if (!scoped) {
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

async function report(root: string, documents: WikiDocument[], flags: Flags): Promise<number> {
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
					documents: documents.map((d) => ({
						path: d.path,
						title: d.title,
						verification: d.verification,
						provenance: d.provenance,
					})),
					refreshedAgents: refreshed,
				},
				null,
				2,
			)}\n`,
		);
		return totalGrounding > 0 ? 1 : 0;
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

	const kinds = summariseDefects(documents.flatMap((d) => d.verification.defects));
	out.push("", `defects by kind: ${JSON.stringify(kinds)}`);
	out.push(
		totalGrounding === 0
			? "every claim checks out against the structural index"
			: `${totalGrounding} claims could not be grounded — raise the multiplier to buy correction passes`,
	);
	if (refreshed) out.push("", "refreshed the generated section of AGENTS.md");

	process.stdout.write(`${out.join("\n")}\n`);
	return totalGrounding > 0 ? 1 : 0;
}
