import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, type IndexResult } from "@kaioken/index";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	depthFor,
	expandDirectories,
	extractJson,
	gatherEvidence,
	gatherModuleEvidence,
	generateCards,
	type ModelClient,
	type ModelRequest,
	type ModulePlan,
	moduleScope,
	parseMultiplier,
	proposeModulePlan,
	readModulePlan,
	validatePlan,
	writeModulePlan,
} from "../dist/index.js";

/**
 * Phase 3 is the first phase that calls a model, and none of these tests do.
 * The deterministic halves — evidence, validation, verification, persistence —
 * are separately testable by construction, and the generative half is driven by
 * a scripted double. If a stage needed an API key to be tested, it would be
 * designed wrong.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Records every request, so a test can assert what the model was actually asked. */
class ScriptedModel implements ModelClient {
	readonly requests: ModelRequest[] = [];
	private replies: string[];

	constructor(replies: string[]) {
		this.replies = [...replies];
	}

	async complete(request: ModelRequest): Promise<string> {
		this.requests.push(request);
		return this.replies.shift() ?? this.replies.at(-1) ?? "{}";
	}
}

const SOURCE = {
	"src/scan/walk.ts": [
		"/** Walks the working tree once. */",
		"export function walkTree(root: string): string[] {",
		"\treturn [root];",
		"}",
		"",
		"export const DEFAULT_IGNORES = [`.git`];",
		"",
	].join("\n"),
	"src/search/rank.ts": [
		"/** Ranks documents with BM25. */",
		"export function rankDocuments(query: string): number[] {",
		"\treturn [query.length];",
		"}",
		"",
	].join("\n"),
	"README.md": "# Demo\n",
};

async function repo(files: Record<string, string> = SOURCE): Promise<{
	root: string;
	scan: ScanResult;
	index: IndexResult;
}> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-plan-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	return { root, scan: scanned, index };
}

const PLAN_REPLY = JSON.stringify({
	modules: [
		{
			id: "scanning",
			name: "Scanning",
			purpose: "Walks the working tree and produces the canonical file set.",
			files: ["src/scan/walk.ts"],
		},
		{
			id: "search",
			name: "Search",
			purpose: "Ranks the corpus against a query.",
			files: ["src/search/rank.ts"],
		},
	],
});

describe("evidence gathering", () => {
	it("summarises directories from the phase-1 artifacts alone", async () => {
		const { scan: scanned, index } = await repo();
		const evidence = gatherEvidence(scanned, index);

		expect(evidence.directories.map((d) => d.path)).toEqual([".", "src/scan", "src/search"]);
		expect(evidence.readmes).toEqual(["README.md"]);
	});

	it("lists exported declarations, which are a module's contract", async () => {
		const { scan: scanned, index } = await repo();
		const evidence = gatherEvidence(scanned, index);
		const scanDir = evidence.directories.find((d) => d.path === "src/scan");
		expect(scanDir?.symbols).toContain("walkTree");
	});

	it("excludes generated and lockfile noise, which describes no intent", async () => {
		const { scan: scanned, index } = await repo({
			...SOURCE,
			"dist/bundle.js": "export const a = 1;\n",
			"package-lock.json": '{"name":"x"}\n',
		});
		const evidence = gatherEvidence(scanned, index);
		expect(evidence.directories.map((d) => d.path)).not.toContain("dist");
	});

	it("bundles a module's declaration skeleton, not its source", async () => {
		const { index } = await repo();
		const evidence = gatherModuleEvidence(index, ["src/scan/walk.ts"]);
		expect(evidence.files[0]?.declarations.join("\n")).toContain("walkTree");
		expect(evidence.exportedSymbols).toContain("DEFAULT_IGNORES");
	});

	it("reports a claimed file the index never had", async () => {
		const { index } = await repo();
		const evidence = gatherModuleEvidence(index, ["src/nope.ts"]);
		expect(evidence.missing).toEqual(["src/nope.ts"]);
	});
});

describe("validation", () => {
	it("accepts a plan whose files all exist", async () => {
		const { scan: scanned, index } = await repo();
		const { plan, validation } = await proposeModulePlan(
			scanned,
			index,
			new ScriptedModel([PLAN_REPLY]),
		);
		expect(validation.ok).toBe(true);
		expect(plan.modules).toHaveLength(2);
	});

	it("rejects a module claiming a file the repository does not contain", async () => {
		const { scan: scanned } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "a", name: "A", purpose: "p", files: ["src/imaginary.ts"] }],
		};
		const validation = validatePlan(plan, scanned);
		expect(validation.ok).toBe(false);
		expect(validation.defects[0]?.kind).toBe("unknown_file");
		expect(validation.defects[0]?.items).toEqual(["src/imaginary.ts"]);
	});

	it("rejects duplicate ids, which are how everything else refers to a module", async () => {
		const { scan: scanned } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{ id: "a", name: "A", purpose: "p", files: ["src/scan/walk.ts"] },
				{ id: "a", name: "B", purpose: "p", files: ["src/search/rank.ts"] },
			],
		};
		expect(validatePlan(plan, scanned).ok).toBe(false);
	});

	it("treats an incomplete decomposition as a warning, not an error", async () => {
		const { scan: scanned } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "a", name: "A", purpose: "p", files: ["src/scan/walk.ts"] }],
		};
		const validation = validatePlan(plan, scanned);
		// Leaving peripheral files unassigned is often correct; the user judges.
		expect(validation.ok).toBe(true);
		expect(validation.orphans).toContain("src/search/rank.ts");
	});

	it("warns when two modules claim the same file", async () => {
		const { scan: scanned } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{ id: "a", name: "A", purpose: "p", files: ["src/scan/walk.ts"] },
				{ id: "b", name: "B", purpose: "p", files: ["src/scan/walk.ts"] },
			],
		};
		const validation = validatePlan(plan, scanned);
		expect(validation.ok).toBe(true);
		expect(validation.defects.some((d) => d.kind === "overlapping_files")).toBe(true);
	});

	it("collects a parent's whole subtree as its scope", () => {
		expect(
			moduleScope({
				id: "p",
				name: "P",
				purpose: "",
				files: ["a.ts"],
				children: [{ id: "c", name: "C", purpose: "", files: ["b.ts"] }],
			}),
		).toEqual(["a.ts", "b.ts"]);
	});
});

describe("the plan is an editable checkpoint", () => {
	it("round-trips through yaml", async () => {
		const { root, scan: scanned, index } = await repo();
		const { plan } = await proposeModulePlan(scanned, index, new ScriptedModel([PLAN_REPLY]));
		await writeModulePlan(root, plan);

		const reloaded = await readModulePlan(root);
		expect(reloaded?.modules.map((m) => m.id)).toEqual(["scanning", "search"]);
	});

	it("writes a file that explains itself to whoever opens it", async () => {
		const { root, scan: scanned, index } = await repo();
		const { plan } = await proposeModulePlan(scanned, index, new ScriptedModel([PLAN_REPLY]));
		const path = await writeModulePlan(root, plan);
		expect(await readFile(path, "utf8")).toContain("edit this file");
	});

	it("tolerates a hand-edited file with fields left out", async () => {
		const { root } = await repo();
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/module-plan.yaml"),
			"modules:\n  - id: mine\n    files:\n      - src/scan/walk.ts\n",
			"utf8",
		);
		const plan = await readModulePlan(root);
		// A missing name falls back to the id rather than failing to parse.
		expect(plan?.modules[0]).toMatchObject({ id: "mine", name: "mine", purpose: "" });
	});

	it("validates hand-edited files the same way it validates model output", async () => {
		const { root, scan: scanned } = await repo();
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/module-plan.yaml"),
			"modules:\n  - id: mine\n    files:\n      - src/typo.ts\n",
			"utf8",
		);
		const plan = await readModulePlan(root);
		expect(validatePlan(plan as ModulePlan, scanned).ok).toBe(false);
	});
});

describe("the multiplier", () => {
	it("accepts x1..x10 and rejects the rest", () => {
		expect(parseMultiplier("x3")).toBe(3);
		expect(parseMultiplier("7")).toBe(7);
		expect(parseMultiplier(undefined)).toBe(1);
		expect(parseMultiplier("x11")).toBeNull();
		expect(parseMultiplier("x0")).toBeNull();
		expect(parseMultiplier("deep")).toBeNull();
	});

	it("buys breadth below the threshold", () => {
		expect(depthFor(3).targetModules).toBeGreaterThan(depthFor(1).targetModules);
		expect(depthFor(3).refinementPasses).toBe(0);
	});

	it("stops buying breadth and starts buying passes above it", () => {
		// Past the threshold more breadth yields longer output, not better
		// output, so the dial switches to scrutiny.
		expect(depthFor(8).targetModules).toBe(depthFor(5).targetModules);
		expect(depthFor(8).refinementPasses).toBe(3);
	});
});

describe("json extraction", () => {
	it("reads a bare object", () => {
		expect(extractJson<{ a: number }>('{"a":1}').a).toBe(1);
	});

	it("reads a fenced block", () => {
		expect(extractJson<{ a: number }>('```json\n{"a":1}\n```').a).toBe(1);
	});

	it("reads an object buried in prose", () => {
		// Models wrap JSON in commentary no matter how firmly asked not to.
		expect(extractJson<{ a: number }>('Sure! Here it is:\n{"a":1}\nHope that helps.').a).toBe(1);
	});

	it("is not confused by braces inside strings", () => {
		expect(extractJson<{ a: string }>('{"a":"}{"}').a).toBe("}{");
	});

	it("throws rather than returning something invented", () => {
		expect(() => extractJson("no json at all")).toThrow(/no parseable JSON/);
	});
});

/**
 * The phase's definition of done. The plan is authoritative: what the user
 * writes in it is what gets generated.
 */
describe("generation obeys the edits", () => {
	const CARD_REPLY = JSON.stringify({
		summary: "Walks the tree.",
		keyPoints: ["One traversal."],
		entryPoints: [{ name: "walkTree", file: "src/scan/walk.ts", note: "Start here." }],
	});

	it("generates a card for exactly the modules the plan declares", async () => {
		const { index } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{ id: "only-this", name: "Only This", purpose: "p", files: ["src/scan/walk.ts"] },
			],
		};
		const model = new ScriptedModel([CARD_REPLY]);
		const results = await generateCards(plan, index, model);

		expect(results.map((r) => r.card.moduleId)).toEqual(["only-this"]);
	});

	it("bundles exactly the files the edited plan assigns", async () => {
		const { index } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "m", name: "M", purpose: "p", files: ["src/search/rank.ts"] }],
		};
		const model = new ScriptedModel([CARD_REPLY]);
		await generateCards(plan, index, model);

		const prompt = model.requests[0]?.prompt ?? "";
		expect(prompt).toContain("src/search/rank.ts");
		expect(prompt).not.toContain("src/scan/walk.ts");
	});

	it("carries the edited purpose into the prompt", async () => {
		const { index } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{ id: "m", name: "M", purpose: "A purpose the user typed by hand.", files: ["src/scan/walk.ts"] },
			],
		};
		const model = new ScriptedModel([CARD_REPLY]);
		await generateCards(plan, index, model);
		expect(model.requests[0]?.prompt).toContain("A purpose the user typed by hand.");
	});

	it("gives a grouping parent no card of its own", async () => {
		const { index } = await repo();
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{
					id: "parent",
					name: "Parent",
					purpose: "Groups things.",
					files: [],
					children: [{ id: "child", name: "Child", purpose: "p", files: ["src/scan/walk.ts"] }],
				},
			],
		};
		const results = await generateCards(plan, index, new ScriptedModel([CARD_REPLY]));
		expect(results.map((r) => r.card.moduleId)).toEqual(["child"]);
	});
});

/**
 * Generation is a claim; verification is the product. The model is asked not to
 * invent declarations, and then checked on whether it did.
 */
describe("cards are verified, not trusted", () => {
	const plan: ModulePlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		modules: [{ id: "scanning", name: "Scanning", purpose: "p", files: ["src/scan/walk.ts"] }],
	};

	it("grounds an entry point the repository really declares", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: ["k"],
				entryPoints: [{ name: "walkTree", file: "src/scan/walk.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.grounded).toBe(1);
		expect(result?.card.verification.ungrounded).toEqual([]);
	});

	it("reports an invented declaration instead of shipping it", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: ["k"],
				entryPoints: [{ name: "traverseEverything", file: "src/scan/walk.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.ungrounded).toEqual(["traverseEverything"]);
	});

	it("rejects a real symbol attributed to the wrong file", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: ["k"],
				// rankDocuments exists, but not in this module's scope.
				entryPoints: [{ name: "rankDocuments", file: "src/scan/walk.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.ungrounded).toEqual(["rankDocuments"]);
	});

	it("reports a file outside the module's scope", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: ["k"],
				entryPoints: [{ name: "rankDocuments", file: "src/search/rank.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.unknownFiles).toEqual(["src/search/rank.ts"]);
	});

	it("names exported declarations the card never covered", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: ["k"],
				entryPoints: [{ name: "walkTree", file: "src/scan/walk.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.uncovered).toContain("DEFAULT_IGNORES");
	});

	it("records the files it was written from, not the ones it mentioned", async () => {
		const { scan: scanned, index } = await repo();
		const model = new ScriptedModel([
			JSON.stringify({ summary: "s", keyPoints: [], entryPoints: [] }),
		]);
		const known = new Map(scanned.files.map((f) => [f.path, f.hash] as const));
		const [result] = await generateCards(plan, index, model, { knownFiles: known });

		// Provenance is machinery: staleness reads these hashes, so a path alone
		// would be decoration.
		expect(result?.card.sources).toEqual([
			{ path: "src/scan/walk.ts", hash: known.get("src/scan/walk.ts") },
		]);
	});
});

/**
 * Both of these were live false positives: real cards flagged as wrong. A flag
 * on correct output teaches the reader to ignore flags, so precision in the
 * verifier matters as much as recall.
 */
describe("the verifier does not cry wolf", () => {
	it("accepts a method written as Owner.method", async () => {
		const { index } = await repo({
			"src/store.ts": [
				"export class Store {",
				"\tstatic open(): Store {",
				"\t\treturn new Store();",
				"\t}",
				"}",
				"",
			].join("\n"),
		});
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "m", name: "M", purpose: "p", files: ["src/store.ts"] }],
		};
		const model = new ScriptedModel([
			JSON.stringify({
				summary: "s",
				keyPoints: [],
				// The index stores name "open" with parent "Store".
				entryPoints: [{ name: "Store.open", file: "src/store.ts", note: "n" }],
			}),
		]);
		const [result] = await generateCards(plan, index, model);
		expect(result?.card.verification.ungrounded).toEqual([]);
		expect(result?.card.verification.grounded).toBe(1);
	});

	it("does not call a real file missing just because it has no declarations", async () => {
		const { root, scan: scanned, index } = await repo({
			...SOURCE,
			"src/scan/package.json": '{"name":"scan"}\n',
		});
		void root;
		const known = new Map(
			scanned.files.filter((f) => !f.binary).map((f) => [f.path, f.hash] as const),
		);
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [
				{
					id: "m",
					name: "M",
					purpose: "p",
					files: ["src/scan/walk.ts", "src/scan/package.json"],
				},
			],
		};
		const model = new ScriptedModel([
			JSON.stringify({ summary: "s", keyPoints: [], entryPoints: [] }),
		]);
		const [result] = await generateCards(plan, index, model, { knownFiles: known });

		// A package.json is a real file with nothing to extract, not a defect.
		expect(result?.card.verification.unknownFiles).toEqual([]);
		expect(result?.card.sources.map((s) => s.path)).toContain("src/scan/package.json");
	});

	it("still reports a path the scan never saw", async () => {
		const { scan: scanned, index } = await repo();
		const known = new Map(scanned.files.map((f) => [f.path, f.hash] as const));
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "m", name: "M", purpose: "p", files: ["src/ghost.ts"] }],
		};
		const model = new ScriptedModel([
			JSON.stringify({ summary: "s", keyPoints: [], entryPoints: [] }),
		]);
		const [result] = await generateCards(plan, index, model, { knownFiles: known });
		expect(result?.card.verification.unknownFiles).toEqual(["src/ghost.ts"]);
	});
});

describe("directory expansion", () => {
	it("resolves a directory named where files were expected", async () => {
		const { scan: scanned } = await repo();
		const expanded = expandDirectories(
			{
				version: 1,
				generatedAt: "",
				multiplier: 1,
				modules: [{ id: "m", name: "M", purpose: "p", files: ["src/scan"] }],
			},
			scanned,
		);
		expect(expanded.modules[0]?.files).toEqual(["src/scan/walk.ts"]);
	});

	it("leaves a path matching nothing alone, so it is still reported", async () => {
		const { scan: scanned } = await repo();
		const expanded = expandDirectories(
			{
				version: 1,
				generatedAt: "",
				multiplier: 1,
				modules: [{ id: "m", name: "M", purpose: "p", files: ["src/nowhere"] }],
			},
			scanned,
		);
		expect(expanded.modules[0]?.files).toEqual(["src/nowhere"]);
		expect(validatePlan(expanded, scanned).ok).toBe(false);
	});
});

describe("correction passes", () => {
	const plan: ModulePlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		modules: [{ id: "scanning", name: "Scanning", purpose: "p", files: ["src/scan/walk.ts"] }],
	};

	const BAD = JSON.stringify({
		summary: "s",
		keyPoints: ["k"],
		entryPoints: [{ name: "invented", file: "src/scan/walk.ts", note: "n" }],
	});
	const GOOD = JSON.stringify({
		summary: "s",
		keyPoints: ["k"],
		entryPoints: [{ name: "walkTree", file: "src/scan/walk.ts", note: "n" }],
	});

	it("makes no correction call below the threshold", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([BAD]);
		await generateCards(plan, index, model, { multiplier: 1 });
		expect(model.requests.map((r) => r.purpose)).toEqual(["card"]);
	});

	it("feeds the verifier's findings back above the threshold", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([BAD, GOOD]);
		const [result] = await generateCards(plan, index, model, { multiplier: 6 });

		expect(model.requests.map((r) => r.purpose)).toEqual(["card", "card-correct"]);
		expect(model.requests[1]?.prompt).toContain("invented");
		expect(result?.card.verification.ungrounded).toEqual([]);
	});

	it("keeps the original when a revision makes grounding worse", async () => {
		const { index } = await repo();
		const WORSE = JSON.stringify({
			summary: "s",
			keyPoints: ["k"],
			entryPoints: [
				{ name: "invented", file: "src/scan/walk.ts", note: "n" },
				{ name: "alsoInvented", file: "src/scan/walk.ts", note: "n" },
			],
		});
		const model = new ScriptedModel([BAD, WORSE]);
		const [result] = await generateCards(plan, index, model, { multiplier: 6 });
		// A model asked to fix things can make them worse.
		expect(result?.card.verification.ungrounded).toEqual(["invented"]);
	});

	it("stops early once nothing is left to correct", async () => {
		const { index } = await repo();
		const model = new ScriptedModel([GOOD]);
		await generateCards(plan, index, model, { multiplier: 10 });
		expect(model.requests).toHaveLength(1);
	});
});
