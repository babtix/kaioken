import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, type IndexResult, SymbolOracle } from "@kaioken/index";
import type { ModelClient, ModelRequest } from "@kaioken/model";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	briefPath,
	buildBrief,
	coverageOf,
	extractClaims,
	findPadding,
	locate,
	planWiki,
	readBrief,
	readWikiPlan,
	readWikiState,
	runWiki,
	sourceReader,
	verifyDocument,
	type WikiPlan,
	type WikiRunState,
	writeBrief,
	writeProvenance,
	writeWikiDocument,
	writeWikiIndex,
	writeWikiPlan,
	writeWikiState,
} from "../dist/index.js";

/**
 * The wiki's claim is that verification is the product. These tests hold it to
 * that: a document that names something the repository does not contain must be
 * reported, and — just as importantly — a correct document must not be.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

class ScriptedModel implements ModelClient {
	readonly requests: ModelRequest[] = [];
	private replies: Array<string | Error>;
	private lastString = "{}";

	constructor(replies: Array<string | Error>) {
		this.replies = [...replies];
	}

	async complete(request: ModelRequest): Promise<string> {
		this.requests.push(request);
		const item = this.replies.shift();
		if (item instanceof Error) throw item;
		if (typeof item === "string") this.lastString = item;
		return item ?? this.lastString;
	}
}

const NEWLINE = String.fromCharCode(10);

const WALK = [
	"/** Walks the working tree once. */",
	"export function walkTree(root: string): string[] {",
	"\treturn [root];",
	"}",
	"",
	"export const DEFAULT_IGNORES = [];",
	"",
].join("\n");

const SOURCE = { "src/walk.ts": WALK, "README.md": "# Demo\n" };
const ROOT_FILES = {
	"src/walk.ts": WALK,
	"package.json": '{ "name": "demo", "scripts": { "build": "tsc" } }\n',
	"deploy.sh": "#!/bin/sh\nset -euo pipefail\nnpm run build\n",
};

async function repo(files: Record<string, string> = SOURCE): Promise<{
	root: string;
	scan: ScanResult;
	index: IndexResult;
	oracle: SymbolOracle;
}> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-wiki-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	return { root, scan: scanned, index, oracle: new SymbolOracle(index) };
}

async function verify(root: string, body: string, oracle: SymbolOracle, scanned: ScanResult) {
	return verifyDocument({
		body,
		oracle,
		scope: ["src/walk.ts"],
		readSource: sourceReader(root),
		knownFiles: new Set(scanned.files.map((f) => f.path)),
	});
}

describe("claim extraction", () => {
	it("finds file references written in code spans", () => {
		const claims = extractClaims("The traversal lives in `src/walk.ts`.");
		expect(claims).toEqual([{ kind: "file", text: "src/walk.ts", line: 1 }]);
	});

	it("finds symbol references, including qualified ones", () => {
		const claims = extractClaims("Call `walkTree` or `Store.open` to begin.");
		expect(claims.map((c) => c.text)).toEqual(["walkTree", "Store.open"]);
	});

	it("finds a line anchor and keeps its range", () => {
		const [claim] = extractClaims("See `src/walk.ts:2-4` for the loop.");
		expect(claim).toMatchObject({ kind: "anchor", file: "src/walk.ts", startLine: 2, endLine: 4 });
	});

	it("treats a fence attributed to a file as a quotation", () => {
		const body = ["```ts src/walk.ts:2-4", "export function walkTree() {}", "```"].join("\n");
		const [claim] = extractClaims(body);
		expect(claim?.kind).toBe("excerpt");
		expect(claim?.file).toBe("src/walk.ts");
	});

	it("does not treat an unattributed fence as a quotation", () => {
		// An illustrative snippet claims nothing and must not be checked.
		const body = ["```ts", "const example = 1;", "```"].join("\n");
		expect(extractClaims(body)).toEqual([]);
	});

	it("ignores prose words and language keywords in code spans", () => {
		expect(extractClaims("Returns `true`, or `null` on failure, as a `string`.")).toEqual([]);
	});

	it("ignores a bare lowercase word, which is prose not a declaration", () => {
		expect(extractClaims("the `walk` step")).toEqual([]);
	});

	it("does not extract claims from inside a fence", () => {
		const body = ["```", "`src/imaginary.ts` and `NotReal`", "```"].join("\n");
		expect(extractClaims(body)).toEqual([]);
	});
});

describe("padding detection", () => {
	it("finds stock phrasing that would fit any codebase", () => {
		const found = findPadding("This module provides functionality for various different things.");
		expect(found.map((f) => f.phrase)).toContain("provides functionality for");
	});

	it("leaves specific prose alone", () => {
		expect(findPadding("walkTree respects .gitignore per directory, stacking matchers.")).toEqual([]);
	});
});

describe("verification", () => {
	it("grounds a document whose every claim is real", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(
			root,
			"# Walking\n\n`walkTree` in `src/walk.ts` returns paths. `DEFAULT_IGNORES` seeds the stack.\n",
			oracle,
			scanned,
		);
		expect(report.defects.filter((d) => d.kind !== "uncovered_export")).toEqual([]);
		expect(report.grounded).toBeGreaterThan(0);
	});

	it("reports a file the repository does not contain", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "See `src/imaginary.ts`.", oracle, scanned);
		expect(report.defects[0]).toMatchObject({ kind: "unknown_file", claim: "src/imaginary.ts" });
	});

	it("reports an invented symbol", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "Call `traverseEverything` first.", oracle, scanned);
		expect(report.defects.some((d) => d.kind === "unknown_symbol")).toBe(true);
	});

	it("resolves a verbatim excerpt to its lines", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const body = [
			"# W",
			"",
			"```ts src/walk.ts",
			"export function walkTree(root: string): string[] {",
			"```",
			"",
			"`walkTree` and `DEFAULT_IGNORES`.",
		].join("\n");
		const report = await verify(root, body, oracle, scanned);
		expect(report.defects.filter((d) => d.kind === "excerpt_not_found")).toEqual([]);
	});

	it("catches a misquotation, which is the failure a reader cannot see", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const body = ["```ts src/walk.ts", "export function walkTree(root: Path): string[] {", "```"].join(
			"\n",
		);
		const report = await verify(root, body, oracle, scanned);
		expect(report.defects.some((d) => d.kind === "excerpt_not_found")).toBe(true);
	});

	it("rejects a line anchor beyond the end of the file", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "See `src/walk.ts:900-950`.", oracle, scanned);
		expect(report.defects.some((d) => d.kind === "bad_anchor")).toBe(true);
	});

	it("accepts a valid line anchor", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "See `src/walk.ts:2-4`.", oracle, scanned);
		expect(report.defects.some((d) => d.kind === "bad_anchor")).toBe(false);
	});

	it("scores coverage against every export in scope", async () => {
		const { oracle } = await repo();
		const full = coverageOf("walkTree and DEFAULT_IGNORES are here.", oracle, ["src/walk.ts"]);
		expect(full.coverage).toBe(1);

		const partial = coverageOf("only walkTree here.", oracle, ["src/walk.ts"]);
		expect(partial.uncovered).toEqual(["DEFAULT_IGNORES"]);
		expect(partial.coverage).toBeCloseTo(0.5);
	});

	it("counts a mention in plain prose, not only in a code span", async () => {
		const { oracle } = await repo();
		// Requiring backticks would punish a document for reading well.
		expect(coverageOf("The walkTree function.", oracle, ["src/walk.ts"]).uncovered).toEqual([
			"DEFAULT_IGNORES",
		]);
	});

	it("does not count a prefix as a mention", async () => {
		const { oracle } = await repo();
		expect(coverageOf("the walk step", oracle, ["src/walk.ts"]).coverage).toBe(0);
	});
});

/**
 * These were live false positives: a chapter about the scanner correctly wrote
 * `large_binary`, `maxReadBytes` and `id_rsa`, and every one was flagged. Forty
 * false alarms bury the one defect that matters.
 */
describe("the verifier does not cry wolf", () => {
	const WITH_VALUES = [
		"export type Risk = \"private_key\" | \"large_binary\";",
		"",
		"export function classify(opts: { maxReadBytes: number }): Risk[] {",
		"	const names = [\"id_rsa\"];",
		"	return names.length && opts.maxReadBytes ? [] : [];",
		"}",
		"",
	].join("\n");

	it("grounds an enum value, an options field and a literal", async () => {
		const { root, scan: scanned, index } = await repo({ "src/risk.ts": WITH_VALUES });
		const report = await verifyDocument({
			body: "`classify` flags `large_binary`; `maxReadBytes` caps reads; `id_rsa` matches.",
			oracle: new SymbolOracle(index),
			scope: ["src/risk.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});
		// None of these is a declaration, and all of them are real.
		expect(report.defects.filter((d) => d.kind === "unknown_symbol")).toEqual([]);
	});

	it("still reports a name that appears nowhere in the source", async () => {
		const { root, scan: scanned, index } = await repo({ "src/risk.ts": WITH_VALUES });
		const report = await verifyDocument({
			body: "Call `traverseEverything` to begin.",
			oracle: new SymbolOracle(index),
			scope: ["src/risk.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});
		expect(report.defects.some((d) => d.kind === "unknown_symbol")).toBe(true);
	});

	it("accepts a file named by its basename alone", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "The traversal lives in `walk.ts`.", oracle, scanned);
		expect(report.defects.filter((d) => d.kind === "unknown_file")).toEqual([]);
	});

	it("accepts an output path the code itself constructs", async () => {
		const { root, scan: scanned, index } = await repo({
			"src/artifact.ts": 'export const OUT = "scan.json";\n',
		});
		const report = await verifyDocument({
			body: "It writes `.kaioken/scan.json`.",
			oracle: new SymbolOracle(index),
			scope: ["src/artifact.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});
		expect(report.defects.filter((d) => d.kind === "unknown_file")).toEqual([]);
	});

	it("still reports a path with no counterpart anywhere", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const report = await verify(root, "See `src/totally/imaginary.ts`.", oracle, scanned);
		expect(report.defects.some((d) => d.kind === "unknown_file")).toBe(true);
	});
});

describe("the outline is an editable checkpoint", () => {
	const OUTLINE = JSON.stringify({
		chapters: [
			{
				id: "traversal",
				title: "Traversal",
				goal: "How the working tree is walked.",
				files: ["src/walk.ts"],
			},
		],
	});

	it("round-trips through yaml", async () => {
		const { root, scan: scanned, index } = await repo();
		const { plan } = await planWiki({
			scan: scanned,
			index,
			client: new ScriptedModel([OUTLINE]),
		});
		await writeWikiPlan(root, plan);

		const reloaded = await readWikiPlan(root);
		expect(reloaded?.chapters[0]).toMatchObject({ id: "traversal", files: ["src/walk.ts"] });
	});

	it("writes a file that explains what editing it does", async () => {
		const { root, scan: scanned, index } = await repo();
		const { plan } = await planWiki({ scan: scanned, index, client: new ScriptedModel([OUTLINE]) });
		expect(await readFile(await writeWikiPlan(root, plan), "utf8")).toContain("edit this file");
	});

	it("tolerates a hand-edited outline with fields left out", async () => {
		const { root } = await repo();
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/wiki-plan.yaml"),
			"chapters:\n  - id: mine\n    files:\n      - src/walk.ts\n",
			"utf8",
		);
		const plan = await readWikiPlan(root);
		expect(plan?.chapters[0]).toMatchObject({ id: "mine", title: "mine", goal: "" });
	});
});

describe("the cascade", () => {
	const PLAN: WikiPlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		chapters: [
			{
				id: "traversal",
				title: "Traversal",
				goal: "How the tree is walked.",
				files: ["src/walk.ts"],
			},
		],
	};

	const CHAPTER = "# Traversal\n\n`walkTree` in `src/walk.ts` returns paths. `DEFAULT_IGNORES` seeds it.\n";
	const SECTIONS = JSON.stringify({
		sections: [
			{ id: "ignores", title: "Ignore rules", summary: "How ignores stack.", files: ["src/walk.ts"] },
		],
	});
	const SECTION_DOC = "# Ignore rules\n\n`DEFAULT_IGNORES` seeds the stack used by `walkTree`.\n";

	it("writes a chapter, plans its sections, then writes them", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([CHAPTER, SECTIONS, SECTION_DOC]);
		const { documents: docs } = await runWiki({ root, plan: PLAN, scan: scanned, index, client: model });

		expect(docs.map((d) => d.path)).toEqual(["traversal/index.md", "traversal/ignores.md"]);
		expect(model.requests.map((r) => r.purpose)).toEqual([
			"wiki-chapter",
			"wiki-sections",
			"wiki-section",
		]);
	});

	it("shows a chapter the rest of the outline so chapters do not overlap", async () => {
		const { root, scan: scanned, index } = await repo();
		const plan: WikiPlan = {
			...PLAN,
			chapters: [
				PLAN.chapters[0] as (typeof PLAN.chapters)[number],
				{ id: "other", title: "Other", goal: "Something else.", files: [] },
			],
		};
		const model = new ScriptedModel([CHAPTER, SECTIONS, SECTION_DOC]);
		await runWiki({ root, plan, scan: scanned, index, client: model });
		expect(model.requests[0]?.prompt).toContain("Something else.");
	});

	it("uses sections already written into the outline by hand", async () => {
		const { root, scan: scanned, index } = await repo();
		const plan: WikiPlan = {
			...PLAN,
			chapters: [
				{
					...(PLAN.chapters[0] as (typeof PLAN.chapters)[number]),
					sections: [
						{ id: "mine", title: "Mine", summary: "Hand written.", files: ["src/walk.ts"] },
					],
				},
			],
		};
		const model = new ScriptedModel([CHAPTER, SECTION_DOC]);
		const { documents: docs } = await runWiki({ root, plan, scan: scanned, index, client: model });

		// No section-planning call: the edit is authoritative.
		expect(model.requests.map((r) => r.purpose)).toEqual(["wiki-chapter", "wiki-section"]);
		expect(docs.map((d) => d.path)).toEqual(["traversal/index.md", "traversal/mine.md"]);
	});

	it("confines a subsection to its chapter's files", async () => {
		const { root, scan: scanned, index } = await repo({
			...SOURCE,
			"src/other.ts": "export function elsewhere() {}\n",
		});
		const greedy = JSON.stringify({
			sections: [
				{ id: "s", title: "S", summary: "x", files: ["src/walk.ts", "src/other.ts"] },
			],
		});
		const model = new ScriptedModel([CHAPTER, greedy, SECTION_DOC]);
		const { documents: docs } = await runWiki({ root, plan: PLAN, scan: scanned, index, client: model });

		// The section plan may not overrule the global plan.
		const section = docs.find((d) => d.sectionId === "s");
		expect(section?.provenance.sources.map((s) => s.path)).toEqual(["src/walk.ts"]);
	});

	it("records provenance as hashes, which is what invalidation reads", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([CHAPTER, SECTIONS, SECTION_DOC]);
		const { documents: [doc] } = await runWiki({ root, plan: PLAN, scan: scanned, index, client: model });

		const source = doc?.provenance.sources[0];
		expect(source?.path).toBe("src/walk.ts");
		expect(source?.hash).toMatch(/^[0-9a-f]{64}$/);
		expect(source?.hash).toBe(scanned.files.find((f) => f.path === "src/walk.ts")?.hash);
	});

	it("ships the defect report alongside the document", async () => {
		const { root, scan: scanned, index } = await repo();
		const bad = "# Traversal\n\nCall `traverseEverything` in `src/ghost.ts`.\n";
		const model = new ScriptedModel([bad, JSON.stringify({ sections: [] })]);
		const { documents: [doc] } = await runWiki({ root, plan: PLAN, scan: scanned, index, client: model });

		const kinds = doc?.verification.defects.map((d) => d.kind) ?? [];
		expect(kinds).toContain("unknown_symbol");
		expect(kinds).toContain("unknown_file");
	});

	it("persists documents and the provenance index", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([CHAPTER, JSON.stringify({ sections: [] })]);
		const { documents: docs } = await runWiki({ root, plan: PLAN, scan: scanned, index, client: model });

		for (const doc of docs) await writeWikiDocument(root, doc);
		await writeProvenance(root, docs.map((d) => d.provenance));

		expect(await readFile(join(root, ".kaioken/wiki/traversal/index.md"), "utf8")).toContain(
			"# Traversal",
		);
		const provenance = JSON.parse(
			await readFile(join(root, ".kaioken/provenance.json"), "utf8"),
		) as { documents: { document: string }[] };
		expect(provenance.documents[0]?.document).toBe("traversal/index.md");
	});
});

/**
 * Sections were being re-planned on every run, inventing different ids and
 * leaving the previous documents on disk describing the same ground. Persisting
 * them into the outline is what makes a later `update` able to regenerate one
 * document instead of a whole chapter.
 */
describe("sections are persisted into the outline", () => {
	const PLAN2: WikiPlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		chapters: [{ id: "t", title: "T", goal: "g", files: ["src/walk.ts"] }],
	};
	const DOC = ["# T", "", "`walkTree` and `DEFAULT_IGNORES`.", ""].join(String.fromCharCode(10));
	const SECTIONS = JSON.stringify({
		sections: [{ id: "detail", title: "Detail", summary: "s", files: ["src/walk.ts"] }],
	});

	it("returns the plan with the sections the run actually used", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([DOC, SECTIONS, DOC]);
		const { plan } = await runWiki({ root, plan: PLAN2, scan: scanned, index, client: model });

		expect(plan.chapters[0]?.sections?.map((s) => s.id)).toEqual(["detail"]);
	});

	it("re-running with the returned plan does not re-plan sections", async () => {
		const { root, scan: scanned, index } = await repo();
		const first = new ScriptedModel([DOC, SECTIONS, DOC]);
		const { plan } = await runWiki({ root, plan: PLAN2, scan: scanned, index, client: first });

		const second = new ScriptedModel([DOC, DOC]);
		const { documents } = await runWiki({ root, plan, scan: scanned, index, client: second });

		// No wiki-sections call, and the same paths as before: nothing orphaned.
		expect(second.requests.map((r) => r.purpose)).toEqual(["wiki-chapter", "wiki-section"]);
		expect(documents.map((d) => d.path)).toEqual(["t/index.md", "t/detail.md"]);
	});
});

describe("refinement", () => {
	const PLAN: WikiPlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		chapters: [
			{ id: "t", title: "T", goal: "g", files: ["src/walk.ts"] },
		],
	};
	const BAD = "# T\n\nCall `traverseEverything`.\n";
	const GOOD = "# T\n\n`walkTree` walks the tree; `DEFAULT_IGNORES` seeds it.\n";

	it("makes no critique call when document is clean below the threshold", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([GOOD, JSON.stringify({ sections: [] })]);
		await runWiki({ root, plan: PLAN, scan: scanned, index, client: model, multiplier: 1 });
		expect(model.requests.map((r) => r.purpose)).toEqual(["wiki-chapter", "wiki-sections"]);
	});

	it("feeds the verifier's findings back to repair ungrounded claims", async () => {
		const { root, scan: scanned, index } = await repo();
		const model = new ScriptedModel([BAD, GOOD, JSON.stringify({ sections: [] })]);
		const { documents: [doc] } = await runWiki({
			root,
			plan: PLAN,
			scan: scanned,
			index,
			client: model,
			multiplier: 1,
		});

		expect(model.requests[1]?.purpose).toBe("wiki-correct");
		expect(model.requests[1]?.prompt).toContain("traverseEverything");
		expect(doc?.verification.defects.some((d) => d.kind === "unknown_symbol")).toBe(false);
	});

	it("keeps the original when a revision makes things worse", async () => {
		const { root, scan: scanned, index } = await repo();
		const worse = "# T\n\nCall `traverseEverything` and `alsoInvented` in `src/ghost.ts`.\n";
		const model = new ScriptedModel([BAD, worse, JSON.stringify({ sections: [] })]);
		const { documents: [doc] } = await runWiki({
			root,
			plan: PLAN,
			scan: scanned,
			index,
			client: model,
			multiplier: 1,
		});
		expect(doc?.body).toBe(BAD.trim());
	});
});

/**
 * Two ways the verifier used to accuse correct documentation.
 *
 * Both are lookup failures wearing the costume of a content defect, which is
 * the worst shape a defect report can take: the repair loop believes it, and
 * rewrites prose that was right.
 */
describe("what the verifier must not call a defect", () => {
	it("does not call a root-level file an invented symbol", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		// No slash, so claim extraction classifies these as symbols. Only the
		// verifier knows the repository's file list, so only it can tell.
		const report = await verifyDocument({
			body: "The build is declared in `package.json` and run by `deploy.sh`.",
			oracle: new SymbolOracle(index),
			scope: ["src/walk.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});

		expect(report.defects.filter((d) => d.kind === "unknown_symbol")).toEqual([]);
	});

	it("checks a quote from a file with no grammar, instead of denying it", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const report = await verifyDocument({
			body: [
				"The deploy script builds first:",
				"",
				"```sh deploy.sh",
				"npm run build",
				"```",
				"",
			].join(NEWLINE),
			oracle: new SymbolOracle(index),
			scope: ["src/walk.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});

		// The quote is verbatim. Refusing because the file has no declaration
		// index reported "the attributed file does not contain that text" about
		// text it plainly contains.
		expect(report.defects.filter((d) => d.kind === "excerpt_not_found")).toEqual([]);
	});

	it("still catches a quote the file does not contain", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const report = await verifyDocument({
			body: ["```sh deploy.sh", "rm -rf /", "```", ""].join(NEWLINE),
			oracle: new SymbolOracle(index),
			scope: ["src/walk.ts"],
			readSource: sourceReader(root),
			knownFiles: new Set(scanned.files.map((f) => f.path)),
		});

		// The fallback must not become a pass-through: an unindexed file is
		// still checked, just against its text rather than its declarations.
		expect(report.defects.some((d) => d.kind === "excerpt_not_found")).toBe(true);
	});
});

describe("wiki durability and failures", () => {
	it("calls onDocument incrementally as each document completes", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);
		const written: string[] = [];

		const client = new ScriptedModel([
			"# Walk\n\n`walkTree` walks the tree.",
			JSON.stringify({ sections: [{ id: "sub", title: "Sub", summary: "sub", files: ["src/walk.ts"] }] }),
			"# Sub\n\n`DEFAULT_IGNORES` is empty.",
		]);

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [{ id: "core", title: "Core", goal: "core", files: ["src/walk.ts"] }],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			onDocument: async (doc) => {
				written.push(doc.path);
			},
		});

		expect(written).toEqual(["core/index.md", "core/sub.md"]);
		expect(res.documents.map((d) => d.path)).toEqual(["core/index.md", "core/sub.md"]);
		expect(res.failures).toEqual([]);
	});

	it("keeps succeeded documents when one chapter throws", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel([
			"# Chapter 1\n\n`walkTree` walks.",
			JSON.stringify({ sections: [] }),
			new Error("500 Server Error on chapter 2"),
		]);

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [
				{ id: "ch1", title: "Ch1", goal: "goal 1", files: ["src/walk.ts"] },
				{ id: "ch2", title: "Ch2", goal: "goal 2", files: ["src/walk.ts"] },
			],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			concurrency: 1,
		});

		expect(res.documents).toHaveLength(1);
		expect(res.documents[0]?.path).toBe("ch1/index.md");
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]?.chapterId).toBe("ch2");
		expect(res.failures[0]?.kind).toBe("document");
		expect(res.failures[0]?.reason).toContain("500 Server Error");
	});

	it("records a sections failure without losing the chapter document", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel([
			"# Chapter 1\n\n`walkTree` walks.",
			new Error("rate limit on sections planning"),
		]);

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [{ id: "ch1", title: "Ch1", goal: "goal 1", files: ["src/walk.ts"] }],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
		});

		expect(res.documents).toHaveLength(1);
		expect(res.documents[0]?.path).toBe("ch1/index.md");
		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]?.kind).toBe("sections");
		expect(res.failures[0]?.chapterId).toBe("ch1");
	});

	it("resolves sections into the returned plan even when a later chapter fails", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel([
			"# Ch1\n\n`walkTree` walks.",
			JSON.stringify({ sections: [{ id: "sec1", title: "Sec1", summary: "s1", files: ["src/walk.ts"] }] }),
			new Error("ch2 exploded"),
			"# Sec1\n\n`DEFAULT_IGNORES` is used.",
		]);

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [
				{ id: "ch1", title: "Ch1", goal: "g1", files: ["src/walk.ts"] },
				{ id: "ch2", title: "Ch2", goal: "g2", files: ["src/walk.ts"] },
			],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			concurrency: 1,
		});

		const ch1 = res.plan.chapters.find((c) => c.id === "ch1");
		expect(ch1?.sections).toBeDefined();
		expect(ch1?.sections?.[0]?.id).toBe("sec1");
	});

	it("treats a throwing sink as a failed document", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel([
			"# Ch1\n\n`walkTree` walks.",
			JSON.stringify({ sections: [] }),
		]);
		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [{ id: "ch1", title: "Ch1", goal: "g1", files: ["src/walk.ts"] }],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			onDocument: async () => {
				throw new Error("disk full");
			},
		});

		expect(res.failures).toHaveLength(1);
		expect(res.failures[0]?.kind).toBe("document");
		expect(res.failures[0]?.reason).toContain("disk full");
	});

	it("caches sourceReader promises so duplicate concurrent reads make 1 file read", async () => {
		const { root } = await repo(ROOT_FILES);
		const reader = sourceReader(root);

		const [p1, p2, p3] = await Promise.all([
			reader("src/walk.ts"),
			reader("src/walk.ts"),
			reader("src/walk.ts"),
		]);

		expect(p1).toBe(WALK);
		expect(p2).toBe(WALK);
		expect(p3).toBe(WALK);
	});
});

describe("wiki retry and onlyDocuments", () => {
	it("restricting to onlyDocuments produces purposes only for wanted documents", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel(["# Sub\n\n`DEFAULT_IGNORES` is empty."]);
		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [
				{
					id: "core",
					title: "Core",
					goal: "core",
					files: ["src/walk.ts"],
					sections: [{ id: "sub", title: "Sub", summary: "sub", files: ["src/walk.ts"] }],
				},
			],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			onlyDocuments: ["core/sub.md"],
		});

		expect(res.documents).toHaveLength(1);
		expect(res.documents[0]?.path).toBe("core/sub.md");
		expect(client.requests.map((r) => r.purpose)).toEqual(["wiki-section"]);
	});

	it("locate helper resolves chapters and subsections accurately", () => {
		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [
				{
					id: "ch1",
					title: "Chapter 1",
					goal: "goal",
					files: ["src/walk.ts"],
					sections: [{ id: "sec1", title: "Section 1", summary: "s", files: ["src/walk.ts"] }],
				},
			],
		};

		const c = locate(plan, "ch1/index.md");
		expect(c?.chapter.id).toBe("ch1");
		expect(c?.section).toBeUndefined();

		const s = locate(plan, "ch1/sec1.md");
		expect(s?.chapter.id).toBe("ch1");
		expect(s?.section?.id).toBe("sec1");

		expect(locate(plan, "ch1/unknown.md")).toBeNull();
		expect(locate(plan, "unknown/index.md")).toBeNull();
		expect(locate(plan, "invalid")).toBeNull();
	});
});

describe("wiki concurrency and order", () => {
	it("returns documents in plan order regardless of completion order", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client: ModelClient = {
			async complete(req: ModelRequest): Promise<string> {
				if (req.purpose === "wiki-chapter") {
					// Chapter 1 takes longer than Chapter 2
					if (req.prompt.includes("Ch1")) {
						await new Promise((r) => setTimeout(r, 40));
						return "# Ch1\n\n`walkTree` walks.";
					}
					await new Promise((r) => setTimeout(r, 10));
					return "# Ch2\n\n`walkTree` walks again.";
				}
				return "{}";
			},
		};

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [
				{ id: "ch1", title: "Ch1", goal: "g1", files: ["src/walk.ts"] },
				{ id: "ch2", title: "Ch2", goal: "g2", files: ["src/walk.ts"] },
			],
		};

		const res = await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			concurrency: 2,
		});

		expect(res.documents.map((d) => d.path)).toEqual(["ch1/index.md", "ch2/index.md"]);
	});
});

describe("architecture brief", () => {
	it("injects the brief into chapter and section prompts", async () => {
		const { root, scan: scanned, index } = await repo(ROOT_FILES);

		const client = new ScriptedModel([
			"# Ch1\n\n`walkTree` walks.",
			JSON.stringify({ sections: [{ id: "sub", title: "Sub", summary: "sub", files: ["src/walk.ts"] }] }),
			"# Sub\n\n`DEFAULT_IGNORES` is empty.",
		]);

		const plan: WikiPlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			chapters: [{ id: "core", title: "Core", goal: "core", files: ["src/walk.ts"] }],
		};

		const briefText = "## Architecture\nThe core system components.";

		await runWiki({
			root,
			plan,
			scan: scanned,
			index,
			client,
			brief: briefText,
		});

		for (const req of client.requests) {
			expect(req.prompt).toContain("Architecture brief");
			expect(req.prompt).toContain(briefText);
		}
	});

	it("reads and writes brief to disk stripping comment header", async () => {
		const { root } = await repo(ROOT_FILES);
		const content = "## What this system is\nA test system.\n\n## Glossary\n**Scanner** — inspects files.";

		const path = await writeBrief(root, content);
		expect(path).toBe(briefPath(root));

		const read = await readBrief(root);
		expect(read).toBe(content);
	});
});
