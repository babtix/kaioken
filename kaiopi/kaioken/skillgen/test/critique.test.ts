import { describe, expect, it } from "vitest";
import {
	critiqueSkill,
	formatCritiqueReport,
	summariseCritique,
	ungroundedPaths,
} from "../src/index.ts";

const KNOWN = new Map([
	["src/commands/add.ts", "h1"],
	["src/commands/run.ts", "h2"],
]);

const GROUNDED = [
	"# Add a command",
	"",
	"## Steps",
	"",
	"1. Edit `src/commands/add.ts` following the pattern in `src/commands/run.ts`.",
	"2. Run `npm test` to verify.",
	"",
	"## Verification",
	"",
	"Run `npm test`.",
	"",
].join("\n");

describe("skillgen: adversarial critique (UX-1721 - UX-1730)", () => {
	it("finds no defects in a grounded skill", () => {
		expect(critiqueSkill(GROUNDED, KNOWN)).toEqual([]);
		expect(ungroundedPaths(GROUNDED, KNOWN)).toEqual([]);
		const report = summariseCritique([]);
		expect(report.grounded).toBe(true);
		expect(report.score).toBe(100);
	});

	it("flags a path the repository lacks with step and line", () => {
		const body = "# T\n\n1. Edit `src/ghost/file.ts` to begin.\n\n## Verification\n\nRun `npm test`.\n";
		const defects = critiqueSkill(body, KNOWN);
		const pathDefect = defects.find((d) => d.kind === "ungrounded_path");
		expect(pathDefect?.claim).toBe("src/ghost/file.ts");
		expect(pathDefect?.step).toBe(0);
		expect(pathDefect?.line).toBeGreaterThan(0);
		expect(ungroundedPaths(body, KNOWN)).toEqual(["src/ghost/file.ts"]);
	});

	it("does not flag commands or URLs as missing paths", () => {
		const body = "# T\n\n1. Run `npm test` and see `https://example.com/a.md`.\n\n## Verification\n\nRun `npm test`.\n";
		expect(ungroundedPaths(body, KNOWN)).toEqual([]);
	});

	it("flags placeholder steps and a missing Verification section", () => {
		const body = "# T\n\n1. TODO\n\n2. Edit `src/commands/add.ts`.\n";
		const defects = critiqueSkill(body, KNOWN);
		expect(defects.some((d) => d.kind === "empty_step")).toBe(true);
		expect(defects.some((d) => d.kind === "missing_verification")).toBe(true);
		const report = summariseCritique(defects);
		expect(report.grounded).toBe(false);
		expect(report.score).toBeLessThan(100);
	});

	it("is fail-soft on empty bodies", () => {
		const defects = critiqueSkill("   ", KNOWN);
		expect(defects.length).toBeGreaterThan(0);
		expect(defects[0]?.kind).toBe("empty_step");
	});

	it("accepts a scan-shaped known-files input", () => {
		const scan = { files: [{ path: "src/commands/add.ts" }, { path: "src/commands/run.ts" }] } as unknown as {
			files: Array<{ path: string }>;
		};
		expect(ungroundedPaths(GROUNDED, scan)).toEqual([]);
	});

	it("formats a readable report for the repair prompt", () => {
		expect(formatCritiqueReport([])).toContain("No grounding defects");
		const body = "# T\n\n1. Edit `src/ghost/file.ts`.\n";
		const rendered = formatCritiqueReport(critiqueSkill(body, KNOWN));
		expect(rendered).toContain("ungrounded_path");
		expect(rendered).toContain("src/ghost/file.ts");
	});
});
