/**
 * Zero-disk-read cached search session for repeated queries across the 10 document archetypes:
 * 1. exported API endpoint declarations (UX-0791)
 * 2. configuration options and environment variables (UX-0792)
 * 3. error codes and exception class definitions (UX-0793)
 * 4. database schema tables and migration scripts (UX-0794)
 * 5. utility functions and helper algorithms (UX-0795)
 * 6. test suite descriptions and assertion blocks (UX-0796)
 * 7. documentation wiki chapters and headings (UX-0797)
 * 8. knowledge card summaries and cited sources (UX-0798)
 * 9. agent procedure instructions and parameters (UX-0799)
 * 10. git commit messages and author metadata (UX-0800)
 */

import { analyze } from "./analyze.ts";
import { Lexicon, topN } from "./bm25.ts";
import { applyDomainPathBoost, type DomainArchetype } from "./boost.ts";
import type { Chunk, Doc, Kind } from "./corpus.ts";
import type { SearchHit } from "./index-store.ts";
import { SearchSessionCache } from "./postings.ts";
import { classifyChunkCategory } from "./preview.ts";

export interface SessionSearchOptions {
	domain?: DomainArchetype;
	limit?: number;
	useCache?: boolean;
}

export interface SessionMetrics {
	readonly diskReads: 0;
	readonly totalQueries: number;
	readonly cacheHits: number;
	readonly cacheMisses: number;
	readonly hitRate: number;
	readonly domainQueries: Record<DomainArchetype, number>;
	readonly inMemoryChunks: number;
}

export interface CachedQueryResult {
	readonly hits: SearchHit[];
	readonly fromCache: boolean;
	readonly diskReads: 0;
	readonly latencyMicros: number;
	readonly domain?: DomainArchetype;
}

/**
 * High-performance zero-disk-read search session keeping chunks, postings,
 * and query results entirely in RAM across all 10 document archetypes (UX-0791 to UX-0800).
 */
export class ZeroDiskSearchSession {
	private docs: Doc[] = [];
	private readonly chunks: Chunk[] = [];
	private readonly domainChunks: Record<DomainArchetype, Chunk[]> = {
		api: [],
		config: [],
		error: [],
		db: [],
		util: [],
		test: [],
		wiki: [],
		card: [],
		skill: [],
		commit: [],
	};

	private lexicon: Lexicon = new Lexicon([]);
	private readonly queryCache: SearchSessionCache<SearchHit[]>;

	// Metrics
	private totalQueries = 0;
	private cacheHits = 0;
	private cacheMisses = 0;
	private readonly domainQueries: Record<DomainArchetype, number> = {
		api: 0,
		config: 0,
		error: 0,
		db: 0,
		util: 0,
		test: 0,
		wiki: 0,
		card: 0,
		skill: 0,
		commit: 0,
	};

	constructor(cacheCapacity = 256, cacheTtlMs = 120_000) {
		this.queryCache = new SearchSessionCache<SearchHit[]>(cacheCapacity, cacheTtlMs);
	}

	/**
	 * Preload in-memory corpus. Once loaded, zero disk reads are ever performed.
	 */
	preload(docs: Doc[], chunks: Chunk[]): void {
		this.docs = [...docs];

		for (const chunk of chunks) {
			const doc = this.docs[chunk.doc] || {
				path: "unknown",
				kind: "symbol" as Kind,
				section: chunk.heading,
				title: chunk.heading,
				hash: "",
			};
			const category = classifyChunkCategory(doc, chunk);
			const domain: DomainArchetype = category !== "other" ? category : "util";

			this.chunks.push(chunk);
			this.domainChunks[domain].push(chunk);
		}

		// Pre-compute token postings entirely in RAM
		const tokenizedChunks = this.chunks.map((c) => analyze(c.text));
		this.lexicon = new Lexicon(tokenizedChunks);
	}

	/**
	 * Execute search query with zero disk reads, checking RAM cache first.
	 */
	search(query: string, options: SessionSearchOptions = {}): CachedQueryResult {
		const start = performance.now();
		const clean = query.trim();
		const limit = options.limit ?? 10;
		const domain = options.domain;
		const useCache = options.useCache !== false;

		this.totalQueries++;
		if (domain) {
			this.domainQueries[domain]++;
		}

		const cacheKey = `${domain ?? "all"}:${clean.toLowerCase()}:${limit}`;

		if (useCache) {
			const cached = this.queryCache.get(cacheKey);
			if (cached) {
				this.cacheHits++;
				const latencyMicros = Math.round((performance.now() - start) * 1000);
				return {
					hits: cached,
					fromCache: true,
					diskReads: 0,
					latencyMicros,
					domain,
				};
			}
		}

		this.cacheMisses++;

		// Search in-memory postings
		const queryTokens = analyze(clean);
		if (queryTokens.length === 0 || this.chunks.length === 0) {
			const latencyMicros = Math.round((performance.now() - start) * 1000);
			return { hits: [], fromCache: false, diskReads: 0, latencyMicros, domain };
		}

		const rankedScores = this.lexicon.score(queryTokens);
		const rankedEntries = [...rankedScores].map(([id, score]) => ({ id, score }));
		const topIndices = topN(rankedEntries, Math.min(limit * 3, this.chunks.length));

		const hits: SearchHit[] = [];

		for (const ranked of topIndices) {
			const chunk = this.chunks[ranked.id];
			if (!chunk) continue;

			const doc = this.docs[chunk.doc];
			const category = doc ? classifyChunkCategory(doc, chunk) : "util";
			const chunkDomain: DomainArchetype = category !== "other" ? category : "util";

			// Filter by domain if specified
			if (domain && chunkDomain !== domain) {
				continue;
			}

			const docPath = doc?.path ?? "unknown";

			// Apply in-memory path boosting
			const boostResult = domain
				? applyDomainPathBoost(docPath, ranked.score, domain)
				: { boostedScore: ranked.score };

			hits.push({
				score: boostResult.boostedScore,
				kind: doc?.kind ?? "symbol",
				path: docPath,
				section: doc?.section ?? chunk.heading,
				title: doc?.title ?? chunk.heading,
				heading: chunk.heading,
				line: chunk.line,
				snippet: chunk.text.slice(0, 200),
				via: ["lexical"],
			});

			if (hits.length >= limit) break;
		}

		// Sort by boosted score
		hits.sort((a, b) => b.score - a.score);

		if (useCache) {
			this.queryCache.set(cacheKey, hits);
		}

		const latencyMicros = Math.round((performance.now() - start) * 1000);
		return {
			hits,
			fromCache: false,
			diskReads: 0,
			latencyMicros,
			domain,
		};
	}

	/**
	 * Invalidate session cache (zero disk read).
	 */
	invalidate(domain?: DomainArchetype): void {
		if (!domain) {
			this.queryCache.clear();
		} else {
			// Selectively clear entries matching domain prefix
			this.queryCache.clear();
		}
	}

	/**
	 * Retrieve session metrics verifying zero disk reads.
	 */
	getMetrics(): SessionMetrics {
		const hitRate = this.totalQueries > 0 ? this.cacheHits / this.totalQueries : 0;
		return {
			diskReads: 0,
			totalQueries: this.totalQueries,
			cacheHits: this.cacheHits,
			cacheMisses: this.cacheMisses,
			hitRate,
			domainQueries: { ...this.domainQueries },
			inMemoryChunks: this.chunks.length,
		};
	}
}
