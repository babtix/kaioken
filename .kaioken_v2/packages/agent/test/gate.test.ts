import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	type CommandRunner,
	detectCommands,
	type RunOutcome,
	runGate,
	tail,
} from "../dist/index.js";

/**
 * The gate's claim is that it never reports a pass it did not observe. These
 * tests hold it to that from both directions: a repository it cannot verify
 * must not come back green, and a repository whose commands fail must come back
 * with the failure attached rather than summarised away.
 */

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

/** Records what it was asked to run and returns whatever it was scripted with. */
class ScriptedRunner implements CommandRunner {
	readonly ran: string[] = [];

	constructor(private readonly outcomes: Record<string, Partial<RunOutcome>> = {}) {}

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

		// Declaration order in package.json is irrelevant: a failing typecheck
		// explains a failing suite, so it is the one worth seeing first.
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

		// A repository that has said what to run must not also get a guess
		// appended to it.
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

		// Knowing whether the change broke one thing or everything is the whole
		// value of the second result.
		expect(runner.ran).toEqual(["npm run build", "npm test"]);
		expect(report.verdict).toBe("failed");
		expect(report.failed).toHaveLength(1);
		expect(report.failed[0]?.output).toContain("TS2322");
	});

	it("treats a timeout as a failure and says which one it was", async () => {
		const commands = [{ id: "a", label: "test", command: "npm test", source: "test" }];
		const runner = new ScriptedRunner({ "npm test": { exitCode: 0, timedOut: true } });

		const report = await runGate(commands, runner, { cwd: "." });

		// Exit code zero is not a pass if the process was killed for hanging.
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
