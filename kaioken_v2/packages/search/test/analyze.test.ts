import { describe, expect, it } from "vitest";
import { analyze, Lexicon, phraseBonus, rrf, splitIdentifier, topN } from "../dist/index.js";

/**
 * The tokenizer decides what search can possibly find. Indexing and querying
 * both run through `analyze`, so these assertions pin down the contract both
 * sides rely on.
 */

describe("identifier splitting", () => {
	it("breaks camelCase and PascalCase", () => {
		expect(splitIdentifier("handleWikiSearch")).toEqual(["handle", "wiki", "search"]);
		expect(splitIdentifier("SearchIndex")).toEqual(["search", "index"]);
	});

	it("puts the acronym boundary in the right place", () => {
		// The break belongs before the S, not after it.
		expect(splitIdentifier("HTTPServer")).toEqual(["http", "server"]);
		expect(splitIdentifier("parseJSONBody")).toEqual(["parse", "json", "body"]);
	});

	it("breaks digit boundaries", () => {
		expect(splitIdentifier("bm25Score")).toEqual(["bm", "25", "score"]);
	});

	it("returns nothing for a word with no internal boundary", () => {
		expect(splitIdentifier("search")).toEqual([]);
		expect(splitIdentifier("wiki")).toEqual([]);
	});
});

describe("analysis", () => {
	it("emits both the whole identifier and its parts", () => {
		const tokens = analyze("handleWikiSearch");
		expect(tokens).toContain("handlewikisearch");
		expect(tokens).toContain("wiki");
		expect(tokens).toContain("search");
	});

	it("lets a two-word query reach a single compound identifier", () => {
		// The single most common way a code-repo search misses.
		const doc = analyze("func handleWikiSearch(w http.ResponseWriter)");
		for (const term of analyze("wiki search")) expect(doc).toContain(term);
	});

	it("splits snake_case and kebab-case via separator flattening", () => {
		expect(analyze("parse_json_body")).toEqual(["parse", "json", "body"]);
		expect(analyze("parse-json-body")).toEqual(["parse", "json", "body"]);
	});

	it("drops stopwords and single characters", () => {
		expect(analyze("the a of x")).toEqual([]);
	});

	it("keeps technical words a generic stoplist would remove", () => {
		expect(analyze("get set run")).toEqual(["get", "set", "run"]);
	});

	it("lowercases and strips punctuation", () => {
		expect(analyze("Search(query, limit);")).toEqual(["search", "query", "limit"]);
	});
});

describe("bm25", () => {
	const docs = [
		analyze("the cat sat on the mat"),
		analyze("a dog sat on a log"),
		analyze("cats and dogs living together"),
	];
	const lexicon = new Lexicon(docs);

	it("counts the collection", () => {
		expect(lexicon.documentCount).toBe(3);
		expect(lexicon.averageLength).toBeGreaterThan(0);
	});

	it("gives a rare term more weight than a common one", () => {
		expect(lexicon.idf("cat")).toBeGreaterThan(lexicon.idf("sat"));
	});

	it("scores a matching document above a non-matching one", () => {
		const query = analyze("cat");
		expect(lexicon.score(query, docs[0] as string[])).toBeGreaterThan(0);
		expect(lexicon.score(query, docs[1] as string[])).toBe(0);
	});

	it("never returns a negative idf, even for a term in every document", () => {
		const all = new Lexicon([analyze("alpha"), analyze("alpha"), analyze("alpha")]);
		expect(all.idf("alpha")).toBeGreaterThanOrEqual(0);
	});

	it("scores an empty document as zero rather than dividing by zero", () => {
		expect(lexicon.score(analyze("cat"), [])).toBe(0);
	});
});

describe("phrase bonus", () => {
	it("rewards a contiguous phrase", () => {
		expect(phraseBonus("context window", "managing the context window here")).toBe(1);
	});

	it("does not reward words that merely co-occur", () => {
		expect(phraseBonus("context window", "the context is wide, the window is tall")).toBe(0);
	});

	it("ignores single words, where BM25 already suffices", () => {
		expect(phraseBonus("context", "context")).toBe(0);
	});
});

describe("reciprocal rank fusion", () => {
	it("ranks an item appearing in both lists above one appearing in either", () => {
		const lexical = [
			{ id: 1, score: 9 },
			{ id: 2, score: 8 },
		];
		const semantic = [
			{ id: 3, score: 0.9 },
			{ id: 1, score: 0.8 },
		];
		expect(rrf([lexical, semantic], 3)[0]?.id).toBe(1);
	});

	it("fuses over ranks, so incomparable score scales cannot distort it", () => {
		// Semantic scores are ~0.9; lexical ~40. A score-space merge would let
		// the lexical list win outright regardless of agreement.
		const lexical = [{ id: 1, score: 40 }];
		const semantic = [{ id: 2, score: 0.9 }];
		const fused = rrf([lexical, semantic], 2);
		expect(fused[0]?.score).toBeCloseTo(fused[1]?.score as number, 10);
	});

	it("breaks ties deterministically", () => {
		const ranked = topN(
			[
				{ id: 5, score: 1 },
				{ id: 2, score: 1 },
			],
			2,
		);
		expect(ranked.map((r) => r.id)).toEqual([2, 5]);
	});
});
