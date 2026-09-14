import type { IndexResult, SymbolOracle } from "@kaioken/index";
import type { Provenance } from "@kaioken/provenance";
import type { ScanResult } from "@kaioken/scan";
import type { SearchHit, SearchQuery } from "@kaioken/search";
import type { Skill } from "./skills.js";

/**
 * The agent surface, described without a transport.
 *
 * Phases 1-5 built a knowledge layer that answers questions definitively; this
 * phase hands those answers to a model. Everything about *what* a tool does and
 * *what it may say* lives here, in a package that cannot make a network call.
 * Only `apps/cli` knows an agent runtime exists, which is what keeps the tools
 * testable by calling them.
 */

export type ParamType = "string" | "number" | "boolean" | "string[]";

export interface ToolParam {
	type: ParamType;
	description: string;
	required?: boolean;
	/** Closed set of accepted values, when there is one. */
	choices?: string[];
}

export interface ToolResult {
	/** What the model is shown. */
	text: string;
	/** The same answer structured, for logs and `--json`. */
	details?: unknown;
	/**
	 * The call could not be answered. This is not the same as a negative answer:
	 * "this repository declares no such symbol" is a successful result, and the
	 * distinction matters because the model should trust the first and retry the
	 * second.
	 */
	isError?: boolean;
}

/** Callback for partial tool results streamed during execution. */
export type ToolUpdateCallback = (partial: ToolResult) => void;

/** Options passed to tool execution. */
export interface ToolRunOptions {
	signal?: AbortSignal;
	onUpdate?: ToolUpdateCallback;
}

/**
 * A tool as the knowledge layer defines it: a name, a shape, and a function.
 *
 * The optional `options` bag on `run` is backwards-compatible: existing call
 * sites that pass only (args, ctx) continue to work without change.
 */
export interface KnowledgeTool {
	name: string;
	label: string;
	description: string;
	params: Record<string, ToolParam>;
	run(
		args: Record<string, unknown>,
		ctx: KnowledgeContext,
		options?: ToolRunOptions,
	): Promise<ToolResult>;
}

/**
 * A coding tool with JSON Schema parameters (passthrough to provider).
 *
 * Unlike KnowledgeTool which takes a KnowledgeContext per call, a CodingTool
 * binds to ports at creation time. It never imports node:fs, node:child_process,
 * or any LLM SDK — the host injects concrete port implementations.
 */
export interface CodingTool {
	name: string;
	label: string;
	description: string;
	/** JSON Schema object for parameters, passed through to the provider. */
	inputSchema: Record<string, unknown>;
	run(
		args: Record<string, unknown>,
		options?: ToolRunOptions,
	): Promise<ToolResult>;
}

// ---------------------------------------------------------------------------
// Port interfaces — agent depends on shapes, never on concrete packages
// ---------------------------------------------------------------------------

/**
 * Search as the tools need it — one method.
 *
 * `SearchIndex` satisfies this structurally. Narrowing it here means a test can
 * hand the tools a two-line double instead of building an index, and means the
 * tool layer never sees the embedding provider it has no business knowing about.
 */
export interface SearchPort {
	search(query: SearchQuery): Promise<SearchHit[]>;
}

/** Filesystem operations for coding tools. Implemented by the host. */
export interface FileSystemPort {
	readFile(path: string, encoding: "utf8"): Promise<string>;
	writeFile(path: string, content: string): Promise<void>;
	exists(path: string): Promise<boolean>;
	mkdir(path: string): Promise<void>;
	readdir(path: string): Promise<Array<{ name: string; isDirectory: boolean; size: number }>>;
	stat(path: string): Promise<{ isFile: boolean; isDirectory: boolean; size: number }>;
}

/** Shell execution for coding tools. Implemented by the host. */
export interface ShellPort {
	exec(
		command: string,
		options: {
			cwd: string;
			signal?: AbortSignal;
			timeoutMs?: number;
			env?: Record<string, string>;
			onChunk?: (chunk: string) => void;
		},
	): Promise<{ exitCode: number | null; stdout: string; stderr: string }>;
}

/** Ports needed to construct coding tools. */
export interface CodingToolPorts {
	fs: FileSystemPort;
	shell: ShellPort;
}

export interface SessionPort {
	save(messages: unknown[]): Promise<void>;
	load(id: string): Promise<unknown[] | null>;
	list(): Promise<Array<{ id: string; title: string; updated: string }>>;
}

export interface CompactionPort {
	shouldCompact(messages: unknown[]): boolean;
	compact(messages: unknown[], signal?: AbortSignal): Promise<unknown[]>;
}

export interface ExtensionPort {
	/** Discover tools contributed by trusted extensions. */
	discoverTools(): Promise<CodingTool[]>;
}

export interface GitOpsPort {
	isRepo(root: string): Promise<boolean>;
	currentBranch(root: string): Promise<string | null>;
	checkpoint(root: string, message: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Context — unchanged
// ---------------------------------------------------------------------------

/**
 * Everything the tools read, loaded once per session.
 *
 * The tools take this rather than a root path because artifact loading is the
 * caller's job: the CLI already knows how to build phase-1 artifacts on demand,
 * and repeating that inside every tool would make each call cost a scan.
 */
export interface KnowledgeContext {
	root: string;
	index: IndexResult;
	oracle: SymbolOracle;
	scan: ScanResult;
	/** Every tenant's records. A chapter and a card age identically. */
	provenance: readonly Provenance[];
	skills: readonly Skill[];
	/** Absent until something has been indexed for search. */
	search: SearchPort | null;
}
