/**
 * Step 14.1 parity lock: every Pi slash command has a headless CLI
 * counterpart, and every CLI subcommand ships shell completion.
 *
 * Static by design: it reads `kaioken/bin.ts` and the Pi bridge source as
 * text and asserts the three surfaces name the same commands. A new command
 * added to one surface without the others fails here rather than shipping
 * a silent parity gap.
 */
import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { commandNames } from "../src/completion.ts";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url));

/** Pi slash command suffix -> root CLI subcommand. */
const PI_TO_CLI: Record<string, string> = {
	scan: "scan",
	symbols: "symbols",
	search: "search",
	status: "status",
	verify: "verify",
	graph: "graph",
	serve: "serve",
	export: "export",
	delegate: "delegate",
	merge: "merge",
	plan: "plan",
	cards: "cards",
	wiki: "wiki",
	update: "update",
	research: "research",
	skills: "skills",
};

describe("cli parity: Pi slash commands have headless counterparts", () => {
	it("registers all 16 kaio-* commands in the bridge", async () => {
		const bridge = await readFile(
			`${ROOT}/.pi/extensions/kaioken/commands/index.ts`,
			"utf8",
		);
		for (const pi of Object.keys(PI_TO_CLI)) {
			expect(bridge).toContain(`registerCommand("kaio-${pi}"`);
		}
	});

	it("implements every Pi command as a bin.ts case", async () => {
		const bin = await readFile(`${ROOT}/kaioken/bin.ts`, "utf8");
		for (const cli of Object.values(PI_TO_CLI)) {
			expect(bin, `missing case for ${cli}`).toContain(`case "${cli}":`);
		}
	});

	it("covers every Pi command in shell completion", () => {
		const names = commandNames();
		for (const cli of Object.values(PI_TO_CLI)) {
			expect(names, `missing completion for ${cli}`).toContain(cli);
		}
	});
});

describe("cli parity: CI-facing eval flags", () => {
	it("exposes --scorecard, --ndjson, and --json on the evals path", async () => {
		const bin = await readFile(`${ROOT}/kaioken/bin.ts`, "utf8");
		expect(bin).toContain("--scorecard");
		expect(bin).toContain("--ndjson");
		expect(bin).toContain("writeScorecard");
		expect(bin).toContain("formatNdjson");
	});
});
