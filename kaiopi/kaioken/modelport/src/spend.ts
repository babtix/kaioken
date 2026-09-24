/**
 * Upfront spend estimation.
 *
 * Invariant 9 says cost transparency is mechanical, not aspirational, which
 * means two rules hold here:
 *
 *  1. Prices are never hardcoded. They are read from the active model's own
 *     cost registry, so a price change is a config change, not a code change.
 *  2. An estimate that cannot be computed is reported as unknown rather than
 *     guessed at. A wrong number is worse than an admitted gap.
 *
 * The token side is derived from the same `depthFor` dial that drives the
 * pipeline, so the estimate cannot drift away from what actually runs.
 */
import type { ModelCost, ModelCostRates, ModelCostTier } from "@earendil-works/pi-ai";
import { depthFor } from "./port.ts";

export interface TokenEstimate {
	/** Total input tokens across every pass. */
	input: number;
	/** Total output tokens across every pass. */
	output: number;
	/** How many model calls the estimate assumes. */
	passes: number;
}

export interface SpendEstimate extends TokenEstimate {
	/** Estimated cost in USD, or null when no pricing is available. */
	usd: number | null;
	/** The pricing tier that was selected, when the model defines tiers. */
	tierThreshold: number | null;
	/** Populated when `usd` is null, explaining why. */
	unavailableReason?: string;
}

/**
 * Rough per-stage context sizes.
 *
 * These are input budgets for a single pass, in tokens. They are deliberately
 * coarse: the point of the gate is to catch an order-of-magnitude surprise
 * before the user pays for it, not to predict the invoice to the cent.
 */
export const STAGE_CONTEXT_TOKENS: Record<string, number> = {
	plan: 25_000,
	cards: 12_000,
	wiki: 30_000,
	update: 18_000,
	research: 40_000,
	skillgen: 15_000,
};

export const DEFAULT_CONTEXT_TOKENS = 25_000;

export function contextTokensFor(action: string): number {
	return STAGE_CONTEXT_TOKENS[action] ?? DEFAULT_CONTEXT_TOKENS;
}

/**
 * Estimate the tokens a stage will consume at a given multiplier.
 *
 * Passes come from `depthFor`, which is the same function the pipeline uses to
 * decide how many repair and critique passes to run — so raising the multiplier
 * raises the estimate for the same reason it raises the work.
 */
export function estimateTokens(
	multiplier: number,
	contextSize: number,
	itemCount = 1,
): TokenEstimate {
	const depth = depthFor(multiplier);
	const passesPerItem = 1 + depth.repairPasses + depth.critiquePasses;
	const count = Math.max(1, itemCount);
	const passes = passesPerItem * count;
	return {
		input: Math.round(contextSize * passes),
		output: Math.round(depth.maxOutputTokens * passes),
		passes,
	};
}

export function estimateStageTokens(
	action: string,
	multiplier: number,
	itemCount = 1,
): TokenEstimate {
	return estimateTokens(multiplier, contextTokensFor(action), itemCount);
}

export interface PreflightOptions {
	itemCount?: number;
	/** Optional explicit context tokens (e.g. from exact AST or file char count). */
	explicitContextTokens?: number;
	/** Approximate character count to convert to tokens (~4 chars per token). */
	characterCount?: number;
}

/**
 * Real-time pre-flight token estimation calculation before model dispatches.
 *
 * Implements features UX-0401 through UX-0410.
 */
export function estimatePreflightTokens(
	action: string,
	multiplier: number,
	options: PreflightOptions = {},
): TokenEstimate {
	let contextSize = contextTokensFor(action);
	if (typeof options.explicitContextTokens === "number" && options.explicitContextTokens > 0) {
		contextSize = options.explicitContextTokens;
	} else if (typeof options.characterCount === "number" && options.characterCount > 0) {
		// Heuristic ~4 characters per token
		contextSize = Math.max(100, Math.round(options.characterCount / 4));
	}
	return estimateTokens(multiplier, contextSize, options.itemCount ?? 1);
}

export interface PipelineStageSpec {
	stage: string;
	itemCount?: number;
	explicitContextTokens?: number;
}

export interface PipelineTokenEstimate {
	stages: Record<string, TokenEstimate>;
	total: TokenEstimate;
}

/**
 * Summarize full pipeline token consumption across multiple stages.
 */
export function estimatePipelineTokens(
	stages: PipelineStageSpec[],
	multiplier: number,
): PipelineTokenEstimate {
	const resultStages: Record<string, TokenEstimate> = {};
	let totalInput = 0;
	let totalOutput = 0;
	let totalPasses = 0;

	for (const spec of stages) {
		const est = estimatePreflightTokens(spec.stage, multiplier, {
			itemCount: spec.itemCount,
			explicitContextTokens: spec.explicitContextTokens,
		});
		resultStages[spec.stage] = est;
		totalInput += est.input;
		totalOutput += est.output;
		totalPasses += est.passes;
	}

	return {
		stages: resultStages,
		total: {
			input: totalInput,
			output: totalOutput,
			passes: totalPasses,
		},
	};
}

/**
 * Pick the rate card that applies to a request.
 *
 * A tier applies to the whole request when the request's input exceeds its
 * `inputTokensAbove` threshold; the highest matching threshold wins. Without
 * this, long-context requests would be quoted at the cheap short-context rate.
 */
export function resolveRates(cost: ModelCost, inputTokens: number): ModelCostRates {
	const tiers = cost.tiers;
	if (!tiers?.length) return cost;

	let best: ModelCostRates = cost;
	let bestThreshold = -Infinity;
	for (const tier of tiers) {
		if (inputTokens >= tier.inputTokensAbove && tier.inputTokensAbove > bestThreshold) {
			best = tier;
			bestThreshold = tier.inputTokensAbove;
		}
	}
	return best;
}

/**
 * Price a token estimate against a model's cost registry.
 *
 * `cacheRead` and `cacheWrite` are intentionally not modelled in the base usd cost:
 * the gate exists to bound worst-case spend, and cache behaviour only ever makes a
 * request cheaper. Ignoring it keeps the estimate an upper bound rather than a guess.
 */
export function estimateSpend(cost: ModelCost | undefined, tokens: TokenEstimate): SpendEstimate {
	if (!cost) {
		return {
			...tokens,
			usd: null,
			tierThreshold: null,
			unavailableReason: "no active model, so pricing is unknown",
		};
	}

	const rates = resolveRates(cost, tokens.input);
	const usd = (tokens.input / 1_000_000) * rates.input + (tokens.output / 1_000_000) * rates.output;

	return {
		...tokens,
		usd,
		tierThreshold: rates === cost ? null : ((rates as ModelCostTier).inputTokensAbove ?? null),
	};
}

/** One-line human summary, used verbatim in the confirmation dialog. */
export function describeSpend(action: string, multiplier: number, estimate: SpendEstimate, modelLabel: string): string {
	const lines = [
		`Kaioken spend estimate — ${action} ×${multiplier}`,
		`Model: ${modelLabel}`,
		`Tokens: ~${estimate.input.toLocaleString()} in / ~${estimate.output.toLocaleString()} out`,
		`Passes: ~${estimate.passes}`,
	];
	lines.push(
		estimate.usd === null
			? `Cost: unknown (${estimate.unavailableReason ?? "pricing unavailable"})`
			: `Cost: ~$${estimate.usd.toFixed(4)} USD`,
	);
	lines.push("This is an estimate, not a quote. Proceed?");
	return lines.join("\n");
}
