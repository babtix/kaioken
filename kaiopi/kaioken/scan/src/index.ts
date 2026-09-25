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

// Step 28 additions (UX-0541 to UX-0600)
export {
	ALL_RISK_ARCHETYPES,
	ARCHETYPE_METADATA,
	isRiskArchetype,
	type RiskArchetype,
	type RiskArchetypeMeta,
} from "./archetypes.ts";
export {
	formatSuggestionSection,
	generateComprehensiveGitignore,
	suggestRulesForArchetype,
	type GitignoreSuggestion,
	type SuggestGitignoreOptions,
} from "./gitignore_suggest.ts";
export {
	analyzeStreamWithSlidingChunks,
	SlidingChunkAnalyzer,
	type BoundaryFinding as ChunkBoundaryFinding,
	type SlidingChunkAnalyzerOptions,
	type SlidingChunkResult,
} from "./sliding_chunk.ts";
export {
	defaultWhitelistManager,
	WhitelistManager,
	type WhitelistCheckInput,
	type WhitelistCheckResult,
	type WhitelistRule,
} from "./whitelist.ts";
export {
	analyzeCharClasses,
	evaluateArchetypeEntropy,
	formatEntropyGauge,
	renderEntropyCard,
	type ArchetypeEntropyReport,
	type CharClassDistribution,
} from "./entropy_visualizer.ts";
export {
	sniffMimeAndArchetypes,
	type SniffedMimeResult,
} from "./mime_sniff.ts";
export {
	diagnosePaths,
	formatPathDiagnosticReport,
	inferPathArchetype,
	normalizeCanonicalPath,
	type PathDiagnosticIssue,
	type PathDiagnosticReport,
	type PathIssueType,
} from "./path_diagnostic.ts";
