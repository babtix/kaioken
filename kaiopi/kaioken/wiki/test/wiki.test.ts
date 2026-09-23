import { describe, expect, it } from "vitest";
import { SymbolOracle, type IndexResult } from "@kaioken/index";
import type { ModelClient, ModelRequest } from "@kaioken/modelport";
import { extractClaims, findPadding } from "../src/claims.ts";
import { coverageOf, groundingDefects, summariseDefects, verifyDocument } from "../src/verify.ts";
import { buildPrompt, documentPath, generateDocument } from "../src/generate.ts";
import { planSections, planWiki } from "../src/plan.ts";
import {
	normalisePlan,
	locate,
	readVerification,
	writeVerification,
	writeWikiIndex,
	writeWikiPlan,
	readWikiPlan,
} from "../src/artifact.ts";
import { buildBrief, writeBrief, readBrief } from "../src/brief.ts";
import { runWiki } from "../src/run.ts";
import type { Chapter, WikiPlan } from "../src/types.ts";
import type { ScanResult } from "@kaioken/scan";

function scriptedClient(replies: string[]): ModelClient & { requests: ModelRequest[] } {
	const requests: ModelRequest[] = [];
	let index = 0;
	return {
		requests,
		async complete(request: ModelRequest): Promise<string> {
			requests.push(request);
			const reply = replies[Math.min(index, replies.length - 1)] ?? "";
			index++;
			return reply;
		},
	};
}

function indexOf(
	files: Array<{
		path: string;
		symbols?: Array<{
			name: string;
			exported?: boolean;
			parent?: string;
			startLine?: number;
			endLine?: number;
			doc?: string;
			signature?: string;
		}>;
		lineCount?: number;
	}>,
): IndexResult {
	return {
		root: "/repo",
		builtAt: "",
		fileCount: files.length,
		symbolCount: files.reduce((n, f) => n + (f.symbols?.length ?? 0), 0),
		unparsedLanguages: {},
		files: files.map((f) => ({
			path: f.path,
			language: "typescript",
			lineCount: f.lineCount ?? 20,
			hash: `hash-${f.path}`,
			symbols: (f.symbols ?? []).map((s) => ({
				name: s.name,
				kind: "function",
				exported: s.exported ?? true,
				parent: s.parent,
				signature: s.signature ?? `${s.name}(): void`,
				startLine: s.startLine ?? 1,
				endLine: s.endLine ?? 5,
				doc: s.doc ?? "",
			})),
			imports: [],
		})),
	} as unknown as IndexResult;
}

function scanOf(files: Array<{ path: string; hash?: string; binary?: boolean; risk?: string[] }>): ScanResult {
	return {
		root: "/repo",
		scannedAt: "",
		fileCount: files.length,
		totalBytes: 1000,
		files: files.map((f) => ({
			path: f.path,
			language: "typescript",
			bytes: 100,
			lineCount: 20,
			risk: f.risk ?? [],
			binary: f.binary ?? false,
			hash: f.hash ?? `hash-${f.path}`,
		})),
	} as unknown as ScanResult;
}

const oracle = new SymbolOracle(indexOf([{ path: "src/a.ts", symbols: [{ name: "alphaSearch" }, { name: "Engine", parent: undefined }] }]));
const knownFiles = new Set(["src/a.ts", "src/b.ts", "README.md"]);
const noSource = async () => null;

describe("wiki: claim extraction", () => {
	it("extracts a symbol claim from a code span", () => {
		const claims = extractClaims("The `alphaSearch` function does the work.");
		expect(claims).toContainEqual({ kind: "symbol", text: "alphaSearch", line: 1 });
	});

	it("extracts a file claim from a slash-bearing path", () => {
		const claims = extractClaims("See `src/a.ts` for details.");
		expect(claims).toContainEqual({ kind: "file", text: "src/a.ts", line: 1 });
	});

	it("extracts an anchor with a line range", () => {
		const claims = extractClaims("Defined at `src/a.ts:10-20`.");
		expect(claims).toContainEqual({
			kind: "anchor",
			text: "src/a.ts:10-20",
			line: 1,
			file: "src/a.ts",
			startLine: 10,
			endLine: 20,
		});
	});

	it("treats a single-line anchor as a one-line range", () => {
		const claims = extractClaims("At `src/a.ts:7`.");
		expect(claims[0]?.startLine).toBe(7);
		expect(claims[0]?.endLine).toBe(7);
	});

	it("treats a call as a claim about the callee", () => {
		const claims = extractClaims("Call `alphaSearch()` to begin.");
		expect(claims).toContainEqual({ kind: "symbol", text: "alphaSearch", line: 1 });
	});

	it("ignores prose words that are not claims", () => {
		const claims = extractClaims("This returns `true` or `null`, a `string` value.");
		expect(claims).toHaveLength(0);
	});

	it("ignores a bare lowercase word", () => {
		expect(extractClaims("the `config` value")).toHaveLength(0);
	});

	it("does not claim anything from an un-attributed fence", () => {
		const body = ["```ts", "const x = notRealThing();", "```"].join("\n");
		expect(extractClaims(body)).toHaveLength(0);
	});

	it("treats an attributed fence as a quotation", () => {
		const body = ["```ts src/a.ts:1-2", "export const x = 1;", "```"].join("\n");
		const claims = extractClaims(body);
		expect(claims).toHaveLength(1);
		expect(claims[0]?.kind).toBe("excerpt");
		expect(claims[0]?.file).toBe("src/a.ts");
	});

	it("accepts a root-level file in a fence info string", () => {
		const body = ["```sh deploy.sh", "npm run build", "```"].join("\n");
		expect(extractClaims(body)[0]?.file).toBe("deploy.sh");
	});

	it("deduplicates identical claims on different lines separately", () => {
		const claims = extractClaims("`alphaSearch` here.\n`alphaSearch` there.");
		expect(claims).toHaveLength(2);
	});

	it("skips code spans inside fences", () => {
		const body = ["```ts src/a.ts", "// mentions `ghostSymbol`", "```"].join("\n");
		const claims = extractClaims(body);
		expect(claims.some((c) => c.kind === "symbol")).toBe(false);
	});
});

describe("wiki: padding detection", () => {
	it("flags a filler phrase with its line", () => {
		const found = findPadding("Intro.\nIt is important to note that this runs.");
		expect(found).toContainEqual({ phrase: "it is important to note", line: 2 });
	});

	it("does not flag a phrase inside a quoted fence", () => {
		const body = ["```ts src/a.ts", "// in conclusion, we ship", "```"].join("\n");
		expect(findPadding(body)).toHaveLength(0);
	});

	it("flags several phrases on one line", () => {
		expect(findPadding("This module provides a variety of things.").length).toBeGreaterThan(1);
	});

	it("returns nothing for specific prose", () => {
		expect(findPadding("alphaSearch walks the index and returns ranked hits.")).toHaveLength(0);
	});
});

describe("wiki: verification", () => {
	it("grounds a symbol the index declares", async () => {
		const report = await verifyDocument({
			body: "The `alphaSearch` function.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.grounded).toBe(1);
		expect(groundingDefects(report.defects)).toHaveLength(0);
	});

	it("reports an invented symbol", async () => {
		const report = await verifyDocument({
			body: "The `authMagicLogin` function.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		const defect = report.defects.find((d) => d.kind === "unknown_symbol");
		expect(defect?.claim).toBe("authMagicLogin");
		expect(defect?.line).toBe(1);
	});

	it("accepts a file the repository really contains", async () => {
		const report = await verifyDocument({
			body: "See `src/a.ts`.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.filter((d) => d.kind === "unknown_file")).toHaveLength(0);
	});

	it("reports a file the repository does not contain", async () => {
		const report = await verifyDocument({
			body: "See `src/invented.ts`.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.some((d) => d.kind === "unknown_file")).toBe(true);
	});

	it("accepts a basename shorthand for a known path", async () => {
		const report = await verifyDocument({
			body: "See `a.ts`.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.filter((d) => d.kind === "unknown_file")).toHaveLength(0);
	});

	it("treats a root-level filename as a file, not an invented symbol", async () => {
		const report = await verifyDocument({
			body: "The `README.md` explains it.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.filter((d) => d.kind === "unknown_symbol")).toHaveLength(0);
	});

	it("grounds a symbol that appears in the source but is not a declaration", async () => {
		const report = await verifyDocument({
			body: "The `maxReadBytes` option.",
			oracle,
			scope: ["src/a.ts"],
			readSource: async (p) => (p === "src/a.ts" ? "const maxReadBytes = 1024;" : null),
			knownFiles,
		});
		expect(groundingDefects(report.defects)).toHaveLength(0);
	});

	it("reports a bad anchor range", async () => {
		const report = await verifyDocument({
			body: "At `src/a.ts:900-1000`.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.some((d) => d.kind === "bad_anchor")).toBe(true);
	});

	it("reports an excerpt that the attributed file does not contain", async () => {
		const report = await verifyDocument({
			body: ["```ts src/a.ts", "const invented = true;", "```"].join("\n"),
			oracle,
			scope: ["src/a.ts"],
			readSource: async () => "const real = true;",
			knownFiles,
		});
		expect(report.defects.some((d) => d.kind === "excerpt_not_found")).toBe(true);
	});

	it("accepts an excerpt that matches the source whitespace-insensitively", async () => {
		const report = await verifyDocument({
			body: ["```ts src/a.ts", "const real = true;", "```"].join("\n"),
			oracle,
			scope: ["src/a.ts"],
			readSource: async () => "\tconst real = true;\n",
			knownFiles,
		});
		expect(groundingDefects(report.defects)).toHaveLength(0);
	});

	it("flags padding as a defect", async () => {
		const report = await verifyDocument({
			body: "It is important to note that `alphaSearch` exists.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.defects.some((d) => d.kind === "padding")).toBe(true);
	});

	it("reports an uncovered export", async () => {
		const report = await verifyDocument({
			body: "Nothing relevant here.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		expect(report.uncovered).toContain("alphaSearch");
		expect(report.coverage).toBeLessThan(1);
	});

	it("summarises defects by kind", async () => {
		const report = await verifyDocument({
			body: "The `ghostSymbol` in `ghost/file.ts`.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
		});
		const summary = summariseDefects(report.defects);
		expect(summary.unknown_symbol).toBe(1);
		expect(summary.unknown_file).toBe(1);
	});

	it("accepts a relative markdown link pointing to an existing or planned document", async () => {
		const report = await verifyDocument({
			body: "Refer to [Architecture](../architecture/index.md) and [Section](./overview.md).",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
			currentDocument: "storage/index.md",
			knownDocuments: new Set(["architecture/index.md", "storage/overview.md"]),
		});
		expect(report.defects.filter((d) => d.kind === "broken_link")).toHaveLength(0);
	});

	it("flags a broken relative link to a non-existent chapter as a defect", async () => {
		const report = await verifyDocument({
			body: "Refer to [Missing Chapter](../ghost/index.md) for details.",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
			currentDocument: "storage/index.md",
			knownDocuments: new Set(["architecture/index.md"]),
		});
		const linkDefect = report.defects.find((d) => d.kind === "broken_link");
		expect(linkDefect).toBeDefined();
		expect(linkDefect?.claim).toBe("../ghost/index.md");
		expect(linkDefect?.detail).toContain("ghost/index.md");
	});

	it("ignores web URLs and anchor links during relative link check", async () => {
		const report = await verifyDocument({
			body: "See [GitHub](https://github.com/example/repo) and [Local](#section-anchor).",
			oracle,
			scope: ["src/a.ts"],
			readSource: noSource,
			knownFiles,
			currentDocument: "storage/index.md",
			knownDocuments: new Set(["architecture/index.md"]),
		});
		expect(report.defects.filter((d) => d.kind === "broken_link")).toHaveLength(0);
	});
});

describe("wiki: coverage", () => {
	it("is complete when every export is mentioned", () => {
		// The fixture file exports both `alphaSearch` and `Engine`.
		const { coverage, uncovered } = coverageOf("alphaSearch and Engine do it.", oracle, ["src/a.ts"]);
		expect(coverage).toBe(1);
		expect(uncovered).toEqual([]);
	});

	it("is partial when only some exports are mentioned", () => {
		const { coverage, uncovered } = coverageOf("alphaSearch does it.", oracle, ["src/a.ts"]);
		expect(coverage).toBe(0.5);
		expect(uncovered).toEqual(["Engine"]);
	});

	it("is zero when no export is mentioned", () => {
		expect(coverageOf("nothing", oracle, ["src/a.ts"]).coverage).toBe(0);
	});

	it("treats a scope with no exports as fully covered", () => {
		expect(coverageOf("anything", oracle, ["src/empty.ts"]).coverage).toBe(1);
	});

	it("does not credit a partial word match", () => {
		// `alpha` must not satisfy `alphaSearch`.
		const partial = new SymbolOracle(indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }] }]));
		expect(coverageOf("alphaSearch", partial, ["src/a.ts"]).coverage).toBe(0);
	});
});

describe("wiki: planning", () => {
	const scan = scanOf([{ path: "src/a.ts" }, { path: "src/b.ts" }]);
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alphaSearch" }] }]);

	it("parses chapters from a reply", async () => {
		const client = scriptedClient([
			JSON.stringify({ chapters: [{ id: "Core", title: "Core", goal: "Explains core.", files: ["src/a.ts"] }] }),
		]);
		const { plan } = await planWiki({ scan, index, client, multiplier: 3 });
		expect(plan.chapters[0]?.id).toBe("core");
		expect(plan.multiplier).toBe(3);
	});

	it("drops a chapter with no usable id", async () => {
		const client = scriptedClient([JSON.stringify({ chapters: [{ title: "No id", files: ["src/a.ts"] }] })]);
		const { plan } = await planWiki({ scan, index, client });
		expect(plan.chapters).toHaveLength(0);
	});

	it("shows the model the real paths and warns against inventing", async () => {
		const client = scriptedClient([JSON.stringify({ chapters: [] })]);
		await planWiki({ scan, index, client });
		expect(client.requests[0]?.prompt).toContain("src/a.ts");
		expect(client.requests[0]?.prompt).toContain("Do not write a directory path");
	});

	it("confines sections to the chapter's own files", async () => {
		const chapter: Chapter = { id: "core", title: "Core", goal: "g", files: ["src/a.ts"] };
		const plan: WikiPlan = { version: 1, generatedAt: "", multiplier: 1, chapters: [chapter] };
		const client = scriptedClient([
			JSON.stringify({ sections: [{ id: "s1", title: "S1", summary: "x", files: ["src/a.ts", "src/other.ts"] }] }),
		]);
		const sections = await planSections({ plan, chapter, index, client });
		expect(sections[0]?.files).toEqual(["src/a.ts"]);
	});

	it("drops a section that would cover no in-scope files", async () => {
		const chapter: Chapter = { id: "core", title: "Core", goal: "g", files: ["src/a.ts"] };
		const plan: WikiPlan = { version: 1, generatedAt: "", multiplier: 1, chapters: [chapter] };
		const client = scriptedClient([
			JSON.stringify({ sections: [{ id: "s1", title: "S1", summary: "x", files: ["elsewhere.ts"] }] }),
		]);
		expect(await planSections({ plan, chapter, index, client })).toHaveLength(0);
	});
});

describe("wiki: document generation", () => {
	const chapter: Chapter = { id: "core", title: "Core", goal: "Explain core.", files: ["src/a.ts"] };
	const plan: WikiPlan = { version: 1, generatedAt: "", multiplier: 1, chapters: [chapter] };
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alphaSearch" }] }]);
	const scan = scanOf([{ path: "src/a.ts", hash: "h1" }]);

	function input(replies: string[]) {
		return {
			plan,
			chapter,
			index,
			oracle: new SymbolOracle(index),
			client: scriptedClient(replies),
			scanFiles: scan.files,
			readSource: noSource,
		};
	}

	it("produces a grounded document", async () => {
		const doc = await generateDocument(input(["# Core\n\nThe `alphaSearch` function walks the index."]));
		expect(doc.path).toBe("core/index.md");
		expect(doc.title).toBe("Core");
		expect(groundingDefects(doc.verification.defects)).toHaveLength(0);
	});

	it("strips a wrapping markdown fence", async () => {
		const doc = await generateDocument(input(["```markdown\n# Core\n\n`alphaSearch`.\n```"]));
		expect(doc.body.startsWith("# Core")).toBe(true);
	});

	it("records provenance hashes for the files written from", async () => {
		const doc = await generateDocument(input(["# Core\n\n`alphaSearch`."]));
		expect(doc.provenance.sources).toEqual([{ path: "src/a.ts", hash: "h1" }]);
	});

	it("repairs an ungrounded draft at a high multiplier", async () => {
		const doc = await generateDocument({
			...input(["# Core\n\nThe `ghostSymbol` does it.", "# Core\n\nThe `alphaSearch` function walks the index."]),
			multiplier: 10,
		});
		expect(groundingDefects(doc.verification.defects)).toHaveLength(0);
	});

	it("keeps the original when a repair makes grounding worse", async () => {
		const doc = await generateDocument({
			...input(["# Core\n\nThe `alphaSearch` function.", "# Core\n\n`ghost1` and `ghost2` and `ghost3`."]),
			multiplier: 10,
		});
		expect(groundingDefects(doc.verification.defects)).toHaveLength(0);
	});

	it("uses the section title as the fallback heading", async () => {
		const section = { id: "s1", title: "Section One", summary: "s", files: ["src/a.ts"] };
		const doc = await generateDocument({ ...input(["`alphaSearch` with no heading."]), section });
		expect(doc.title).toBe("Section One");
		expect(doc.path).toBe("core/s1.md");
	});

	it("names the document path per section", () => {
		expect(documentPath(chapter)).toBe("core/index.md");
		expect(documentPath(chapter, { id: "s1", title: "t", summary: "s", files: [] })).toBe("core/s1.md");
	});

	it("rations evidence hierarchically: entry files have full signatures, non-entry files only exports", () => {
		const entryFile = {
			path: "src/index.ts",
			symbols: [
				{ name: "exportedEntry", exported: true, signature: "exportedEntry(): void", doc: "Entry documentation" },
				{ name: "internalEntry", exported: false, signature: "internalEntry(): void" },
			],
		};
		const otherFile = {
			path: "src/util.ts",
			symbols: [
				{ name: "exportedOther", exported: true, signature: "exportedOther(): void", doc: "Other documentation" },
				{ name: "internalOther", exported: false, signature: "internalOther(): void" },
			],
		};
		const testIndex = indexOf([entryFile, otherFile]);
		const prompt = buildPrompt(
			{
				plan: { version: 1, generatedAt: "", multiplier: 1, chapters: [{ id: "c1", title: "C1", goal: "g", files: ["src/index.ts", "src/util.ts"] }] },
				chapter: { id: "c1", title: "C1", goal: "g", files: ["src/index.ts", "src/util.ts"] },
				index: testIndex,
				oracle: new SymbolOracle(testIndex),
				client: scriptedClient([]),
				scanFiles: scanOf([{ path: "src/index.ts" }, { path: "src/util.ts" }]).files,
				readSource: async () => null,
			},
			["src/index.ts", "src/util.ts"],
			{ declarationsPerFile: 10, repairPasses: 0, critiquePasses: 0, maxOutputTokens: 1000, targetModules: 1, multiplier: 1 } as never,
		);

		// Entry file includes doc and signatures
		expect(prompt).toContain("Entry documentation");
		expect(prompt).toContain("exportedEntry");

		// Non-entry file includes exported declarations, but omits non-entry doc and internal declarations
		expect(prompt).toContain("exportedOther");
		expect(prompt).not.toContain("Other documentation");
		expect(prompt).not.toContain("internalOther");
	});
});

describe("wiki: artifact normalisation", () => {
	it("coerces a hand-edited plan", () => {
		const plan = normalisePlan({ chapters: [{ id: "core", files: "src/a.ts" }] });
		expect(plan?.chapters[0]?.id).toBe("core");
		expect(plan?.chapters[0]?.files).toEqual([]);
		expect(plan?.multiplier).toBe(1);
	});

	it("normalises backslash paths", () => {
		expect(normalisePlan({ chapters: [{ id: "c", files: ["src\\a.ts"] }] })?.chapters[0]?.files).toEqual(["src/a.ts"]);
	});

	it("returns null for a non-object", () => {
		expect(normalisePlan("nope")).toBeNull();
	});

	it("locates a chapter document", () => {
		const plan = { chapters: [{ id: "core", title: "C", goal: "g", files: [] }] };
		expect(locate(plan, "core/index.md")?.chapter.id).toBe("core");
	});

	it("locates a section document", () => {
		const plan = {
			chapters: [{ id: "core", title: "C", goal: "g", files: [], sections: [{ id: "s1", title: "S", summary: "", files: [] }] }],
		};
		expect(locate(plan, "core/s1.md")?.section?.id).toBe("s1");
	});

	it("returns null for an unknown document", () => {
		expect(locate({ chapters: [] }, "ghost/index.md")).toBeNull();
		expect(locate({ chapters: [] }, "no-slash")).toBeNull();
	});

	it("round-trips a plan through the checkpoint with readable keys", async () => {
		const { mkdtemp, readFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-wiki-artifact-"));
		try {
			const path = await writeWikiPlan(root, {
				version: 1,
				generatedAt: "2026-01-01",
				multiplier: 4,
				chapters: [{ id: "core", title: "Core", goal: "Explain core.", files: ["src/a.ts"] }],
			});
			const text = await readFile(path, "utf8");

			expect(text).toContain("multiplier: 4");
			expect(text).not.toContain('"multiplier"');
			expect(text).toContain("- id: core");

			const back = await readWikiPlan(root);
			expect(back?.multiplier).toBe(4);
			expect(back?.chapters[0]?.files).toEqual(["src/a.ts"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("writes an index listing chapters and sections", async () => {
		const { mkdtemp, readFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-wiki-index-"));
		try {
			await writeWikiIndex(root, {
				version: 1,
				generatedAt: "",
				multiplier: 3,
				chapters: [
					{
						id: "core",
						title: "Core",
						goal: "Explain core.",
						files: ["src/a.ts"],
						sections: [{ id: "s1", title: "S1", summary: "First.", files: ["src/a.ts"] }],
					},
				],
			});
			const text = await readFile(join(root, ".kaioken", "wiki", "README.md"), "utf8");
			expect(text).toContain("[Core](core/index.md)");
			expect(text).toContain("[S1](core/s1.md)");
			expect(text).toContain("×3");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("wiki: verification artifact", () => {
	it("round-trips verdicts, including the defects themselves", async () => {
		const { mkdtemp, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-verify-artifact-"));
		try {
			await writeVerification(root, {
				model: "antigravity/gemini-3.8-flash-high",
				multiplier: 7,
				documents: [
					{
						document: "core/b.md",
						grounded: 0,
						uncovered: ["beta"],
						coverage: 0,
						defects: [{ kind: "unknown_symbol", claim: "calls `ghost()`", line: 12, detail: "no such symbol" }],
					},
					{
						document: "core/a.md",
						grounded: 4,
						uncovered: [],
						coverage: 1,
						defects: [],
					},
				],
			});

			const back = await readVerification(root);
			expect(back?.model).toBe("antigravity/gemini-3.8-flash-high");
			expect(back?.multiplier).toBe(7);
			// Sorted by document path, so a diff of two runs reads as content
			// rather than as insertion order.
			expect(back?.documents.map((d) => d.document)).toEqual(["core/a.md", "core/b.md"]);

			// A count would tell a reader to be suspicious; the claim and its
			// line tell them where to look. Persisting only the count would lose
			// the thing that makes the badge actionable.
			const defect = back?.documents[1]?.defects[0];
			expect(defect?.claim).toBe("calls `ghost()`");
			expect(defect?.line).toBe(12);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("returns null rather than throwing when nothing was written", async () => {
		const { mkdtemp, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-verify-missing-"));
		try {
			// A repository documented before verification was recorded has no
			// such file, and the pages must still render.
			expect(await readVerification(root)).toBeNull();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("rejects a foreign shape instead of trusting it", async () => {
		const { mkdtemp, mkdir, rm, writeFile } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-verify-foreign-"));
		try {
			await mkdir(join(root, ".kaioken"), { recursive: true });
			await writeFile(
				join(root, ".kaioken", "verification.json"),
				JSON.stringify({ version: 99, documents: "not an array" }),
				"utf8",
			);
			expect(await readVerification(root)).toBeNull();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("wiki: architecture brief", () => {
	const scan = scanOf([{ path: "src/a.ts" }]);
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alphaSearch" }] }]);

	it("returns the model's brief", async () => {
		const client = scriptedClient(["## What this system is\nA scanner."]);
		expect(await buildBrief({ scan, index, client })).toContain("A scanner.");
	});

	it("strips a wrapping fence from the brief", async () => {
		const client = scriptedClient(["```markdown\n## Architecture\nLayered.\n```"]);
		expect(await buildBrief({ scan, index, client })).toBe("## Architecture\nLayered.");
	});

	it("refuses to write an empty brief", async () => {
		const client = scriptedClient(["   "]);
		await expect(buildBrief({ scan, index, client })).rejects.toThrow(/empty brief/);
	});

	it("round-trips a brief through disk with the edit header", async () => {
		const { mkdtemp, readFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-wiki-brief-"));
		try {
			await writeBrief(root, "## Glossary\n**Index** — the symbol map.");
			const raw = await readFile(join(root, ".kaioken", "architecture.md"), "utf8");
			expect(raw).toContain("EDIT FREELY");
			// The header is stripped on read, so the model never sees it.
			expect(await readBrief(root)).toBe("## Glossary\n**Index** — the symbol map.");
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it("returns null when no brief exists", async () => {
		const { mkdtemp, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const root = await mkdtemp(join(tmpdir(), "kaioken-wiki-nobrief-"));
		try {
			expect(await readBrief(root)).toBeNull();
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

describe("wiki: the run cascade", () => {
	const scan = scanOf([{ path: "src/a.ts", hash: "h1" }]);
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alphaSearch" }] }]);
	const chapter: Chapter = { id: "core", title: "Core", goal: "g", files: ["src/a.ts"] };
	const plan: WikiPlan = { version: 1, generatedAt: "", multiplier: 1, chapters: [chapter] };

	function runClient() {
		return scriptedClient([
			"# Core\n\nThe `alphaSearch` function walks the index and returns ranked hits.",
			JSON.stringify({ sections: [] }),
		]);
	}

	it("generates the chapter document and reports it", async () => {
		const documents: string[] = [];
		const out = await runWiki({
			root: "/repo",
			plan,
			scan,
			index,
			client: runClient(),
			onDocument: async (doc) => void documents.push(doc.path),
		});

		expect(out.documents.map((d) => d.path)).toEqual(["core/index.md"]);
		expect(documents).toEqual(["core/index.md"]);
		expect(out.failures).toEqual([]);
	});

	it("collects a failure instead of discarding the whole run", async () => {
		const out = await runWiki({
			root: "/repo",
			plan,
			scan,
			index,
			client: runClient(),
			onDocument: async () => {
				throw new Error("disk full");
			},
		});

		expect(out.failures).toHaveLength(1);
		expect(out.failures[0]?.kind).toBe("document");
		expect(out.failures[0]?.reason).toContain("disk full");
	});

	it("skips a chapter with no files", async () => {
		const emptyPlan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [{ id: "empty", title: "E", goal: "g", files: [] }],
		};
		const out = await runWiki({ root: "/repo", plan: emptyPlan, scan, index, client: runClient() });
		expect(out.documents).toHaveLength(0);
	});

	it("honours a chapter filter", async () => {
		const out = await runWiki({ root: "/repo", plan, scan, index, client: runClient(), only: ["other"] });
		expect(out.documents).toHaveLength(0);
	});

	it("persists the sections it actually used back into the plan", async () => {
		const client = scriptedClient([
			"# Core\n\nThe `alphaSearch` function walks the index and returns ranked hits.",
			JSON.stringify({ sections: [{ id: "s1", title: "S1", summary: "First.", files: ["src/a.ts"] }] }),
			"# S1\n\nThe `alphaSearch` function walks the index and returns ranked hits.",
		]);
		const out = await runWiki({ root: "/repo", plan, scan, index, client });
		expect(out.plan.chapters[0]?.sections?.map((s) => s.id)).toEqual(["s1"]);
	});

	it("reports progress", async () => {
		const labels: string[] = [];
		await runWiki({
			root: "/repo",
			plan,
			scan,
			index,
			client: runClient(),
			onProgress: (label) => labels.push(label),
		});
		expect(labels.some((l) => l.startsWith("chapter"))).toBe(true);
	});

	it("signals task starts before progress completions", async () => {
		const client = scriptedClient([
			"# Core\n\nThe `alphaSearch` function walks the index and returns ranked hits.",
			JSON.stringify({ sections: [{ id: "s1", title: "S1", summary: "First.", files: ["src/a.ts"] }] }),
			"# S1\n\nThe `alphaSearch` function walks the index and returns ranked hits.",
		]);
		const events: string[] = [];
		await runWiki({
			root: "/repo",
			plan,
			scan,
			index,
			client,
			onTaskStart: (label) => events.push(`start:${label}`),
			onProgress: (label) => events.push(`done:${label}`),
		});
		expect(events).toContain("start:chapter core");
		expect(events).toContain("start:section core/s1");
		expect(events.indexOf("start:chapter core")).toBeLessThan(events.indexOf("done:chapter core"));
		expect(events.indexOf("start:section core/s1")).toBeLessThan(events.indexOf("done:section core/s1"));
	});

	it("resumes an existing wiki run and skips chapters already written to disk", async () => {
		const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");

		const tempDir = await mkdtemp(join(tmpdir(), "kaioken-wiki-resume-"));
		try {
			const wikiChapterDir = join(tempDir, ".kaioken", "wiki", "core");
			await mkdir(wikiChapterDir, { recursive: true });
			await writeFile(
				join(wikiChapterDir, "index.md"),
				"# Pre-existing Core Chapter\n\nContent already generated.\n",
				"utf8",
			);

			const twoChapterPlan: WikiPlan = {
				version: 1,
				generatedAt: "",
				multiplier: 1,
				chapters: [
					{ id: "core", title: "Core", goal: "g1", files: ["src/a.ts"] },
					{ id: "other", title: "Other", goal: "g2", files: ["src/b.ts"] },
				],
			};

			const twoScan = scanOf([{ path: "src/a.ts" }, { path: "src/b.ts" }]);

			const client = scriptedClient([
				"# Other\n\nThe other module.",
				JSON.stringify({ sections: [] }),
			]);

			const out = await runWiki({
				root: tempDir,
				plan: twoChapterPlan,
				scan: twoScan,
				index,
				client,
				resume: true,
			});

			// core should be reused from disk, other generated by client
			expect(out.documents).toHaveLength(2);
			const coreDoc = out.documents.find((d) => d.chapterId === "core");
			expect(coreDoc?.body).toContain("Pre-existing Core Chapter");
			// Client should only have completed requests for "other" (none for "core")
			expect(client.requests).toHaveLength(2);
			expect(client.requests[0]?.purpose).toBe("wiki-chapter");
			expect(client.requests[1]?.purpose).toBe("wiki-sections");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
