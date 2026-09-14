import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	detectCommands,
	detectMonorepo,
	detectPackageManager,
	runGate,
	type CommandRunner,
	type RunOutcome,
} from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-gate-pm-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

describe("package manager detection", () => {
	it("detects pnpm from pnpm-lock.yaml", async () => {
		const root = await repo({
			"pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
			"package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest run" } }),
		});

		expect(await detectPackageManager(root)).toBe("pnpm");
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["pnpm run build", "pnpm run test"]);
	});

	it("detects yarn from yarn.lock", async () => {
		const root = await repo({
			"yarn.lock": "# yarn lockfile v1\n",
			"package.json": JSON.stringify({ scripts: { test: "jest" } }),
		});

		expect(await detectPackageManager(root)).toBe("yarn");
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["yarn run test"]);
	});

	it("detects bun from bun.lockb", async () => {
		const root = await repo({
			"bun.lockb": "",
			"package.json": JSON.stringify({ scripts: { test: "bun test" } }),
		});

		expect(await detectPackageManager(root)).toBe("bun");
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["bun run test"]);
	});

	it("defaults to npm when no special lockfile is present", async () => {
		const root = await repo({
			"package.json": JSON.stringify({ scripts: { test: "vitest" } }),
		});

		expect(await detectPackageManager(root)).toBe("npm");
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["npm run test"]);
	});
});

describe("monorepo workspace detection", () => {
	it("detects pnpm workspace and appends -r to test", async () => {
		const root = await repo({
			"pnpm-lock.yaml": "",
			"pnpm-workspace.yaml": "packages:\n  - 'packages/*'\n",
			"package.json": JSON.stringify({ scripts: { build: "tsc", test: "vitest" } }),
		});

		expect(await detectMonorepo(root)).toBe(true);
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["pnpm run build", "pnpm run test -r"]);
	});

	it("detects package.json workspaces and appends --workspace to test", async () => {
		const root = await repo({
			"package.json": JSON.stringify({
				workspaces: ["packages/*"],
				scripts: { test: "vitest" },
			}),
		});

		expect(await detectMonorepo(root, { workspaces: ["packages/*"] })).toBe(true);
		const { commands } = await detectCommands(root);
		expect(commands.map((c) => c.command)).toEqual(["npm run test --workspace"]);
	});

	it("detects lerna.json as monorepo", async () => {
		const root = await repo({
			"lerna.json": JSON.stringify({ version: "1.0.0" }),
			"package.json": JSON.stringify({ scripts: { test: "vitest" } }),
		});

		expect(await detectMonorepo(root)).toBe(true);
	});
});

describe("runGate with AbortSignal", () => {
	it("passes AbortSignal to runner and stops on abort", async () => {
		const controller = new AbortController();
		const runner: CommandRunner = {
			async run(cmd, opts) {
				if (opts.signal?.aborted) {
					return { exitCode: -1, stdout: "", stderr: "aborted", durationMs: 0 };
				}
				controller.abort();
				return { exitCode: 0, stdout: "done", stderr: "", durationMs: 10 };
			},
		};

		const commands = [
			{ id: "1", label: "build", command: "npm run build", source: "test" },
			{ id: "2", label: "test", command: "npm run test", source: "test" },
		];

		const report = await runGate(commands, runner, {
			cwd: ".",
			signal: controller.signal,
		});

		expect(report.verdict).toBe("failed");
		// Second command was aborted
		expect(report.results.length).toBeGreaterThanOrEqual(1);
	});
});
