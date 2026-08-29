import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { asProvenance, parseArtifact, renderMarkdown, writeResearchDocument } from "../src/artifact.js";
import type { ResearchDocument } from "../src/types.js";

let root: string;

beforeEach(async () => {
	root = join(tmpdir(), `kaioken-research-${Date.now()}-${Math.random().toString(36).slice(2)}`);
	await mkdir(root, { recursive: true });
});

afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const doc: ResearchDocument = {
	question: "what is the thing?",
	path: "what-is-the-thing.md",
	title: "The Thing",
	body: "It exists [1] and reportedly works [2].",
	sources: [
		{ number: 1, url: "https://a.example/", title: "A", hash: "h1", fetched: true },
		{ number: 2, url: "https://b.example/", title: "B", hash: "", fetched: false, error: "timeout" },
	],
	generatedAt: "2026-08-28T00:00:00Z",
	verification: {
		grounded: 1,
		defects: [{ kind: "cites_failed_fetch", claim: "[2]", line: 1, detail: "source 2 failed" }],
		groundedRatio: 0.5,
	},
	sourcesAsProvenance: [{ path: "https://a.example/", hash: "h1" }],
};

describe("writeResearchDocument", () => {
	it("writes markdown with a sources receipt and defect report", async () => {
		const path = await writeResearchDocument(root, doc);
		const text = await readFile(path, "utf8");
		expect(text).toContain("# The Thing");
		expect(text).toContain("It exists [1]");
		expect(text).toContain("## Sources");
		expect(text).toContain("1. [A](https://a.example/)");
		expect(text).toContain("fetch failed: timeout");
		expect(text).toContain("cites_failed_fetch");
	});
});

describe("asProvenance", () => {
	it("maps fetched pages into provenance records", () => {
		const provenance = asProvenance(doc);
		expect(provenance.document).toBe("what-is-the-thing.md");
		expect(provenance.sources).toEqual([{ path: "https://a.example/", hash: "h1" }]);
	});
});

describe("parseArtifact", () => {
	it("recovers question, sources and title from the rendered markdown", async () => {
		const path = await writeResearchDocument(root, doc);
		const markdown = await readFile(path, "utf8");
		const parsed = parseArtifact(markdown, "what-is-the-thing.md");

		expect(parsed.title).toBe("The Thing");
		expect(parsed.question).toBe("what is the thing?");
		expect(parsed.sources).toHaveLength(2);
		expect(parsed.sources[0]).toMatchObject({ number: 1, fetched: true, url: "https://a.example/" });
		expect(parsed.sources[1].fetched).toBe(false);
		// Provenance from the parsed artifact feeds staleness for free.
		expect(parsed.sourcesAsProvenance).toHaveLength(1);
	});
});
