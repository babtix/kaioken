import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex } from "@kaioken/index";
import { scan } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	predictImpact,
	renderImpact,
	buildDependencyGraph,
	findTransitiveDependents,
	computeBlastRadius,
	renderBlastGauge,
	runPreCommitGate,
	renderGate,
	simulateRename,
	renderRenameSimulation,
	exportMermaid,
} from "../src/index.ts";

/**
 * The claim this package makes is that nothing in its report is invented. Most
 * of these tests are that claim, asked from different directions.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-impact-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

async function artifacts(root: string) {
	const scanResult = await scan(root);
	const { index } = await buildIndex(scanResult, {});
	return { scan: scanResult, index };
}

const SAMPLE = {
	"src/config.ts": "export function loadConfig(): string {\n\treturn \"ok\";\n}\n",
	"src/app.ts": "import { loadConfig } from './config.ts';\n\nexport function start() {\n\treturn loadConfig();\n}\n",
	"src/unrelated.ts": "export function unrelated(): number {\n\treturn 1;\n}\n",
};

describe("impact prediction", () => {
	it("finds the declaration and everything that mentions it", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });

		expect(report.symbols.map((s) => s.path)).toEqual(["src/config.ts"]);
		expect(report.dependents.map((d) => d.path)).toEqual(["src/app.ts"]);
		// A file that never names it is not in the blast radius, and padding the
		// list with it would make the whole report untrustworthy.
		expect(report.dependents.map((d) => d.path)).not.toContain("src/unrelated.ts");
	});

	it("says plainly when nothing else refers to a symbol", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "change unrelated", scan: scanResult, index });
		expect(report.symbols).toHaveLength(1);
		expect(report.dependents).toEqual([]);
		expect(renderImpact(report).join("\n")).toContain("nothing outside the declaring files");
	});

	it("reports a name the repository does not declare rather than inventing one", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "rename parseSettings",
			scan: scanResult,
			index,
		});
		expect(report.symbols).toEqual([]);
		expect(report.unknown).toContain("parseSettings");
		expect(renderImpact(report).join("\n")).toContain("nothing in this repository matches");
	});

	it("does not report ordinary words in the description as missing symbols", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "rename the config loader and update every caller",
			scan: scanResult,
			index,
		});
		// Every word of the sentence is a candidate. Listing "rename", "config"
		// and "caller" as things the repository does not declare buries the one
		// name that would have mattered.
		expect(report.unknown).toEqual([]);
	});

	it("still reports a missing name that was written as an identifier", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename parseSettings", scan: scanResult, index });
		// "the repository has no parseSettings" is often the most useful line
		// in the answer, and this is how it stays in it.
		expect(report.unknown).toContain("parseSettings");
	});

	it("discards a model's guesses that do not exist, and keeps the ones that do", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "the settings reader",
			scan: scanResult,
			index,
			client: {
				async complete() {
					return JSON.stringify({ symbols: ["loadConfig", "readSettings"], files: ["src/nope.ts"] });
				},
			},
		});

		expect(report.symbols.map((s) => s.name)).toEqual(["loadConfig"]);
		// A name the model proposed is a claim even when it reads like prose,
		// so it is reported whatever its shape.
		expect(report.unknown).toContain("readSettings");
		expect(report.unknown).toContain("src/nope.ts");
	});

	it("still answers when the model fails", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		// The deterministic half is the grounded half; losing the model must not
		// cost the answer.
		const report = await predictImpact({
			root,
			description: "rename loadConfig",
			scan: scanResult,
			index,
			client: {
				async complete() {
					throw new Error("no network");
				},
			},
		});
		expect(report.symbols.map((s) => s.name)).toEqual(["loadConfig"]);
	});

	it("names the skills whose steps point at an affected file", async () => {
		const root = await repo({
			...SAMPLE,
			".kaioken/skills/wire-config.md": [
				"---",
				"name: wire-config",
				"description: How to add a config option here.",
				"---",
				"",
				"1. Edit `src/config.ts`.",
				"",
			].join("\n"),
		});
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });
		// Nothing else in the system would notice that a checklist had gone
		// wrong: a skill is prose, and prose has no provenance record.
		expect(report.skills.map((s) => s.name)).toEqual(["wire-config"]);
	});

	it("filters generic names that only appear in comments or strings", async () => {
		const root = await repo({
			"src/config.ts": "export const config = { retry: 1 };\n",
			"src/real.ts":
				"import { config } from './config.ts';\n\nexport const retries = config.retry;\n",
			"src/noise.ts": "// config goes here\nconst label = \"config value\";\n",
		});
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename config", scan: scanResult, index });
		expect(report.symbols.map((s) => s.name)).toEqual(["config"]);
		expect(report.dependents.map((d) => d.path)).toEqual(["src/real.ts"]);
	});

	it("ranks import and call-site matches ahead of comment-only mentions", async () => {
		const root = await repo({
			"src/config.ts": "export function loadConfig(): string {\n\treturn \"ok\";\n}\n",
			"src/strong.ts":
				"import { loadConfig } from './config.ts';\n\nexport function start() {\n\treturn loadConfig();\n}\n",
			"src/weak.ts": "// loadConfig was considered here\n// nothing to do\n",
		});
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });
		expect(report.dependents.map((d) => d.path)[0]).toBe("src/strong.ts");
		expect(report.dependents.map((d) => d.path)).toContain("src/weak.ts");
	});

	it("sweeps many files through the bounded reader without dropping hits", async () => {
		const files: Record<string, string> = {
			"src/config.ts": "export function loadConfig(): string {\n\treturn \"ok\";\n}\n",
		};
		for (let i = 0; i < 60; i++) {
			files[`src/caller${i}.ts`] =
				`import { loadConfig } from './config.ts';\n\nexport function run${i}() {\n\treturn loadConfig();\n}\n`;
		}
		const root = await repo(files);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({
			root,
			description: "rename loadConfig",
			scan: scanResult,
			index,
			limit: 100,
		});
		expect(report.dependents).toHaveLength(60);
	});

	it("populates score and cycles on predictImpact report", async () => {
		const root = await repo(SAMPLE);
		const { scan: scanResult, index } = await artifacts(root);

		const report = await predictImpact({ root, description: "rename loadConfig", scan: scanResult, index });
		expect(report.score).toBeDefined();
		expect(report.score?.score).toBeGreaterThan(0);
		expect(report.cycles).toBeDefined();
		expect(Array.isArray(report.cycles)).toBe(true);

		const rendered = renderImpact(report).join("\n");
		expect(rendered).toContain("Risk Gauge:");
	});
});

describe("transitive dependent tree & cycle guards (UX-0901–UX-0910)", () => {
	it("detects circular dependency cycle (A → B → A) and breaks loop", () => {
		const files = [
			{ path: "src/a.ts", content: "import { b } from './b.ts';" },
			{ path: "src/b.ts", content: "import { a } from './a.ts';" },
		];
		const knownPaths = new Set(["src/a.ts", "src/b.ts"]);
		const graph = buildDependencyGraph(files, knownPaths);

		const { transitiveDependents, cycles } = findTransitiveDependents(new Set(["src/a.ts"]), graph);
		expect(transitiveDependents.has("src/b.ts")).toBe(true);
		expect(cycles.length).toBeGreaterThan(0);
		expect(cycles[0]?.cyclePath).toContain("src/b.ts");
	});

	it("detects multi-hop cycle (A → B → C → A) without infinite recursion", () => {
		const files = [
			{ path: "src/a.ts", content: "import { b } from './b.ts';" },
			{ path: "src/b.ts", content: "import { c } from './c.ts';" },
			{ path: "src/c.ts", content: "import { a } from './a.ts';" },
		];
		const known = new Set(["src/a.ts", "src/b.ts", "src/c.ts"]);
		const graph = buildDependencyGraph(files, known);

		const { transitiveDependents, cycles } = findTransitiveDependents(new Set(["src/a.ts"]), graph);
		expect(transitiveDependents.has("src/b.ts")).toBe(true);
		expect(transitiveDependents.has("src/c.ts")).toBe(true);
		expect(cycles.length).toBeGreaterThan(0);
	});

	it("computes transitive dependents across multi-hop acyclic chain (A ← B ← C)", () => {
		const files = [
			{ path: "src/leaf.ts", content: "export const X = 1;" },
			{ path: "src/mid.ts", content: "import { X } from './leaf.ts';" },
			{ path: "src/top.ts", content: "import { mid } from './mid.ts';" },
		];
		const known = new Set(["src/leaf.ts", "src/mid.ts", "src/top.ts"]);
		const graph = buildDependencyGraph(files, known);

		const { transitiveDependents, cycles } = findTransitiveDependents(new Set(["src/leaf.ts"]), graph);
		expect(transitiveDependents.has("src/mid.ts")).toBe(true);
		expect(transitiveDependents.has("src/top.ts")).toBe(true);
		expect(cycles).toHaveLength(0);
	});
});

describe("blast radius risk score gauge (UX-0911–UX-0920)", () => {
	it("computes low score for unexported symbol with zero dependents", () => {
		const dummyReport = {
			description: "internal helper",
			symbols: [{ name: "_helper", path: "src/util.ts", kind: "function", exported: false }],
			seeds: ["src/util.ts"],
			dependents: [],
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const score = computeBlastRadius(dummyReport, []);
		expect(score.score).toBe(0);
		expect(score.label).toBe("low");
		expect(renderBlastGauge(score)).toContain("0/100 low");
	});

	it("computes elevated score for exported symbol with many dependents and cycles", () => {
		const dummyReport = {
			description: "rename CoreModel",
			symbols: [
				{ name: "CoreModel", path: "src/model.ts", kind: "interface", exported: true },
				{ name: "UserModel", path: "src/model.ts", kind: "interface", exported: true },
			],
			seeds: ["src/model.ts"],
			dependents: Array.from({ length: 15 }, (_, i) => ({
				path: `src/caller${i}.ts`,
				mentions: ["CoreModel"],
			})),
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const cycles = [{ path: "src/caller0.ts", cyclePath: ["src/model.ts", "src/caller0.ts"] }];
		const score = computeBlastRadius(dummyReport, cycles);

		expect(score.score).toBeGreaterThanOrEqual(40);
		expect(score.breakdown.publicApi).toBe(20);
		expect(score.breakdown.cycles).toBe(5);
		expect(renderBlastGauge(score)).toMatch(/\[[█░]+\] \d+\/100 (medium|high|critical)/);
	});
});

describe("pre-commit impact check gate (UX-0921–UX-0930)", () => {
	it("passes gate when blast radius is safe", () => {
		const report = {
			description: "safe private tweak",
			symbols: [{ name: "privateFn", path: "src/a.ts", kind: "function", exported: false }],
			seeds: ["src/a.ts"],
			dependents: [],
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const score = computeBlastRadius(report);
		const gate = runPreCommitGate(report, score);

		expect(gate.passed).toBe(true);
		expect(gate.blockers).toHaveLength(0);
		const rendered = renderGate(gate).join("\n");
		expect(rendered).toContain("✓ Impact gate: PASSED");
	});

	it("blocks gate when public API change exceeds critical threshold", () => {
		const report = {
			description: "break AuthProvider",
			symbols: [{ name: "AuthProvider", path: "src/auth.ts", kind: "class", exported: true }],
			seeds: ["src/auth.ts"],
			dependents: Array.from({ length: 30 }, (_, i) => ({
				path: `src/dep${i}.ts`,
				mentions: ["AuthProvider"],
			})),
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const score = computeBlastRadius(report);
		const gate = runPreCommitGate(report, score);

		expect(gate.passed).toBe(false);
		expect(gate.blockers.length).toBeGreaterThan(0);
		expect(gate.blockers[0]?.symbol).toBe("AuthProvider");
		const rendered = renderGate(gate).join("\n");
		expect(rendered).toContain("✗ Impact gate: BLOCKED");
	});
});

describe("safe-rename simulation (UX-0931–UX-0940)", () => {
	it("finds all callsites with exact 1-based line numbers and snippets", async () => {
		const root = await repo({
			"src/util.ts": "export function calculateTotal(a: number, b: number) {\n\treturn a + b;\n}\n",
			"src/order.ts": "import { calculateTotal } from './util.ts';\n\nconst total = calculateTotal(10, 20);\nconsole.log(calculateTotal(1, 2));\n",
		});
		const { scan: scanResult, index } = await artifacts(root);
		const report = await predictImpact({ root, description: "calculateTotal", scan: scanResult, index });

		const sim = await simulateRename(root, report, "calculateTotal", "computeTotal");
		expect(sim.from).toBe("calculateTotal");
		expect(sim.to).toBe("computeTotal");
		expect(sim.totalFiles).toBe(2);
		expect(sim.totalOccurrences).toBe(4);

		const orderEntry = sim.callsites.find((c) => c.path === "src/order.ts");
		expect(orderEntry).toBeDefined();
		expect(orderEntry?.lines).toEqual([1, 3, 4]);

		const rendered = renderRenameSimulation(sim).join("\n");
		expect(rendered).toContain('Rename Simulation: "calculateTotal" → "computeTotal"');
		expect(rendered).toContain("src/order.ts");
		expect(rendered).toContain("L1:");
	});
});

describe("mermaid impact graph diagram exporter (UX-0941–UX-0950)", () => {
	it("exports valid flowchart syntax with stylized seeds and dependents", () => {
		const report = {
			description: "rename apiService",
			symbols: [{ name: "apiService", path: "src/api.ts", kind: "const", exported: true }],
			seeds: ["src/api.ts"],
			dependents: [
				{ path: "src/users.ts", mentions: ["apiService"] },
				{ path: "src/billing.ts", mentions: ["apiService"] },
			],
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const score = computeBlastRadius(report);
		const mermaid = exportMermaid(report, score, { direction: "LR" });

		expect(mermaid).toContain("flowchart LR");
		expect(mermaid).toContain('subgraph Seeds["🌱 Change Seeds"]');
		expect(mermaid).toContain('subgraph Dependents["💥 Blast Radius Dependents"]');
		expect(mermaid).toContain("classDef seed");
		expect(mermaid).toContain("-->");
	});

	it("caps diagram nodes at maxNodes limit and notes truncation", () => {
		const report = {
			description: "massive impact",
			symbols: [{ name: "Core", path: "src/core.ts", kind: "const", exported: true }],
			seeds: ["src/core.ts"],
			dependents: Array.from({ length: 20 }, (_, i) => ({
				path: `src/mod${i}.ts`,
				mentions: ["Core"],
			})),
			modules: [],
			documents: [],
			skills: [],
			unknown: [],
			partial: false,
		};
		const mermaid = exportMermaid(report, undefined, { maxNodes: 5 });
		expect(mermaid).toContain("+15 additional dependent files omitted for brevity");
	});
});
