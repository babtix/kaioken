export type { PiAiClientOptions, RetryPolicy } from "./piai.ts";
export { ModelUnavailableError, PiAiClient } from "./piai.ts";
export type { Depth, ModelClient, ModelRequest } from "./port.ts";
export {
	BREADTH_THRESHOLD,
	depthFor,
	extractJson,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	parseMultiplier,
} from "./port.ts";
export {
	DEFAULT_CONCURRENCY,
	effectiveConcurrency,
	FREE_TIER_CONCURRENCY,
	isFreeModel,
	mapLimit,
	mapLimitSettled,
} from "./pool.ts";
export {
	contextTokensFor,
	DEFAULT_CONTEXT_TOKENS,
	describeSpend,
	estimatePipelineTokens,
	estimatePreflightTokens,
	estimateSpend,
	estimateStageTokens,
	estimateTokens,
	resolveRates,
	STAGE_CONTEXT_TOKENS,
} from "./spend.ts";
export type {
	PipelineStageSpec,
	PipelineTokenEstimate,
	PreflightOptions,
	SpendEstimate,
	TokenEstimate,
} from "./spend.ts";
export {
	describeMultiplierMode,
	formatMultiplierDial,
	formatSpendConfirmationPrompt,
	getMultiplierMode,
	renderDialGauge,
	SpendMultiplierDial,
} from "./dial.ts";
export type { DialFormatOptions, MultiplierMode } from "./dial.ts";
export {
	calculateCacheDiscount,
	formatModelComparisonMatrix,
	formatPricingCard,
	STANDARD_MODEL_CATALOG,
} from "./pricing.ts";
export type { PricingCardOptions } from "./pricing.ts";
export {
	BudgetCeilingManager,
	BudgetExceededError,
	formatSpendAuditReport,
} from "./budget.ts";
export type {
	BudgetCheckResult,
	BudgetOptions,
	BudgetSummary,
	SpendRecord,
} from "./budget.ts";
export {
	calculateOfflineSavings,
	formatOfflineModeBadge,
	isOfflineExecution,
} from "./offline.ts";
export type { OfflineBadgeOptions } from "./offline.ts";

// Step 29 additions (UX-0451 to UX-0500)
export {
	ALL_GOVERNANCE_STAGES,
	isGovernanceStage,
	STAGE_METADATA,
	type GovernanceStage,
	type GovernanceStageMeta,
} from "./stages.ts";
export {
	calculateStageCacheCredit,
	checkStageThresholdWarning,
	formatProviderComparisonMatrix,
	formatThresholdWarningPrompt,
	generateProviderComparisonMatrix,
	generateStageAuditReport,
	renderCacheCreditVisualizer,
	renderHistoricalSpendGraph,
	type ModelComparisonRow,
	type ProviderComparisonMatrixResult,
	type SpendDataPoint,
	type StageCacheCreditResult,
	type StageSpendDetail,
	type ThresholdOptions,
	type ThresholdWarningResult,
} from "./spend_governance.ts";
