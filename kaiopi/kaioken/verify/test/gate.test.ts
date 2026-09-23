import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CommandRunner,
	detectCommands,
	detectPackageManager,
	extractFailures,
	formatFailureSummary,
	type RunOutcome,
	runGate,
	runVerify,
	stripAnsi,
	tail,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-gate-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

class ScriptedRunner implements CommandRunner {
	readonly ran: string[] = [];
	private readonly outcomes: Record<string, Partial<RunOutcome>>;

	constructor(outcomes: Record<string, Partial<RunOutcome>> = {}) {
		this.outcomes = outcomes;
	}

	async run(command: string): Promise<RunOutcome> {
		this.ran.push(command);
		const scripted = this.outcomes[command] ?? {};
		return {
			exitCode: scripted.exitCode ?? 0,
			stdout: scripted.stdout ?? "",
			stderr: scripted.stderr ?? "",
			durationMs: scripted.durationMs ?? 1,
			...(scripted.timedOut !== undefined ? { timedOut: scripted.timedOut } : {}),
		};
	}
}

describe("detectCommands", () => {
	it("reads the scripts a node repository already declares", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
		});

		const { commands } = await detectCommands(root);
		expect(commands.map((command) => command.command)).toEqual(["npm run build", "npm run test"]);
	});

	it("puts the cheaper check first", async () => {
		const root = await repo({
			"package.json": JSON.stringify({
				scripts: { test: "vitest run", typecheck: "tsc --noEmit", build: "tsc" },
			}),
		});

		const { commands } = await detectCommands(root);
		expect(commands.map((command) => command.label)).toEqual(["typecheck", "build", "test"]);
	});

	it("recognises go, rust and make projects", async () => {
		const go = await repo({ "go.mod": "module demo\n" });
		const rust = await repo({ "Cargo.toml": "[package]\nname = \"demo\"\n" });
		const make = await repo({ Makefile: "build:\n\tcc main.c\n\ntest:\n\t./a.out\n" });

		expect((await detectCommands(go)).commands.map((c) => c.command)).toEqual([
			"go build ./...",
			"go test ./...",
		]);
		expect((await detectCommands(rust)).commands.map((c) => c.command)).toEqual([
			"cargo build",
			"cargo test",
		]);
		expect((await detectCommands(make)).commands.map((c) => c.command)).toEqual([
			"make build",
			"make test",
		]);
	});

	it("does not run pytest in a javascript project that happens to have a pyproject", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
			"pyproject.toml": "[project]\nname = \"tooling\"\n",
		});

		const { commands } = await detectCommands(root);
		expect(commands.map((command) => command.command)).toEqual(["npm run test"]);
	});

	it("lets an explicit config replace every guess", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
			"go.mod": "module demo\n",
			".kaioken/verify.json": JSON.stringify({
				commands: [{ label: "check", command: "make ci" }],
			}),
		});

		const { commands, source } = await detectCommands(root);
		expect(commands.map((command) => command.command)).toEqual(["make ci"]);
		expect(source).toContain("verify.json");
	});

	it("finds nothing in a repository that declares nothing", async () => {
		const root = await repo({ "README.md": "# nothing to build\n" });
		expect((await detectCommands(root)).commands).toEqual([]);
	});
});

describe("runGate", () => {
	it("reports unverifiable, never passed, when there is nothing to run", async () => {
		const runner = new ScriptedRunner();
		const report = await runGate([], runner, { cwd: "." });

		expect(report.verdict).toBe("unverifiable");
		expect(report.reason).toContain("verify.json");
		expect(runner.ran).toEqual([]);
	});

	it("passes only when every command exits zero", async () => {
		const commands = [
			{ id: "a", label: "build", command: "npm run build", source: "test" },
			{ id: "b", label: "test", command: "npm test", source: "test" },
		];

		const report = await runGate(commands, new ScriptedRunner(), { cwd: "." });
		expect(report.verdict).toBe("passed");
		expect(report.failed).toEqual([]);
	});

	it("runs every command even after one fails", async () => {
		const commands = [
			{ id: "a", label: "build", command: "npm run build", source: "test" },
			{ id: "b", label: "test", command: "npm test", source: "test" },
		];
		const runner = new ScriptedRunner({
			"npm run build": { exitCode: 2, stderr: "TS2322: type error\n" },
		});

		const report = await runGate(commands, runner, { cwd: "." });
		expect(runner.ran).toEqual(["npm run build", "npm test"]);
		expect(report.verdict).toBe("failed");
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.output).toContain("TS2322");
	});

	it("treats a timeout as a failure and says which one it was", async () => {
		const commands = [{ id: "a", label: "test", command: "npm test", source: "test" }];
		const runner = new ScriptedRunner({ "npm test": { exitCode: 0, timedOut: true } });

		const report = await runGate(commands, runner, { cwd: "." });
		expect(report.verdict).toBe("failed");
		expect(report.results[0]?.timedOut).toBe(true);
	});

	it("turns a runner that throws into a failed command, not a broken gate", async () => {
		const commands = [{ id: "a", label: "test", command: "npm test", source: "test" }];
		const runner: CommandRunner = {
			async run() {
				throw new Error("spawn ENOENT");
			},
		};

		const report = await runGate(commands, runner, { cwd: "." });
		expect(report.verdict).toBe("failed");
		expect(report.failed[0]?.output).toContain("ENOENT");
	});
});

describe("detectPackageManager", () => {
	it("detects pnpm from lockfile or workspace file", async () => {
		const lock = await repo({ "pnpm-lock.yaml": "" });
		const ws = await repo({ "pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n" });
		expect(await detectPackageManager(lock)).toBe("pnpm");
		expect(await detectPackageManager(ws)).toBe("pnpm");
	});

	it("detects yarn from yarn.lock", async () => {
		const root = await repo({ "yarn.lock": "" });
		expect(await detectPackageManager(root)).toBe("yarn");
	});

	it("detects bun from both bun.lockb and bun.lock", async () => {
		const bin = await repo({ "bun.lockb": "" });
		const txt = await repo({ "bun.lock": "" });
		expect(await detectPackageManager(bin)).toBe("bun");
		expect(await detectPackageManager(txt)).toBe("bun");
	});

	it("detects deno from deno.json or deno.lock", async () => {
		const json = await repo({ "deno.json": "{}" });
		const lock = await repo({ "deno.lock": "{}" });
		expect(await detectPackageManager(json)).toBe("deno");
		expect(await detectPackageManager(lock)).toBe("deno");
	});

	it("defaults to npm when no special lockfile exists", async () => {
		const root = await repo({ "package.json": "{}" });
		expect(await detectPackageManager(root)).toBe("npm");
	});
});

describe("detectCommands modern runtimes & monorepo handling", () => {
	it("detects Deno when deno.json is present", async () => {
		const root = await repo({ "deno.json": '{\n  "tasks": { "test": "deno test" }\n}' });
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["deno test"]);
		expect(commands[0]?.id).toBe("deno:test");
	});

	it("falls back to workspace test command when root package.json has workspaces without test script", async () => {
		const root = await repo({
			"package.json": JSON.stringify({
				name: "root-mono",
				workspaces: ["packages/*"],
				scripts: { build: "tsc" },
			}),
		});
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual([
			"npm run build",
			"npm test --workspaces --if-present",
		]);
	});

	it("falls back to pnpm recursive test when pnpm-workspace.yaml exists without root test script", async () => {
		const root = await repo({
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
			"package.json": JSON.stringify({ name: "pnpm-mono" }),
		});
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["pnpm -r --if-present test"]);
	});

	it("honors root test script over workspace fallback when declared", async () => {
		const root = await repo({
			"package.json": JSON.stringify({
				workspaces: ["packages/*"],
				scripts: { test: "custom-test-runner" },
			}),
		});
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["npm run test"]);
	});

	it("uses pnpm test when pnpm-lock.yaml is present", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
			"pnpm-lock.yaml": "",
		});
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["pnpm test"]);
	});
});

describe("runVerify", () => {
	it("returns unverifiable when no test suite is detected", async () => {
		const emptyDir = await repo({ "README.md": "hello" });
		const result = await runVerify(emptyDir);
		expect(result.pass).toBe(false);
		expect(result.summary).toContain("unverifiable");
	});

	it("runs pnpm test when pnpm-lock.yaml is present", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest run" } }),
			"pnpm-lock.yaml": "",
		});
		const runner = new ScriptedRunner({
			"pnpm test": { exitCode: 0, stdout: "10 tests passed" },
		});
		const result = await runVerify(root, 10_000, runner);
		expect(runner.ran).toEqual(["pnpm test"]);
		expect(result.pass).toBe(true);
		expect(result.summary).toContain("10 tests passed");
	});

	it("runs commands declared in .kaioken/verify.json", async () => {
		const root = await repo({
			".kaioken/verify.json": JSON.stringify({
				commands: [
					{ label: "lint", command: "pnpm lint" },
					{ label: "test", command: "pnpm test:ci" },
				],
			}),
		});
		const runner = new ScriptedRunner({
			"pnpm lint": { exitCode: 0, stdout: "lint ok" },
			"pnpm test:ci": { exitCode: 0, stdout: "all tests green" },
		});
		const result = await runVerify(root, 10_000, runner);
		expect(runner.ran).toEqual(["pnpm lint", "pnpm test:ci"]);
		expect(result.pass).toBe(true);
		expect(result.summary).toContain("all tests green");
	});

	it("runs pytest when pyproject.toml is present", async () => {
		const root = await repo({
			"pyproject.toml": "[tool.pytest]\n",
		});
		const runner = new ScriptedRunner({
			pytest: { exitCode: 0, stdout: "3 passed in 0.12s" },
		});
		const result = await runVerify(root, 10_000, runner);
		expect(runner.ran).toEqual(["pytest"]);
		expect(result.pass).toBe(true);
	});

	it("reports structured failure when tests fail", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest" } }),
		});
		const runner = new ScriptedRunner({
			"npm run test": {
				exitCode: 1,
				stdout: "FAIL test/login.test.ts\n ❯ test/login.test.ts:10:5 > auth > rejects bad pass\n",
			},
		});
		const result = await runVerify(root, 10_000, runner);
		expect(result.pass).toBe(false);
		expect(result.summary).toContain("Failed tests (1):");
		expect(result.summary).toContain("test/login.test.ts: auth > rejects bad pass");
	});
});

describe("extractFailures & structured reporting", () => {
	it("extracts Vitest failures with arrow notation and FAIL file header", () => {
		const output = `
 FAIL  test/auth.test.ts
   ❯ test/auth.test.ts:25:7 > auth service > fails invalid token
   ✕ sends correct error code (12ms)
`;
		const failures = extractFailures(output);
		expect(failures.length).toBeGreaterThanOrEqual(1);
		expect(failures.some((f) => f.testName?.includes("fails invalid token"))).toBe(true);
	});

	it("extracts Jest bullet style failures", () => {
		const output = `
FAIL src/user.test.ts
  ● User module › creates new user successfully
    AssertionError: expected null to be defined
`;
		const failures = extractFailures(output);
		expect(failures).toEqual([
			{ file: "src/user.test.ts", testName: "User module › creates new user successfully" },
		]);
	});

	it("extracts Go test failures with location", () => {
		const output = `
=== RUN   TestLogin
--- FAIL: TestLogin (0.02s)
    login_test.go:45: user credentials mismatch
FAIL
`;
		const failures = extractFailures(output);
		expect(failures).toEqual([
			{
				file: "login_test.go:45",
				testName: "TestLogin",
				message: "user credentials mismatch",
			},
		]);
	});

	it("extracts Pytest failures", () => {
		const output = `
FAILED tests/test_db.py::test_connection - ConnectionRefusedError
FAILED tests/test_db.py::test_query - TimeoutError: 5s
`;
		const failures = extractFailures(output);
		expect(failures).toEqual([
			{
				file: "tests/test_db.py",
				testName: "test_connection",
				message: "ConnectionRefusedError",
			},
			{
				file: "tests/test_db.py",
				testName: "test_query",
				message: "TimeoutError: 5s",
			},
		]);
	});

	it("extracts Cargo test failures", () => {
		const output = `
running 2 tests
test parser::test_parse ... ok
test parser::test_invalid_token ... FAILED

failures:
    parser::test_invalid_token
`;
		const failures = extractFailures(output);
		expect(failures).toEqual([{ testName: "parser::test_invalid_token" }]);
	});

	it("strips ANSI escape codes before extracting failures", () => {
		const output = `\x1b[31mFAILED\x1b[39m tests/test_ui.py::\x1b[1mtest_render\x1b[22m - AssertionError`;
		expect(stripAnsi(output)).toBe("FAILED tests/test_ui.py::test_render - AssertionError");
		const failures = extractFailures(output);
		expect(failures).toEqual([
			{
				file: "tests/test_ui.py",
				testName: "test_render",
				message: "AssertionError",
			},
		]);
	});

	it("formatFailureSummary formats header and includes raw tail", () => {
		const output = "FAILED tests/test_app.py::test_boot - RuntimeError: failed to boot\nLine 2\nLine 3";
		const formatted = formatFailureSummary(output);
		expect(formatted).toContain("Failed tests (1):");
		expect(formatted).toContain("- tests/test_app.py: test_boot");
		expect(formatted).toContain("--- Output tail ---");
	});

	it("formatFailureSummary falls back to tail when no structured test patterns match", () => {
		const output = "error: could not compile `demo` (bin 'demo') due to 1 previous error";
		const formatted = formatFailureSummary(output);
		expect(formatted).toBe(output);
		expect(formatted).not.toContain("Failed tests");
	});
});

describe("tail", () => {
	it("keeps the end, which is where a build says why", () => {
		const text = Array.from({ length: 400 }, (_, i) => `line ${i}`).join("\n");
		const kept = tail(text);
		expect(kept).toContain("line 399");
		expect(kept).not.toContain("line 0\n");
	});

	it("is empty for empty output rather than whitespace", () => {
		expect(tail("\n\n   \n")).toBe("");
	});
});
