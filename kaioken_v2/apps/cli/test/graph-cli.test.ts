import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../dist/main.js";

const roots: string[] = [];
let stdout: string;
let stderr: string;

beforeEach(() => {
	stdout = "";
	stderr = "";
	vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
		stdout += String(chunk);
		return true;
	});
	vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
		stderr += String(chunk);
		return true;
	});
});

afterEach(async () => {
	vi.restoreAllMocks();
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/**
 * A repository with generated knowledge to graph and export: a scan, a card
 * provenance record, and a wiki document. Written by hand rather than by
 * running the generative stages — the graph must derive from artifacts as
 * they exist on disk, whatever wrote them.
 */
async function knowledgeRepo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-graph-cli-"));
	roots.push(root);

	await writeFile(join(root, "lib.ts"), "export function alpha(): number {\n\treturn 1;\n}\n", "utf8");
	await mkdir(join(root, ".kaioken"), { recursive: true });
	await writeFile(
		join(root, ".kaioken", "scan.json"),
		JSON.stringify({
			version: 1,
			generatedAt: "2026-08-28T00:00:00Z",
			root,
			files: [
				{
					path: "lib.ts",
					hash: "h-lib",
					language: "TypeScript",
					binary: false,
					risky: false,
					riskReasons: [],
					bytes: 46,
					lines: 3,
				},
			],
			unparsedLanguages: [],
		}),
		"utf8",
	);
	await writeFile(
		join(root, ".kaioken", "provenance.json"),
		JSON.stringify({
			version: 1,
			generatedAt: "2026-08-28T00:00:00Z",
			documents: [
				{
					document: "card:core",
					generatedAt: "2026-08-28T00:00:00Z",
					sources: [{ path: "lib.ts", hash: "h-lib" }],
				},
			],
		}),
		"utf8",
	);
	const wikiDir = join(root, ".kaioken", "wiki");
	await mkdir(wikiDir, { recursive: true });
	await writeFile(
		join(wikiDir, "overview.md"),
		"# Overview\n\nCovers `lib.ts` and its exported `alpha`.\n",
		"utf8",
	);
	// Wiki provenance only: card records are derived from the card store, so
	// listing one here too would double-count it in the graph.
	await writeFile(
		join(root, ".kaioken", "provenance.json"),
		JSON.stringify({
			version: 1,
			generatedAt: "2026-08-28T00:00:00Z",
			documents: [
				{
					document: "overview.md",
					generatedAt: "2026-08-28T00:00:00Z",
					sources: [{ path: "lib.ts", hash: "h-lib" }],
				},
			],
		}),
		"utf8",
	);
	// The card as the cards stage stores it: readCards reads the JSON files,
	// not the provenance index.
	const cardsDir = join(root, ".kaioken", "cards");
	await mkdir(cardsDir, { recursive: true });
	await writeFile(
		join(cardsDir, "core.json"),
		JSON.stringify({
			moduleId: "core",
			name: "Core",
			generatedAt: "2026-08-28T00:00:00Z",
			summary: "The core.",
			keyPoints: [],
			entryPoints: [{ name: "alpha", file: "lib.ts", note: "start here" }],
			sources: [{ path: "lib.ts", hash: "h-lib" }],
			verification: { grounded: 1, ungrounded: [], unknownFiles: [], uncovered: [] },
		}),
		"utf8",
	);
	return root;
}

describe("kaioken graph", () => {
	it("derives and writes the graph, showing shared ground", async () => {
		const root = await knowledgeRepo();
		expect(await main(["graph", "--root", root])).toBe(0);

		expect(stdout).toContain("## Cards (1)");
		expect(stdout).toContain("## Chapters (1)");
		expect(stdout).toContain("shares ground with");
		expect(stdout).toContain("wrote");

		const graph = JSON.parse(await readFile(join(root, ".kaioken", "graph.json"), "utf8"));
		expect(graph.version).toBe(1);
		expect(graph.nodes.map((n: { id: string }) => n.id).sort()).toEqual([
			"card:core",
			"overview.md",
		]);
		// Both documents were written from lib.ts.
		expect(
			graph.edges.filter((e: { kind: string }) => e.kind === "written_from"),
		).toHaveLength(2);
		expect(
			graph.edges.filter((e: { kind: string }) => e.kind === "shared_source"),
		).toHaveLength(1);
	});

	it("emits JSON under --json", async () => {
		const root = await knowledgeRepo();
		expect(await main(["graph", "--json", "--root", root])).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.graph.version).toBe(1);
		expect(parsed.stats.coveredFiles).toBe(1);
	});

	it("fails with guidance when there is nothing to derive from", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-empty-"));
		roots.push(root);
		expect(await main(["graph", "--root", root])).toBe(1);
		expect(stderr).toContain("nothing to derive a graph from");
	});
});

describe("kaioken export", () => {
	it("writes a self-contained bundle with a manifest", async () => {
		const root = await knowledgeRepo();
		expect(await main(["export", "--root", root])).toBe(0);

		expect(stdout).toContain("self-contained");

		const bundle = join(root, ".kaioken", "export");
		const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));
		expect(manifest.counts).toEqual({ cards: 1, wikiDocuments: 1, skills: 0 });

		// The card, verbatim knowledge, the graph and the summary are all there.
		await readFile(join(bundle, "cards", "core.json"), "utf8");
		await readFile(join(bundle, "wiki", "overview.md"), "utf8");
		await readFile(join(bundle, "graph.json"), "utf8");
		const summary = await readFile(join(bundle, "knowledge.md"), "utf8");
		expect(summary).toContain("# Knowledge graph");
	});

	it("derives the graph on the spot when none is cached", async () => {
		const root = await knowledgeRepo();
		expect(await main(["export", "--json", "--root", root])).toBe(0);
		const parsed = JSON.parse(stdout);
		expect(parsed.manifest.counts.cards).toBe(1);
	});

	it("exports into a named directory when given one", async () => {
		const root = await knowledgeRepo();
		expect(await main(["export", "handoff", "--root", root])).toBe(0);
		await readFile(join(root, "handoff", "manifest.json"), "utf8");
	});

	it("bundles both skill layouts, and counts what it bundled", async () => {
		const root = await knowledgeRepo();
		const skills = join(root, ".kaioken", "skills");
		await mkdir(join(skills, "migrate"), { recursive: true });
		await writeFile(
			join(skills, "release.md"),
			"---\nname: release\ndescription: Cut a release.\n---\n\nTag it.\n",
			"utf8",
		);
		await writeFile(
			join(skills, "migrate", "SKILL.md"),
			"---\nname: migrate\ndescription: Migrate a schema.\n---\n\nBack it up first.\n",
			"utf8",
		);

		expect(await main(["export", "--root", root])).toBe(0);

		const bundle = join(root, ".kaioken", "export");
		const manifest = JSON.parse(await readFile(join(bundle, "manifest.json"), "utf8"));

		// The directory layout is the one a hand-rolled readdir drops. Bundling
		// one skill while reporting a count of one is worse than failing: the
		// receiving end has no way to know a procedure went missing.
		expect(manifest.counts.skills).toBe(2);
		await readFile(join(bundle, "skills", "release.md"), "utf8");
		await readFile(join(bundle, "skills", "migrate.md"), "utf8");
	});

	it("fails with guidance when there is nothing to export", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-empty-"));
		roots.push(root);
		expect(await main(["export", "--root", root])).toBe(1);
		expect(stderr).toContain("nothing to export");
	});
});
