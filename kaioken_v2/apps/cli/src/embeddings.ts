import type { EmbeddingProvider } from "@kaioken/search";

/**
 * The semantic leg, when there is one.
 *
 * The prism and search packages define the port and stay free of every
 * dependency the semantic half has; this file is the only place that knows an
 * actual endpoint exists, the same inversion `model.ts` performs for chat. Any
 * OpenAI-compatible embeddings API works — OpenAI's own, or anything local
 * behind a compatible base URL.
 *
 * Absence is a normal state, not an error: `null` means "lexical only", which
 * every caller already handles as a first-class outcome.
 */

const DEFAULT_MODEL = "text-embedding-3-small";
/** Embeddings are priced per call; one round trip per this many texts. */
const BATCH = 64;

export interface ResolvedEmbeddings {
	provider: EmbeddingProvider;
	/** What to call it in output, e.g. "openai-compatible embeddings (text-embedding-3-small)". */
	describe: string;
}

export function resolveEmbeddings(): ResolvedEmbeddings | null {
	const key = process.env["OPENAI_API_KEY"];
	if (!key) return null;

	const model = process.env["OPENAI_EMBEDDINGS_MODEL"] ?? DEFAULT_MODEL;
	const baseUrl = (process.env["OPENAI_BASE_URL"] ?? "https://api.openai.com/v1").replace(/\/+$/, "");

	return {
		describe: `openai-compatible embeddings (${model})`,
		provider: {
			async embed(texts: string[]): Promise<number[][]> {
				const out: number[][] = [];
				for (let i = 0; i < texts.length; i += BATCH) {
					const slice = texts.slice(i, i + BATCH);
					const response = await fetch(`${baseUrl}/embeddings`, {
						method: "POST",
						headers: {
							"content-type": "application/json",
							authorization: `Bearer ${key}`,
						},
						body: JSON.stringify({ model, input: slice }),
					});
					if (!response.ok) {
						throw new Error(`the embeddings endpoint returned ${response.status}`);
					}
					const parsed = (await response.json()) as {
						data?: Array<{ index?: number; embedding?: number[] }>;
					};
					const rows = parsed.data ?? [];
					if (rows.length !== slice.length) {
						throw new Error("the embeddings endpoint returned a mismatched batch");
					}
					// Row n must answer text n, whatever order the endpoint chose.
					const ordered = [...rows].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
					for (const row of ordered) {
						if (!row.embedding || row.embedding.length === 0) {
							throw new Error("the embeddings endpoint returned an empty vector");
						}
						out.push(row.embedding);
					}
				}
				return out;
			},
		},
	};
}
