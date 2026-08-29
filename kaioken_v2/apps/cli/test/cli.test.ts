import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { main } from "../dist/main.js";

const NL = String.fromCharCode(10);

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

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-cli-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(join(abs, ".."), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

const SAMPLE = {
	"lib.ts": [
		"/** Adds two numbers. */",
		"export function add(a: number, b: number): number {",
		"\treturn a + b;",
		"}",
		"",
		"function hidden(): void {}",
		"",
	].join("\n"),
	"util.py": ['def helper():\n    """Do a thing."""\n    return 1\n'].join(""),
	".env": "API_TOKEN=Xk92mQpL7vNz4RtY8wBs\n",
};

describe("kaioken scan", () => {
	it("writes both artifacts and reports the inventory", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["scan", "--root", root])).toBe(0);

		const scanArtifact = JSON.parse(await readFile(join(root, ".kaioken/scan.json"), "utf8"));
		const indexArtifact = JSON.parse(await readFile(join(root, ".kaioken/index.json"), "utf8"));

		expect(scanArtifact.fileCount).toBe(3);
		expect(indexArtifact.symbolCount).toBe(3);
		expect(stdout).toContain("declarations across");
		expect(stdout).toContain("wrote");
	});

	it("surfaces the risk flags the traversal found", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root, "--json"]);
		const report = JSON.parse(stdout);
		expect(report.scan.risk.credentials).toBe(1);
	});

	it("reuses unchanged files on a second run", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		stdout = "";
		await main(["scan", "--root", root, "--json"]);
		const report = JSON.parse(stdout);
		expect(report.index.parsed).toBe(0);
		expect(report.index.reused).toBe(2);
	});
});

describe("kaioken symbols", () => {
	it("lists what a file declares", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		stdout = "";

		expect(await main(["symbols", "lib.ts", "--root", root])).toBe(0);
		expect(stdout).toContain("add");
		expect(stdout).toContain("hidden");
		expect(stdout).toContain("Adds two numbers.");
	});

	it("filters to exported declarations", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		stdout = "";

		await main(["symbols", "lib.ts", "--root", root, "--exported"]);
		expect(stdout).toContain("add");
		expect(stdout).not.toContain("hidden");
	});

	it("answers where a symbol is declared", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["symbols", "add", "--root", root])).toBe(0);
		expect(stdout).toContain("lib.ts:2");
	});

	it("answers definitively, and non-zero, when a symbol is not declared", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["symbols", "multiply", "--root", root])).toBe(2);
		expect(stdout).toContain("not declared");
	});

	it("distinguishes an unindexed path from an undeclared name", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["symbols", "src/missing.ts", "--root", root])).toBe(2);
		expect(stdout).toContain("not indexed");
	});

	it("emits a machine-readable verdict", async () => {
		const root = await repo(SAMPLE);
		await main(["symbols", "helper", "--root", root, "--json"]);
		const report = JSON.parse(stdout);
		expect(report.declared).toBe(true);
		expect(report.matches[0].path).toBe("util.py");
		expect(report.matches[0].doc).toBe("Do a thing.");
	});

	it("builds the artifacts on demand rather than requiring scan first", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["symbols", "add", "--root", root])).toBe(0);
		await readFile(join(root, ".kaioken/index.json"), "utf8");
	});
});

describe("kaioken search", () => {
	it("ranks declarations and says which rankings ran", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["search", "add", "--root", root])).toBe(0);
		expect(stdout).toContain("lib.ts");
		expect(stdout).toContain("lexical ranking only");
	});

	it("joins multi-word queries rather than taking only the first", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["search", "adds", "two", "numbers", "--root", root])).toBe(0);
		expect(stdout).toContain("add");
	});

	it("exits non-zero when nothing matches", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["search", "kubernetes", "--root", root])).toBe(2);
		expect(stdout).toContain("no results");
	});

	it("emits machine-readable hits", async () => {
		const root = await repo(SAMPLE);
		await main(["search", "helper", "--root", root, "--json"]);
		const report = JSON.parse(stdout);
		expect(report.semantic).toBe(false);
		expect(report.hits[0].path).toBe("util.py");
	});

	it("honours --limit and --kind", async () => {
		const root = await repo(SAMPLE);
		await main(["search", "a", "--root", root, "--limit", "1", "--json"]);
		expect(JSON.parse(stdout).hits.length).toBeLessThanOrEqual(1);

		stdout = "";
		await main(["search", "add", "--root", root, "--kind", "wiki", "--json"]);
		expect(JSON.parse(stdout).hits).toEqual([]);
	});

	it("rejects an unknown kind rather than silently ignoring it", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["search", "add", "--root", root, "--kind", "nope"])).toBe(1);
		expect(stderr).toContain("unknown kind");
	});

	it("requires a query", async () => {
		expect(await main(["search"])).toBe(1);
		expect(stderr).toContain("expected a query");
	});
});

/**
 * Phase 3's command surface. The paths that make model calls are covered at the
 * package level with a scripted double; what is asserted here is the wiring and
 * the refusals — which is where a user actually meets this stage.
 */
describe("kaioken plan", () => {
	const PLAN_YAML = [
		"modules:",
		"  - id: library",
		"    name: Library",
		"    purpose: The one module a human decided on.",
		"    files:",
		"      - lib.ts",
		"",
	].join("\n");

	async function withPlan(yaml: string): Promise<string> {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		stdout = "";
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(join(root, ".kaioken/module-plan.yaml"), yaml, "utf8");
		return root;
	}

	it("validates a hand-edited plan without calling a model", async () => {
		const root = await withPlan(PLAN_YAML);
		expect(await main(["plan", "--check", "--root", root])).toBe(0);
		expect(stdout).toContain("plan is valid");
	});

	it("reports an edit that names a file the repository does not contain", async () => {
		const root = await withPlan(PLAN_YAML.replace("lib.ts", "does-not-exist.ts"));
		expect(await main(["plan", "--check", "--root", root])).toBe(1);
		expect(stdout).toContain("does not contain");
	});

	it("refuses to overwrite a plan the user may have edited", async () => {
		const root = await withPlan(PLAN_YAML);
		expect(await main(["plan", "--root", root])).toBe(1);
		expect(stderr).toContain("never overwritten silently");
	});

	it("says so when there is no plan to check", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["plan", "--check", "--root", root])).toBe(1);
		expect(stderr).toContain("no module plan yet");
	});

	it("rejects a multiplier outside x1..x10", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["plan", "x99", "--root", root])).toBe(1);
		expect(stderr).toContain("x1..x10");
	});

	it("reports a model it cannot reach rather than failing obscurely", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["plan", "--root", root, "--model", "no-such-provider/no-model"])).toBe(1);
		expect(stderr).toContain("no configured provider");
	});
});

describe("kaioken cards", () => {
	it("requires a plan first", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["cards", "--root", root])).toBe(1);
		expect(stderr).toContain("run `kaioken plan` first");
	});

	it("refuses to spend tokens against a plan with errors", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		stdout = "";
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/module-plan.yaml"),
			["modules:", "  - id: broken", "    files:", "      - ghost.ts", ""].join("\n"),
			"utf8",
		);
		expect(await main(["cards", "--root", root])).toBe(1);
		expect(stderr).toContain("has errors");
	});
});

/**
 * Phase 5's staleness half calls no model. These run with fetch removed to prove
 * it, because "how stale is my documentation?" has to be answerable in a clone
 * with no credentials.
 */
describe("kaioken wiki", () => {
	it("refuses a chapter id the outline does not contain", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/wiki-plan.yaml"),
			["chapters:", "  - id: real", "    files:", "      - lib.ts", ""].join(NL),
			"utf8",
		);
		stdout = "";

		// Generating nothing and reporting "every claim checks out" would be a
		// true statement that misleads completely.
		expect(await main(["wiki", "--root", root, "--module", "nope"])).toBe(1);
		expect(stderr).toContain("no chapter with id");
	});

	it("validates a hand-edited outline without calling a model", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		await mkdir(join(root, ".kaioken"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/wiki-plan.yaml"),
			["chapters:", "  - id: real", "    files:", "      - ghost.ts", ""].join(NL),
			"utf8",
		);
		stdout = "";

		expect(await main(["wiki", "--check", "--root", root])).toBe(1);
		expect(stdout).toContain("no such file: ghost.ts");
	});
});

describe("kaioken status", () => {
	async function withCard(root: string, sources: { path: string; hash: string }[]) {
		await mkdir(join(root, ".kaioken/cards"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/cards/m.json"),
			JSON.stringify({
				moduleId: "m",
				name: "M",
				generatedAt: "2026-01-01T00:00:00.000Z",
				summary: "s",
				keyPoints: [],
				entryPoints: [],
				sources,
				verification: { grounded: 0, ungrounded: [], unknownFiles: [], uncovered: [] },
			}),
			"utf8",
		);
	}

	it("says so when nothing has been generated", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["status", "--root", root])).toBe(0);
		expect(stdout).toContain("nothing generated yet");
	});

	it("reports documentation that still matches the code", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		const scanned = JSON.parse(await readFile(join(root, ".kaioken/scan.json"), "utf8"));
		const lib = scanned.files.find((f: { path: string }) => f.path === "lib.ts");
		await withCard(root, [{ path: "lib.ts", hash: lib.hash }]);
		stdout = "";

		expect(await main(["status", "--root", root, "--check"])).toBe(0);
		expect(stdout).toContain("documentation matches the code");
	});

	it("fails the drift gate once a source has moved", async () => {
		const root = await repo(SAMPLE);
		await withCard(root, [{ path: "lib.ts", hash: "0".repeat(64) }]);
		stdout = "";

		// --check is the CI gate: non-zero means the docs no longer describe
		// the code.
		expect(await main(["status", "--root", root, "--check"])).toBe(1);
		expect(stdout).toContain("stale");
		expect(stdout).toContain("lib.ts");
	});

	it("reports without failing when --check is not given", async () => {
		const root = await repo(SAMPLE);
		await withCard(root, [{ path: "lib.ts", hash: "0".repeat(64) }]);
		stdout = "";
		expect(await main(["status", "--root", root])).toBe(0);
	});

	it("emits a machine-readable report", async () => {
		const root = await repo(SAMPLE);
		await withCard(root, [{ path: "lib.ts", hash: "0".repeat(64) }]);
		stdout = "";

		await main(["status", "--root", root, "--json"]);
		const report = JSON.parse(stdout);
		expect(report.ok).toBe(false);
		expect(report.stale[0].document).toBe("card:m");
		expect(report.changedFiles).toContain("lib.ts");
	});

	it("answers with no network and no credentials", async () => {
		const root = await repo(SAMPLE);
		await withCard(root, [{ path: "lib.ts", hash: "0".repeat(64) }]);
		stdout = "";

		const original = globalThis.fetch;
		const spy = vi.fn(() => {
			throw new Error("network access attempted while reporting staleness");
		});
		globalThis.fetch = spy as unknown as typeof fetch;
		try {
			expect(await main(["status", "--root", root, "--check"])).toBe(1);
			expect(spy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = original;
		}
	});
});

describe("kaioken update", () => {
	it("requires something to have been generated", async () => {
		const root = await repo(SAMPLE);
		expect(await main(["update", "--root", root])).toBe(1);
		expect(stderr).toContain("nothing generated yet");
	});

	it("does nothing when everything is current", async () => {
		const root = await repo(SAMPLE);
		await main(["scan", "--root", root]);
		const scanned = JSON.parse(await readFile(join(root, ".kaioken/scan.json"), "utf8"));
		const lib = scanned.files.find((f: { path: string }) => f.path === "lib.ts");

		await mkdir(join(root, ".kaioken/cards"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/cards/m.json"),
			JSON.stringify({
				moduleId: "m",
				name: "M",
				generatedAt: "",
				summary: "",
				keyPoints: [],
				entryPoints: [],
				sources: [{ path: "lib.ts", hash: lib.hash }],
				verification: { grounded: 0, ungrounded: [], unknownFiles: [], uncovered: [] },
			}),
			"utf8",
		);
		stdout = "";

		expect(await main(["update", "--root", root])).toBe(0);
		expect(stdout).toContain("nothing to regenerate");
	});

	it("names what it would regenerate without calling a model", async () => {
		const root = await repo(SAMPLE);
		await mkdir(join(root, ".kaioken/cards"), { recursive: true });
		await writeFile(
			join(root, ".kaioken/cards/m.json"),
			JSON.stringify({
				moduleId: "m",
				name: "M",
				generatedAt: "",
				summary: "",
				keyPoints: [],
				entryPoints: [],
				sources: [{ path: "lib.ts", hash: "0".repeat(64) }],
				verification: { grounded: 0, ungrounded: [], unknownFiles: [], uncovered: [] },
			}),
			"utf8",
		);
		stdout = "";

		// The deterministic half is complete before a token is spent, so this is
		// a real answer rather than a guess.
		expect(await main(["update", "--root", root, "--dry-run"])).toBe(0);
		expect(stdout).toContain("card:m");
		expect(stdout).toContain("no model was called");
	});
});

/**
 * Phase 6's deterministic half. The gate spends no tokens and needs no
 * credentials, which is the property that lets it be the thing an agent's claim
 * of success is checked against — and lets CI run it directly.
 */
describe("kaioken verify", () => {
	it("reports which commands it found without running them", async () => {
		const root = await repo({
			...SAMPLE,
			"package.json": JSON.stringify({ scripts: { build: "echo build", test: "echo test" } }),
		});

		expect(await main(["verify", "--dry-run", "--root", root])).toBe(0);

		expect(stdout).toContain("npm run build");
		expect(stdout).toContain("nothing was run");
	});

	it("exits 2, not 0, in a repository it cannot verify", async () => {
		const root = await repo(SAMPLE);

		// Silence is not a pass. A gate that green-lights a repository it could
		// not test is worse than no gate, because it gets trusted.
		expect(await main(["verify", "--root", root])).toBe(2);
		expect(stdout).toContain("no build or test command");
	});

	it("runs the commands a repository declares and passes on zero", async () => {
		const root = await repo({
			...SAMPLE,
			".kaioken/verify.json": JSON.stringify({
				commands: [{ label: "check", command: "node -e \"process.exit(0)\"" }],
			}),
		});

		expect(await main(["verify", "--root", root])).toBe(0);
		expect(stdout).toContain("verified");
	});

	it("fails with the exit code and the output when a command fails", async () => {
		const root = await repo({
			...SAMPLE,
			".kaioken/verify.json": JSON.stringify({
				commands: [
					{
						label: "check",
						command: "node -e \"console.error('boom'); process.exit(3)\"",
					},
				],
			}),
		});

		expect(await main(["verify", "--root", root])).toBe(1);
		expect(stdout).toContain("exit 3");
		expect(stdout).toContain("boom");
	});
});

describe("kaioken chat", () => {
	it("asks for a question when there is no terminal to hold a conversation in", async () => {
		const root = await repo(SAMPLE);

		expect(await main(["chat", "--root", root])).toBe(1);
		expect(stderr).toContain("expected a question");
	});

	it("refuses --write with nobody to approve the changes", async () => {
		const root = await repo(SAMPLE);

		// Granting write access because there was no way to prompt is exactly
		// the failure the approval step exists to prevent, so it fails closed —
		// and before a model is ever resolved.
		expect(await main(["chat", "explain this", "--write", "--root", root])).toBe(1);
		expect(stderr).toContain("--yes");
	});
});

describe("command surface", () => {
	it("reports usage for an unknown command", async () => {
		expect(await main(["nope"])).toBe(1);
		expect(stderr).toContain("unknown command");
	});

	it("requires a target for symbols", async () => {
		expect(await main(["symbols"])).toBe(1);
		expect(stderr).toContain("expected a file path or a symbol name");
	});
});

/**
 * The moat. Phases 1, 2 and 5 contain no model calls, and a stage that quietly
 * grew a network dependency would break the promise that this works in a fresh
 * clone with no credentials — so the whole surface runs here with fetch removed.
 */
describe("offline", () => {
	it("runs the full command surface with no network available", async () => {
		const root = await repo(SAMPLE);
		const originalFetch = globalThis.fetch;
		const fetchSpy = vi.fn(() => {
			throw new Error("network access attempted during phase 1");
		});
		globalThis.fetch = fetchSpy as unknown as typeof fetch;

		try {
			expect(await main(["scan", "--root", root])).toBe(0);
			expect(await main(["symbols", "lib.ts", "--root", root])).toBe(0);
			expect(await main(["symbols", "add", "--root", root])).toBe(0);
			expect(await main(["search", "add", "--root", root])).toBe(0);
			expect(await main(["verify", "--dry-run", "--root", root])).toBe(2);
			expect(await main(["chat", "--root", root])).toBe(1);
			expect(fetchSpy).not.toHaveBeenCalled();
		} finally {
			globalThis.fetch = originalFetch;
		}
	});

	it("needs no API key in the environment", async () => {
		const root = await repo(SAMPLE);
		const removed: Record<string, string | undefined> = {};
		for (const key of ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GOOGLE_API_KEY"]) {
			removed[key] = process.env[key];
			delete process.env[key];
		}
		try {
			expect(await main(["scan", "--root", root])).toBe(0);
		} finally {
			for (const [key, value] of Object.entries(removed)) {
				if (value !== undefined) process.env[key] = value;
			}
		}
	});
});
