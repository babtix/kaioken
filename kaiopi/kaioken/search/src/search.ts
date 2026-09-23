import { formatRankExplanation, visualizeRrfScores } from "./explain.ts";
import { SearchIndex, type SearchHit } from "./index-store.ts";
import { createLiveSearchPreview, formatLivePreviewCard } from "./preview.ts";

export interface Bm25SearchOptions {
	readonly limit?: number;
	readonly preview?: boolean;
	readonly explain?: boolean;
	readonly boost?: Record<string, number>;
	readonly json?: boolean;
}

export async function bm25Search(
	root: string,
	query: string,
	optionsOrLimit: number | Bm25SearchOptions = 8,
): Promise<string> {
	const options: Bm25SearchOptions =
		typeof optionsOrLimit === "number"
			? { limit: optionsOrLimit }
			: optionsOrLimit;

	const limit = options.limit ?? 8;

	try {
		const searchIndex = await SearchIndex.open(root);

		// Live preview mode
		if (options.preview) {
			const summary = await createLiveSearchPreview(searchIndex, query, { limit });
			if (options.json) {
				return JSON.stringify(summary, null, 2);
			}
			return formatLivePreviewCard(summary);
		}

		// Standard or explainable search
		const hits: SearchHit[] = await searchIndex.search({
			text: query,
			limit,
			explain: Boolean(options.explain),
			pathBoost: options.boost ? { customBoosts: options.boost } : undefined,
		});

		if (hits.length === 0) {
			return `No matches found for "${query}".`;
		}

		if (options.explain) {
			if (options.json) {
				return JSON.stringify(
					hits.map((h) => ({
						score: Math.round(h.score * 10000) / 10000,
						kind: h.kind,
						path: h.path,
						heading: h.heading,
						line: h.line,
						snippet: h.snippet,
						explanation: h.explanation,
					})),
					null,
					2,
				);
			}

			const explanations = hits
				.map((h) => h.explanation)
				.filter((e): e is NonNullable<typeof e> => Boolean(e));

			const visualTable = visualizeRrfScores(explanations);
			const detailedCards = explanations.map((e) => formatRankExplanation(e)).join("\n\n");
			return `${visualTable}\n\n${detailedCards}`;
		}

		return JSON.stringify(
			hits.map((h) => ({
				score: Math.round(h.score * 1000) / 1000,
				kind: h.kind,
				path: h.path,
				heading: h.heading,
				snippet: h.snippet,
			})),
			null,
			2,
		);
	} catch {
		return `No search index available or search error for "${query}".`;
	}
}
