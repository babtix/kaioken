import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/build.ts";
import {
	exportGraphJson,
	graphStats,
	renderGraphMarkdown,
	renderGraphMermaid,
	toCytoscapeGraph,
	toD3Graph,
} from "../src/render.ts";
import type { Provenance } from "@kaioken/provenance";

function record(document: string, sources: string[]): Provenance {
	return {
		document,
		generatedAt: "2026-08-28T00:00:00Z",
		sources: sources.map((path) => ({ path, hash: `h-${path}` })),
	};
}

const graph = buildGraph({
	provenance: [
		record("core/scan.md", ["packages/scan/src/scan.ts", "packages/scan/src/ignore.ts"]),
		record("core/wiki.md", ["packages/wiki/src/run.ts", "packages/scan/src/scan.ts"]),
		record("card:scan", ["packages/scan/src/scan.ts"]),
	],
	claims: { "core/wiki.md": ["packages/scan/src/ignore.ts"] },
	skills: [{ name: "release", path: ".kaioken/skills/release.md" }],
});

describe("graphStats", () => {
	it("counts covered files, uncovered files and isolated documents", () => {
		const stats = graphStats(graph, {
			scanPaths: [
				"packages/scan/src/scan.ts",
				"packages/scan/src/ignore.ts",
				"packages/wiki/src/run.ts",
				"packages/serve/src/server.ts", // nothing written from this
			],
		});

		expect(stats.nodes).toBe(7); // 3 documents + 1 skill + 3 source files
		expect(stats.coveredFiles).toBe(3);
		expect(stats.uncoveredFiles).toBe(1);
		// Every document here shares ground with another (scan.ts is common),
		// so nothing is isolated — the isolation case is covered below.
		expect(stats.isolated).toEqual([]);
	});

	it("marks a document isolated only when no edge touches it", () => {
		const solo = buildGraph({
			provenance: [
				record("a.md", ["x.ts"]),
				record("b.md", ["y.ts"]),
			],
		});
		const stats = graphStats(solo, { scanPaths: ["x.ts", "y.ts"] });
		expect(stats.isolated).toEqual(["a.md", "b.md"]);
	});

	it("gives no coverage figure without a scan rather than inventing one", () => {
		expect(graphStats(graph).coverage).toBeNull();
	});
});

describe("renderGraphMarkdown", () => {
	const text = renderGraphMarkdown(graph, graphStats(graph));

	it("states the scale and coverage up front", () => {
		expect(text).toContain("7 nodes");
		expect(text).toContain("3 source files covered");
	});

	it("groups nodes by kind and lists the ground under each", () => {
		expect(text).toContain("## Chapters (2)");
		expect(text).toContain("## Cards (1)");
		expect(text).toContain("## Skills (1)");
		expect(text).toContain("`packages/scan/src/scan.ts`");
		expect(text).toContain("references core/scan.md via `packages/scan/src/ignore.ts`");
		expect(text).toContain("shares ground with: core/scan.md");
	});

	it("reports isolated documents rather than hiding them", () => {
		const solo = buildGraph({ provenance: [record("a.md", ["x.ts"])] });
		const rendered = renderGraphMarkdown(solo, graphStats(solo));
		expect(rendered).toContain("## Isolated");
		expect(rendered).toContain("- a.md");
	});
});

describe("coverage arithmetic", () => {
	it("never exceeds 100%, and counts only files the repository still has", () => {
		const built = buildGraph({
			provenance: [record("a.md", ["src/live.ts", "src/deleted.ts", "src/gone.ts"])],
		});

		const stats = graphStats(built, { scanPaths: ["src/live.ts", "src/undocumented.ts"] });

		// Sources since deleted must not inflate the numerator, and must not
		// cancel out a file nothing describes: 1 of 2, not 3 of 2.
		expect(stats.coverage).toBe(0.5);
		expect(stats.uncoveredFiles).toBe(1);
	});

	it("reports no coverage at all rather than 100% when there is no scan", () => {
		const built = buildGraph({ provenance: [record("a.md", ["src/live.ts"])] });

		expect(graphStats(built).coverage).toBeNull();
	});
});

describe("node rendering", () => {
	it("does not print a wiki node's path twice", () => {
		const built = buildGraph({
			provenance: [record("architecture/index.md", ["src/live.ts"])],
			titles: { "architecture/index.md": "Architecture" },
			// For a wiki document the path *is* the id.
			paths: { "architecture/index.md": "architecture/index.md" },
		});

		const markdown = renderGraphMarkdown(built, graphStats(built));

		expect(markdown).toContain("**Architecture**");
		expect(markdown).not.toContain("architecture/index.md (architecture/index.md)");
	});
});

describe("renderGraphMermaid", () => {
	it("renders Mermaid flowchart with subgraph clustering by directory/module", () => {
		const mermaid = renderGraphMermaid(graph);
		expect(mermaid).toContain("flowchart TD");
		expect(mermaid).toContain("subgraph ");
		expect(mermaid).toContain('["packages/scan/src"]');
		expect(mermaid).toContain('["core"]');
		expect(mermaid).toContain('["cards"]');
		expect(mermaid).toContain('["skills"]');
		expect(mermaid).toContain("-->|written_from|");
	});

	it("supports custom direction and renders empty graph safely", () => {
		const empty = renderGraphMermaid({ version: 1, generatedAt: "t", nodes: [], edges: [] }, { direction: "LR" });
		expect(empty).toBe("flowchart LR");
	});
});

describe("JSON export for D3 and Cytoscape", () => {
	it("converts knowledge graph to D3 node-link format", () => {
		const d3 = toD3Graph(graph);
		expect(d3.nodes.length).toBe(graph.nodes.length);
		expect(d3.links.length).toBe(graph.edges.length);
		expect(d3.links[0]).toHaveProperty("source");
		expect(d3.links[0]).toHaveProperty("target");
		expect(d3.links[0]).toHaveProperty("kind");
	});

	it("converts knowledge graph to Cytoscape elements format", () => {
		const cy = toCytoscapeGraph(graph);
		expect(cy.elements.nodes.length).toBe(graph.nodes.length);
		expect(cy.elements.edges.length).toBe(graph.edges.length);
		expect(cy.elements.nodes[0]?.data).toHaveProperty("id");
		expect(cy.elements.nodes[0]?.data).toHaveProperty("label");
		expect(cy.elements.edges[0]?.data).toHaveProperty("source");
		expect(cy.elements.edges[0]?.data).toHaveProperty("target");
	});

	it("exports formatted JSON strings for both formats", () => {
		const d3Json = exportGraphJson(graph, "d3");
		const parsedD3 = JSON.parse(d3Json);
		expect(parsedD3).toHaveProperty("nodes");
		expect(parsedD3).toHaveProperty("links");

		const cyJson = exportGraphJson(graph, "cytoscape");
		const parsedCy = JSON.parse(cyJson);
		expect(parsedCy).toHaveProperty("elements");
		expect(parsedCy.elements).toHaveProperty("nodes");
		expect(parsedCy.elements).toHaveProperty("edges");
	});
});

