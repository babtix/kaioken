import type { ModelCost } from "@earendil-works/pi-ai";
import { resolveRates, type TokenEstimate } from "./spend.ts";
import { STANDARD_MODEL_CATALOG } from "./pricing.ts";
import {
	ALL_GOVERNANCE_STAGES,
	type GovernanceStage,
	STAGE_METADATA,
} from "./stages.ts";

// ============================================================================
// Theme 1: Cache-Read Discount Credit Visualizer (UX-0451 - UX-0460)
// ============================================================================

export interface StageCacheCreditResult {
	stage: GovernanceStage;
	stageLabel: string;
	inputTokens: number;
	cachedTokens: number;
	uncachedTokens: number;
	cacheHitRatio: number;
	fullCostUsd: number;
	cachedCostUsd: number;
	savingsUsd: number;
	savingsPercentage: number;
	visualBar: string;
}

/**
 * Calculates prompt cache discount credit for a specific governance stage (UX-0451 - UX-0460).
 */
export function calculateStageCacheCredit(
	stage: GovernanceStage,
	inputTokens: number,
	cacheHitRatio = 0.8,
	modelCost: ModelCost = STANDARD_MODEL_CATALOG["gemini-2.5-pro"]!,
): StageCacheCreditResult {
	const meta = STAGE_METADATA[stage];
	const clampedRatio = Math.max(0, Math.min(1, cacheHitRatio));
	const cachedTokens = Math.round(inputTokens * clampedRatio);
	const uncachedTokens = inputTokens - cachedTokens;

	const rates = resolveRates(modelCost, inputTokens);
	const fullCostUsd = (inputTokens / 1_000_000) * rates.input;

	const cacheRate = rates.cacheRead ?? (rates.input * 0.25);
	const cachedCostUsd =
		(uncachedTokens / 1_000_000) * rates.input +
		(cachedTokens / 1_000_000) * cacheRate;

	const savingsUsd = Math.max(0, fullCostUsd - cachedCostUsd);
	const savingsPercentage = fullCostUsd > 0 ? (savingsUsd / fullCostUsd) * 100 : 0;

	// Visual bar format: [████████░░] 80.0% ($0.0420 USD Saved)
	const barWidth = 10;
	const filled = Math.round((clampedRatio) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
	const visualBar = `[${bar}] ${savingsPercentage.toFixed(1)}% Credit ($${savingsUsd.toFixed(4)} USD Saved)`;

	return {
		stage,
		stageLabel: meta.label,
		inputTokens,
		cachedTokens,
		uncachedTokens,
		cacheHitRatio: clampedRatio,
		fullCostUsd: Number(fullCostUsd.toFixed(5)),
		cachedCostUsd: Number(cachedCostUsd.toFixed(5)),
		savingsUsd: Number(savingsUsd.toFixed(5)),
		savingsPercentage: Number(savingsPercentage.toFixed(1)),
		visualBar,
	};
}

/**
 * Formats a terminal-ready visual card for stage prompt cache credit.
 */
export function renderCacheCreditVisualizer(
	credit: StageCacheCreditResult,
): string {
	return [
		`┌── Prompt Cache Credit: ${credit.stageLabel.padEnd(41)} ┐`,
		`│ Visual:      ${credit.visualBar.padEnd(52)} │`,
		`│ Cache Ratio: ${(credit.cacheHitRatio * 100).toFixed(1)}% (${credit.cachedTokens.toLocaleString()} of ${credit.inputTokens.toLocaleString()} tokens cached)`.padEnd(67) + "│",
		`│ Net Cost:    $${credit.cachedCostUsd.toFixed(4)} USD (Standard: $${credit.fullCostUsd.toFixed(4)} USD)`.padEnd(67) + "│",
		`│ Credit:      $${credit.savingsUsd.toFixed(4)} USD discount credited to session balance`.padEnd(67) + "│",
		`└───────────────────────────────────────────────────────────────────┘`,
	].join("\n");
}

// ============================================================================
// Theme 2: Detailed Post-Execution Token Expenditure Audit Report (UX-0461 - UX-0470)
// ============================================================================

export interface StageSpendDetail {
	stage: GovernanceStage;
	model: string;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens?: number;
	cacheWriteTokens?: number;
	latencyMs: number;
	usdCost: number;
	timestamp?: string;
	context?: string;
}

/**
 * Generates a structured post-execution token expenditure audit report (UX-0461 - UX-0470).
 */
export function generateStageAuditReport(
	detail: StageSpendDetail,
	sessionRemainingUsd?: number | null,
): string {
	const meta = STAGE_METADATA[detail.stage];
	const ts = detail.timestamp ?? new Date().toISOString();
	const totalTokens = detail.inputTokens + detail.outputTokens;
	const cacheRead = detail.cacheReadTokens ?? 0;
	const cacheRatio = detail.inputTokens > 0 ? ((cacheRead / detail.inputTokens) * 100).toFixed(1) : "0.0";

	const lines = [
		`╔═══════════════════════════════════════════════════════════════════╗`,
		`║           TOKEN EXPENDITURE AUDIT REPORT                          ║`,
		`╠═══════════════════════════════════════════════════════════════════╣`,
		`║ Stage:      ${meta.label.padEnd(53)} ║`,
		`║ Timestamp:  ${ts.padEnd(53)} ║`,
		`║ Model:      ${detail.model.padEnd(53)} ║`,
		`║ Latency:    ${(detail.latencyMs.toString() + " ms").padEnd(53)} ║`,
		`╟───────────────────────────────────────────────────────────────────╢`,
		`║ Input Tokens:       ${detail.inputTokens.toLocaleString().padEnd(45)} ║`,
		`║ Output Tokens:      ${detail.outputTokens.toLocaleString().padEnd(45)} ║`,
		`║ Total Tokens:       ${totalTokens.toLocaleString().padEnd(45)} ║`,
		`║ Cache-Read Tokens:  ${(cacheRead.toLocaleString() + " (" + cacheRatio + "%)").padEnd(45)} ║`,
		`╟───────────────────────────────────────────────────────────────────╢`,
		`║ Stage Cost:         $${detail.usdCost.toFixed(5)} USD`.padEnd(68) + "║",
	];

	if (sessionRemainingUsd !== undefined && sessionRemainingUsd !== null) {
		lines.push(`║ Session Budget Left: $${sessionRemainingUsd.toFixed(4)} USD`.padEnd(68) + "║");
	}

	lines.push(`╚═══════════════════════════════════════════════════════════════════╝`);
	return lines.join("\n");
}

// ============================================================================
// Theme 3: Historical Spend Timeline Graph (UX-0471 - UX-0480)
// ============================================================================

export interface SpendDataPoint {
	timestamp: string;
	stage: GovernanceStage;
	tokens: number;
	usd: number;
	cachedRatio?: number;
}

/**
 * Renders an ASCII timeline graph showing token investment history for a stage (UX-0471 - UX-0480).
 */
export function renderHistoricalSpendGraph(
	stage: GovernanceStage,
	history: SpendDataPoint[],
	graphWidth = 24,
): string {
	const meta = STAGE_METADATA[stage];
	const filtered = history.filter((h) => h.stage === stage);

	if (filtered.length === 0) {
		return `[${meta.label}] Historical Spend: No prior runs recorded in session ledger.`;
	}

	const maxTokens = Math.max(...filtered.map((d) => d.tokens), 1);
	const totalSpendUsd = filtered.reduce((acc, d) => acc + d.usd, 0);
	const totalTokens = filtered.reduce((acc, d) => acc + d.tokens, 0);

	const lines = [
		`┌── Historical Spend Timeline: ${meta.label} ──┐`,
		`│ Runs: ${filtered.length.toString().padEnd(4)} | Total Spend: $${totalSpendUsd.toFixed(4)} USD | Total Tokens: ${totalTokens.toLocaleString().padEnd(8)} │`,
		`├──────────────────────────────────────────────────────────────────┤`,
	];

	for (let i = 0; i < filtered.length; i++) {
		const dp = filtered[i]!;
		const barLen = Math.max(1, Math.round((dp.tokens / maxTokens) * graphWidth));
		const bar = "■".repeat(barLen);
		const runLabel = `Run #${i + 1}`.padEnd(7);
		const tokenLabel = `${(dp.tokens / 1000).toFixed(1)}k tok`.padStart(9);
		const costLabel = `$${dp.usd.toFixed(4)}`.padStart(8);
		lines.push(`│ ${runLabel} | ${bar.padEnd(graphWidth)} | ${tokenLabel} | ${costLabel} │`);
	}

	lines.push(`└──────────────────────────────────────────────────────────────────┘`);
	return lines.join("\n");
}

// ============================================================================
// Theme 4: Threshold Warning Prompt Before Dispatching High-Context Requests (UX-0481 - UX-0490)
// ============================================================================

export interface ThresholdWarningResult {
	stage: GovernanceStage;
	stageLabel: string;
	triggered: boolean;
	projectedTokens: number;
	projectedCostUsd: number;
	thresholdTokens: number;
	thresholdUsd: number;
	warningMessage: string;
	confirmationPrompt: string;
}

export interface ThresholdOptions {
	modelCost?: ModelCost;
	customTokenThreshold?: number;
	customUsdThreshold?: number;
}

/**
 * Checks if a high-context dispatch exceeds threshold warnings for a stage (UX-0481 - UX-0490).
 */
export function checkStageThresholdWarning(
	stage: GovernanceStage,
	projectedTokens: number,
	options: ThresholdOptions = {},
): ThresholdWarningResult {
	const meta = STAGE_METADATA[stage];
	const thresholdTokens = options.customTokenThreshold ?? meta.warningThresholdTokens;
	const thresholdUsd = options.customUsdThreshold ?? meta.warningThresholdUsd;

	const costModel = options.modelCost ?? STANDARD_MODEL_CATALOG["gemini-2.5-pro"]!;
	const rates = resolveRates(costModel, projectedTokens);
	const projectedCostUsd = Number(((projectedTokens / 1_000_000) * rates.input).toFixed(5));

	const triggered = projectedTokens >= thresholdTokens || projectedCostUsd >= thresholdUsd;

	let warningMessage = "";
	let confirmationPrompt = "";

	if (triggered) {
		warningMessage =
			`⚠️ HIGH-CONTEXT THRESHOLD EXCEEDED for [${meta.label}]: ` +
			`Dispatch requires ${projectedTokens.toLocaleString()} tokens (~$${projectedCostUsd.toFixed(4)} USD), ` +
			`exceeding safety threshold of ${thresholdTokens.toLocaleString()} tokens ($${thresholdUsd.toFixed(2)} USD).`;

		confirmationPrompt =
			`Do you wish to proceed with dispatch for ${meta.label}? [y/N]`;
	} else {
		warningMessage = `✓ Context size (${projectedTokens.toLocaleString()} tokens) is within standard stage threshold (${thresholdTokens.toLocaleString()}).`;
		confirmationPrompt = `Proceed automatically.`;
	}

	return {
		stage,
		stageLabel: meta.label,
		triggered,
		projectedTokens,
		projectedCostUsd,
		thresholdTokens,
		thresholdUsd,
		warningMessage,
		confirmationPrompt,
	};
}

/**
 * Formats terminal prompt card for high-context threshold warnings.
 */
export function formatThresholdWarningPrompt(result: ThresholdWarningResult): string {
	if (!result.triggered) {
		return result.warningMessage;
	}

	return [
		`╔═══════════════════════════════════════════════════════════════════╗`,
		`║           HIGH-CONTEXT PRE-DISPATCH WARNING                       ║`,
		`╠═══════════════════════════════════════════════════════════════════╣`,
		`║ Stage:           ${result.stageLabel.padEnd(48)} ║`,
		`║ Projected Tokens: ${result.projectedTokens.toLocaleString().padEnd(48)} ║`,
		`║ Projected Cost:  $${result.projectedCostUsd.toFixed(4)} USD`.padEnd(68) + "║",
		`║ Token Ceiling:   ${result.thresholdTokens.toLocaleString()} tokens`.padEnd(68) + "║",
		`║ Cost Ceiling:    $${result.thresholdUsd.toFixed(2)} USD`.padEnd(68) + "║",
		`╟───────────────────────────────────────────────────────────────────╢`,
		`║ Action Required: High-context window packing requested.          ║`,
		`║ Prompt: ${result.confirmationPrompt.padEnd(57)} ║`,
		`╚═══════════════════════════════════════════════════════════════════╝`,
	].join("\n");
}

// ============================================================================
// Theme 5: Model Provider Comparison Matrix Calculating Cost Savings (UX-0491 - UX-0500)
// ============================================================================

export interface ModelComparisonRow {
	modelKey: string;
	inputCostPerMillion: number;
	outputCostPerMillion: number;
	cacheDiscountRatio: number;
	estimatedUsd: number;
	savingsVsBaselineUsd: number;
	savingsVsBaselinePercent: number;
	isBaseline: boolean;
	isRecommended: boolean;
}

export interface ProviderComparisonMatrixResult {
	stage: GovernanceStage;
	stageLabel: string;
	tokenEstimate: TokenEstimate;
	baselineModel: string;
	recommendedModel: string;
	rows: ModelComparisonRow[];
}

/**
 * Calculates comparative costs and savings across providers for a stage (UX-0491 - UX-0500).
 */
export function generateProviderComparisonMatrix(
	stage: GovernanceStage,
	tokens: TokenEstimate,
	baselineModel = "gemini-2.5-pro",
	candidateModels: string[] = [
		"offline-heuristic",
		"gemini-2.5-flash",
		"gpt-4o-mini",
		"gemini-2.5-pro",
		"gpt-4o",
		"claude-3-7-sonnet",
	],
): ProviderComparisonMatrixResult {
	const meta = STAGE_METADATA[stage];
	const baseCostObj = STANDARD_MODEL_CATALOG[baselineModel] ?? STANDARD_MODEL_CATALOG["gemini-2.5-pro"]!;
	const baseRates = resolveRates(baseCostObj, tokens.input);
	const baselineUsd =
		(tokens.input / 1_000_000) * baseRates.input +
		(tokens.output / 1_000_000) * baseRates.output;

	const rows: ModelComparisonRow[] = [];
	let lowestCost = Infinity;
	let recommendedModel = candidateModels[0]!;

	for (const modelKey of candidateModels) {
		const costObj = STANDARD_MODEL_CATALOG[modelKey];
		if (!costObj) continue;

		const rates = resolveRates(costObj, tokens.input);
		const inputCost = (tokens.input / 1_000_000) * rates.input;
		const outputCost = (tokens.output / 1_000_000) * rates.output;
		const estimatedUsd = Number((inputCost + outputCost).toFixed(5));

		const savingsVsBaselineUsd = Number((baselineUsd - estimatedUsd).toFixed(5));
		const savingsVsBaselinePercent =
			baselineUsd > 0 ? Number(((savingsVsBaselineUsd / baselineUsd) * 100).toFixed(1)) : 0;

		const isBaseline = modelKey === baselineModel;

		// Select best-value model (non-offline lowest cost, or offline if heuristic requested)
		if (modelKey !== "offline-heuristic" && estimatedUsd < lowestCost) {
			lowestCost = estimatedUsd;
			recommendedModel = modelKey;
		}

		rows.push({
			modelKey,
			inputCostPerMillion: rates.input,
			outputCostPerMillion: rates.output,
			cacheDiscountRatio: rates.cacheRead ? Number((1 - rates.cacheRead / rates.input).toFixed(2)) : 0.75,
			estimatedUsd,
			savingsVsBaselineUsd,
			savingsVsBaselinePercent,
			isBaseline,
			isRecommended: false,
		});
	}

	// Flag recommended row
	for (const r of rows) {
		if (r.modelKey === recommendedModel) {
			r.isRecommended = true;
		}
	}

	return {
		stage,
		stageLabel: meta.label,
		tokenEstimate: tokens,
		baselineModel,
		recommendedModel,
		rows,
	};
}

/**
 * Formats a clean terminal comparison matrix table.
 */
export function formatProviderComparisonMatrix(
	matrix: ProviderComparisonMatrixResult,
): string {
	const header = [
		`╔═════════════════════════════════════════════════════════════════════════════════╗`,
		`║           PROVIDER COMPARISON MATRIX: COST SAVINGS BREAKDOWN                   ║`,
		`╠═════════════════════════════════════════════════════════════════════════════════╣`,
		`║ Stage: ${matrix.stageLabel.padEnd(52)} | Baseline: ${matrix.baselineModel.padEnd(16)} ║`,
		`║ Inputs: ${matrix.tokenEstimate.input.toLocaleString()} tok | Outputs: ${matrix.tokenEstimate.output.toLocaleString()} tok | Recommended: ${matrix.recommendedModel.padEnd(20)} ║`,
		`╟─────────────────────┬──────────────┬──────────────┬──────────────┬──────────────╢`,
		`║ Model Provider      │ In/M ($)     │ Out/M ($)    │ Est. Cost    │ Savings      ║`,
		`╟─────────────────────┼──────────────┼──────────────┼──────────────┼──────────────╢`,
	];

	const rows = matrix.rows.map((r) => {
		const recBadge = r.isRecommended ? " ★" : r.isBaseline ? " (Base)" : "";
		const modelDisplay = (r.modelKey + recBadge).padEnd(19);
		const inCost = `$${r.inputCostPerMillion.toFixed(2)}`.padEnd(12);
		const outCost = `$${r.outputCostPerMillion.toFixed(2)}`.padEnd(12);
		const est = `$${r.estimatedUsd.toFixed(4)}`.padEnd(12);
		const savings = r.isBaseline
			? "baseline    "
			: r.savingsVsBaselinePercent >= 0
				? `+${r.savingsVsBaselinePercent.toFixed(1)}%`.padEnd(12)
				: `${r.savingsVsBaselinePercent.toFixed(1)}%`.padEnd(12);

		return `║ ${modelDisplay} │ ${inCost} │ ${outCost} │ ${est} │ ${savings} ║`;
	});

	const footer = [
		`╚═════════════════════╧══════════════════════╧══════════════╧══════════════╧══════════════╝`,
	];

	return [...header, ...rows, ...footer].join("\n");
}
