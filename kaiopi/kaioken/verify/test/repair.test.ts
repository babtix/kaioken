import { describe, expect, it } from "vitest";
import {
	buildRepairPrompt,
	MAX_REPAIR_ITERATIONS,
	REPAIR_PROTOCOL,
	RepairLoopManager,
	STRICT_REPAIR_RULES,
} from "../src/index.ts";

describe("Automated Repair Protocol", () => {
	it("contains the strict repair protocol string invariant", () => {
		expect(REPAIR_PROTOCOL).toContain("REPAIR LOOP: read failure verbatim → minimal fix → re-run kaio_verify.");
		expect(REPAIR_PROTOCOL).toContain("Max 5 iterations; then stop and present failing output to the human.");
		expect(REPAIR_PROTOCOL).toContain("Never weaken/delete tests to pass. Never mark done on FAIL.");
	});

	it("builds actionable repair prompts with structured diagnostics", () => {
		const payload = buildRepairPrompt({
			root: "/project/app",
			command: "npm test",
			exitCode: 1,
			rawTail: "FAIL test/auth.test.ts",
			iteration: 1,
			maxIterations: 5,
			failures: [
				{
					file: "test/auth.test.ts",
					line: 42,
					column: 5,
					testName: "validates token expiry",
					category: "assertion",
					message: "expected false to be true",
					diff: {
						expected: "true",
						actual: "false",
					},
					stack: [
						{
							file: "/project/app/src/auth.ts",
							line: 18,
							symbol: "validateToken",
							isUserCode: true,
							raw: "at validateToken (/project/app/src/auth.ts:18:3)",
						},
					],
				},
			],
		});

		expect(payload.canProceed).toBe(true);
		expect(payload.userPrompt).toContain("[Iteration 1 of 5]");
		expect(payload.userPrompt).toContain("test/auth.test.ts:42:5");
		expect(payload.userPrompt).toContain('Test: "validates token expiry"');
		expect(payload.userPrompt).toContain("Expected: true");
		expect(payload.userPrompt).toContain("Received: false");
		expect(payload.userPrompt).toContain("/project/app/src/auth.ts:18");
		expect(payload.systemPrompt).toContain("NEVER weaken, comment out, skip, or delete failing tests");
	});

	it("incorporates previous failed attempts into prompt to prevent repeating bad fixes", () => {
		const payload = buildRepairPrompt({
			root: "/project",
			command: "npm test",
			exitCode: 1,
			rawTail: "FAIL",
			iteration: 2,
			maxIterations: 5,
			failures: [],
			previousAttempts: [
				{
					iteration: 1,
					summary: "Modified token expiry check from > to >=",
					failingTests: ["test/auth.test.ts"],
				},
			],
		});

		expect(payload.userPrompt).toContain("Previous Unsuccessful Attempts");
		expect(payload.userPrompt).toContain("Attempt #1: Modified token expiry check from > to >=");
		expect(payload.userPrompt).toContain("DO NOT repeat the identical changes");
	});

	it("RepairLoopManager manages iteration lifecycle and halts at 5 iterations", () => {
		const manager = new RepairLoopManager(5);
		expect(manager.getIteration()).toBe(0);
		expect(manager.canContinue()).toBe(true);

		for (let i = 1; i <= 5; i++) {
			expect(manager.canContinue()).toBe(true);
			const current = manager.nextIteration();
			expect(current).toBe(i);
			manager.recordAttempt({
				timestamp: Date.now(),
				passed: false,
				failures: [],
				summary: `Fix attempt #${i}`,
			});
		}

		// Reached 5 iterations
		expect(manager.getIteration()).toBe(5);
		expect(manager.canContinue()).toBe(false);

		const escalation = manager.generateEscalationReport("npm test", [
			{ category: "assertion", file: "src/token.ts", line: 20, message: "Token expired" },
		]);

		expect(escalation).toContain("KAIOKEN VERIFICATION REPAIR ESCALATION");
		expect(escalation).toContain("FAILED after 5 iteration(s) (Maximum: 5)");
		expect(escalation).toContain("Protocol Invariant: Stopped to avoid looping. Human intervention required.");
		expect(escalation).toContain("src/token.ts:20: Token expired");
	});
});
