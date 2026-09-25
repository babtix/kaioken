export {
	FastStalenessChecker,
	bindingKeyFor,
	changedSourcesFor,
	computeStaleness,
	fastCheckStaleness,
	invalidatedBy,
	isDocumentableFile,
	rangeBindingKey,
	symbolBindingKey,
} from "./staleness.ts";
export {
	computeRangeHash,
	computeSymbolHashes,
	hasSymbolDrifted,
	normalizeSource,
	type SymbolSpan,
} from "./binding.ts";
export {
	calculateFreshnessDial,
	classifyDocCategory,
	formatFreshnessSummary,
	renderFreshnessDial,
	type DialRenderOptions,
} from "./dial.ts";
export { computeLineDiff, formatUnifiedDiff } from "./diff.ts";
export {
	generateDriftMarkdownReport,
	inspectDocumentDrift,
	renderTerminalDrift,
	type InspectOptions,
	type TerminalDriftOptions,
} from "./inspector.ts";
export {
	RegenerationQueue,
	createRegenerationQueue,
	type QueueOptions,
} from "./queue.ts";
export { checkDrift, gatherProvenance, readProvenanceIndex, readCardsSafe } from "./status.ts";
export {
	detectOrphanedDocumentation,
	formatOrphanReportMarkdown,
	getOrphanRecommendation,
} from "./orphan.ts";
export { buildHistoricalStalenessGraph } from "./graph.ts";
export {
	createDefaultToleranceConfig,
	isDriftWithinTolerance,
	normalizeForTolerance,
	stripComments,
	stripWhitespace,
} from "./tolerance.ts";
export { exportDriftComplianceReport } from "./compliance.ts";
export { instantZeroTokenStalenessCheck } from "./instant.ts";
export type {
	CategoryCompliance,
	CategoryDecayMetric,
	CategoryFreshness,
	CategoryToleranceConfig,
	ChangedSource,
	DiffHunk,
	DiffHunkLine,
	DocCategory,
	DocumentDriftReport,
	DocumentStatus,
	DriftComplianceOptions,
	DriftComplianceReport,
	DriftKind,
	Freshness,
	FreshnessDial,
	FreshnessTier,
	HistoricalStalenessGraph,
	InstantCategoryHealth,
	InstantStalenessResult,
	InvalidationOptions,
	NormalizationOptions,
	OrphanDetectionOptions,
	OrphanItem,
	OrphanRecommendation,
	OrphanReport,
	Provenance,
	ProvenanceIndex,
	ProvenanceSource,
	RegenerationQueueStats,
	RegenerationTask,
	RemediationPriorityItem,
	SourceDiff,
	StalenessDataPoint,
	StalenessOptions,
	StalenessReport,
	StalenessSnapshot,
	ToleranceConfig,
	ToleranceEvaluation,
} from "./types.ts";

