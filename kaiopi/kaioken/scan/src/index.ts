export { scan, toPosix } from "./scan.ts";
export {
	KAIOKEN_DIR,
	SCAN_ARTIFACT,
	readScanArtifact,
	scanArtifactPath,
	writeScanArtifact,
} from "./artifact.ts";
export { classifyRisk, hasCredentialContent, hasPrivateKeyContent, isBinary, looksLikeLiveSecret } from "./risk.ts";
export { detectLanguage, extensionOf, languageFromShebang } from "./language.ts";
export { DEFAULT_IGNORES, IgnoreStack, parseIgnoreText, readIgnoreFiles, type IgnoreStackOptions } from "./ignore.ts";
export type { FileRecord, Risk, ScanOptions, ScanResult } from "./types.ts";
