import type { JsonValue, SessionCreateOptions, SessionMetadata } from "../types.js";

export interface FileInfo {
	mtimeMs: number;
	size: number;
	isDirectory: boolean;
}

export interface DirEntry {
	name: string;
	path: string;
	kind: "file" | "directory" | "symlink";
}

export interface JsonlSessionRepoFileSystem {
	absolutePath(path: string): Promise<string>;
	joinPath(parts: string[]): Promise<string>;
	readTextFile(path: string): Promise<string>;
	readTextLines(path: string, options?: { maxLines?: number }): Promise<string[]>;
	writeFile(path: string, content: string): Promise<void>;
	appendFile(path: string, content: string): Promise<void>;
	renameFile(oldPath: string, newPath: string): Promise<void>;
	fileInfo(path: string): Promise<FileInfo>;
	listDir(path: string): Promise<DirEntry[]>;
	exists(path: string): Promise<boolean>;
	createDir(path: string, options?: { recursive?: boolean }): Promise<void>;
	remove(path: string, options?: { force?: boolean }): Promise<void>;
}

export interface JsonlSessionRepoOptions {
	fs: JsonlSessionRepoFileSystem;
	sessionsRoot: string;
}

export interface JsonlSessionMetadata extends SessionMetadata {
	cwd: string;
	path: string;
	modifiedAt: number;
	sourceFormat: 4;
}

export interface JsonlSessionCreateOptions extends SessionCreateOptions {
	cwd: string;
	metadata?: Record<string, JsonValue>;
}

export interface JsonlSessionListOptions {
	cwd?: string;
}

export interface JsonlV4Header {
	kind: "header";
	version: 4;
	id: string;
	createdAt: number;
	cwd: string;
	parentSessionId?: string;
	metadata?: Record<string, JsonValue>;
}
