import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { authoredBody, collectSources, knowledgeSection, mergeKnowledge } from "../dist/index.js";

/**
 * AGENTS.md has two owners: a person owns the prose, and this package owns the
 * block between the markers. Every test here checks that neither one's edits
 * can destroy the other's.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-agentsmd-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

const START = "<!-- kaioken:knowledge:start — generated, do not edit by hand -->";
const END = "<!-- kaioken:knowledge:end -->";

describe("merging the generated block", () => {
	it("appends it to a document that has never had one", () => {
		const merged = mergeKnowledge("# AGENTS.md\n\nRun `npm test`.", `${START}\ngenerated\n${END}`);
		expect(merged).toContain("Run `npm test`.");
		expect(merged.indexOf("generated")).toBeGreaterThan(merged.indexOf("npm test"));
	});

	it("replaces the old block in place, keeping the prose on both sides", () => {
		const doc = ["# AGENTS.md", "", "Above.", "", START, "stale", END, "", "Below."].join("\n");
		const merged = mergeKnowledge(doc, `${START}\nfresh\n${END}`);

		expect(merged).toContain("Above.");
		expect(merged).toContain("Below.");
		expect(merged).toContain("fresh");
		expect(merged).not.toContain("stale");
		expect(merged.match(/kaioken:knowledge:start/g)).toHaveLength(1);
	});

	it("drops a truncated block rather than nesting a second one inside it", () => {
		// Half a block is what a bad merge conflict or an interrupted write
		// leaves behind, and appending to it would make the file unparseable
		// for every run after this one.
		const merged = mergeKnowledge(`# AGENTS.md\n\nProse.\n\n${START}\nhalf written`, `${START}\nfresh\n${END}`);
		expect(merged).toContain("Prose.");
		expect(merged).not.toContain("half written");
		expect(merged.match(/kaioken:knowledge:start/g)).toHaveLength(1);
	});

	it("survives CRLF endings and a BOM", () => {
		const doc = `﻿# AGENTS.md\r\n\r\nProse.\r\n\r\n${START}\r\nstale\r\n${END}\r\n`;
		const merged = mergeKnowledge(doc, `${START}\nfresh\n${END}`);
		expect(merged).toContain("fresh");
		expect(merged).not.toContain("stale");
		expect(merged).not.toContain("\r");
	});
});

describe("the authored half", () => {
	it("is the document with the generated block taken out", () => {
		const doc = ["# AGENTS.md", "", "Above.", "", START, "generated", END, "", "Below."].join("\n");
		const body = authoredBody(doc);

		expect(body).toContain("Above.");
		expect(body).toContain("Below.");
		expect(body).not.toContain("generated");
	});

	it("is the whole document when there is no block", () => {
		expect(authoredBody("# AGENTS.md\n\nProse.")).toBe("# AGENTS.md\n\nProse.");
	});
});

describe("the knowledge block", () => {
	it("is empty when nothing has been generated", async () => {
		// A fresh init must not advertise documents that do not exist.
		expect(await knowledgeSection(await repo({ "package.json": "{}" }))).toBe("");
	});

	it("omits planned chapters when provenance has no recorded documents for them", async () => {
		const root = await repo({
			".kaioken/wiki-plan.yaml": [
				"version: 1",
				"generatedAt: 2026-01-01T00:00:00.000Z",
				"multiplier: 3",
				"chapters:",
				"  - id: overview",
				"    title: Overview",
				"    goal: What this is",
				"    files: []",
			].join("\n"),
		});

		expect(await knowledgeSection(root)).toBe("");
	});

	it("lists the skills, chapters and cards that are actually on disk", async () => {
		const root = await repo({
			".kaioken/skills/release/SKILL.md": "---\nname: release\ndescription: Cut a release.\n---\n\nSteps.\n",
			".kaioken/provenance.json": JSON.stringify({
				version: 1,
				generatedAt: "2026-01-01T00:00:00.000Z",
				documents: [
					{
						document: "overview/index.md",
						chapterId: "overview",
						generatedAt: "2026-01-01T00:00:00.000Z",
						sources: [],
					},
				],
			}),
			".kaioken/wiki-plan.yaml": [
				"version: 1",
				"generatedAt: 2026-01-01T00:00:00.000Z",
				"multiplier: 3",
				"chapters:",
				"  - id: overview",
				"    title: Overview",
				"    goal: What this is",
				"    files: []",
			].join("\n"),
		});

		const section = await knowledgeSection(root);
		expect(section).toContain("release");
		expect(section).toContain("Cut a release.");
		expect(section).toContain("Overview");
		expect(section).toContain(START);
		expect(section).toContain(END);
	});
});

describe("the evidence bundle", () => {
	it("prefers executable sources of truth, most important first", async () => {
		const root = await repo({
			"README.md": "# readme",
			"package.json": "{}",
			"src/app.ts": "export const x = 1;",
			".github/workflows/ci.yml": "name: ci",
			"AGENTS.md": "# existing",
		});

		const files = [
			{ path: "AGENTS.md", hash: "", size: 1, language: "markdown", binary: false, risk: [] },
			{ path: "README.md", hash: "", size: 1, language: "markdown", binary: false, risk: [] },
			{ path: "package.json", hash: "", size: 1, language: "json", binary: false, risk: [] },
			{ path: "src/app.ts", hash: "", size: 1, language: "typescript", binary: false, risk: [] },
			{ path: ".github/workflows/ci.yml", hash: "", size: 1, language: "yaml", binary: false, risk: [] },
		];
		const sources = await collectSources(root, {
			root,
			scannedAt: new Date().toISOString(),
			fileCount: files.length,
			totalBytes: 5,
			files,
		});

		const paths = sources.map((s) => s.path);
		// An existing instruction file leads: it may hold team knowledge no
		// config file states, and the improve pass is asked to preserve it.
		expect(paths[0]).toBe("AGENTS.md");
		expect(paths).toContain(".github/workflows/ci.yml");
		// Ordinary source code is not evidence about how to run the project.
		expect(paths).not.toContain("src/app.ts");
	});
});
