/**
 * Transparent per-model pricing breakdown cards and comparison matrix.
 *
 * Implements features UX-0421 through UX-0430.
 *
 * Invariant 9 guarantees pricing clarity: costs are calculated from active rates,
 * never hidden, and cache discount opportunities are explicitly surfaced.
 */
import type { ModelCost, ModelCostRates, ModelCostTier } from "@earendil-works/pi-ai";
import { estimateSpend, resolveRates, type SpendEstimate, type TokenEstimate } from "./spend.ts";

export interface PricingCardOptions {
	/** Title header for the card. */
	title?: string;
	/** Include cache read/write credit details. Default: true */
	showCacheCredits?: boolean;
	/** Compact formatting with minimal borders. Default: false */
	compact?: boolean;
}

/**
 * Standard reference rate cards for known model families.
 * Used for offline comparisons and quotes when no active model instance is connected.
 */
export const STANDARD_MODEL_CATALOG: Record<string, ModelCost> = {
	"gemini-2.5-flash": {
		input: 0.15,
		output: 0.60,
		cacheRead: 0.0375,
		cacheWrite: 0.15,
		tiers: [
			{ inputTokensAbove: 128_000, input: 0.30, output: 1.20, cacheRead: 0.075, cacheWrite: 0.30 },
		],
	},
	"gemini-2.5-pro": {
		input: 1.25,
		output: 5.00,
		cacheRead: 0.3125,
		cacheWrite: 1.25,
		tiers: [
			{ inputTokensAbove: 128_000, input: 2.50, output: 10.00, cacheRead: 0.625, cacheWrite: 2.50 },
		],
	},
	"claude-3-7-sonnet": {
		input: 3.00,
		output: 15.00,
		cacheRead: 0.30,
		cacheWrite: 3.75,
	},
	"gpt-4o": {
		input: 2.50,
		output: 10.00,
		cacheRead: 1.25,
		cacheWrite: 2.50,
	},
	"gpt-4o-mini": {
		input: 0.15,
		output: 0.60,
		cacheRead: 0.075,
		cacheWrite: 0.15,
	},
	"offline-heuristic": {
		input: 0.0,
		output: 0.0,
		cacheRead: 0.0,
		cacheWrite: 0.0,
	},
};

/**
 * Calculate potential cache-read discount credit for an estimate.
 */
export function calculateCacheDiscount(cost: ModelCost | undefined, tokens: TokenEstimate): {
	fullInputCost: number;
	cachedInputCost: number;
	maxPotentialSavings: number;
	discountRatio: number;
} {
	if (!cost) {
		return { fullInputCost: 0, cachedInputCost: 0, maxPotentialSavings: 0, discountRatio: 0 };
	}

	const rates = resolveRates(cost, tokens.input);
	const fullInputCost = (tokens.input / 1_000_000) * rates.input;
	const cacheRate = rates.cacheRead ?? rates.input;
	const cachedInputCost = (tokens.input / 1_000_000) * cacheRate;
	const maxPotentialSavings = Math.max(0, fullInputCost - cachedInputCost);
	const discountRatio = fullInputCost > 0 ? maxPotentialSavings / fullInputCost : 0;

	return {
		fullInputCost,
		cachedInputCost,
		maxPotentialSavings,
		discountRatio,
	};
}

/**
 * Render a formatted per-model pricing breakdown card.
 */
export function formatPricingCard(
	modelLabel: string,
	cost: ModelCost | undefined,
	tokens: TokenEstimate,
	options: PricingCardOptions = {},
): string {
	const spend: SpendEstimate = estimateSpend(cost, tokens);
	const title = options.title ?? `Model Pricing Breakdown: ${modelLabel}`;
	const width = 64;
	const border = "─".repeat(width);

	const lines: string[] = [
		`┌${border}┐`,
		`│ ${title.padEnd(width - 2)} │`,
		`├${border}┤`,
	];

	if (!cost) {
		lines.push(`│ Status: PRICING UNKNOWN (${spend.unavailableReason ?? "no model cost registered"}`.padEnd(width - 1) + "│");
		lines.push(`│ Input Tokens:  ~${tokens.input.toLocaleString()} (Rate: unknown)`.padEnd(width - 1) + "│");
		lines.push(`│ Output Tokens: ~${tokens.output.toLocaleString()} (Rate: unknown)`.padEnd(width - 1) + "│");
		lines.push(`│ Passes:        ${tokens.passes}`.padEnd(width - 1) + "│");
		lines.push(`│ Estimated USD: unknown (admitted gap over guess)`.padEnd(width - 1) + "│");
		lines.push(`└${border}┘`);
		return lines.join("\n");
	}

	const rates = resolveRates(cost, tokens.input);
	const isTiered = rates !== cost;
	const tierThreshold = (rates as ModelCostTier).inputTokensAbove;

	const inCost = (tokens.input / 1_000_000) * rates.input;
	const outCost = (tokens.output / 1_000_000) * rates.output;
	const totalUsd = inCost + outCost;

	lines.push(`│ Model ID:      ${modelLabel}`.padEnd(width - 1) + "│");
	lines.push(`│ Pricing Tier:  ${isTiered ? `Long-Context Tier (> ${tierThreshold?.toLocaleString()} tokens)` : "Standard Tier"}`.padEnd(width - 1) + "│");
	lines.push(`│ Input Rate:    $${rates.input.toFixed(3)} / 1M tokens`.padEnd(width - 1) + "│");
	lines.push(`│ Output Rate:   $${rates.output.toFixed(3)} / 1M tokens`.padEnd(width - 1) + "│");
	lines.push(`├${border}┤`);
	lines.push(`│ Projected Volume:`.padEnd(width - 1) + "│");
	lines.push(`│   Input:   ~${tokens.input.toLocaleString()} tokens → $${inCost.toFixed(4)} USD`.padEnd(width - 1) + "│");
	lines.push(`│   Output:  ~${tokens.output.toLocaleString()} tokens → $${outCost.toFixed(4)} USD`.padEnd(width - 1) + "│");
	lines.push(`│   Passes:  ${tokens.passes} pass(es)`.padEnd(width - 1) + "│");

	if (options.showCacheCredits !== false && rates.cacheRead !== undefined) {
		const cache = calculateCacheDiscount(cost, tokens);
		lines.push(`├${border}┤`);
		lines.push(`│ Cache-Read Credit Potential:`.padEnd(width - 1) + "│");
		lines.push(`│   Cache Rate:   $${rates.cacheRead.toFixed(4)} / 1M tokens`.padEnd(width - 1) + "│");
		lines.push(`│   Max Savings:  ~$${cache.maxPotentialSavings.toFixed(4)} USD (${Math.round(cache.discountRatio * 100)}% discount on hits)`.padEnd(width - 1) + "│");
	}

	lines.push(`├${border}┤`);
	lines.push(`│ UPPER BOUND TOTAL: ~$${totalUsd.toFixed(4)} USD`.padEnd(width - 1) + "│");
	lines.push(`└${border}┘`);

	return lines.join("\n");
}

/**
 * Compare pricing across multiple model providers for a token volume.
 */
export function formatModelComparisonMatrix(
	tokens: TokenEstimate,
	catalog: Record<string, ModelCost> = STANDARD_MODEL_CATALOG,
): string {
	const header = "Model Provider Comparison Matrix";
	const col1 = "Model";
	const col2 = "In ($/1M)";
	const col3 = "Out ($/1M)";
	const col4 = "Est. Total";
	const col5 = "Relative";

	const rows: { model: string; inRate: string; outRate: string; totalStr: string; total: number }[] = [];

	let baseCost = 0;
	const firstEntry = Object.entries(catalog)[0];
	if (firstEntry) {
		const baseSpend = estimateSpend(firstEntry[1], tokens);
		baseCost = baseSpend.usd ?? 1;
	}

	for (const [name, cost] of Object.entries(catalog)) {
		const spend = estimateSpend(cost, tokens);
		const rates = resolveRates(cost, tokens.input);
		const total = spend.usd ?? 0;
		rows.push({
			model: name,
			inRate: `$${rates.input.toFixed(2)}`,
			outRate: `$${rates.output.toFixed(2)}`,
			totalStr: `$${total.toFixed(4)}`,
			total,
		});
	}

	const wModel = 20;
	const wIn = 12;
	const wOut = 12;
	const wTotal = 14;
	const wRel = 12;

	const line = "─".repeat(wModel + wIn + wOut + wTotal + wRel + 4);

	const formattedRows = rows.map((r) => {
		const rel = baseCost > 0 ? `${(r.total / baseCost).toFixed(2)}x` : "-";
		return `${r.model.padEnd(wModel)} ${r.inRate.padEnd(wIn)} ${r.outRate.padEnd(wOut)} ${r.totalStr.padEnd(wTotal)} ${rel.padEnd(wRel)}`;
	});

	return [
		header,
		`Tokens: ~${tokens.input.toLocaleString()} in / ~${tokens.output.toLocaleString()} out (${tokens.passes} pass(es))`,
		line,
		`${col1.padEnd(wModel)} ${col2.padEnd(wIn)} ${col3.padEnd(wOut)} ${col4.padEnd(wTotal)} ${col5.padEnd(wRel)}`,
		line,
		...formattedRows,
		line,
	].join("\n");
}
