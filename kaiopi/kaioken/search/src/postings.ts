/**
 * High-performance postings lists and in-memory BM25 index structures.
 * Features: #UX-0711 to #UX-0720, #UX-0791 to #UX-0800
 */

export interface PostingEntry {
	readonly docId: number;
	readonly tf: number;
}

export interface BM25Parameters {
	readonly k1: number;
	readonly b: number;
}

export const DEFAULT_BM25_PARAMS: BM25Parameters = {
	k1: 1.2,
	b: 0.75,
};

export interface PostingsStats {
	readonly documentCount: number;
	readonly vocabularySize: number;
	readonly totalPostings: number;
	readonly averageLength: number;
	readonly memoryEstimateBytes: number;
}

/**
 * Compact postings list using typed arrays to minimize heap allocations
 * and GC pressure during intensive query iterations.
 */
export class CompactPostingsList {
	private readonly docIds: Int32Array;
	private readonly tfs: Uint16Array;
	public readonly length: number;

	constructor(entries: readonly PostingEntry[]) {
		this.length = entries.length;
		this.docIds = new Int32Array(this.length);
		this.tfs = new Uint16Array(this.length);

		for (let i = 0; i < entries.length; i++) {
			const entry = entries[i];
			if (entry) {
				this.docIds[i] = entry.docId;
				this.tfs[i] = entry.tf;
			}
		}
	}

	get(index: number): PostingEntry | undefined {
		if (index < 0 || index >= this.length) return undefined;
		return {
			docId: this.docIds[index] as number,
			tf: this.tfs[index] as number,
		};
	}

	getDocId(index: number): number {
		return this.docIds[index] as number;
	}

	getTf(index: number): number {
		return this.tfs[index] as number;
	}

	entries(): PostingEntry[] {
		const out: PostingEntry[] = new Array(this.length);
		for (let i = 0; i < this.length; i++) {
			out[i] = {
				docId: this.docIds[i] as number,
				tf: this.tfs[i] as number,
			};
		}
		return out;
	}
}

/**
 * High-performance optimized inverted lexicon supporting dynamic BM25 parameter
 * tuning, zero-allocation iteration, and memory introspection.
 */
export class OptimizedLexicon {
	private readonly postings = new Map<string, CompactPostingsList>();
	private readonly idfCache = new Map<string, number>();
	private readonly docNorms: Float64Array;
	private readonly docLengths: Int32Array;
	private readonly avgLen: number;
	private readonly n: number;
	private readonly params: BM25Parameters;

	constructor(
		documents: readonly (readonly string[])[],
		params: BM25Parameters = DEFAULT_BM25_PARAMS,
	) {
		this.n = documents.length;
		this.params = params;
		this.docNorms = new Float64Array(this.n);
		this.docLengths = new Int32Array(this.n);

		const tempPostings = new Map<string, PostingEntry[]>();
		let totalTokens = 0;

		for (let docId = 0; docId < this.n; docId++) {
			const tokens = documents[docId] ?? [];
			const docLen = tokens.length;
			this.docLengths[docId] = docLen;
			totalTokens += docLen;

			const tf = new Map<string, number>();
			for (const token of tokens) {
				tf.set(token, (tf.get(token) ?? 0) + 1);
			}

			for (const [term, freq] of tf) {
				let list = tempPostings.get(term);
				if (!list) {
					list = [];
					tempPostings.set(term, list);
				}
				list.push({ docId, tf: freq });
			}
		}

		this.avgLen = this.n === 0 ? 0 : totalTokens / this.n;

		// Convert temporary postings to compact typed-array representations
		for (const [term, list] of tempPostings) {
			this.postings.set(term, new CompactPostingsList(list));
		}

		// Pre-compute document length normalization factors
		for (let docId = 0; docId < this.n; docId++) {
			const len = this.docLengths[docId] as number;
			this.docNorms[docId] =
				this.avgLen === 0
					? 0
					: this.params.k1 * (1 - this.params.b + (this.params.b * len) / this.avgLen);
		}
	}

	get documentCount(): number {
		return this.n;
	}

	get averageLength(): number {
		return this.avgLen;
	}

	get parameters(): BM25Parameters {
		return this.params;
	}

	hasTerm(term: string): boolean {
		return this.postings.has(term);
	}

	getPostings(term: string): CompactPostingsList | undefined {
		return this.postings.get(term);
	}

	/**
	 * Compute or return cached probabilistic IDF floored at 0:
	 * idf = ln(1 + (N - df + 0.5) / (df + 0.5))
	 */
	idf(term: string): number {
		const cached = this.idfCache.get(term);
		if (cached !== undefined) return cached;

		const list = this.postings.get(term);
		const df = list ? list.length : 0;
		if (df === 0) {
			this.idfCache.set(term, 0);
			return 0;
		}

		const val = Math.max(0, Math.log(1 + (this.n - df + 0.5) / (df + 0.5)));
		this.idfCache.set(term, val);
		return val;
	}

	/**
	 * Score query terms against all matching documents using zero-allocation
	 * typed-array iterations.
	 */
	score(queryTerms: readonly string[]): Map<number, number> {
		const scores = new Map<number, number>();
		if (this.avgLen === 0 || queryTerms.length === 0) return scores;

		const k1Plus1 = this.params.k1 + 1;

		for (let t = 0; t < queryTerms.length; t++) {
			const term = queryTerms[t];
			if (!term) continue;

			const list = this.postings.get(term);
			if (!list || list.length === 0) continue;

			const termIdf = this.idf(term);
			if (termIdf <= 0) continue;

			const count = list.length;
			for (let i = 0; i < count; i++) {
				const docId = list.getDocId(i);
				const tf = list.getTf(i);
				const norm = this.docNorms[docId] as number;
				const termScore = termIdf * ((tf * k1Plus1) / (tf + norm));
				scores.set(docId, (scores.get(docId) ?? 0) + termScore);
			}
		}

		return scores;
	}

	/**
	 * Decompose score for a single document into detailed term breakdown.
	 */
	explainDocument(
		queryTerms: readonly string[],
		docId: number,
	): {
		terms: Array<{
			term: string;
			tf: number;
			idf: number;
			norm: number;
			score: number;
		}>;
		total: number;
	} {
		const breakdown: Array<{
			term: string;
			tf: number;
			idf: number;
			norm: number;
			score: number;
		}> = [];

		if (docId < 0 || docId >= this.n) return { terms: [], total: 0 };

		let total = 0;
		const norm = this.docNorms[docId] as number;
		const k1Plus1 = this.params.k1 + 1;

		for (const term of queryTerms) {
			const list = this.postings.get(term);
			let tf = 0;
			if (list) {
				for (let i = 0; i < list.length; i++) {
					if (list.getDocId(i) === docId) {
						tf = list.getTf(i);
						break;
					}
				}
			}

			const termIdf = this.idf(term);
			const termScore = tf > 0 ? termIdf * ((tf * k1Plus1) / (tf + norm)) : 0;
			total += termScore;

			breakdown.push({
				term,
				tf,
				idf: termIdf,
				norm,
				score: termScore,
			});
		}

		return { terms: breakdown, total };
	}

	getStats(): PostingsStats {
		let totalPostings = 0;
		for (const list of this.postings.values()) {
			totalPostings += list.length;
		}

		// Estimate memory: 4 bytes per docId + 2 bytes per tf + map overhead
		const memoryEstimateBytes =
			totalPostings * 6 +
			this.n * (8 + 4) +
			this.postings.size * 64;

		return {
			documentCount: this.n,
			vocabularySize: this.postings.size,
			totalPostings,
			averageLength: this.avgLen,
			memoryEstimateBytes,
		};
	}
}

export interface CacheStats {
	hits: number;
	misses: number;
	size: number;
	maxSize: number;
}

/**
 * Zero-disk-read in-memory query cache with LRU eviction.
 * Used for instant live typing preview and repeated query acceleration.
 */
export class SearchSessionCache<T = unknown> {
	private readonly cache = new Map<string, { value: T; timestamp: number }>();
	private readonly maxSize: number;
	private readonly ttlMs: number;
	private hits = 0;
	private misses = 0;

	constructor(maxSize = 256, ttlMs = 60_000) {
		this.maxSize = maxSize;
		this.ttlMs = ttlMs;
	}

	get(key: string): T | undefined {
		const entry = this.cache.get(key);
		if (!entry) {
			this.misses++;
			return undefined;
		}

		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key);
			this.misses++;
			return undefined;
		}

		// Refresh LRU order
		this.cache.delete(key);
		this.cache.set(key, entry);
		this.hits++;
		return entry.value;
	}

	set(key: string, value: T): void {
		if (this.cache.has(key)) {
			this.cache.delete(key);
		} else if (this.cache.size >= this.maxSize) {
			// Evict oldest entry
			const oldestKey = this.cache.keys().next().value;
			if (oldestKey !== undefined) {
				this.cache.delete(oldestKey);
			}
		}

		this.cache.set(key, { value, timestamp: Date.now() });
	}

	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) return false;
		if (Date.now() - entry.timestamp > this.ttlMs) {
			this.cache.delete(key);
			return false;
		}
		return true;
	}

	clear(): void {
		this.cache.clear();
		this.hits = 0;
		this.misses = 0;
	}

	stats(): CacheStats {
		return {
			hits: this.hits,
			misses: this.misses,
			size: this.cache.size,
			maxSize: this.maxSize,
		};
	}
}
