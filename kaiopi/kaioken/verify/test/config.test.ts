import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	loadVerifyConfig,
	validateVerifyConfig,
	writeVerifyConfig,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
});

describe("VerifyConfigLoader (validateVerifyConfig)", () => {
	it("validates a compliant .kaioken/verify.json structure", () => {
		const result = validateVerifyConfig({
			version: 1,
			commands: [
				{
					label: "typecheck",
					command: "tsc --noEmit",
					runtime: "node",
					timeoutMs: 60000,
				},
				{
					label: "unit-tests",
					command: "vitest run",
					runtime: "node",
					env: { CI: "true" },
				},
			],
			ignoreFlaky: ["test/intermittent.test.ts"],
			maxFlakyReruns: 3,
			timeoutMs: 300000,
		});

		expect(result.valid).toBe(true);
		expect(result.errors).toEqual([]);
		expect(result.config?.commands).toHaveLength(2);
	});

	it("flags schema violations and missing required fields", () => {
		const empty = validateVerifyConfig({});
		expect(empty.valid).toBe(false);
		expect(empty.errors).toContain("Missing required field 'commands' (must be an array)");

		const badCommand = validateVerifyConfig({
			commands: [{ label: "", command: "" }],
		});
		expect(badCommand.valid).toBe(false);
		expect(badCommand.errors).toContain(
			"commands[0].command is required and must be a non-empty string",
		);
		expect(badCommand.errors).toContain(
			"commands[0].label is required and must be a non-empty string",
		);

		const badRuntime = validateVerifyConfig({
			commands: [{ label: "test", command: "test.sh", runtime: "ruby" }],
		});
		expect(badRuntime.valid).toBe(false);
		expect(badRuntime.errors[0]).toContain("commands[0].runtime must be one of: node, python, go, rust, deno, make");

		const badFlaky = validateVerifyConfig({
			commands: [{ label: "test", command: "vitest" }],
			ignoreFlaky: [123],
		});
		expect(badFlaky.valid).toBe(false);
		expect(badFlaky.errors).toContain("Field 'ignoreFlaky' must be an array of strings");
	});
});

describe("loadVerifyConfig & writeVerifyConfig", () => {
	it("writes and reads back .kaioken/verify.json in a repository root", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-config-"));
		roots.push(root);

		const sampleConfig = {
			version: 1,
			commands: [
				{
					label: "test",
					command: "pnpm test",
					runtime: "node" as const,
				},
			],
			ignoreFlaky: ["flaky.test.ts"],
		};

		const writtenPath = await writeVerifyConfig(root, sampleConfig);
		expect(writtenPath).toContain(".kaioken");

		const loaded = await loadVerifyConfig(root);
		expect(loaded).toEqual(sampleConfig);
	});

	it("returns null if .kaioken/verify.json is missing or corrupted", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-empty-config-"));
		roots.push(root);

		expect(await loadVerifyConfig(root)).toBeNull();
	});
});
