import type { GraphNode, KnowledgeGraph } from "./types.js";

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
	const documents = graph.nodes.filter((n) => n.kind !== "skill");
	const covered = new Set(
		graph.edges.filter((e) => e.kind === "written_from").flatMap((e) => e.via),
	);

	const scanPaths = options.scanPaths ?? [];
	const uncovered = scanPaths.filter((p) => !covered.has(p));

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
		coverage: scanPaths.length === 0 ? null : covered.size / new Set(scanPaths).size,
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
		`Derived from this repository's generated knowledge: ${stats.nodes} documents, ` +
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

			const parts = [`${kind === "skill" ? node.path ?? node.title : node.id}`];
			if (node.path && kind !== "skill") parts.push(` (${node.path})`);
			lines.push(`- **${node.title}** — ${parts[0]}${parts[1] ?? ""}`);
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
