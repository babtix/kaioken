import { describe, expect, it } from "vitest";
import { buildGraph } from "../src/build.js";
import { graphStats, renderGraphMarkdown } from "../src/render.js";
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

		expect(stats.nodes).toBe(4); // 3 documents + 1 skill
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
		expect(text).toContain("4 documents");
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
