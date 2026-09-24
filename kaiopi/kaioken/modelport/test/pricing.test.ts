import { describe, expect, it } from "vitest";
import type { ModelCost } from "@earendil-works/pi-ai";
import {
	calculateCacheDiscount,
	formatModelComparisonMatrix,
	formatPricingCard,
	STANDARD_MODEL_CATALOG,
} from "../src/pricing.ts";
import { estimateTokens } from "../src/spend.ts";

const sampleFlashCost: ModelCost = {
	input: 0.15,
	output: 0.60,
	cacheRead: 0.0375,
	cacheWrite: 0.15,
	tiers: [
		{ inputTokensAbove: 128_000, input: 0.30, output: 1.20, cacheRead: 0.075, cacheWrite: 0.30 },
	],
};

describe("pricing: cache discount calculations", () => {
	it("calculates potential cache savings against standard rate", () => {
		const flatCost: ModelCost = { input: 0.15, output: 0.60, cacheRead: 0.0375, cacheWrite: 0.15 };
		const tokens = { input: 1_000_000, output: 100_000, passes: 1 };
		const discount = calculateCacheDiscount(flatCost, tokens);
		expect(discount.fullInputCost).toBeCloseTo(0.15, 4);
		expect(discount.cachedInputCost).toBeCloseTo(0.0375, 4);
		expect(discount.maxPotentialSavings).toBeCloseTo(0.1125, 4);
		expect(discount.discountRatio).toBeCloseTo(0.75, 2);
	});

	it("returns zeroes when cost is undefined", () => {
		const tokens = { input: 100_000, output: 10_000, passes: 1 };
		const discount = calculateCacheDiscount(undefined, tokens);
		expect(discount.maxPotentialSavings).toBe(0);
		expect(discount.discountRatio).toBe(0);
	});
});

describe("pricing: formatPricingCard", () => {
	it("renders pricing card with rate breakdown and upper bound total", () => {
		const tokens = estimateTokens(3, 20_000);
		const card = formatPricingCard("google/gemini-2.5-flash", sampleFlashCost, tokens);
		expect(card).toContain("Model ID:      google/gemini-2.5-flash");
		expect(card).toContain("Input Rate:    $0.150 / 1M tokens");
		expect(card).toContain("Output Rate:   $0.600 / 1M tokens");
		expect(card).toContain("Cache-Read Credit Potential");
		expect(card).toContain("UPPER BOUND TOTAL:");
	});

	it("reflects long-context tier when tokens exceed tier threshold", () => {
		const tokens = { input: 200_000, output: 10_000, passes: 1 };
		const card = formatPricingCard("google/gemini-2.5-flash", sampleFlashCost, tokens);
		expect(card).toContain("Long-Context Tier");
		expect(card).toContain("$0.300 / 1M tokens");
	});

	it("handles undefined model cost by reporting unknown pricing", () => {
		const tokens = estimateTokens(1, 10_000);
		const card = formatPricingCard("custom/unregistered-model", undefined, tokens);
		expect(card).toContain("PRICING UNKNOWN");
		expect(card).toContain("admitted gap over guess");
	});
});

describe("pricing: formatModelComparisonMatrix", () => {
	it("formats multi-model comparison table", () => {
		const tokens = estimateTokens(3, 25_000);
		const matrix = formatModelComparisonMatrix(tokens, STANDARD_MODEL_CATALOG);
		expect(matrix).toContain("Model Provider Comparison Matrix");
		expect(matrix).toContain("gemini-2.5-flash");
		expect(matrix).toContain("claude-3-7-sonnet");
		expect(matrix).toContain("gpt-4o");
		expect(matrix).toContain("offline-heuristic");
		expect(matrix).toContain("$0.0000"); // offline cost
	});
});
