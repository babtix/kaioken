/** Risk classes flagged during the scan traversal. */
export type Risk =
	| "private_key"
	| "credentials"
	| "generated"
	| "large_binary"
	| "lockfile";

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
}

export interface ScanResult {
	/** Absolute path of the scanned root. */
	root: string;
	scannedAt: string;
	fileCount: number;
	totalBytes: number;
	/** Sorted by path, so the artifact is diffable. */
	files: FileRecord[];
}

export interface ScanOptions {
	/** Extra ignore patterns, gitignore syntax, applied at the root. */
	ignore?: string[];
	/** Files at or above this size are never read past the detection window. */
	maxReadBytes?: number;
	/** Byte threshold above which a binary file is flagged `large_binary`. */
	largeBinaryBytes?: number;
	/** Skip loading .gitignore / .kaiokenignore. Used by tests. */
	noIgnoreFiles?: boolean;
	/** Follow symlinked directories. Off by default — cycles are not worth the risk. */
	followSymlinks?: boolean;
}
