import { describe, expect, it } from "vitest";
import {
	applyPathBoost,
	calculatePhraseQuoteBonus,
	parseQueryQuotes,
} from "../src/boost.ts";

describe("parseQueryQuotes", () => {
	it("extracts exact phrases enclosed in double or single quotes", () => {
		const parsed = parseQueryQuotes('handle "wiki search" query');
		expect(parsed.exactQuotes).toEqual(["wiki search"]);
		expect(parsed.unquotedTerms).toEqual(["handle", "query"]);
		expect(parsed.cleanText).toBe("wiki search handle query");
	});

	it("extracts multiple quoted phrases", () => {
		const parsed = parseQueryQuotes('"export function" and "retry with backoff"');
		expect(parsed.exactQuotes).toEqual(["export function", "retry with backoff"]);
		expect(parsed.unquotedTerms).toEqual(["and"]);
	});

	it("extracts path filters like path:src/ and in:cards", () => {
		const parsed = parseQueryQuotes('"search index" path:src/kaioken in:cards limit:10');
		expect(parsed.exactQuotes).toEqual(["search index"]);
		expect(parsed.pathFilters).toEqual(["src/kaioken", "cards"]);
		expect(parsed.unquotedTerms).toEqual(["limit:10"]);
	});

	it("handles plain queries without quotes", () => {
		const parsed = parseQueryQuotes("simple search terms");
		expect(parsed.exactQuotes).toEqual([]);
		expect(parsed.unquotedTerms).toEqual(["simple", "search", "terms"]);
		expect(parsed.cleanText).toBe("simple search terms");
	});
});

describe("calculatePhraseQuoteBonus", () => {
	const snippet =
		"export function handleWikiSearch(query: string) { return retryWithBackoff(3); }";

	it("rewards exact contiguous matching quotes", () => {
		const result = calculatePhraseQuoteBonus(["handleWikiSearch"], snippet);
		expect(result.bonus).toBeGreaterThan(0);
		expect(result.matchedQuotes).toEqual(["handleWikiSearch"]);
	});

	it("matches case-insensitively", () => {
		const result = calculatePhraseQuoteBonus(["handlewikisearch"], snippet);
		expect(result.bonus).toBeGreaterThan(0);
		expect(result.matchedQuotes).toEqual(["handlewikisearch"]);
	});

	it("accumulates bonus across multiple matching quotes", () => {
		const result = calculatePhraseQuoteBonus(
			["handleWikiSearch", "retryWithBackoff"],
			snippet,
		);
		expect(result.matchedQuotes.length).toBe(2);
		expect(result.bonus).toBeGreaterThan(4.0);
	});

	it("returns zero bonus when phrases do not match contiguously", () => {
		const result = calculatePhraseQuoteBonus(["handle query", "nonexistent phrase"], snippet);
		expect(result.bonus).toBe(0);
		expect(result.matchedQuotes).toEqual([]);
	});
});

describe("applyPathBoost", () => {
	it("boosts core source directories (src/, packages/, lib/)", () => {
		const core = applyPathBoost("src/search/index.ts", 10.0);
		expect(core.multiplier).toBeGreaterThan(1.0);
		expect(core.boostedScore).toBeGreaterThan(10.0);
		expect(core.reason).toContain("Core source file boost");
	});

	it("attenuates test files", () => {
		const testResult = applyPathBoost("test/search/index.test.ts", 10.0);
		expect(testResult.multiplier).toBeLessThan(1.0);
		expect(testResult.boostedScore).toBeLessThan(10.0);
		expect(testResult.reason).toContain("Test file attenuation");
	});

	it("demotes vendor and dist files", () => {
		const vendor = applyPathBoost("dist/bundle.js", 10.0);
		expect(vendor.multiplier).toBeLessThan(0.7);
		expect(vendor.boostedScore).toBeLessThan(10.0);
	});

	it("applies custom directory boost multipliers", () => {
		const custom = applyPathBoost("kaioken/special/feature.ts", 10.0, {
			customBoosts: { special: 2.5 },
		});
		expect(custom.multiplier).toBe(2.5);
		expect(custom.boostedScore).toBe(25.0);
		expect(custom.reason).toContain("Custom boost");
	});

	it("handles zero base score safely", () => {
		const zero = applyPathBoost("src/index.ts", 0);
		expect(zero.boostedScore).toBe(0);
		expect(zero.multiplier).toBe(1.0);
	});
});
