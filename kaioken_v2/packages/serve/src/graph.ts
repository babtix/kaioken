import type { Library, WikiChapter, WikiDoc } from "./library.js";

/**
 * The wire format the ported graph engine (`graphEngineAsset.ts`, itself
 * ported from kaioken v1's `desktop/src/lib/graph/`) expects — field names
 * match what v1's `cli/internal/wiki/graph.go` emitted, so the engine needs
 * no changes to read this.
 *
 * Three relationships, same as v1: `contains` (a chapter's lead document to
 * its siblings, which is what gives the drawing its clusters), `links` (one
 * document to another, from relative .md links in its prose), and `source`
 * (a document to the repository files it was written from).
 */
export type GraphNodeKind = "doc" | "file" | "section";
export type GraphEdgeKind = "contains" | "links" | "source";

export interface GraphNode {
	id: string;
	kind: GraphNodeKind;
	label: string;
	/** Wiki-relative path of a doc node. */
	rel?: string;
	/** Repo-relative path of a file node. */
	path?: string;
	section?: string;
	is_section_doc?: boolean;
	/** A cited file that no longer exists in the working tree. */
	missing?: boolean;
}

export interface GraphEdge {
	source: string;
	target: string;
	kind: GraphEdgeKind;
}

export interface GraphStats {
	docs: number;
	files: number;
	sections: number;
	edges: number;
}

export interface Graph {
	root: string;
	nodes: GraphNode[];
	edges: GraphEdge[];
	stats: GraphStats;
}

export const docId = (path: string): string => `doc:${path}`;
const fileId = (path: string): string => `file:${path}`;
const sectionId = (id: string): string => `section:${id}`;

/**
 * The chapter's own opening document, when it has one — same rule the wiki
 * pages use to avoid printing a chapter's title twice. A chapter without one
 * gets a standalone section node instead of leaving its documents as
 * unconnected dots.
 */
function leadDoc(chapter: WikiChapter): WikiDoc | undefined {
	const first = chapter.docs[0];
	return first && first.title.trim() === chapter.title.trim() ? first : undefined;
}

/**
 * Derive the same graph v1 drew, from what `readLibrary` already parsed —
 * no extra file reads, no separate stored artifact. A repository with no
 * wiki yields an empty graph rather than an error.
 */
export function buildGraph(root: string, library: Library): Graph {
	const nodes: GraphNode[] = [];
	const seen = new Set<string>();
	const edges: GraphEdge[] = [];
	const addEdge = (source: string, target: string, kind: GraphEdgeKind): void => {
		const key = `${kind}|${source}|${target}`;
		if (seen.has(key)) return;
		seen.add(key);
		edges.push({ source, target, kind });
	};

	let sections = 0;
	for (const doc of library.docs) {
		const chapter = library.chapters.find((c) => c.id === doc.chapterId);
		nodes.push({
			id: docId(doc.path),
			kind: "doc",
			label: doc.title,
			rel: doc.path,
			section: doc.chapterId || undefined,
			is_section_doc: chapter ? leadDoc(chapter) === doc : false,
		});
	}

	// contains: every chapter's lead document to its siblings.
	for (const chapter of library.chapters) {
		if (chapter.docs.length === 0) continue;
		const lead = leadDoc(chapter);
		let hub: string;
		if (lead) {
			hub = docId(lead.path);
		} else {
			hub = sectionId(chapter.id);
			nodes.push({ id: hub, kind: "section", label: chapter.title, section: chapter.id });
			sections++;
		}
		for (const doc of chapter.docs) {
			if (docId(doc.path) === hub) continue;
			addEdge(hub, docId(doc.path), "contains");
		}
	}

	// links: relative .md links already resolved when the library was read.
	for (const doc of library.docs) {
		for (const target of doc.links) {
			addEdge(docId(doc.path), docId(target), "links");
		}
	}

	// source: the provenance record, plus a file node per unique source path.
	const files = new Map<string, boolean>(); // path -> missing
	for (const doc of library.docs) {
		for (const path of doc.sources) {
			if (!files.has(path)) files.set(path, doc.deleted.includes(path));
			else if (doc.deleted.includes(path)) files.set(path, true);
			addEdge(docId(doc.path), fileId(path), "source");
		}
	}
	for (const [path, missing] of files) {
		nodes.push({ id: fileId(path), kind: "file", label: basename(path), path, missing });
	}

	nodes.sort((a, b) => (a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)));
	edges.sort((a, b) =>
		a.kind === b.kind
			? a.source === b.source
				? a.target.localeCompare(b.target)
				: a.source.localeCompare(b.source)
			: a.kind.localeCompare(b.kind),
	);

	return {
		root,
		nodes,
		edges,
		stats: { docs: library.docs.length, files: files.size, sections, edges: edges.length },
	};
}

function basename(path: string): string {
	const i = path.lastIndexOf("/");
	return i === -1 ? path : path.slice(i + 1);
}
