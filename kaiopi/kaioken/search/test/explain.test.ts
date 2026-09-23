import { describe, expect, it } from "vitest";
import {
	buildScoreExplanation,
	formatRankExplanation,
	renderBar,
	visualizeRrfScores,
} from "../src/explain.ts";
import type { SearchHit } from "../src/index-store.ts";

describe("renderBar", () => {
	it("renders visual ASCII progress bars with percentages", () => {
		expect(renderBar(0, 10)).toBe("[░░░░░░░░░░]   0%");
		expect(renderBar(50, 10)).toBe("[█████░░░░░]  50%");
		expect(renderBar(100, 10)).toBe("[██████████] 100%");
	});

	it("clamps out-of-bounds percentages safely", () => {
		expect(renderBar(-10, 8)).toBe("[░░░░░░░░]   0%");
		expect(renderBar(150, 8)).toBe("[████████] 100%");
	});
});

describe("buildScoreExplanation", () => {
	const sampleHit: SearchHit = {
		score: 4.5,
		kind: "symbol",
		path: "src/search/index.ts",
		section: "search",
		title: "src/search/index.ts",
		heading: "export class SearchIndex",
		line: 55,
		snippet: "export class SearchIndex with BM25 ranking",
		via: ["lexical"],
	};

	it("builds detailed lexical score breakdown", () => {
		const exp = buildScoreExplanation({
			hit: sampleHit,
			rawBm25: 3.2,
			terms: [
				{ term: "search", tf: 2, idf: 1.2, norm: 0.8, contribution: 2.1 },
				{ term: "index", tf: 1, idf: 1.0, norm: 0.8, contribution: 1.1 },
			],
			quoteBonus: 1.5,
			matchedQuotes: ["search index"],
			pathMultiplier: 1.25,
			pathReason: "Core source boost",
		});

		expect(exp.docPath).toBe("src/search/index.ts");
		expect(exp.heading).toBe("export class SearchIndex");
		expect(exp.bm25.rawScore).toBe(3.2);
		expect(exp.bm25.terms.length).toBe(2);
		expect(exp.phraseQuoteBonus.bonus).toBe(1.5);
		expect(exp.phraseQuoteBonus.matchedQuotes).toEqual(["search index"]);
		expect(exp.pathBoost.multiplier).toBe(1.25);
		expect(exp.pathBoost.boostedScore).toBeCloseTo((3.2 + 1.5) * 1.25, 4);
		expect(exp.rrf.isFused).toBe(false);
	});

	it("calculates reciprocal rank fusion when both lexical and semantic ranks are supplied", () => {
		const exp = buildScoreExplanation({
			hit: sampleHit,
			rawBm25: 4.0,
			terms: [],
			quoteBonus: 0,
			matchedQuotes: [],
			pathMultiplier: 1.0,
			pathReason: "Default",
			lexicalRank: 0, // rank #1
			semanticRank: 1, // rank #2
			cosineSimilarity: 0.88,
		});

		expect(exp.rrf.isFused).toBe(true);
		expect(exp.rrf.contributions.length).toBe(2);
		// 1 / (60 + 1) + 1 / (60 + 2) = 1/61 + 1/62 = 0.016393 + 0.016129 = 0.032522
		expect(exp.rrf.fusedScore).toBeCloseTo(1 / 61 + 1 / 62, 5);
	});
});

describe("formatRankExplanation", () => {
	it("renders structured visual explanation cards", () => {
		const sampleHit: SearchHit = {
			score: 5.0,
			kind: "symbol",
			path: "src/core.ts",
			section: "core",
			title: "src/core.ts",
			heading: "export function runCore",
			line: 12,
			snippet: "Run core logic",
			via: ["lexical"],
		};

		const exp = buildScoreExplanation({
			hit: sampleHit,
			rawBm25: 4.0,
			terms: [{ term: "core", tf: 1, idf: 1.5, norm: 0.9, contribution: 2.0 }],
			quoteBonus: 2.0,
			matchedQuotes: ["runCore"],
			pathMultiplier: 1.25,
			pathReason: "Core source boost",
		});

		const formatted = formatRankExplanation(exp);
		expect(formatted).toContain("Ranking Explanation: export function runCore");
		expect(formatted).toContain("Final Score:");
		expect(formatted).toContain("Score Factor Weights:");
		expect(formatted).toContain("BM25 Lexical:");
		expect(formatted).toContain("Exact Phrase:");
		expect(formatted).toContain("Path Multiplier:");
		expect(formatted).toContain('"core": tf=1');
	});
});

describe("visualizeRrfScores", () => {
	it("renders comparative ranking table for multiple results", () => {
		const hit1: SearchHit = {
			score: 0.032,
			kind: "symbol",
			path: "src/a.ts",
			section: "",
			title: "A",
			heading: "Feature A",
			line: 1,
			snippet: "A",
			via: ["lexical"],
		};
		const hit2: SearchHit = {
			score: 0.016,
			kind: "symbol",
			path: "src/b.ts",
			section: "",
			title: "B",
			heading: "Feature B",
			line: 1,
			snippet: "B",
			via: ["lexical"],
		};

		const exp1 = buildScoreExplanation({
			hit: hit1,
			rawBm25: 5.0,
			terms: [],
			quoteBonus: 1.0,
			matchedQuotes: [],
			pathMultiplier: 1.25,
			pathReason: "",
		});
		const exp2 = buildScoreExplanation({
			hit: hit2,
			rawBm25: 3.0,
			terms: [],
			quoteBonus: 0,
			matchedQuotes: [],
			pathMultiplier: 1.0,
			pathReason: "",
		});

		const table = visualizeRrfScores([exp1, exp2]);
		expect(table).toContain("│Rank│ Passage");
		expect(table).toContain("│#1  │ Feature A");
		expect(table).toContain("│#2  │ Feature B");
	});

	it("handles empty results list", () => {
		expect(visualizeRrfScores([])).toBe("No search results to explain.");
	});
});
