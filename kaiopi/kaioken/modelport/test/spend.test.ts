import { describe, expect, it } from "vitest";
import type { ModelCost } from "@earendil-works/pi-ai";
import {
	DEFAULT_CONTEXT_TOKENS,
	contextTokensFor,
	describeSpend,
	estimatePipelineTokens,
	estimatePreflightTokens,
	estimateSpend,
	estimateTokens,
	resolveRates,
} from "../src/spend.ts";

const flashCost: ModelCost = { input: 0.15, output: 0.6, cacheRead: 0.03, cacheWrite: 0.15 };

describe("spend: token estimation", () => {
	it("falls back to a default context for an unknown stage", () => {
		expect(contextTokensFor("nonexistent")).toBe(DEFAULT_CONTEXT_TOKENS);
		expect(contextTokensFor("plan")).toBe(25_000);
	});

	it("grows the estimate with the multiplier", () => {
		const low = estimateTokens(1, 10_000);
		const high = estimateTokens(10, 10_000);
		expect(high.input).toBeGreaterThan(low.input);
		expect(high.output).toBeGreaterThan(low.output);
		expect(high.passes).toBeGreaterThan(low.passes);
	});

	it("counts passes as the first pass plus repair and critique", () => {
		const est = estimateTokens(10, 1_000);
		// x10 => repairPasses 6, critiquePasses 6, plus the initial pass.
		expect(est.passes).toBe(13);
	});

	it("always assumes at least one pass", () => {
		expect(estimateTokens(1, 1_000).passes).toBeGreaterThanOrEqual(1);
	});

	it("multiplies the estimate across multiple units/cards", () => {
		const single = estimateTokens(3, 12_000, 1);
		const fifty = estimateTokens(3, 12_000, 50);
		expect(fifty.input).toBe(single.input * 50);
		expect(fifty.output).toBe(single.output * 50);
		expect(fifty.passes).toBe(single.passes * 50);
	});
});

describe("spend: rate selection", () => {
	it("uses the flat rate when the model defines no tiers", () => {
		expect(resolveRates(flashCost, 5_000_000)).toBe(flashCost);
	});

	it("uses the flat rate below the lowest tier threshold", () => {
		const cost: ModelCost = {
			...flashCost,
			tiers: [{ inputTokensAbove: 200_000, input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.3 }],
		};
		expect(resolveRates(cost, 100_000)).toBe(cost);
	});

	it("applies the tier once input reaches its threshold", () => {
		const tier = { inputTokensAbove: 200_000, input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.3 };
		const cost: ModelCost = { ...flashCost, tiers: [tier] };
		expect(resolveRates(cost, 200_000)).toBe(tier);
	});

	it("picks the highest matching threshold when several apply", () => {
		const mid = { inputTokensAbove: 100_000, input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.3 };
		const high = { inputTokensAbove: 500_000, input: 0.6, output: 2.4, cacheRead: 0.12, cacheWrite: 0.6 };
		const cost: ModelCost = { ...flashCost, tiers: [mid, high] };
		expect(resolveRates(cost, 600_000)).toBe(high);
	});
});

describe("spend: pricing", () => {
	it("prices a known model from its own registry rates", () => {
		const est = estimateSpend(flashCost, { input: 1_000_000, output: 1_000_000, passes: 1 });
		// 1M in at $0.15 + 1M out at $0.60
		expect(est.usd).toBeCloseTo(0.75, 6);
	});

	it("reports unknown cost instead of guessing when there is no model", () => {
		const est = estimateSpend(undefined, { input: 1_000, output: 1_000, passes: 1 });
		expect(est.usd).toBeNull();
		expect(est.unavailableReason).toMatch(/no active model/);
	});

	it("never hardcodes prices: doubling the rate doubles the cost", () => {
		const doubled: ModelCost = { ...flashCost, input: 0.3, output: 1.2 };
		const tokens = { input: 1_000_000, output: 1_000_000, passes: 1 };
		const base = estimateSpend(flashCost, tokens).usd as number;
		const twice = estimateSpend(doubled, tokens).usd as number;
		expect(twice).toBeCloseTo(base * 2, 6);
	});

	it("reports which tier was applied", () => {
		const tier = { inputTokensAbove: 100_000, input: 0.3, output: 1.2, cacheRead: 0.06, cacheWrite: 0.3 };
		const cost: ModelCost = { ...flashCost, tiers: [tier] };
		const est = estimateSpend(cost, { input: 500_000, output: 1_000, passes: 1 });
		expect(est.tierThreshold).toBe(100_000);
	});

	it("reports no tier when the flat rate applies", () => {
		const est = estimateSpend(flashCost, { input: 1_000, output: 1_000, passes: 1 });
		expect(est.tierThreshold).toBeNull();
	});

	it("is an upper bound: a real quote never exceeds the estimate for the same tokens", () => {
		const est = estimateSpend(flashCost, { input: 2_000_000, output: 500_000, passes: 3 });
		expect(est.usd).toBeGreaterThan(0);
	});
});

describe("spend: dialog text", () => {
	it("names the action, multiplier and model", () => {
		const est = estimateSpend(flashCost, estimateTokens(3, 10_000));
		const text = describeSpend("plan", 3, est, "antigravity/gemini-3.8-flash-high");
		expect(text).toContain("plan ×3");
		expect(text).toContain("antigravity/gemini-3.8-flash-high");
	});

	it("admits when cost is unknown rather than showing a number", () => {
		const est = estimateSpend(undefined, estimateTokens(3, 10_000));
		const text = describeSpend("plan", 3, est, "unknown");
		expect(text).toContain("Cost: unknown");
		expect(text).not.toMatch(/\$\d/);
	});

	it("states that the figure is an estimate, not a quote", () => {
		const est = estimateSpend(flashCost, estimateTokens(3, 10_000));
		expect(describeSpend("wiki", 3, est, "m")).toContain("not a quote");
	});
});

describe("spend: preflight and pipeline estimation", () => {
	it("estimates preflight tokens using explicit context tokens", () => {
		const est = estimatePreflightTokens("plan", 2, { explicitContextTokens: 50_000 });
		expect(est.input).toBeGreaterThan(50_000);
		expect(est.passes).toBe(2);
	});

	it("estimates preflight tokens from character count heuristic", () => {
		const est = estimatePreflightTokens("cards", 1, { characterCount: 40_000 });
		// 40_000 chars / 4 = 10_000 tokens * 2 passes (initial + 1 repair)
		expect(est.input).toBe(20_000);
		expect(est.passes).toBe(2);
	});

	it("estimates multi-stage pipeline tokens", () => {
		const pipe = estimatePipelineTokens(
			[
				{ stage: "plan", itemCount: 1 },
				{ stage: "cards", itemCount: 5 },
				{ stage: "wiki", itemCount: 3 },
			],
			3,
		);

		expect(pipe.stages.plan).toBeDefined();
		expect(pipe.stages.cards).toBeDefined();
		expect(pipe.stages.wiki).toBeDefined();
		expect(pipe.total.input).toBe(
			pipe.stages.plan.input + pipe.stages.cards.input + pipe.stages.wiki.input,
		);
		expect(pipe.total.passes).toBe(
			pipe.stages.plan.passes + pipe.stages.cards.passes + pipe.stages.wiki.passes,
		);
	});
});

