import type { HighEntropyFinding } from "./entropy.ts";
import type { SecretFinding } from "./quarantine.ts";

/** Risk classes flagged during the scan traversal. */
export type Risk =
	| "private_key"
	| "credentials"
	| "generated"
	| "large_binary"
	| "lockfile"
	| "high_entropy"
	| "symlink_loop";

/** One file in the canonical file set. */
export interface FileRecord {
	/** Repo-relative, POSIX separators. Stable across platforms. */
	path: string;
	/** SHA-256 of the raw bytes, hex. Drives incremental reindex. */
	hash: string;
	size: number;
	/** Language id from extension, with a shebang fallback. "unknown" if undetermined. */
	language: string;
	binary: boolean;
	risk: Risk[];
	/** High entropy findings if entropy check is enabled. */
	entropyFindings?: HighEntropyFinding[];
}

export interface ScanResult {
	/** Absolute path of the scanned root. */
	root: string;
	scannedAt: string;
	fileCount: number;
	totalBytes: number;
	/** Sorted by path, so the artifact is diffable. */
	files: FileRecord[];
	/** Detailed secret findings for quarantine and table view. */
	secretFindings?: SecretFinding[];
	/** Symlink loops or circular junction paths detected during scan. */
	circularPaths?: string[];
}

/** Streaming real-time progress update during scan traversal. */
export interface ScanProgress {
	scannedFiles: number;
	scannedBytes: number;
	currentFile: string;
	throughputFilesPerSec: number;
	throughputBytesPerSec: number;
	elapsedMs: number;
	risksFound: number;
}

export interface ScanOptions {
	/** Extra ignore patterns, gitignore syntax, applied at the root. */
	ignore?: string[];
	/** Files at or above this size are never read past the detection window. */
	maxReadBytes?: number;
	/** Maximum bytes scanned for secrets in large text files. Defaults to 16MB. */
	maxSecretScanBytes?: number;
	/** Byte threshold above which a binary file is flagged `large_binary`. */
	largeBinaryBytes?: number;
	/** Skip loading .gitignore / .kaiokenignore. Used by tests. */
	noIgnoreFiles?: boolean;
	/** Follow symlinked directories. Off by default — cycles are not worth the risk. */
	followSymlinks?: boolean;
	/** Whether path matching and directory deduplication are case-insensitive. Defaults to true on Windows, false on Linux/other. */
	ignoreCase?: boolean;
	/** Streaming real-time progress callback. */
	onProgress?: (progress: ScanProgress) => void;
	/** Cancellation token to abort traversal. */
	signal?: AbortSignal;
	/** Flag high-entropy string literals as suspicious. */
	checkEntropy?: boolean;
	/** Custom minimum Shannon entropy threshold (defaults to 4.3). */
	entropyThreshold?: number;
}
