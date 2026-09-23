import { describe, expect, it } from "vitest";
import { assertGraphIntegrity, buildCodeGraph, buildGraph, nodeKindFor, splitDocumentId } from "../src/build.ts";
import type { Provenance } from "@kaioken/provenance";

function record(
	document: string,
	sources: string[],
	extra: Partial<Provenance> = {},
): Provenance {
	return {
		document,
		generatedAt: "2026-08-28T00:00:00Z",
		sources: sources.map((path) => ({ path, hash: `h-${path}` })),
		...extra,
	};
}

describe("splitDocumentId", () => {
	it("namespaces cards and skills, treats the rest as wiki", () => {
		expect(splitDocumentId("card:scan")).toEqual({ kind: "card", id: "scan" });
		expect(splitDocumentId("skill:release.md")).toEqual({ kind: "skill", id: "release.md" });
		expect(splitDocumentId("core/retrieval.md")).toEqual({ kind: "chapter", id: "core/retrieval.md" });
	});

	it("distinguishes a section from its chapter by the record", () => {
		expect(nodeKindFor({ document: "core/retrieval.md" })).toBe("chapter");
		expect(nodeKindFor({ document: "core/retrieval.md", sectionId: "s-ranking" })).toBe("section");
	});
});

describe("buildGraph", () => {
	it("writes one written_from edge per source file", () => {
		const graph = buildGraph({
			provenance: [
				record("card:scan", ["packages/scan/src/scan.ts", "packages/scan/src/ignore.ts"]),
				record("card:wiki", ["packages/wiki/src/run.ts"]),
			],
			generatedAt: "2026-08-28T00:00:00Z",
		});

		const written = graph.edges.filter((e) => e.kind === "written_from");
		expect(written).toHaveLength(3);
		expect(written.map((e) => e.to)).toEqual([
			"packages/scan/src/ignore.ts",
			"packages/scan/src/scan.ts",
			"packages/wiki/src/run.ts",
		]);
	});

	it("connects documents over shared sources once, listing the ground", () => {
		const graph = buildGraph({
			provenance: [
				record("core/a.md", ["src/shared.ts", "src/a.ts"]),
				record("core/b.md", ["src/shared.ts", "src/b.ts"]),
			],
		});

		const shared = graph.edges.filter((e) => e.kind === "shared_source");
		expect(shared).toHaveLength(1);
		expect(shared[0]).toMatchObject({ from: "core/a.md", to: "core/b.md", via: ["src/shared.ts"] });
	});

	it("derives cross-references from claims naming another document's sources", () => {
		const graph = buildGraph({
			provenance: [
				record("cards/scan.md", ["packages/scan/src/scan.ts"]),
				record("cards/wiki.md", ["packages/wiki/src/run.ts"]),
			],
			claims: {
				"cards/wiki.md": [
					"packages/scan/src/scan.ts",
					"packages/wiki/src/run.ts", // own source: not a reference
					"computeStaleness", // not a path
				],
			},
		});

		const refs = graph.edges.filter((e) => e.kind === "references");
		expect(refs).toHaveLength(1);
		expect(refs[0]).toMatchObject({
			from: "cards/wiki.md",
			to: "cards/scan.md",
			via: ["packages/scan/src/scan.ts"],
		});
	});

	it("resolves shorthand paths but refuses ambiguous ones", () => {
		const graph = buildGraph({
			provenance: [
				record("a.md", ["packages/scan/src/scan.ts"]),
				record("b.md", ["packages/wiki/src/scan.ts"]),
			],
			claims: { "a.md": ["scan.ts"] },
		});

		// Two documents' sources end in scan.ts: the shorthand is ambiguous,
		// and an ambiguous edge is a wrong edge.
		expect(graph.edges.filter((e) => e.kind === "references")).toHaveLength(0);
	});

	it("never connects a document to itself through a shared source", () => {
		const graph = buildGraph({ provenance: [record("solo.md", ["src/x.ts"])] });
		expect(graph.edges.filter((e) => e.kind === "shared_source")).toHaveLength(0);
	});

	it("includes skills as nodes even though they carry no provenance", () => {
		const graph = buildGraph({
			provenance: [],
			skills: [{ name: "release", path: ".kaioken/skills/release.md" }],
		});

		expect(graph.nodes).toHaveLength(1);
		expect(graph.nodes[0]).toMatchObject({ id: "skill:release", kind: "skill" });
	});

	it("uses supplied titles and paths when given", () => {
		const graph = buildGraph({
			provenance: [record("core/retrieval.md", ["src/r.ts"], { chapterId: "retrieval" })],
			titles: { "core/retrieval.md": "Retrieval" },
			paths: { "core/retrieval.md": "core/retrieval.md" },
		});

		expect(graph.nodes[0]).toMatchObject({ title: "Retrieval", path: "core/retrieval.md" });
	});

	it("registers every source.path as a node so written_from edges never dangle", () => {
		const graph = buildGraph({
			provenance: [
				record("card:scan", ["packages/scan/src/scan.ts", "packages/scan/src/ignore.ts"]),
			],
		});

		const nodeIds = new Set(graph.nodes.map((n) => n.id));
		for (const edge of graph.edges) {
			expect(nodeIds.has(edge.from)).toBe(true);
			expect(nodeIds.has(edge.to)).toBe(true);
		}
		expect(graph.nodes.some((n) => n.id === "packages/scan/src/scan.ts" && n.kind === "source")).toBe(true);
		expect(graph.nodes.some((n) => n.id === "packages/scan/src/ignore.ts" && n.kind === "source")).toBe(true);
		expect(() => assertGraphIntegrity(graph)).not.toThrow();
	});
});

describe("reference edges", () => {
	it("emits one edge per referenced document, however many paths ground it", () => {
		const graph = buildGraph({
			provenance: [
				record("a.md", ["src/one.ts"]),
				record("b.md", ["src/two.ts", "src/three.ts"]),
			],
			// A names two files, and both belong to B.
			claims: { "a.md": ["src/two.ts", "src/three.ts"] },
		});

		const refs = graph.edges.filter((e) => e.kind === "references");

		// One edge per path double-counted in the stats and rendered the same
		// bullet twice; the paths belong together on a single edge.
		expect(refs).toHaveLength(1);
		expect(refs[0]?.to).toBe("b.md");
		expect(refs[0]?.via).toEqual(["src/three.ts", "src/two.ts"]);
	});
});

describe("buildCodeGraph", () => {
	it("builds file import dependency edges between modules", () => {
		const graph = buildCodeGraph({
			files: [
				{ path: "src/index.ts", imports: ["./build.ts", "./render.ts"] },
				{ path: "src/build.ts", imports: ["./types.ts"] },
				{ path: "src/render.ts", imports: ["./types.ts"] },
				{ path: "src/types.ts", imports: [] },
			],
		});

		expect(graph.nodes).toHaveLength(4);
		expect(graph.nodes.map((n) => n.id)).toEqual([
			"src/build.ts",
			"src/index.ts",
			"src/render.ts",
			"src/types.ts",
		]);

		const indexEdges = graph.edges.filter((e) => e.from === "src/index.ts");
		expect(indexEdges).toHaveLength(2);
		expect(indexEdges.map((e) => e.to)).toEqual(["src/build.ts", "src/render.ts"]);

		const buildEdges = graph.edges.filter((e) => e.from === "src/build.ts");
		expect(buildEdges).toHaveLength(1);
		expect(buildEdges[0]?.to).toBe("src/types.ts");

		expect(() => assertGraphIntegrity(graph)).not.toThrow();
	});

	it("resolves relative import specifiers and re-exports", () => {
		const graph = buildCodeGraph({
			files: [
				{
					path: "src/index.ts",
					reexports: [{ from: "./components/button.ts", name: "Button" }],
				},
				{
					path: "src/components/button.ts",
					imports: ["../utils/theme.ts"],
				},
				{
					path: "src/utils/theme.ts",
				},
			],
		});

		expect(graph.edges).toHaveLength(2);
		expect(graph.edges[0]).toMatchObject({
			from: "src/components/button.ts",
			to: "src/utils/theme.ts",
			kind: "imports",
		});
		expect(graph.edges[1]).toMatchObject({
			from: "src/index.ts",
			to: "src/components/button.ts",
			kind: "reexports",
		});
	});

	it("handles imports from index artifacts (IndexResult.files)", () => {
		const graph = buildCodeGraph({
			index: {
				files: [
					{
						path: "packages/core/src/index.ts",
						reexports: [{ from: "./engine.ts", name: "Engine" }],
					},
					{
						path: "packages/core/src/engine.ts",
						reexports: [],
					},
				],
			},
		});

		expect(graph.nodes).toHaveLength(2);
		expect(graph.edges).toHaveLength(1);
		expect(graph.edges[0]).toMatchObject({
			from: "packages/core/src/index.ts",
			to: "packages/core/src/engine.ts",
			kind: "reexports",
		});
	});

	it("extracts imports from raw source code if provided", () => {
		const graph = buildCodeGraph({
			files: [
				{
					path: "src/app.ts",
					content: 'import { run } from "./runner.ts";\nexport const v = 1;',
				},
				{
					path: "src/runner.ts",
					content: "export function run() {}",
				},
			],
		});

		expect(graph.edges).toHaveLength(1);
		expect(graph.edges[0]?.from).toBe("src/app.ts");
		expect(graph.edges[0]?.to).toBe("src/runner.ts");
	});
});

