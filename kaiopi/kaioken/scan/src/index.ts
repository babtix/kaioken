export { scan, toPosix } from "./scan.ts";
export {
	KAIOKEN_DIR,
	SCAN_ARTIFACT,
	readScanArtifact,
	scanArtifactPath,
	writeScanArtifact,
} from "./artifact.ts";
export {
	classifyRisk,
	extractSecretFindings,
	hasCredentialContent,
	hasPrivateKeyContent,
	isBinary,
	looksLikeLiveSecret,
	PROVIDER_SECRET_PATTERNS,
	type NamedPattern,
	type RiskInput,
} from "./risk.ts";
export { detectLanguage, extensionOf, languageFromShebang } from "./language.ts";
export {
	DEFAULT_IGNORES,
	IgnoreStack,
	parseIgnoreText,
	readIgnoreFiles,
	type IgnoreStackOptions,
} from "./ignore.ts";
export { BufferPool, defaultBufferPool } from "./pool.ts";
export {
	calculateMetricEntropy,
	calculateShannonEntropy,
	detectHighEntropyStrings,
	formatEntropyBar,
	maskToken,
	visualizeEntropyProfile,
	type EntropyOptions,
	type HighEntropyFinding,
} from "./entropy.ts";
export {
	analyzeStreamWithWindow,
	SlidingWindowAnalyzer,
	type BoundaryFinding,
	type SlidingWindowOptions,
	type SlidingWindowResult,
} from "./sliding-window.ts";
export {
	formatClassificationTable,
	quarantineSecretFile,
	suggestIgnoreRules,
	type QuarantineManifest,
	type QuarantineManifestEntry,
	type QuarantineOptions,
	type QuarantineResult,
	type SecretFinding,
} from "./quarantine.ts";
export type { FileRecord, Risk, ScanOptions, ScanProgress, ScanResult } from "./types.ts";
