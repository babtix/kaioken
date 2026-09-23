import { describe, expect, it } from "vitest";
import { analyze } from "../src/analyze.ts";
import {
	CompactPostingsList,
	DEFAULT_BM25_PARAMS,
	OptimizedLexicon,
	SearchSessionCache,
} from "../src/postings.ts";

describe("CompactPostingsList", () => {
	it("stores and retrieves postings with typed arrays", () => {
		const entries = [
			{ docId: 0, tf: 2 },
			{ docId: 5, tf: 1 },
			{ docId: 12, tf: 4 },
		];
		const list = new CompactPostingsList(entries);

		expect(list.length).toBe(3);
		expect(list.getDocId(0)).toBe(0);
		expect(list.getTf(0)).toBe(2);
		expect(list.getDocId(1)).toBe(5);
		expect(list.getTf(1)).toBe(1);
		expect(list.getDocId(2)).toBe(12);
		expect(list.getTf(2)).toBe(4);

		expect(list.get(1)).toEqual({ docId: 5, tf: 1 });
		expect(list.get(-1)).toBeUndefined();
		expect(list.get(3)).toBeUndefined();
		expect(list.entries()).toEqual(entries);
	});

	it("handles empty entries safely", () => {
		const empty = new CompactPostingsList([]);
		expect(empty.length).toBe(0);
		expect(empty.get(0)).toBeUndefined();
		expect(empty.entries()).toEqual([]);
	});
});

describe("OptimizedLexicon", () => {
	const rawDocs = [
		"the fast brown fox jumps over the lazy dog",
		"continuous integration and deployment pipeline for code",
		"fast continuous deployment testing in repository",
	];
	const tokenized = rawDocs.map((d) => analyze(d));
	const lexicon = new OptimizedLexicon(tokenized);

	it("computes collection statistics correctly", () => {
		expect(lexicon.documentCount).toBe(3);
		expect(lexicon.averageLength).toBeGreaterThan(0);
		expect(lexicon.parameters).toEqual(DEFAULT_BM25_PARAMS);
	});

	it("provides compact postings lookup and term presence", () => {
		expect(lexicon.hasTerm("fast")).toBe(true);
		expect(lexicon.hasTerm("nonexistent")).toBe(false);

		const fastPostings = lexicon.getPostings("fast");
		expect(fastPostings).toBeDefined();
		expect(fastPostings!.length).toBe(2); // In doc 0 and doc 2
	});

	it("calculates non-negative probabilistic IDF", () => {
		const rareIdf = lexicon.idf("fox"); // Only in doc 0
		const commonIdf = lexicon.idf("fast"); // In doc 0 & 2

		expect(rareIdf).toBeGreaterThan(0);
		expect(commonIdf).toBeGreaterThan(0);
		expect(rareIdf).toBeGreaterThan(commonIdf);
		expect(lexicon.idf("unknown")).toBe(0);
	});

	it("scores matching documents accurately", () => {
		const scores = lexicon.score(analyze("fast pipeline"));
		expect(scores.size).toBeGreaterThan(0);

		// Doc 1 and 2 match terms
		expect(scores.get(1)).toBeGreaterThan(0);
		expect(scores.get(2)).toBeGreaterThan(0);
	});

	it("supports custom BM25 parameter tuning", () => {
		const tuned = new OptimizedLexicon(tokenized, { k1: 1.8, b: 0.5 });
		expect(tuned.parameters.k1).toBe(1.8);
		expect(tuned.parameters.b).toBe(0.5);

		const scores = tuned.score(analyze("continuous"));
		expect(scores.get(1)).toBeGreaterThan(0);
	});

	it("provides detailed document term explanation", () => {
		const explanation = lexicon.explainDocument(analyze("fast pipeline"), 1);
		expect(explanation.terms.length).toBeGreaterThan(0);
		expect(explanation.total).toBeGreaterThan(0);

		const pipelineTerm = explanation.terms.find((t) => t.term === "pipeline");
		expect(pipelineTerm).toBeDefined();
		expect(pipelineTerm!.tf).toBe(1);
		expect(pipelineTerm!.idf).toBeGreaterThan(0);
		expect(pipelineTerm!.score).toBeGreaterThan(0);
	});

	it("returns introspection memory and postings stats", () => {
		const stats = lexicon.getStats();
		expect(stats.documentCount).toBe(3);
		expect(stats.vocabularySize).toBeGreaterThan(0);
		expect(stats.totalPostings).toBeGreaterThan(0);
		expect(stats.memoryEstimateBytes).toBeGreaterThan(0);
	});
});

describe("SearchSessionCache", () => {
	it("caches and retrieves query results", () => {
		const cache = new SearchSessionCache<string[]>(3, 5000);
		cache.set("query:1", ["hitA", "hitB"]);

		expect(cache.has("query:1")).toBe(true);
		expect(cache.get("query:1")).toEqual(["hitA", "hitB"]);

		const stats = cache.stats();
		expect(stats.hits).toBe(1);
		expect(stats.misses).toBe(0);
		expect(stats.size).toBe(1);
	});

	it("evicts oldest entries when reaching maxSize (LRU)", () => {
		const cache = new SearchSessionCache<string>(2, 5000);
		cache.set("k1", "v1");
		cache.set("k2", "v2");
		cache.set("k3", "v3"); // Should evict k1

		expect(cache.has("k1")).toBe(false);
		expect(cache.has("k2")).toBe(true);
		expect(cache.has("k3")).toBe(true);
	});

	it("handles TTL expiration and clear", async () => {
		const shortCache = new SearchSessionCache<string>(5, 20); // 20ms TTL
		shortCache.set("temp", "val");
		expect(shortCache.get("temp")).toBe("val");

		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(shortCache.get("temp")).toBeUndefined();

		shortCache.set("permanent", "keep");
		shortCache.clear();
		expect(shortCache.stats().size).toBe(0);
		expect(shortCache.has("permanent")).toBe(false);
	});
});
