import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	ask,
	chunkParentChild,
	createModule,
	Headings,
	ingest,
	readModule,
	retrieve,
	splitAtBoundary,
	type ModuleData,
} from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-prism-"));
	roots.push(root);
	return root;
}

/** Long enough to force several parents, with clean paragraph boundaries. */
function longDocument(paragraphs: number): string {
	const out: string[] = ["# Handbook", ""];
	for (let i = 0; i < paragraphs; i++) {
		out.push(`## Section ${i}`, "");
		out.push(
			`This is section ${i}. ${"It restates the same idea in a slightly different way. ".repeat(20)}`,
			"",
		);
	}
	return out.join("\n");
}

describe("chunking", () => {
	it("splits at a paragraph break rather than mid-sentence", () => {
		const text = `${"a".repeat(90)}\n\n${"b".repeat(90)}`;
		const segments = splitAtBoundary([...text], 100);
		expect(segments).toHaveLength(2);
		expect(segments[0]?.text).toBe("a".repeat(90));
		expect(segments[1]?.text).toBe("b".repeat(90));
	});

	it("does not emit one near-duplicate child per remaining character", () => {
		// The reference implementation steps back by the overlap on the final
		// window, which lands before the cursor: the advance guard then moves a
		// single character at a time and the parent dissolves into hundreds of
		// copies of its own tail. This is the regression that guards it.
		const pairs = chunkParentChild("x ".repeat(1200), {
			parentTokens: 600,
			childTokens: 150,
			childOverlap: 20,
			charsPerToken: 4,
		});
		expect(pairs.length).toBeLessThan(20);
	});

	it("gives every child a parent that contains it", () => {
		const pairs = chunkParentChild(longDocument(6));
		expect(pairs.length).toBeGreaterThan(1);
		for (const pair of pairs) {
			expect(pair.parentText).toContain(pair.childText.slice(0, 40));
		}
	});

	it("attributes a chunk to the heading above it, ignoring code fences", () => {
		const text = ["# Top", "", "intro", "", "```", "# not a heading", "```", "", "## Real", "", "body"].join("\n");
		const headings = new Headings([...text]);
		expect(headings.count).toBe(2);
		expect(headings.at(text.indexOf("body"))).toBe("Real");
	});

	it("terminates on text with no boundaries at all", () => {
		const segments = splitAtBoundary([..."z".repeat(1000)], 100);
		expect(segments.length).toBeGreaterThan(1);
		expect(segments.map((s) => s.text).join("")).toBe("z".repeat(1000));
	});
});

describe("a module", () => {
	async function moduleWith(text: string, filename = "doc.md"): Promise<{ root: string; data: ModuleData }> {
		const root = await repo();
		const data = await createModule(root, "Handbook");
		const docs = join(root, "src");
		await mkdir(docs, { recursive: true });
		await writeFile(join(docs, filename), text, "utf8");
		await ingest({ root, data, path: docs });
		return { root, data };
	}

	it("imports a document and makes it retrievable", async () => {
		const { root, data } = await moduleWith(
			"# Leave policy\n\nStaff accrue twenty-five days of annual leave per year.\n",
		);
		expect(data.documents[0]?.status).toBe("ready");

		const reloaded = await readModule(root, "handbook");
		expect(reloaded?.chunks.some((chunk) => chunk.type === "child")).toBe(true);

		const result = await retrieve({ data: reloaded as ModuleData, query: "how much annual leave" });
		expect(result.passages[0]?.text).toContain("twenty-five days");
	});

	it("does not import the same bytes twice", async () => {
		const { root, data } = await moduleWith("# A\n\nSome text about widgets.\n");
		const before = data.documents.length;
		const result = await ingest({ root, data, path: join(root, "src") });
		// Duplicated chunks would win retrieval twice and crowd the rest out.
		expect(result.imported).toEqual([]);
		expect(result.skipped[0]?.reason).toBe("already imported");
		expect(data.documents.length).toBe(before);
	});

	it("reports an empty module rather than pretending to search it", async () => {
		const root = await repo();
		const data = await createModule(root, "Empty");
		const result = await retrieve({ data, query: "anything" });
		expect(result.passages).toEqual([]);
		expect(result.sourceFound).toBe(false);
		expect(result.describe).toContain("no documents");
	});

	it("refuses to create the same module twice", async () => {
		const root = await repo();
		await createModule(root, "Handbook");
		await expect(createModule(root, "Handbook")).rejects.toThrow(/already exists/);
	});
});

describe("the relevance gate", () => {
	async function handbook(): Promise<ModuleData> {
		const root = await repo();
		const data = await createModule(root, "Handbook");
		const docs = join(root, "src");
		await mkdir(docs, { recursive: true });
		await writeFile(
			join(docs, "leave.md"),
			"# Leave\n\nStaff accrue twenty-five days of annual leave per year.\n\n# Parking\n\nParking permits cost ten pounds.\n",
			"utf8",
		);
		await ingest({ root, data, path: docs });
		return data;
	}

	const grader = (verdict: string) => ({ async complete() { return verdict; } });

	it("says the context is unverified when no gate is configured", async () => {
		const result = await retrieve({ data: await handbook(), query: "annual leave" });
		// A caller that cannot tell "checked and kept" from "never checked"
		// will present both as though something had checked them.
		expect(result.graded).toBe(false);
		expect(result.describe).toContain("ungraded");
	});

	it("drops what the gate rejects, and reports no source found", async () => {
		const result = await retrieve({
			data: await handbook(),
			query: "annual leave",
			grader: grader("irrelevant"),
		});
		expect(result.passages).toEqual([]);
		expect(result.graded).toBe(true);
		expect(result.sourceFound).toBe(false);
	});

	it("keeps a chunk whose verdict failed, but stops claiming it was graded", async () => {
		const result = await retrieve({
			data: await handbook(),
			query: "annual leave",
			// A dead grader that silently approved everything would look exactly
			// like one that examined everything and approved it.
			grader: { async complete() { throw new Error("no network"); } },
		});
		expect(result.passages.length).toBeGreaterThan(0);
		expect(result.graded).toBe(false);
		expect(result.sourceFound).toBe(false);
	});

	it("treats a grader that answers with something else as a failed call", async () => {
		const result = await retrieve({
			data: await handbook(),
			query: "annual leave",
			grader: grader("well, it depends"),
		});
		expect(result.graded).toBe(false);
	});

	it("tells the model plainly when nothing was found", async () => {
		const asked: string[] = [];
		const answer = await ask({
			data: await handbook(),
			question: "what is the dress code",
			client: {
				async complete(request) {
					asked.push(request.system);
					return "The documents do not cover that.";
				},
			},
			grader: grader("irrelevant"),
		});
		// The failure this guards is a model handed the least-bad passages and
		// left to make something of them.
		expect(asked[0]).toContain("retrieval found no passage");
		expect(answer.retrieval.sourceFound).toBe(false);
	});

	it("numbers the passages it does hand over", async () => {
		let prompt = "";
		await ask({
			data: await handbook(),
			question: "how much annual leave",
			client: {
				async complete(request) {
					prompt = request.prompt;
					return "Twenty-five days [1].";
				},
			},
			grader: grader("relevant"),
		});
		expect(prompt).toContain("[1]");
		expect(prompt).toContain("twenty-five days");
	});
});
