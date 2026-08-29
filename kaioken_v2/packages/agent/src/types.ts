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

/** A tool as the knowledge layer defines it: a name, a shape, and a function. */
export interface KnowledgeTool {
	name: string;
	label: string;
	description: string;
	params: Record<string, ToolParam>;
	run(args: Record<string, unknown>, ctx: KnowledgeContext): Promise<ToolResult>;
}

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
