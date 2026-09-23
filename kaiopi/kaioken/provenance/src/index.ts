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
export type {
	CategoryFreshness,
	ChangedSource,
	DiffHunk,
	DiffHunkLine,
	DocCategory,
	DocumentDriftReport,
	DocumentStatus,
	DriftKind,
	Freshness,
	FreshnessDial,
	FreshnessTier,
	InvalidationOptions,
	NormalizationOptions,
	Provenance,
	ProvenanceIndex,
	ProvenanceSource,
	RegenerationQueueStats,
	RegenerationTask,
	SourceDiff,
	StalenessOptions,
	StalenessReport,
} from "./types.ts";
