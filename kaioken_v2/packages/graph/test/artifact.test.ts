import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { graphPath, readGraph, writeGraph, writeExportTree, readWikiTree } from "../src/artifact.js";
import type { KnowledgeGraph } from "../src/types.js";

let root: string;

beforeEach(async () => {
	root = join(tmpdir(), `kaioken-graph-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(root, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const sample: KnowledgeGraph = {
	version: 1,
	generatedAt: "2026-08-28T00:00:00Z",
	nodes: [{ id: "core/a.md", kind: "chapter", title: "A" }],
	edges: [],
};

describe("graph artifact", () => {
	it("round-trips through .kaioken/graph.json", async () => {
		const path = await writeGraph(root, sample);
		expect(path).toBe(graphPath(root));
		expect(await readGraph(root)).toEqual(sample);
	});

	it("reads a missing or wrong-version graph as null, never as a crash", async () => {
		expect(await readGraph(root)).toBeNull();
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(graphPath(root), JSON.stringify({ ...sample, version: 99 }), "utf8");
		expect(await readGraph(root)).toBeNull();
	});
});

describe("writeExportTree", () => {
	it("writes files under the bundle root and a manifest", async () => {
		const bundle = join(root, "bundle");
		const written = await writeExportTree(
			bundle,
			[
				{ path: "cards/scan.json", content: "{}" },
				{ path: "wiki/core/a.md", content: "# A" },
			],
			{ version: 1, generatedAt: "t", repository: "r", counts: { cards: 1, wikiDocuments: 1, skills: 0 } },
		);

		expect(written).toEqual(["cards/scan.json", "manifest.json", "wiki/core/a.md"]);
		expect(await readFile(join(bundle, "cards", "scan.json"), "utf8")).toBe("{}");
		expect(await readFile(join(bundle, "manifest.json"), "utf8")).toContain("wikiDocuments");
	});

	it("refuses a path that escapes the bundle", async () => {
		await expect(
			writeExportTree(
				join(root, "bundle"),
				[{ path: "../escape.md", content: "no" }],
				{ version: 1, generatedAt: "t", repository: "r", counts: { cards: 0, wikiDocuments: 0, skills: 0 } },
			),
		).rejects.toThrow(/escapes/);
	});
});

describe("readWikiTree", () => {
	it("collects markdown from nested wiki directories", async () => {
		const wikiRoot = join(root, "wiki");
		await mkdir(join(wikiRoot, "core"), { recursive: true });
		await writeFile(join(wikiRoot, "core", "a.md"), "# A", "utf8");
		await writeFile(join(wikiRoot, "top.md"), "# Top", "utf8");
		await writeFile(join(wikiRoot, "skip.txt"), "not markdown", "utf8");

		const files = await readWikiTree(wikiRoot);
		// Wiki-relative ids, matching what provenance records use.
		expect(files.map((f) => f.path).sort()).toEqual(["core/a.md", "top.md"]);
	});

	it("reads a missing wiki as empty rather than failing", async () => {
		expect(await readWikiTree(join(root, "nope"))).toEqual([]);
	});
});
