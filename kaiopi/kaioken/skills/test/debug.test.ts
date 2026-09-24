import { describe, expect, it } from "vitest";
import {
	completeCurrentStep,
	createStepSession,
	currentStep,
	formatSessionProgress,
	formatStep,
	isComplete,
	parseProcedureSteps,
	resetSession,
	sessionForSkill,
	stepNext,
	stepPrev,
	stepTo,
} from "../src/index.ts";

const NUMBERED = [
	"# Release",
	"",
	"## Steps",
	"",
	"1. Bump the version in `package.json`.",
	"2. Run `npm test` to verify.",
	"3. Tag it with `git tag`.",
	"",
].join("\n");

describe("skills: parseProcedureSteps step-through debugger (UX-1731 - UX-1740)", () => {
	it("parses numbered steps under ## Steps with citations and commands", () => {
		const steps = parseProcedureSteps(NUMBERED);
		expect(steps).toHaveLength(3);
		expect(steps[0]?.title).toContain("Bump the version");
		expect(steps[0]?.citations).toEqual(["package.json"]);
		expect(steps[1]?.commands).toEqual(["npm test"]);
		expect(steps[0]?.line).toBeGreaterThan(0);
	});

	it("parses bullets and checkboxes when no Steps heading exists", () => {
		const body = ["- [ ] Take a backup first.", "- Run `npm test`.", "* Tag it."].join("\n");
		const steps = parseProcedureSteps(body);
		expect(steps).toHaveLength(3);
		expect(steps[0]?.title).toContain("backup");
	});

	it("returns no steps, without throwing, for empty or marker-less bodies", () => {
		expect(parseProcedureSteps("")).toEqual([]);
		expect(parseProcedureSteps("   \n  \n")).toEqual([]);
		expect(parseProcedureSteps("Just a paragraph with no list.")).toEqual([]);
		expect(parseProcedureSteps("## Steps\n\nNo list here.")).toEqual([]);
	});

	it("survives CRLF line endings", () => {
		const steps = parseProcedureSteps(NUMBERED.replace(/\n/g, "\r\n"));
		expect(steps).toHaveLength(3);
	});

	it("caps output so huge context files cannot blow up the session", () => {
		const many = Array.from({ length: 300 }, (_, i) => `${i + 1}. Do thing ${i}.`).join("\n");
		const steps = parseProcedureSteps(many);
		expect(steps.length).toBeLessThanOrEqual(100);
		expect(steps[0]?.index).toBe(0);
	});
});

describe("skills: step session navigation", () => {
	it("starts parked on the first step and walks forward and back", () => {
		const session = createStepSession("release", NUMBERED);
		expect(currentStep(session)?.index).toBe(0);
		expect(stepNext(session)?.index).toBe(1);
		expect(stepNext(session)?.index).toBe(2);
		expect(stepNext(session)).toBeNull();
		expect(currentStep(session)?.index).toBe(2);
		expect(stepPrev(session)?.index).toBe(1);
	});

	it("returns null stepping back from the first step", () => {
		const session = createStepSession("release", NUMBERED);
		expect(stepPrev(session)).toBeNull();
		expect(currentStep(session)?.index).toBe(0);
	});

	it("jumps to an explicit index and rejects out-of-range input", () => {
		const session = createStepSession("release", NUMBERED);
		expect(stepTo(session, 2)?.index).toBe(2);
		expect(stepTo(session, 99)).toBeNull();
		expect(currentStep(session)?.index).toBe(2);
		expect(stepTo(session, -1)).toBeNull();
	});

	it("tracks completion and resets cleanly", () => {
		const session = createStepSession("release", NUMBERED);
		expect(isComplete(session)).toBe(false);
		expect(completeCurrentStep(session)).toBe(true);
		stepNext(session);
		completeCurrentStep(session);
		stepNext(session);
		completeCurrentStep(session);
		expect(isComplete(session)).toBe(true);
		resetSession(session);
		expect(isComplete(session)).toBe(false);
		expect(currentStep(session)?.index).toBe(0);
	});

	it("an empty procedure is never complete and formats fail-soft", () => {
		const session = createStepSession("empty", "no steps here");
		expect(currentStep(session)).toBeNull();
		expect(stepNext(session)).toBeNull();
		expect(completeCurrentStep(session)).toBe(false);
		expect(isComplete(session)).toBe(false);
		expect(formatStep("empty", currentStep(session))).toContain("No steps");
		expect(formatSessionProgress(session)).toContain("no steps");
	});

	it("formats progress and steps for terminal display", () => {
		const session = createStepSession("release", NUMBERED);
		expect(formatSessionProgress(session)).toContain("release 1/3");
		const rendered = formatStep("release", currentStep(session));
		expect(rendered).toContain("step 1");
		expect(rendered).toContain("Bump the version");
	});

	it("starts a session directly from a loaded skill record", () => {
		const session = sessionForSkill({
			name: "migrate",
			description: "Run a migration.",
			content: NUMBERED,
			path: ".kaioken/skills/migrate.md",
		});
		expect(session.skillName).toBe("migrate");
		expect(session.steps).toHaveLength(3);
	});
});
