import { describe, expect, it } from "vitest";
import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";
import type { ModelClient, ModelRequest } from "@kaioken/modelport";
import { gatherEvidence, gatherModuleEvidence } from "../src/evidence.ts";
import { buildPrompt, proposeHeuristicModules, proposeModulePlan } from "../src/propose.ts";
import { expandDirectories, findModule, flatten, moduleScope, validatePlan } from "../src/validate.ts";
import { normalisePlan, safeFileName } from "../src/artifact.ts";
import type { ModulePlan } from "../src/types.ts";

/**
 * A scripted model double.
 *
 * The plan pipeline takes its client by injection precisely so it can be tested
 * without a transport, a credential or a network (Invariant 10). This records
 * the requests it receives so prompt content is assertable too.
 */
function scriptedClient(replies: string[]): ModelClient & { requests: ModelRequest[] } {
	const requests: ModelRequest[] = [];
	let index = 0;
	return {
		requests,
		async complete(request: ModelRequest): Promise<string> {
			requests.push(request);
			const reply = replies[Math.min(index, replies.length - 1)] ?? "{}";
			index++;
			return reply;
		},
	};
}

function scanOf(files: Array<{ path: string; language?: string; risk?: string[]; binary?: boolean }>): ScanResult {
	return {
		root: "/repo",
		scannedAt: "",
		fileCount: files.length,
		totalBytes: files.length * 100,
		files: files.map((f) => ({
			path: f.path,
			language: f.language ?? "typescript",
			bytes: 100,
			lineCount: 10,
			risk: f.risk ?? [],
			binary: f.binary ?? false,
			hash: `hash-${f.path}`,
		})),
	} as unknown as ScanResult;
}

function indexOf(
	files: Array<{ path: string; symbols?: Array<{ name: string; exported?: boolean; parent?: string }> }>,
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
			lineCount: 10,
			hash: `hash-${f.path}`,
			symbols: (f.symbols ?? []).map((s) => ({
				name: s.name,
				kind: "function",
				exported: s.exported ?? true,
				parent: s.parent,
				signature: `${s.name}(): void`,
				startLine: 1,
				endLine: 2,
			})),
			imports: [],
		})),
	} as unknown as IndexResult;
}

describe("plan: evidence gathering is deterministic", () => {
	it("groups files by directory with their real paths", () => {
		const scan = scanOf([
			{ path: "src/a.ts" },
			{ path: "src/b.ts" },
			{ path: "lib/c.ts" },
		]);
		const evidence = gatherEvidence(scan, null);

		expect(evidence.directories.map((d) => d.path)).toEqual(["lib", "src"]);
		expect(evidence.directories.find((d) => d.path === "src")?.files).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("excludes generated and lockfile noise so modules are not named after build output", () => {
		const scan = scanOf([
			{ path: "src/a.ts" },
			{ path: "dist/bundle.ts", risk: ["generated"] },
			{ path: "package-lock.json", risk: ["lockfile"] },
		]);
		const evidence = gatherEvidence(scan, null);
		const allFiles = evidence.directories.flatMap((d) => d.files);

		expect(allFiles).toContain("src/a.ts");
		expect(allFiles).not.toContain("dist/bundle.ts");
		expect(allFiles).not.toContain("package-lock.json");
	});

	it("excludes binaries", () => {
		const scan = scanOf([{ path: "src/a.ts" }, { path: "assets/logo.png", binary: true }]);
		expect(gatherEvidence(scan, null).directories.flatMap((d) => d.files)).not.toContain("assets/logo.png");
	});

	it("detects readmes and conventional entry points", () => {
		const scan = scanOf([{ path: "README.md" }, { path: "src/index.ts" }, { path: "src/other.ts" }]);
		const evidence = gatherEvidence(scan, null);
		expect(evidence.readmes).toContain("README.md");
		expect(evidence.entryFiles).toContain("src/index.ts");
		expect(evidence.entryFiles).not.toContain("src/other.ts");
	});

	it("collects exported symbol names per directory", () => {
		const scan = scanOf([{ path: "src/a.ts" }]);
		const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }, { name: "beta", exported: false }] }]);
		const evidence = gatherEvidence(scan, index);
		const src = evidence.directories.find((d) => d.path === "src");

		expect(src?.symbols).toContain("alpha");
		expect(src?.symbols).not.toContain("beta");
		expect(src?.symbolCount).toBe(2);
	});
});

describe("plan: module evidence", () => {
	it("lists declarations with an export marker", () => {
		const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }, { name: "hidden", exported: false }] }]);
		const evidence = gatherModuleEvidence(index, ["src/a.ts"]);

		expect(evidence.files[0]?.declarations.some((d) => d.startsWith("+ alpha"))).toBe(true);
		expect(evidence.files[0]?.declarations.some((d) => d.startsWith("- hidden"))).toBe(true);
	});

	it("qualifies method names with their parent", () => {
		const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "run", parent: "Engine" }] }]);
		const evidence = gatherModuleEvidence(index, ["src/a.ts"]);
		expect(evidence.files[0]?.declarations.some((d) => d.includes("Engine.run"))).toBe(true);
	});

	it("treats a known file with no declarations as in scope, not missing", () => {
		const index = indexOf([{ path: "src/a.ts" }]);
		const knownFiles = new Map([["README.md", "h"]]);
		const evidence = gatherModuleEvidence(index, ["README.md"], { knownFiles });

		expect(evidence.missing).toEqual([]);
		expect(evidence.files.map((f) => f.path)).toContain("README.md");
	});

	it("reports a path the scan never saw as missing", () => {
		const evidence = gatherModuleEvidence(indexOf([]), ["invented.ts"]);
		expect(evidence.missing).toContain("invented.ts");
	});

	it("respects the declaration cap", () => {
		const symbols = Array.from({ length: 30 }, (_, i) => ({ name: `s${i}` }));
		const index = indexOf([{ path: "src/a.ts", symbols }]);
		expect(gatherModuleEvidence(index, ["src/a.ts"], { maxDeclarationsPerFile: 5 }).files[0]?.declarations).toHaveLength(5);
	});
});

describe("plan: validation", () => {
	const scan = scanOf([{ path: "src/a.ts" }, { path: "src/b.ts" }]);

	function planOf(modules: ModulePlan["modules"]): ModulePlan {
		return { version: 1, generatedAt: "", multiplier: 1, modules };
	}

	it("accepts a plan that only names real files", () => {
		const result = validatePlan(planOf([{ id: "a", name: "A", purpose: "p", files: ["src/a.ts"] }]), scan);
		expect(result.ok).toBe(true);
		expect(result.coveredFiles).toBe(1);
	});

	it("rejects a plan naming a file that does not exist", () => {
		const result = validatePlan(planOf([{ id: "a", name: "A", purpose: "p", files: ["nope.ts"] }]), scan);
		expect(result.ok).toBe(false);
		const defect = result.defects.find((d) => d.kind === "unknown_file");
		expect(defect?.severity).toBe("error");
		expect(defect?.items).toContain("nope.ts");
	});

	it("rejects duplicate module ids", () => {
		const result = validatePlan(
			planOf([
				{ id: "dup", name: "A", purpose: "p", files: ["src/a.ts"] },
				{ id: "dup", name: "B", purpose: "p", files: ["src/b.ts"] },
			]),
			scan,
		);
		expect(result.ok).toBe(false);
		expect(result.defects.some((d) => d.kind === "duplicate_id")).toBe(true);
	});

	it("warns but does not block on an unclaimed file", () => {
		const result = validatePlan(planOf([{ id: "a", name: "A", purpose: "p", files: ["src/a.ts"] }]), scan);
		const orphan = result.defects.find((d) => d.kind === "orphaned_files");
		expect(orphan?.severity).toBe("warning");
		expect(result.ok).toBe(true);
		expect(result.orphans).toContain("src/b.ts");
	});

	it("warns on a leaf with no files", () => {
		const result = validatePlan(planOf([{ id: "empty", name: "E", purpose: "p", files: [] }]), scan);
		expect(result.defects.some((d) => d.kind === "empty_module")).toBe(true);
	});

	it("does not warn when a fileless parent has children", () => {
		const result = validatePlan(
			planOf([{ id: "parent", name: "P", purpose: "p", files: [], children: [{ id: "c", name: "C", purpose: "p", files: ["src/a.ts"] }] }]),
			scan,
		);
		expect(result.defects.some((d) => d.kind === "empty_module")).toBe(false);
	});

	it("warns when two modules claim the same file", () => {
		const result = validatePlan(
			planOf([
				{ id: "a", name: "A", purpose: "p", files: ["src/a.ts"] },
				{ id: "b", name: "B", purpose: "p", files: ["src/a.ts"] },
			]),
			scan,
		);
		expect(result.defects.some((d) => d.kind === "overlapping_files")).toBe(true);
	});

	it("warns on a module with no stated purpose", () => {
		const result = validatePlan(planOf([{ id: "a", name: "A", purpose: "", files: ["src/a.ts"] }]), scan);
		expect(result.defects.some((d) => d.kind === "missing_purpose")).toBe(true);
	});
});

describe("plan: directory expansion", () => {
	const scan = scanOf([{ path: "src/a.ts" }, { path: "src/deep/b.ts" }, { path: "other.ts" }]);

	it("expands a directory entry into the files beneath it", () => {
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "a", name: "A", purpose: "p", files: ["src"] }],
		};
		expect(expandDirectories(plan, scan).modules[0]?.files).toEqual(["src/a.ts", "src/deep/b.ts"]);
	});

	it("keeps an entry that matches nothing so the validator can name it", () => {
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "a", name: "A", purpose: "p", files: ["ghost/"] }],
		};
		expect(expandDirectories(plan, scan).modules[0]?.files).toEqual(["ghost/"]);
	});

	it("leaves an exact file path untouched", () => {
		const plan: ModulePlan = {
			version: 1,
			generatedAt: "",
			multiplier: 1,
			modules: [{ id: "a", name: "A", purpose: "p", files: ["other.ts"] }],
		};
		expect(expandDirectories(plan, scan).modules[0]?.files).toEqual(["other.ts"]);
	});
});

describe("plan: module traversal", () => {
	const plan: ModulePlan = {
		version: 1,
		generatedAt: "",
		multiplier: 1,
		modules: [
			{
				id: "parent",
				name: "P",
				purpose: "p",
				files: ["p.ts"],
				children: [{ id: "child", name: "C", purpose: "p", files: ["c.ts"] }],
			},
		],
	};

	it("flattens parents before children", () => {
		expect(flatten(plan.modules).map((m) => m.id)).toEqual(["parent", "child"]);
	});

	it("finds a module by id", () => {
		expect(findModule(plan, "child")?.name).toBe("C");
		expect(findModule(plan, "ghost")).toBeNull();
	});

	it("scopes a parent to its whole subtree", () => {
		expect(moduleScope(plan.modules[0] as never)).toEqual(["c.ts", "p.ts"]);
	});
});

describe("plan: proposal", () => {
	const scan = scanOf([{ path: "src/a.ts" }, { path: "src/b.ts" }]);
	const index = indexOf([{ path: "src/a.ts", symbols: [{ name: "alpha" }] }]);

	it("parses a well-formed reply and validates it", async () => {
		const client = scriptedClient([
			JSON.stringify({
				modules: [{ id: "core", name: "Core", purpose: "The core.", files: ["src/a.ts", "src/b.ts"] }],
			}),
		]);
		const result = await proposeModulePlan(scan, index, client, { multiplier: 3 });

		expect(result.plan.modules).toHaveLength(1);
		expect(result.validation.ok).toBe(true);
		expect(result.plan.multiplier).toBe(3);
	});

	it("normalises a messy id and path separators from the model", async () => {
		const client = scriptedClient([
			JSON.stringify({
				modules: [{ id: "  Core Module!  ", name: "Core", purpose: "p", files: [".\\src\\a.ts"] }],
			}),
		]);
		const result = await proposeModulePlan(scan, index, client);
		expect(result.plan.modules[0]?.id).toBe("core-module");
		expect(result.plan.modules[0]?.files).toEqual(["src/a.ts"]);
	});

	it("flags an invented file instead of silently accepting it", async () => {
		const client = scriptedClient([
			JSON.stringify({ modules: [{ id: "x", name: "X", purpose: "p", files: ["made-up.ts"] }] }),
		]);
		const result = await proposeModulePlan(scan, index, client);
		expect(result.validation.ok).toBe(false);
	});

	it("drops entries with no usable id rather than emitting a nameless module", async () => {
		const client = scriptedClient([JSON.stringify({ modules: [{ name: "No Id", files: ["src/a.ts"] }] })]);
		const result = await proposeModulePlan(scan, index, client);
		expect(result.plan.modules).toHaveLength(0);
	});

	it("keeps the raw reply for inspection", async () => {
		const client = scriptedClient([JSON.stringify({ modules: [] })]);
		const result = await proposeModulePlan(scan, index, client);
		expect(result.reply).toContain("modules");
	});

	it("sends the real file paths to the model", async () => {
		const client = scriptedClient([JSON.stringify({ modules: [] })]);
		await proposeModulePlan(scan, index, client);
		expect(client.requests[0]?.prompt).toContain("src/a.ts");
		expect(client.requests[0]?.prompt).toContain("src/b.ts");
	});

	it("states the target module count derived from the multiplier", () => {
		const evidence = gatherEvidence(scan, index);
		expect(buildPrompt(evidence, { multiplier: 1, targetModules: 7 } as never)).toContain("7 modules");
	});

	it("warns the model not to invent paths", async () => {
		const client = scriptedClient([JSON.stringify({ modules: [] })]);
		await proposeModulePlan(scan, index, client);
		expect(client.requests[0]?.prompt).toContain("Do not invent a path");
	});

	it("falls back to deterministic structural clustering when client is null", async () => {
		const result = await proposeModulePlan(scan, index, null);
		expect(result.source).toBe("heuristic");
		expect(result.plan.source).toBe("heuristic");
		expect(result.plan.modules.length).toBeGreaterThan(0);
		expect(result.validation.ok).toBe(true);
		expect(result.plan.modules[0]?.files).toEqual(["src/a.ts", "src/b.ts"]);
	});

	it("falls back to deterministic structural clustering when model completion throws", async () => {
		const failingClient: ModelClient = {
			async complete() {
				throw new Error("503 Service Unavailable");
			},
		};
		const result = await proposeModulePlan(scan, index, failingClient);
		expect(result.source).toBe("heuristic");
		expect(result.plan.source).toBe("heuristic");
		expect(result.plan.modules.length).toBeGreaterThan(0);
		expect(result.validation.ok).toBe(true);
	});

	it("clusters monorepo directory structures by package boundary", () => {
		const monorepoScan = scanOf([
			{ path: "packages/core/src/index.ts" },
			{ path: "packages/ui/src/button.ts" },
			{ path: "tools/build.ts" },
			{ path: "README.md" },
		]);
		const modules = proposeHeuristicModules(monorepoScan);
		const ids = modules.map((m) => m.id);
		expect(ids).toContain("packages-core");
		expect(ids).toContain("packages-ui");
		expect(ids).toContain("tools");
		expect(ids).toContain("root");
	});
});

describe("plan: artifact normalisation", () => {
	it("coerces a hand-edited document with missing fields", () => {
		const plan = normalisePlan({ modules: [{ id: "a", files: "src/a.ts" }] });
		expect(plan?.modules[0]?.id).toBe("a");
		expect(plan?.modules[0]?.files).toEqual([]);
		expect(plan?.multiplier).toBe(1);
	});

	it("normalises backslash paths from a Windows editor", () => {
		const plan = normalisePlan({ modules: [{ id: "a", files: ["src\\a.ts"] }] });
		expect(plan?.modules[0]?.files).toEqual(["src/a.ts"]);
	});

	it("returns null for a non-object document", () => {
		expect(normalisePlan("just a string")).toBeNull();
		expect(normalisePlan(null)).toBeNull();
	});

	it("drops modules with no id", () => {
		expect(normalisePlan({ modules: [{ files: ["a.ts"] }] })?.modules).toHaveLength(0);
	});

	it("uses the id as the name when no name is given", () => {
		expect(normalisePlan({ modules: [{ id: "alpha", files: [] }] })?.modules[0]?.name).toBe("alpha");
	});
});

describe("plan: card filenames", () => {
	it("keeps a safe id as-is", () => {
		expect(safeFileName("core-module")).toBe("core-module");
	});

	it("strips path separators so an id cannot escape the cards directory", () => {
		expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
		expect(safeFileName("a/b")).toBe("a-b");
	});

	it("falls back to a placeholder rather than an empty filename", () => {
		expect(safeFileName("...")).toBe("module");
	});
});

describe("plan: the checkpoint is written for a human", () => {
	it("writes unquoted keys and a readable module entry", async () => {
		const { mkdtemp, readFile, rm } = await import("node:fs/promises");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const { writeModulePlan, readModulePlan } = await import("../src/artifact.ts");

		const root = await mkdtemp(join(tmpdir(), "kaioken-plan-artifact-"));
		try {
			const path = await writeModulePlan(root, {
				version: 1,
				generatedAt: "2026-01-01",
				multiplier: 3,
				modules: [{ id: "x", name: "X", purpose: "Does a thing.", files: ["a.ts"] }],
			});
			const text = await readFile(path, "utf8");

			// A checkpoint a person cannot comfortably edit is not a checkpoint.
			expect(text).toContain("multiplier: 3");
			expect(text).not.toContain('"multiplier"');
			expect(text).toContain("- id: x");
			expect(text).toContain("# This is a checkpoint, not an output.");

			// And it round-trips through the reader.
			const back = await readModulePlan(root);
			expect(back?.multiplier).toBe(3);
			expect(back?.modules[0]?.files).toEqual(["a.ts"]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});
