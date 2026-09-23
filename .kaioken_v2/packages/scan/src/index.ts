export { scan, toPosix } from "./scan.js";
export {
	KAIOKEN_DIR,
	SCAN_ARTIFACT,
	readScanArtifact,
	scanArtifactPath,
	writeScanArtifact,
} from "./artifact.js";
export { classifyRisk, hasCredentialContent, isBinary, looksLikeLiveSecret } from "./risk.js";
export { detectLanguage, extensionOf, languageFromShebang } from "./language.js";
export { DEFAULT_IGNORES, IgnoreStack, parseIgnoreText, readIgnoreFiles } from "./ignore.js";
export type { FileRecord, Risk, ScanOptions, ScanResult } from "./types.js";
