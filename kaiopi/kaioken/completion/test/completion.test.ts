import { describe, expect, it } from "vitest";
import {
	allFlags,
	commandNames,
	generateBashCompletion,
	generateCompletion,
	generateFishCompletion,
	generateZshCompletion,
	KAIKEN_COMMANDS,
} from "../src/completion.ts";

describe("completion: command coverage", () => {
	it("lists the 16 Pi-parity commands plus headless extras", () => {
		const names = commandNames();
		for (const required of [
			"scan",
			"symbols",
			"search",
			"status",
			"verify",
			"graph",
			"serve",
			"export",
			"delegate",
			"merge",
			"plan",
			"cards",
			"wiki",
			"update",
			"research",
			"skills",
		]) {
			expect(names).toContain(required);
		}
	});

	it("exposes evals, impact, spend, and skillgen headless commands", () => {
		const names = commandNames();
		expect(names).toContain("evals");
		expect(names).toContain("impact");
		expect(names).toContain("spend");
		expect(names).toContain("skillgen");
	});

	it("gives every command a description", () => {
		for (const cmd of KAIKEN_COMMANDS) expect(cmd.description.length).toBeGreaterThan(0);
	});
});

describe("completion: generated scripts", () => {
	it("bash script completes every command and key flags", () => {
		const script = generateBashCompletion();
		for (const name of commandNames()) expect(script).toContain(name);
		for (const flag of ["--json", "--root", "--limit", "--format", "--action"]) {
			expect(script).toContain(flag);
		}
		expect(script).toContain("complete -F _kaioken kaioken");
	});

	it("zsh script names every command with descriptions", () => {
		const script = generateZshCompletion();
		for (const name of commandNames()) expect(script).toContain(name);
		expect(script).toContain("#compdef kaioken");
	});

	it("fish script names every command", () => {
		const script = generateFishCompletion();
		for (const name of commandNames()) expect(script).toContain(name);
		expect(script).toContain("complete -c kaioken");
	});

	it("all-flags set includes globals and per-command flags", () => {
		expect(allFlags()).toContain("--json");
		expect(allFlags()).toContain("--scorecard");
	});
});

describe("completion: fail-soft boundaries", () => {
	it("rejects unknown shells with the valid choices", () => {
		expect(() => generateCompletion("powershell")).toThrow(/bash, zsh, fish/);
	});

	it("is case-insensitive on shell names", () => {
		expect(generateCompletion("Bash")).toContain("complete");
		expect(generateCompletion("ZSH")).toContain("#compdef");
		expect(generateCompletion("Fish")).toContain("complete -c kaioken");
	});

	it("renders without a TTY (no terminal probing)", () => {
		expect(generateCompletion("bash").length).toBeGreaterThan(0);
	});
});
