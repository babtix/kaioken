/**
 * The derived graph: what this repository's knowledge *is*, as data.
 *
 * Provenance says which files a document was written from; verification says
 * which of its claims held. Neither says how the knowledge fits together —
 * which documents share ground, which describe the same module, where the
 * coverage of a change would land. That relationship view is what a consumer
 * outside this machine needs, and it is derivable from artifacts that already
 * exist, so the graph is computed rather than stored: it cannot drift.
 *
 * Like every tenant, this package never sees a model or a credential. The
 * inputs are plain data — provenance records, claims, and the scan — so the
 * whole thing is testable offline.
 */

import type { Provenance } from "@kaioken/provenance";

/** Where a node in the graph came from. */
export type NodeKind = "chapter" | "section" | "card" | "skill";

export interface GraphNode {
	/** Stable identifier: provenance document id, or skill path. */
	id: string;
	kind: NodeKind;
	/** Human title: document title, card name, or skill file name. */
	title: string;
	/**
	 * Wiki-relative document path when the node has one. A section and its
	 * chapter share a path but differ in id; consumers that render the graph
	 * need to know which nodes are pages.
	 */
	path?: string;
}

/** What connects two nodes. */
export type EdgeKind =
	/** The document was written from this repository file. */
	| "written_from"
	/** Two documents draw on at least one shared source file. */
	| "shared_source"
	/** One document's claims name ground the other document covers. */
	| "references";

export interface GraphEdge {
	from: string;
	to: string;
	kind: EdgeKind;
	/**
	 * The concrete ground an edge stands on: source paths for
	 * `written_from`/`shared_source`, claim texts for `references`.
	 */
	via: string[];
}

export interface KnowledgeGraph {
	version: 1;
	generatedAt: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
}

export interface GraphStats {
	nodes: number;
	edges: number;
	/** Distinct repository files at least one document was written from. */
	coveredFiles: number;
	/** Files in the scan no document draws on. */
	uncoveredFiles: number;
	/** Documents with no connection to any other document. */
	isolated: string[];
}

export interface GraphBuildInput {
	provenance: readonly Provenance[];
	/**
	 * Claim texts per document id — the code spans a document asserts ground
	 * truth about. Cross-references are derived by matching these against other
	 * documents' source paths.
	 */
	claims?: Readonly<Record<string, readonly string[]>>;
	/** Titles by document id, when known. Falls back to the id. */
	titles?: Readonly<Record<string, string>>;
	/** Wiki-relative paths by document id, for nodes that are pages. */
	paths?: Readonly<Record<string, string>>;
	/** Handwritten procedures, indexed so the graph covers every tenant. */
	skills?: readonly { name: string; path: string }[];
	/** Repo-relative paths the scan contains, for the coverage figure. */
	scanPaths?: readonly string[];
	generatedAt?: string;
}
