import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { analyze } from "./analyze.ts";
import { cosine, Lexicon, phraseBonus, type Ranked, rrf, topN } from "./bm25.ts";
import { applyPathBoost, calculatePhraseQuoteBonus, parseQueryQuotes, type PathBoostConfig } from "./boost.ts";
import { type Chunk, collect, type Corpus, type Doc, type Kind } from "./corpus.ts";
import { buildScoreExplanation, type ScoreExplanation, type TermScoreContribution } from "./explain.ts";
import { OptimizedLexicon, SearchSessionCache } from "./postings.ts";

export const SEARCH_DIR = join(KAIOKEN_DIR, "search-index");

export function searchIndexPath(root: string): string {
	return join(resolve(root), SEARCH_DIR, "index.json");
}

/** The persisted form. Tokens are recomputed on load — they would triple the file. */
export interface PersistedIndex {
	version: 1;
	builtAt: string;
	fingerprint: string;
	docs: Doc[];
	chunks: Chunk[];
	/** Parallel to `chunks`. Absent unless an embedding provider ran. */
	vectors?: (number[] | null)[];
}

export interface SearchQuery {
	text: string;
	limit?: number;
	/** Restrict to one or more tenants. */
	kinds?: Kind[];
	section?: string;
	/** Directory and file path boosting options. */
	pathBoost?: PathBoostConfig;
	/** Additional explicit exact phrase quotes. */
	exactQuotes?: string[];
	/** Generate detailed RRF and BM25 score explanation. */
	explain?: boolean;
	/** Use zero-disk session query cache (default: true). */
	useCache?: boolean;
}

export interface SearchHit {
	score: number;
	kind: Kind;
	path: string;
	section: string;
	title: string;
	heading: string;
	line: number;
	snippet: string;
	/** Which rankings contributed. Makes it visible when semantic ranking is off. */
	via: ("lexical" | "semantic")[];
	/** Optional transparent score explanation. */
	explanation?: ScoreExplanation;
}

/**
 * Supplied by a higher layer when one is configured. The index never constructs
 * one and never imports a client to make one — that inversion is what keeps the
 * lexical layer free of every dependency the semantic layer has.
 */
export interface EmbeddingProvider {
	embed(texts: string[]): Promise<number[][]>;
}

export class SearchIndex {
	private readonly lexicon: Lexicon;
	private readonly optimizedLexicon: OptimizedLexicon;
	private readonly sessionCache = new SearchSessionCache<SearchHit[]>(256, 120_000);
	private readonly data: PersistedIndex;

	private constructor(data: PersistedIndex) {
		this.data = data;
		const tokens = data.chunks.map((chunk) => analyze(`${chunk.heading}\n${chunk.text}`));
		this.lexicon = new Lexicon(tokens);
		this.optimizedLexicon = new OptimizedLexicon(tokens);
	}

	static async build(
		root: string,
		provider?: EmbeddingProvider,
		corpus?: Corpus,
	): Promise<SearchIndex> {
		const resolvedCorpus = corpus ?? (await collect(root));
		const data: PersistedIndex = {
			version: 1,
			builtAt: new Date().toISOString(),
			fingerprint: resolvedCorpus.fingerprint,
			docs: resolvedCorpus.docs,
			chunks: resolvedCorpus.chunks,
		};

		const index = new SearchIndex(data);
		if (provider) await index.embedAll(provider);
		return index;
	}

	/**
	 * Load from disk, rebuilding when the corpus has moved. Returning a stale
	 * index silently would make search quietly wrong, which is worse than slow.
	 */
	static async open(root: string, options: { force?: boolean } = {}): Promise<SearchIndex> {
		let collected: Corpus | undefined;
		if (!options.force) {
			const existing = await SearchIndex.load(root);
			if (existing) {
				collected = await collect(root);
				if (collected.fingerprint === existing.fingerprint) return existing;
			}
		}
		const built = await SearchIndex.build(root, undefined, collected);
		await built.save(root);
		return built;
	}

	static async load(root: string): Promise<SearchIndex | null> {
		try {
			const data = JSON.parse(await readFile(searchIndexPath(root), "utf8")) as PersistedIndex;
			if (data.version !== 1) return null;
			return new SearchIndex(data);
		} catch {
			return null;
		}
	}

	async save(root: string): Promise<string> {
		const path = searchIndexPath(root);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, `${JSON.stringify(this.data, null, 2)}\n`, "utf8");
		return path;
	}

	get fingerprint(): string {
		return this.data.fingerprint;
	}

	get docCount(): number {
		return this.data.docs.length;
	}

	get chunkCount(): number {
		return this.data.chunks.length;
	}

	/** True when vectors are present, so callers can report honestly what ran. */
	get semantic(): boolean {
		return (this.data.vectors ?? []).some((v) => v !== null && v !== undefined);
	}

	kinds(): Record<string, number> {
		const out: Record<string, number> = {};
		for (const doc of this.data.docs) out[doc.kind] = (out[doc.kind] ?? 0) + 1;
		return out;
	}

	getLexicon(): Lexicon {
		return this.lexicon;
	}

	getOptimizedLexicon(): OptimizedLexicon {
		return this.optimizedLexicon;
	}

	getSessionCache(): SearchSessionCache<SearchHit[]> {
		return this.sessionCache;
	}

	getChunks(): readonly Chunk[] {
		return this.data.chunks;
	}

	getDocs(): readonly Doc[] {
		return this.data.docs;
	}

	/**
	 * Rank a query with BM25, exact phrase quote bonuses, directory boosting,
	 * session caching, and optional RRF hybrid rank fusion.
	 */
	async search(query: SearchQuery, provider?: EmbeddingProvider): Promise<SearchHit[]> {
		const limit = query.limit ?? 10;
		const useCache = query.useCache !== false && !provider;
		const cacheKey = JSON.stringify({
			t: query.text,
			l: limit,
			k: query.kinds,
			s: query.section,
			b: query.pathBoost,
			q: query.exactQuotes,
			e: query.explain,
		});

		if (useCache) {
			const cached = this.sessionCache.get(cacheKey);
			if (cached) return cached;
		}

		const parsedQuery = parseQueryQuotes(query.text);
		const allQuotes = [...parsedQuery.exactQuotes, ...(query.exactQuotes ?? [])];
		const terms = analyze(parsedQuery.cleanText.length > 0 ? parsedQuery.cleanText : query.text);
		const candidates = this.filter(query);

		let lexical: Ranked[] = [];
		const lexicalRawScores = new Map<number, number>();
		const lexicalQuoteBonuses = new Map<number, { bonus: number; matched: string[] }>();
		const lexicalPathBoosts = new Map<number, { multiplier: number; reason: string }>();

		if (terms.length > 0) {
			const candidateSet =
				candidates.length === this.data.chunks.length ? null : new Set(candidates);
			const bm25Scores = this.optimizedLexicon.score(terms);
			const entries: Ranked[] = [];

			for (const [id, bm25Score] of bm25Scores) {
				if (candidateSet && !candidateSet.has(id)) continue;
				const chunk = this.data.chunks[id] as Chunk;
				const doc = this.data.docs[chunk.doc] as Doc;

				// Contiguous phrase bonus (single query & multi-word quotes)
				const basePhrase = phraseBonus(query.text, chunk.text);
				const quoteResult = calculatePhraseQuoteBonus(allQuotes, chunk.text);
				const totalQuoteBonus = basePhrase + quoteResult.bonus;

				// Directory and file-path boosting
				const pathBoostResult = applyPathBoost(doc.path, bm25Score + totalQuoteBonus, query.pathBoost);

				lexicalRawScores.set(id, bm25Score);
				lexicalQuoteBonuses.set(id, {
					bonus: totalQuoteBonus,
					matched: quoteResult.matchedQuotes,
				});
				lexicalPathBoosts.set(id, {
					multiplier: pathBoostResult.multiplier,
					reason: pathBoostResult.reason,
				});

				const finalScore = pathBoostResult.boostedScore;
				if (finalScore > 0) {
					entries.push({ id, score: finalScore });
				}
			}

			lexical = topN(entries, limit * 5);
		}

		const semantic = await this.semanticRank(query.text, candidates, limit * 5, provider);

		let hits: SearchHit[];

		if (semantic.length === 0) {
			hits = this.materialize(lexical, limit, ["lexical"]);
		} else {
			const fused = rrf([lexical, semantic], limit);
			const lexicalIds = new Set(lexical.map((r) => r.id));
			const semanticIds = new Set(semantic.map((r) => r.id));

			hits = fused.map((entry) => {
				const via: ("lexical" | "semantic")[] = [];
				if (lexicalIds.has(entry.id)) via.push("lexical");
				if (semanticIds.has(entry.id)) via.push("semantic");
				return this.hit(entry, via);
			});
		}

		// Optional RRF & BM25 ranking explanation
		if (query.explain) {
			const lexicalRankMap = new Map<number, number>();
			for (let i = 0; i < lexical.length; i++) {
				const r = lexical[i];
				if (r) lexicalRankMap.set(r.id, i);
			}

			const semanticRankMap = new Map<number, number>();
			for (let i = 0; i < semantic.length; i++) {
				const r = semantic[i];
				if (r) semanticRankMap.set(r.id, i);
			}

			for (let i = 0; i < hits.length; i++) {
				const hit = hits[i];
				if (!hit) continue;

				// Find original chunk id for this hit
				const chunkId = this.data.chunks.findIndex(
					(c) => c.line === hit.line && c.heading === hit.heading,
				);

				const rawBm25 = chunkId >= 0 ? lexicalRawScores.get(chunkId) ?? 0 : hit.score;
				const quoteInfo = chunkId >= 0 ? lexicalQuoteBonuses.get(chunkId) : undefined;
				const boostInfo = chunkId >= 0 ? lexicalPathBoosts.get(chunkId) : undefined;

				const termsBreakdown: TermScoreContribution[] = [];
				if (chunkId >= 0) {
					const explained = this.optimizedLexicon.explainDocument(terms, chunkId);
					for (const item of explained.terms) {
						if (item.score > 0) {
							termsBreakdown.push({
								term: item.term,
								tf: item.tf,
								idf: item.idf,
								norm: item.norm,
								contribution: item.score,
							});
						}
					}
				}

				const lexRank = chunkId >= 0 ? lexicalRankMap.get(chunkId) : undefined;
				const semRank = chunkId >= 0 ? semanticRankMap.get(chunkId) : undefined;
				const semScore = semRank !== undefined ? semantic[semRank]?.score : undefined;

				hit.explanation = buildScoreExplanation({
					hit,
					rawBm25,
					terms: termsBreakdown,
					quoteBonus: quoteInfo?.bonus ?? 0,
					matchedQuotes: quoteInfo?.matched ?? [],
					pathMultiplier: boostInfo?.multiplier ?? 1.0,
					pathReason: boostInfo?.reason ?? "Standard scoring",
					lexicalRank: lexRank,
					semanticRank: semRank,
					cosineSimilarity: semScore,
				});
			}
		}

		if (useCache) {
			this.sessionCache.set(cacheKey, hits);
		}

		return hits;
	}

	private async semanticRank(
		text: string,
		candidates: number[],
		limit: number,
		provider?: EmbeddingProvider,
	): Promise<Ranked[]> {
		const vectors = this.data.vectors;
		if (!provider || !vectors) return [];

		let queryVector: number[] | undefined;
		try {
			queryVector = (await provider.embed([text]))[0];
		} catch {
			// An embedding failure mid-query is not fatal: BM25 already has an
			// answer, and returning it beats returning an error.
			return [];
		}
		if (!queryVector) return [];

		const ranked: Ranked[] = [];
		for (const id of candidates) {
			const vector = vectors[id];
			if (!vector) continue;
			ranked.push({ id, score: cosine(queryVector, vector) });
		}
		return topN(ranked, limit).filter((r) => r.score > 0);
	}

	private filter(query: SearchQuery): number[] {
		const kinds = query.kinds && query.kinds.length > 0 ? new Set(query.kinds) : null;
		const out: number[] = [];

		for (let id = 0; id < this.data.chunks.length; id++) {
			const doc = this.data.docs[(this.data.chunks[id] as Chunk).doc] as Doc;
			if (kinds && !kinds.has(doc.kind)) continue;
			if (query.section && doc.section !== query.section) continue;
			out.push(id);
		}
		return out;
	}

	private materialize(ranked: Ranked[], limit: number, via: ("lexical" | "semantic")[]): SearchHit[] {
		return ranked.slice(0, limit).map((entry) => this.hit(entry, via));
	}

	private hit(entry: Ranked, via: ("lexical" | "semantic")[]): SearchHit {
		const chunk = this.data.chunks[entry.id] as Chunk;
		const doc = this.data.docs[chunk.doc] as Doc;
		return {
			score: entry.score,
			kind: doc.kind,
			path: doc.path,
			section: doc.section,
			title: doc.title,
			heading: chunk.heading,
			line: chunk.line,
			snippet: snippet(chunk.text),
			via,
		};
	}

	private async embedAll(provider: EmbeddingProvider): Promise<void> {
		const texts = this.data.chunks.map((c) => `${c.heading}\n${c.text}`);
		try {
			this.data.vectors = await provider.embed(texts);
		} catch {
			// Leaving vectors absent degrades to lexical, which is the whole point.
			this.data.vectors = undefined as unknown as PersistedIndex["vectors"];
		}
	}
}

const SNIPPET_CHARS = 240;

function snippet(text: string): string {
	const flat = text.replace(/\s+/g, " ").trim();
	return flat.length <= SNIPPET_CHARS ? flat : `${flat.slice(0, SNIPPET_CHARS - 1)}…`;
}

export type { Corpus, Doc, Chunk, Kind };
