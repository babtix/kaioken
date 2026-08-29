import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, SymbolOracle } from "@kaioken/index";
import type { Provenance } from "@kaioken/provenance";
import { scan } from "@kaioken/scan";
import type { SearchHit } from "@kaioken/search";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildSystemPrompt,
	type KnowledgeContext,
	KNOWLEDGE_TOOLS,
	loadSkills,
	toolByName,
} from "../dist/index.js";

/**
 * The tools are the phase's product, and they are tested by calling them. That
 * is only possible because nothing here needs a model: an agent tool that could
 * not be exercised without an API key would be a tool nobody could hold to a
 * contract.
 *
 * The contract under test is mostly about negatives. A tool that finds things is
 * easy; what makes this engine worth attaching to a model is that "no such
 * symbol" is a fact rather than a shrug.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const WALK = [
	"/** Walks the working tree once. */",
	"export function walkTree(root: string): string[] {",
	"\treturn [root];",
	"}",
	"",
	"function privateHelper(): void {}",
	"",
].join("\n");

const SKILL = [
	"---",
	"name: release",
	"description: Cut a release of this package.",
	"---",
	"",
	"Bump the version, then tag it.",
	"",
].join("\n");

async function context(
	overrides: {
		files?: Record<string, string>;
		provenance?: Provenance[];
		hits?: SearchHit[];
	} = {},
): Promise<KnowledgeContext> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-tools-"));
	roots.push(root);

	const files = overrides.files ?? { "src/walk.ts": WALK, ".kaioken/skills/release.md": SKILL };
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}

	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	const { skills } = await loadSkills(root);

	return {
		root,
		index,
		oracle: new SymbolOracle(index),
		scan: scanned,
		provenance: overrides.provenance ?? [],
		skills,
		search: overrides.hits
			? { async search() { return overrides.hits as SearchHit[]; } }
			: null,
	};
}

function tool(name: string) {
	const found = toolByName(name);
	if (!found) throw new Error(`no tool named ${name}`);
	return found;
}

describe("the tool surface", () => {
	it("exposes exactly the tools the agent is told it has", () => {
		expect(KNOWLEDGE_TOOLS.map((entry) => entry.name)).toEqual([
			"symbol_lookup",
			"wiki_search",
			"impact",
			"skill_load",
			"read_file",
		]);
	});

	it("describes every parameter it accepts", () => {
		for (const entry of KNOWLEDGE_TOOLS) {
			expect(entry.description.length).toBeGreaterThan(40);
			for (const param of Object.values(entry.params)) {
				expect(param.description.trim()).not.toBe("");
			}
		}
	});
});

describe("symbol_lookup", () => {
	it("locates a declaration and says where it is", async () => {
		const ctx = await context();

		const result = await tool("symbol_lookup").run({ name: "walkTree" }, ctx);

		expect(result.text).toContain("src/walk.ts:2");
		expect(result.isError).toBeUndefined();
		expect(result.details).toMatchObject({ declared: true });
	});

	it("answers a miss definitively, and not as an error", async () => {
		const ctx = await context();

		const result = await tool("symbol_lookup").run({ name: "walkForest" }, ctx);

		// This is the answer the model most needs to believe. Flagging it as a
		// failure would teach it to retry instead of accept.
		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("not declared: walkForest");
		expect(result.details).toMatchObject({ declared: false });
	});

	it("lists what a file declares, and can hide what is not exported", async () => {
		const ctx = await context();

		const all = await tool("symbol_lookup").run({ path: "src/walk.ts" }, ctx);
		const exported = await tool("symbol_lookup").run({ path: "src/walk.ts", exported: true }, ctx);

		expect(all.text).toContain("privateHelper");
		expect(exported.text).toContain("walkTree");
		expect(exported.text).not.toContain("privateHelper");
	});

	it("separates a file that is not indexed from a symbol that does not exist", async () => {
		const ctx = await context();

		const result = await tool("symbol_lookup").run({ path: "src/nope.ts" }, ctx);

		expect(result.text).toContain("not indexed");
	});

	it("refuses a call with neither a name nor a path", async () => {
		const ctx = await context();

		const result = await tool("symbol_lookup").run({}, ctx);

		expect(result.isError).toBe(true);
	});
});

describe("wiki_search", () => {
	it("says the index is missing rather than returning nothing found", async () => {
		const ctx = await context();

		const result = await tool("wiki_search").run({ query: "walking the tree" }, ctx);

		// "No results" and "no index" are different facts, and conflating them
		// would let the agent conclude the repository lacks something it has.
		expect(result.isError).toBe(true);
		expect(result.text).toContain("no search index");
	});

	it("renders a hit with the file and line it came from", async () => {
		const ctx = await context({
			hits: [
				{
					score: 1,
					kind: "wiki",
					path: "traversal/scanning.md",
					section: "traversal",
					title: "Scanning",
					heading: "One traversal",
					line: 42,
					snippet: "The scan walks the tree once.",
					via: ["lexical"],
				},
			],
		});

		const result = await tool("wiki_search").run({ query: "scanning" }, ctx);

		expect(result.text).toContain("traversal/scanning.md:42");
		expect(result.text).toContain("(lexical)");
	});
});

describe("impact", () => {
	it("says nothing has been generated rather than reporting no impact", async () => {
		const ctx = await context();

		const result = await tool("impact").run({ paths: ["src/walk.ts"] }, ctx);

		expect(result.text).toContain("nothing has been generated");
	});

	it("names the documents a change would invalidate", async () => {
		const ctx = await context();
		const hash = ctx.scan.files.find((file) => file.path === "src/walk.ts")?.hash as string;
		const withDocs: KnowledgeContext = {
			...ctx,
			provenance: [
				{
					document: "traversal/scanning.md",
					generatedAt: new Date().toISOString(),
					sources: [{ path: "src/walk.ts", hash }],
				},
				{
					document: "other/unrelated.md",
					generatedAt: new Date().toISOString(),
					sources: [{ path: ".kaioken/skills/release.md", hash: "x" }],
				},
			],
		};

		const result = await tool("impact").run({ paths: ["src/walk.ts"] }, withDocs);

		expect(result.text).toContain("traversal/scanning.md");
		expect(result.text).not.toContain("other/unrelated.md");
		expect(result.details).toMatchObject({ documents: ["traversal/scanning.md"] });
	});

	it("reports that a change is invisible to the wiki, which is itself an answer", async () => {
		const ctx = await context();
		const withDocs: KnowledgeContext = {
			...ctx,
			provenance: [
				{
					document: "other/unrelated.md",
					generatedAt: new Date().toISOString(),
					sources: [{ path: "src/other.ts", hash: "x" }],
				},
			],
		};

		const result = await tool("impact").run({ paths: ["src/walk.ts"] }, withDocs);

		expect(result.text).toContain("no generated document was written from");
	});

	it("accepts a single path passed as a bare string", async () => {
		const ctx = await context();
		const withDocs: KnowledgeContext = {
			...ctx,
			provenance: [
				{
					document: "d.md",
					generatedAt: new Date().toISOString(),
					sources: [{ path: "src/walk.ts", hash: "x" }],
				},
			],
		};

		const result = await tool("impact").run({ paths: "src/walk.ts" }, withDocs);

		expect(result.details).toMatchObject({ documents: ["d.md"] });
	});
});

describe("skill_load", () => {
	it("lists what is available when asked for nothing in particular", async () => {
		const ctx = await context();

		const result = await tool("skill_load").run({}, ctx);

		expect(result.text).toContain("release — Cut a release");
	});

	it("returns the full procedure, attributed to the file it came from", async () => {
		const ctx = await context();

		const result = await tool("skill_load").run({ name: "release" }, ctx);

		expect(result.text).toContain("Bump the version");
		expect(result.text).toContain(".kaioken/skills/release.md");
	});

	it("names the alternatives when the requested skill does not exist", async () => {
		const ctx = await context();

		const result = await tool("skill_load").run({ name: "deploy" }, ctx);

		expect(result.isError).toBe(true);
		expect(result.text).toContain("release");
	});
});

describe("read_file", () => {
	it("returns numbered lines and says how much of the file it showed", async () => {
		const ctx = await context();

		const result = await tool("read_file").run({ path: "src/walk.ts", start: 2, end: 3 }, ctx);

		expect(result.text).toContain("lines 2-3 of");
		expect(result.text).toContain("2  export function walkTree");
		expect(result.text).not.toContain("privateHelper");
	});

	it("refuses to read outside the repository", async () => {
		const ctx = await context();

		const escape = await tool("read_file").run({ path: "../../../etc/passwd" }, ctx);

		// Clamping the path to something readable would be worse than refusing:
		// a tool that quietly reads a different file than it was asked for is
		// not one anything can be built on.
		expect(escape.isError).toBe(true);
		expect(escape.text).toContain("outside the repository");
	});

	it("says plainly that a file does not exist", async () => {
		const ctx = await context();

		const result = await tool("read_file").run({ path: "src/missing.ts" }, ctx);

		expect(result.isError).toBe(true);
		expect(result.text).toContain("no such file");
	});
});

describe("the system prompt", () => {
	it("names the exact commands the gate will run", async () => {
		const ctx = await context();

		const prompt = buildSystemPrompt(ctx, {
			gate: [{ id: "a", label: "test", command: "npm test", source: "package.json" }],
			canWrite: false,
		});

		// An agent told which commands decide its fate runs them itself. One
		// told nothing declares victory on a file it never parsed.
		expect(prompt).toContain("npm test");
		expect(prompt).toContain("read-only");
	});

	it("says so when nothing will verify the work", async () => {
		const ctx = await context();

		const prompt = buildSystemPrompt(ctx, { gate: [], canWrite: true });

		expect(prompt).toContain("No build or test command could be discovered");
		expect(prompt).not.toContain("read-only");
	});

	it("advertises the skills without pasting them in", async () => {
		const ctx = await context();

		const prompt = buildSystemPrompt(ctx, { gate: [], canWrite: false });

		expect(prompt).toContain("Cut a release of this package.");
		// The body is a tool call away; spending the window on it up front would
		// pay for procedures this session is not carrying out.
		expect(prompt).not.toContain("Bump the version");
	});
});
