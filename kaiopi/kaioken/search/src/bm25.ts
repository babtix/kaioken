/**
 * BM25 and rank fusion. This layer never imports a model client, a network
 * transport or a credential store — that is the property that lets search work
 * in a fresh clone, offline, with no API access whatsoever.
 */

/** K1 controls how fast term frequency saturates; B how hard length normalisation bites. */
export const K1 = 1.2;
export const B = 0.75;

export { CompactPostingsList, OptimizedLexicon, SearchSessionCache } from "./postings.ts";
export type { BM25Parameters, PostingEntry, PostingsStats } from "./postings.ts";

export interface Ranked {
	id: number;
	score: number;
}

export interface Posting {
	docId: number;
	tf: number;
}

/** The collection statistics and inverted index BM25 needs, computed once per index build. */
export class Lexicon {
	private readonly postingsMap = new Map<string, Posting[]>();
	private readonly docNorms: number[];
	private readonly avgLen: number;
	private readonly n: number;

	/**
	 * Documents are identified by position, so the caller keeps whatever record
	 * type it likes and passes only the analysed form.
	 */
	constructor(documents: readonly (readonly string[])[]) {
		this.n = documents.length;
		this.docNorms = new Array(this.n);
		let total = 0;

		for (let docId = 0; docId < this.n; docId++) {
			const tokens = documents[docId] as readonly string[];
			total += tokens.length;

			const tf = new Map<string, number>();
			for (const token of tokens) {
				tf.set(token, (tf.get(token) ?? 0) + 1);
			}

			for (const [term, freq] of tf) {
				let list = this.postingsMap.get(term);
				if (!list) {
					list = [];
					this.postingsMap.set(term, list);
				}
				list.push({ docId, tf: freq });
			}
		}

		this.avgLen = this.n === 0 ? 0 : total / this.n;

		for (let docId = 0; docId < this.n; docId++) {
			const len = (documents[docId] as readonly string[]).length;
			this.docNorms[docId] =
				this.avgLen === 0 ? 0 : K1 * (1 - B + (B * len) / this.avgLen);
		}
	}

	get documentCount(): number {
		return this.n;
	}

	get averageLength(): number {
		return this.avgLen;
	}

	postings(term: string): readonly Posting[] {
		return this.postingsMap.get(term) ?? [];
	}

	/** Probabilistic IDF, floored at zero so a term in every document cannot subtract. */
	idf(term: string): number {
		const df = this.postingsMap.get(term)?.length ?? 0;
		if (df === 0) return 0;
		return Math.max(0, Math.log(1 + (this.n - df + 0.5) / (df + 0.5)));
	}

	/**
	 * Score query terms against all documents using the inverted index.
	 * Only documents containing at least one query term are scored.
	 */
	score(queryTerms: readonly string[]): Map<number, number> {
		const scores = new Map<number, number>();
		if (this.avgLen === 0) return scores;

		for (const term of queryTerms) {
			const list = this.postingsMap.get(term);
			if (!list) continue;

			const idf = this.idf(term);
			if (idf <= 0) continue;

			for (const { docId, tf } of list) {
				const norm = this.docNorms[docId] as number;
				const termScore = idf * ((tf * (K1 + 1)) / (tf + norm));
				scores.set(docId, (scores.get(docId) ?? 0) + termScore);
			}
		}

		return scores;
	}
}

/**
 * A small bonus when the query appears as a contiguous phrase. BM25 is a
 * bag of words and cannot tell "context window" from a passage that happens to
 * mention both words far apart.
 */
export function phraseBonus(query: string, haystack: string): number {
	const needle = query.trim().toLowerCase();
	if (needle.length < 4 || !needle.includes(" ")) return 0;
	return haystack.toLowerCase().includes(needle) ? 1 : 0;
}

/**
 * Damps the contribution of low ranks in reciprocal-rank fusion. 60 is the
 * value from the original paper and behaves well without tuning.
 */
export const RRF_K = 60;

/**
 * Fuse any number of ranked lists: score = Σ 1/(k + rank) over every list an id
 * appears in.
 *
 * Fusion is over *ranks*, not scores, which is the point: BM25 scores and cosine
 * similarities are not on a comparable scale, and normalising them against each
 * other would invent a relationship that does not exist.
 */
export function rrf(lists: readonly (readonly Ranked[])[], limit: number): Ranked[] {
	const combined = new Map<number, number>();

	for (const list of lists) {
		for (let rank = 0; rank < list.length; rank++) {
			const entry = list[rank] as Ranked;
			combined.set(entry.id, (combined.get(entry.id) ?? 0) + 1 / (RRF_K + rank + 1));
		}
	}

	return topN(
		[...combined].map(([id, score]) => ({ id, score })),
		limit,
	);
}

/** Sort by score descending, ties broken by id so results are deterministic. */
export function topN(entries: Ranked[], limit: number): Ranked[] {
	entries.sort((a, b) => b.score - a.score || a.id - b.id);
	return limit > 0 ? entries.slice(0, limit) : entries;
}

export function cosine(a: readonly number[], b: readonly number[]): number {
	if (a.length !== b.length || a.length === 0) return 0;
	let dot = 0;
	let na = 0;
	let nb = 0;
	for (let i = 0; i < a.length; i++) {
		const x = a[i] as number;
		const y = b[i] as number;
		dot += x * y;
		na += x * x;
		nb += y * y;
	}
	if (na === 0 || nb === 0) return 0;
	return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
