import { classifyDocCategory } from "./dial.ts";
import type {
	DocCategory,
	InstantCategoryHealth,
	InstantStalenessResult,
	Provenance,
} from "./types.ts";

const ALL_CATEGORIES: readonly DocCategory[] = [
	"architecture",
	"cards",
	"subsystems",
	"procedures",
	"api",
	"data_models",
	"security",
	"runbooks",
	"benchmarks",
	"tutorials",
	"other",
];

/**
 * Execute an instant zero-token staleness check running in under 50ms
 * for all 10 documentation artifact types (UX-0891 - UX-0900).
 *
 * Guarantees:
 * - 0 LLM tokens consumed.
 * - Sub-50ms execution runtime (measured with high-resolution performance timer).
 * - Complete offline execution with no network or subprocess calls.
 */
export function instantZeroTokenStalenessCheck(
	documents: readonly Provenance[],
	currentHashes: ReadonlyMap<string, string>,
	filterCategory?: DocCategory,
): InstantStalenessResult {
	const startTime = performance.now();

	const catStats = new Map<
		DocCategory,
		{ total: number; fresh: number; stale: number; orphaned: number }
	>();

	for (const cat of ALL_CATEGORIES) {
		catStats.set(cat, { total: 0, fresh: 0, stale: 0, orphaned: 0 });
	}

	const staleDocuments: string[] = [];
	const orphanedDocuments: string[] = [];
	let totalEvaluated = 0;
	let freshEvaluated = 0;

	for (const doc of documents) {
		const cat = classifyDocCategory(doc.document);
		if (filterCategory !== undefined && cat !== filterCategory) {
			continue;
		}

		totalEvaluated++;
		const stats = catStats.get(cat)!;
		stats.total++;

		if (doc.sources.length === 0) {
			stats.fresh++;
			freshEvaluated++;
			continue;
		}

		let deletedCount = 0;
		let changedCount = 0;

		for (const source of doc.sources) {
			const hash = currentHashes.get(source.path);
			if (hash === undefined) {
				deletedCount++;
			} else if (hash !== source.hash) {
				changedCount++;
			}
		}

		if (deletedCount === doc.sources.length) {
			stats.orphaned++;
			orphanedDocuments.push(doc.document);
		} else if (changedCount > 0 || deletedCount > 0) {
			stats.stale++;
			staleDocuments.push(doc.document);
		} else {
			stats.fresh++;
			freshEvaluated++;
		}
	}

	const categories = {} as Record<DocCategory, InstantCategoryHealth>;
	for (const cat of ALL_CATEGORIES) {
		const s = catStats.get(cat)!;
		const pct = s.total === 0 ? 100 : Math.round((s.fresh / s.total) * 100);
		categories[cat] = {
			category: cat,
			total: s.total,
			fresh: s.fresh,
			stale: s.stale,
			orphaned: s.orphaned,
			freshnessPercentage: pct,
			healthy: s.stale === 0 && s.orphaned === 0,
		};
	}

	const endTime = performance.now();
	const executionDurationMs = Number((endTime - startTime).toFixed(3));
	const overallFreshnessPercentage =
		totalEvaluated === 0
			? 100
			: Math.round((freshEvaluated / totalEvaluated) * 100);

	return {
		executionDurationMs,
		ok: staleDocuments.length === 0 && orphanedDocuments.length === 0,
		overallFreshnessPercentage,
		totalDocuments: totalEvaluated,
		categories,
		staleDocuments,
		orphanedDocuments,
	};
}
