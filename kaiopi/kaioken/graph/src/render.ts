import type { CytoscapeGraph, D3Graph, GraphNode, KnowledgeGraph } from "./types.ts";

/**
 * Summarise the graph: what it covers and what it leaves out.
 *
 * The numbers a consumer needs before trusting a handoff. Coverage against the
 * scan is the honest denominator, exactly as staleness reports it: documents
 * are selective, and saying so beats implying the graph is complete.
 */
export function graphStats(
	graph: KnowledgeGraph,
	options: { scanPaths?: readonly string[] } = {},
): {
	nodes: number;
	edges: number;
	coveredFiles: number;
	uncoveredFiles: number;
	isolated: string[];
	coverage: number | null;
} {
	const documents = graph.nodes.filter(
		(n) => n.kind !== "skill" && n.kind !== "source" && n.kind !== "file",
	);
	const covered = new Set(
		graph.edges.filter((e) => e.kind === "written_from").flatMap((e) => e.via),
	);

	const scanPaths = options.scanPaths ?? [];
	const scanned = new Set(scanPaths);
	const uncovered = scanPaths.filter((p) => !covered.has(p));

	// Only files the repository still contains can count towards describing it.
	// `covered` is every path any document was written from, which includes
	// sources since deleted — counting those put the ratio above 100% after a
	// refactor, and let a deleted file silently cancel out an undocumented one.
	const describedNow = [...covered].filter((path) => scanned.has(path)).length;

	// Only edges between documents count: `written_from` ties every document
	// to its sources, and by that reading no document is ever isolated. The
	// question is whether it shares ground with any other document.
	const documentIds = new Set(documents.map((n) => n.id));
	const connected = new Set(
		graph.edges
			.filter((e) => documentIds.has(e.from) && documentIds.has(e.to))
			.flatMap((e) => [e.from, e.to]),
	);
	const isolated = documents.filter((n) => !connected.has(n.id)).map((n) => n.id);

	return {
		nodes: graph.nodes.length,
		edges: graph.edges.length,
		coveredFiles: covered.size,
		uncoveredFiles: uncovered.length,
		isolated: isolated.sort(),
		// No scan means no honest denominator; reporting 100% would be a claim
		// nobody made.
		coverage: scanned.size === 0 ? null : describedNow / scanned.size,
	};
}

/**
 * The export's human-readable half.
 *
 * A JSON graph is for programs; a person handing knowledge to another agent or
 * a new teammate needs the shape in prose, with the ground each document
 * stands on listed where they can see it.
 */
export function renderGraphMarkdown(
	graph: KnowledgeGraph,
	stats: ReturnType<typeof graphStats>,
): string {
	const lines: string[] = [
		"# Knowledge graph",
		"",
		`Derived from this repository's generated knowledge: ${stats.nodes} nodes, ` +
			`${stats.edges} edges, ${stats.coveredFiles} source files covered.` +
			(stats.coverage !== null
				? ` ${(stats.coverage * 100).toFixed(0)}% of scanned files are described.`
				: ""),
		"",
	];

	const byKind = groupBy(graph.nodes, (n) => n.kind);
	for (const kind of ["chapter", "section", "card", "skill"] as const) {
		const nodes = byKind.get(kind) ?? [];
		if (nodes.length === 0) continue;
		lines.push(`## ${kindLabel(kind, nodes.length)}`, "");
		for (const node of nodes) {
			const sources = graph.edges
				.filter((e) => e.kind === "written_from" && e.from === node.id)
				.flatMap((e) => e.via);
			const refs = graph.edges.filter((e) => e.from === node.id && e.kind === "references");
			// A shared_source edge is stored once for the pair but true in both
			// directions, so peers are read from both ends.
			const shared = graph.edges
				.filter(
					(e) =>
						e.kind === "shared_source" && (e.from === node.id || e.to === node.id),
				)
				.map((e) => (e.from === node.id ? e.to : e.from))
				.sort();

			// A wiki node's path *is* its id, so printing both rendered
			// `architecture/index.md (architecture/index.md)`. The parenthetical
			// is only worth the space when it says something the id did not.
			const primary = kind === "skill" ? (node.path ?? node.title) : node.id;
			const secondary = node.path && kind !== "skill" && node.path !== node.id
				? ` (${node.path})`
				: "";
			lines.push(`- **${node.title}** — ${primary}${secondary}`);
			if (sources.length > 0) {
				lines.push(`  - written from: ${sources.map((s) => `\`${s}\``).join(", ")}`);
			}
			for (const ref of refs) {
				lines.push(`  - references ${ref.to} via ${ref.via.map((v) => `\`${v}\``).join(", ")}`);
			}
			if (shared.length > 0) {
				lines.push(`  - shares ground with: ${shared.join(", ")}`);
			}
		}
		lines.push("");
	}

	if (stats.isolated.length > 0) {
		lines.push(
			"## Isolated",
			"",
			"These documents share no source with any other — either their subject is",
			"distinct, or the knowledge around it was never written:",
			"",
			...stats.isolated.map((id) => `- ${id}`),
			"",
		);
	}

	return lines.join("\n");
}

function kindLabel(kind: GraphNode["kind"], count: number): string {
	switch (kind) {
		case "chapter":
			return `Chapters (${count})`;
		case "section":
			return `Sections (${count})`;
		case "card":
			return `Cards (${count})`;
		case "skill":
			return `Skills (${count})`;
		case "source":
			return `Sources (${count})`;
		case "file":
			return `Files (${count})`;
	}
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
	const out = new Map<string, T[]>();
	for (const item of items) {
		const k = key(item);
		const list = out.get(k) ?? [];
		list.push(item);
		out.set(k, list);
	}
	return out;
}

export interface MermaidOptions {
	direction?: "TD" | "LR";
	includeEdgeLabels?: boolean;
}

/**
 * Render a Mermaid flowchart with subgraph clustering by directory or module.
 * Subgraph clustering organizes nodes into directory/module boundaries so large
 * graphs (40+ nodes) remain navigable and legible.
 */
export function renderGraphMermaid(
	graph: KnowledgeGraph,
	options: MermaidOptions = {},
): string {
	const direction = options.direction ?? "TD";
	const lines: string[] = [`flowchart ${direction}`];

	if (graph.nodes.length === 0) return lines.join("\n");

	const idMap = new Map<string, string>();
	for (let i = 0; i < graph.nodes.length; i++) {
		const node = graph.nodes[i] as GraphNode;
		idMap.set(node.id, `node_${i}`);
	}

	const clusters = new Map<string, GraphNode[]>();
	for (const node of graph.nodes) {
		const key = clusterKeyForNode(node);
		const list = clusters.get(key) ?? [];
		list.push(node);
		clusters.set(key, list);
	}

	let clusterIndex = 0;
	for (const [clusterName, nodes] of [...clusters.entries()].sort(([a], [b]) => a.localeCompare(b))) {
		const subId = `subgraph_${clusterIndex++}`;
		lines.push(`  subgraph ${subId} ["${escapeMermaid(clusterName)}"]`);
		for (const node of nodes) {
			const safeId = idMap.get(node.id) as string;
			const label = escapeMermaid(node.title || node.id);
			lines.push(`    ${safeId}["${label}"]`);
		}
		lines.push("  end");
	}

	const includeLabels = options.includeEdgeLabels ?? true;
	for (const edge of graph.edges) {
		const fromId = idMap.get(edge.from);
		const toId = idMap.get(edge.to);
		if (!fromId || !toId) continue;

		if (includeLabels && edge.kind) {
			lines.push(`  ${fromId} -->|${edge.kind}| ${toId}`);
		} else {
			lines.push(`  ${fromId} --> ${toId}`);
		}
	}

	return lines.join("\n");
}

export const renderMermaid = renderGraphMermaid;

/**
 * Convert knowledge graph into D3-compatible node-link format.
 */
export function toD3Graph(graph: KnowledgeGraph): D3Graph {
	return {
		nodes: graph.nodes.map((n) => ({
			id: n.id,
			title: n.title,
			kind: n.kind,
			...(n.path ? { path: n.path } : {}),
		})),
		links: graph.edges.map((e) => ({
			source: e.from,
			target: e.to,
			kind: e.kind,
			via: e.via,
		})),
	};
}

/**
 * Convert knowledge graph into Cytoscape.js elements format.
 */
export function toCytoscapeGraph(graph: KnowledgeGraph): CytoscapeGraph {
	return {
		elements: {
			nodes: graph.nodes.map((n) => ({
				data: {
					id: n.id,
					label: n.title,
					kind: n.kind,
					...(n.path ? { path: n.path } : {}),
				},
			})),
			edges: graph.edges.map((e, index) => ({
				data: {
					id: `e_${index}`,
					source: e.from,
					target: e.to,
					kind: e.kind,
					via: e.via,
				},
			})),
		},
	};
}

/**
 * Export graph as formatted JSON string for D3 or Cytoscape.
 */
export function exportGraphJson(
	graph: KnowledgeGraph,
	format: "d3" | "cytoscape" = "d3",
): string {
	const data = format === "cytoscape" ? toCytoscapeGraph(graph) : toD3Graph(graph);
	return `${JSON.stringify(data, null, 2)}\n`;
}

export const renderGraphJson = exportGraphJson;

function clusterKeyForNode(node: GraphNode): string {
	if (node.kind === "card" || node.id.startsWith("card:")) return "cards";
	if (node.kind === "skill" || node.id.startsWith("skill:")) return "skills";
	if (node.path) {
		const norm = node.path.replace(/\\/g, "/");
		const lastSlash = norm.lastIndexOf("/");
		if (lastSlash !== -1) {
			return norm.slice(0, lastSlash);
		}
		return "(root)";
	}
	const lastSlash = node.id.lastIndexOf("/");
	if (lastSlash !== -1) {
		return node.id.slice(0, lastSlash);
	}
	return "(root)";
}

function escapeMermaid(text: string): string {
	return text.replace(/["#;[\]]/g, " ").trim();
}
