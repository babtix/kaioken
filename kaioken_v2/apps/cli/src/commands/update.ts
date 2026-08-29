import { resolve } from "node:path";
import { parseMultiplier } from "@kaioken/model";
import { findModule, generateCards, readCards, readModulePlan, writeCard } from "@kaioken/plan";
import { computeStaleness, type DocumentStatus } from "@kaioken/provenance";
import { scan, writeScanArtifact } from "@kaioken/scan";
import { type IndexResult, SymbolOracle } from "@kaioken/index";
import {
	type Chapter,
	generateDocument,
	readProvenance,
	readWikiPlan,
	type Section,
	sourceReader,
	writeProvenance,
	writeWikiDocument,
} from "@kaioken/wiki";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";
import { resolveModelClient } from "../model.js";
import { gatherProvenance } from "./status.js";

/**
 * Regenerate only what a change actually invalidated.
 *
 * The decision of *what* to regenerate is entirely deterministic — recorded
 * hashes against a fresh scan — and runs before any model is contacted. Only
 * then is the model asked to rewrite the specific documents that moved.
 *
 * This is the payoff for having built provenance as machinery rather than as a
 * prose "referenced files" footer: the set is computed, not guessed at.
 */
export async function runUpdate(flags: Flags): Promise<number> {
	const root = resolve(flags.root);

	const multiplier = parseMultiplier(flags.positional[0] ?? flags.multiplier);
	if (multiplier === null) {
		process.stderr.write("kaioken update: multiplier must be x1..x10\n");
		return 1;
	}

	const scanResult = await scan(root);
	await writeScanArtifact(root, scanResult);

	const records = await gatherProvenance(root);
	if (records.length === 0) {
		process.stderr.write("kaioken update: nothing generated yet\n");
		return 1;
	}

	const report = computeStaleness(records, scanResult);
	const affected = [...report.stale, ...report.orphaned];

	if (affected.length === 0) {
		process.stdout.write("everything is current — nothing to regenerate\n");
		return 0;
	}

	// The deterministic half is complete and reportable before a single token is
	// spent, so `--dry-run` is a real answer rather than a guess.
	if (flags.dryRun) {
		return reportPlanned(affected, flags);
	}

	const client = await resolveModelClient(flags);
	if (!client.ok) {
		process.stderr.write(`kaioken update: ${client.reason}\n`);
		return 1;
	}
	if (client.warning) process.stderr.write(`kaioken update: ${client.warning}\n`);

	const index = await ensureIndex(root);
	const staleCards = affected
		.filter((entry) => entry.document.startsWith("card:"))
		.map((entry) => entry.document.slice("card:".length));
	const staleDocs = affected.filter((entry) => !entry.document.startsWith("card:"));

	const out: string[] = [];
	let regenerated = 0;

	if (staleCards.length > 0) {
		const plan = await readModulePlan(root);
		if (plan) {
			// Only modules that still exist in the plan: a card whose module the
			// user deleted should not be resurrected.
			const live = staleCards.filter((id) => findModule(plan, id) !== null);
			const dropped = staleCards.filter((id) => findModule(plan, id) === null);
			for (const id of dropped) out.push(`  skipped card:${id} — no longer in the module plan`);

			if (live.length > 0) {
				const knownFiles = new Map(
					scanResult.files.filter((f) => !f.binary).map((f) => [f.path, f.hash] as const),
				);
				const results = await generateCards(plan, index, client.client, {
					multiplier,
					only: live,
					knownFiles,
					onProgress: (moduleId, done, total) => {
						process.stdout.write(`  [card ${done + 1}/${total}] ${moduleId}\n`);
					},
				});
				for (const result of results) {
					await writeCard(root, result.card);
					out.push(`  regenerated card:${result.card.moduleId}`);
					regenerated++;
				}
			}
		}
	}

	if (staleDocs.length > 0) {
		const plan = await readWikiPlan(root);
		if (!plan) {
			out.push("  skipped the wiki — no outline on disk");
		} else {
			const oracle = new SymbolOracle(index ?? emptyIndex());
			const readSource = sourceReader(root);
			const regeneratedDocs = [];

			// One document at a time, not one chapter at a time. Regenerating a
			// whole chapter because one subsection aged would spend tokens on
			// documents that are still correct, and re-planning the sections
			// would invent new ids that orphan the files already on disk.
			for (const entry of staleDocs) {
				const target = locate(plan, entry.document);
				if (!target) {
					out.push(`  skipped ${entry.document} — no longer in the outline`);
					continue;
				}

				process.stdout.write(`  [wiki ${regeneratedDocs.length + 1}/${staleDocs.length}] ${entry.document}\n`);
				const doc = await generateDocument({
					plan,
					chapter: target.chapter,
					...(target.section ? { section: target.section } : {}),
					index,
					oracle,
					client: client.client,
					multiplier,
					scanFiles: scanResult.files,
					readSource,
				});

				await writeWikiDocument(root, doc);
				regeneratedDocs.push(doc);
				out.push(`  regenerated ${doc.path}`);
				regenerated++;
			}

			// Documents that were still current keep their existing records, so
			// provenance never loses track of what it already knows.
			const existing = (await readProvenance(root))?.documents ?? [];
			const fresh = new Map(regeneratedDocs.map((d) => [d.path, d.provenance]));
			await writeProvenance(root, [
				...existing.filter((record) => !fresh.has(record.document)),
				...fresh.values(),
			]);
		}
	}

	const plural = affected.length === 1 ? "" : "s";
	process.stdout.write(
		`${out.join("\n")}\n\nregenerated ${regenerated} of ${affected.length} stale document${plural}\n`,
	);
	return 0;
}

function reportPlanned(affected: DocumentStatus[], flags: Flags): number {
	if (flags.json) {
		process.stdout.write(`${JSON.stringify({ wouldRegenerate: affected }, null, 2)}\n`);
		return 0;
	}

	const out = [`${affected.length} documents would be regenerated`, ""];
	for (const entry of affected) {
		out.push(`  ${entry.document}`);
		for (const path of entry.changed.slice(0, 3)) out.push(`      changed: ${path}`);
		for (const path of entry.deleted.slice(0, 3)) out.push(`      deleted: ${path}`);
	}
	out.push("", "no model was called");
	process.stdout.write(`${out.join("\n")}\n`);
	return 0;
}

/**
 * Resolve a document path back to the chapter — and, for a subsection, the
 * section — that produced it.
 *
 * Sections are persisted into the outline after a run precisely so this lookup
 * is possible. Re-planning them here would invent different ids and leave the
 * documents already on disk describing the same ground under other names.
 */
function locate(
	plan: { chapters: Chapter[] },
	document: string,
): { chapter: Chapter; section?: Section } | null {
	const slash = document.indexOf("/");
	if (slash === -1) return null;

	const chapterId = document.slice(0, slash);
	const leaf = document.slice(slash + 1).replace(/\.md$/, "");
	const chapter = plan.chapters.find((c) => c.id === chapterId);
	if (!chapter) return null;

	if (leaf === "index") return { chapter };
	const section = chapter.sections?.find((s) => s.id === leaf);
	return section ? { chapter, section } : null;
}

function emptyIndex(): IndexResult {
	return { root: "", builtAt: "", fileCount: 0, symbolCount: 0, unparsedLanguages: {}, files: [] };
}
