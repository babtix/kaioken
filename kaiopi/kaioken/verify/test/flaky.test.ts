import { describe, expect, it } from "vitest";
import {
	type CommandRunner,
	FlakyTestDetector,
	type RunOutcome,
} from "../src/index.ts";

class MockRunner implements CommandRunner {
	private readonly responses: Record<string, RunOutcome[]>;
	private callCounts: Record<string, number> = {};

	constructor(responses: Record<string, RunOutcome[]>) {
		this.responses = responses;
	}

	async run(command: string): Promise<RunOutcome> {
		const count = this.callCounts[command] || 0;
		this.callCounts[command] = count + 1;
		const list = this.responses[command] || [];
		return list[count % list.length] || { exitCode: 0, stdout: "", stderr: "", durationMs: 5 };
	}
}

describe("FlakyTestDetector", () => {
	it("classifies consistently passing suite as deterministic_pass", async () => {
		const runner = new MockRunner({
			"npm test": [
				{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 10 },
				{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 12 },
				{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 9 },
			],
		});
		const detector = new FlakyTestDetector(runner);
		const report = await detector.analyzeCommand("npm test", {
			cwd: "/mock",
			rerunCount: 3,
		});

		expect(report.classification).toBe("deterministic_pass");
		expect(report.passedRuns).toBe(3);
		expect(report.failedRuns).toBe(0);
		expect(report.flakinessScore).toBe(0);
		expect(report.quarantineHint).toBeUndefined();
	});

	it("classifies consistently failing suite as deterministic_fail", async () => {
		const runner = new MockRunner({
			"pytest tests/": [
				{ exitCode: 1, stdout: "", stderr: "AssertionError", durationMs: 15 },
				{ exitCode: 1, stdout: "", stderr: "AssertionError", durationMs: 14 },
				{ exitCode: 1, stdout: "", stderr: "AssertionError", durationMs: 15 },
			],
		});
		const detector = new FlakyTestDetector(runner);
		const report = await detector.analyzeCommand("pytest tests/", {
			cwd: "/mock",
			rerunCount: 3,
		});

		expect(report.classification).toBe("deterministic_fail");
		expect(report.passedRuns).toBe(0);
		expect(report.failedRuns).toBe(3);
		expect(report.flakinessScore).toBe(0);
		expect(report.quarantineHint).toBeUndefined();
	});

	it("identifies intermittent failures as flaky and provides quarantine hint", async () => {
		const runner = new MockRunner({
			"vitest run test/race.test.ts": [
				{ exitCode: 0, stdout: "pass", stderr: "", durationMs: 10 },
				{ exitCode: 1, stdout: "", stderr: "Timeout waiting for lock", durationMs: 30000 },
				{ exitCode: 0, stdout: "pass", stderr: "", durationMs: 10 },
			],
		});
		const detector = new FlakyTestDetector(runner);
		const report = await detector.analyzeCommand("vitest run test/race.test.ts", {
			cwd: "/mock",
			testTarget: "test/race.test.ts",
			rerunCount: 3,
		});

		expect(report.classification).toBe("flaky");
		expect(report.passedRuns).toBe(2);
		expect(report.failedRuns).toBe(1);
		expect(report.flakinessScore).toBeGreaterThan(0);
		expect(report.quarantineHint).toBeDefined();
		expect(report.quarantineHint?.recommendedAction).toBe("fix_timeout");
		expect(report.quarantineHint?.suggestedConfigSnippet).toContain("test/race.test.ts");
	});

	it("analyzes multiple commands and summarizes flakes", async () => {
		const runner = new MockRunner({
			"cmd1": [
				{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 10 },
			],
			"cmd2": [
				{ exitCode: 0, stdout: "ok", stderr: "", durationMs: 10 },
				{ exitCode: 1, stdout: "fail", stderr: "", durationMs: 10 },
			],
		});
		const detector = new FlakyTestDetector(runner);
		const multi = await detector.analyzeMultiple(["cmd1", "cmd2"], {
			cwd: "/mock",
			rerunCount: 2,
		});

		expect(multi.scannedCommands).toBe(2);
		expect(multi.hasFlakes).toBe(true);
		expect(multi.flakyCommands).toHaveLength(1);
		expect(multi.flakyCommands[0]?.command).toBe("cmd2");
	});
});
