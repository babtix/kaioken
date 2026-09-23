import { tail } from "./streaming.ts";
import type {
	CommandRunner,
	FlakyAnalysisReport,
	FlakyClassification,
	FlakyRunAttempt,
	FlakyTestResult,
	QuarantineHint,
} from "./types.ts";

export interface FlakyDetectionOptions {
	cwd: string;
	rerunCount?: number;
	timeoutMs?: number;
	testTarget?: string;
	signal?: AbortSignal;
}

export class FlakyTestDetector {
	private readonly runner: CommandRunner;

	constructor(runner: CommandRunner) {
		this.runner = runner;
	}

	async analyzeCommand(
		command: string,
		options: FlakyDetectionOptions,
	): Promise<FlakyTestResult> {
		const rerunCount = Math.max(2, options.rerunCount ?? 3);
		const timeoutMs = options.timeoutMs ?? 60_000;
		const attempts: FlakyRunAttempt[] = [];
		const durations: number[] = [];

		let passedRuns = 0;
		let failedRuns = 0;

		for (let i = 0; i < rerunCount; i++) {
			if (options.signal?.aborted) break;

			const start = Date.now();
			let outcome;
			try {
				outcome = await this.runner.run(command, {
					cwd: options.cwd,
					timeoutMs,
					signal: options.signal,
				});
			} catch (err: unknown) {
				outcome = {
					exitCode: -1,
					stdout: "",
					stderr: err instanceof Error ? err.message : String(err),
					durationMs: Date.now() - start,
				};
			}

			const passed = outcome.exitCode === 0 && outcome.timedOut !== true;
			if (passed) passedRuns++;
			else failedRuns++;

			durations.push(outcome.durationMs);

			const combinedOutput = `${outcome.stdout}\n${outcome.stderr}`.trim();
			attempts.push({
				runIndex: i + 1,
				exitCode: outcome.exitCode,
				passed,
				durationMs: outcome.durationMs,
				errorSnippet: passed ? undefined : tail(combinedOutput, 5, 500),
			});
		}

		// Calculate classification
		let classification: FlakyClassification;
		let flakinessScore = 0.0;

		if (passedRuns === attempts.length) {
			classification = "deterministic_pass";
			flakinessScore = 0.0;
		} else if (failedRuns === attempts.length) {
			classification = "deterministic_fail";
			flakinessScore = 0.0;
		} else {
			classification = "flaky";
			// Flakiness is highest when outcomes are evenly split (e.g. 50% pass / 50% fail)
			const minorityCount = Math.min(passedRuns, failedRuns);
			flakinessScore = Number(((minorityCount * 2) / attempts.length).toFixed(2));
		}

		// Calculate duration variance
		const avgDuration =
			durations.length > 0
				? durations.reduce((a, b) => a + b, 0) / durations.length
				: 0;
		const variance =
			durations.length > 1
				? durations.reduce((acc, d) => acc + Math.pow(d - avgDuration, 2), 0) /
					durations.length
				: 0;

		let quarantineHint: QuarantineHint | undefined;
		if (classification === "flaky") {
			const isTimingRelated = variance > 5000 || attempts.some((a) => a.durationMs > 25000);
			quarantineHint = {
				command,
				testTarget: options.testTarget,
				reason: isTimingRelated
					? `High timing variance (${Math.round(variance)}ms²) observed across ${attempts.length} runs (${failedRuns} failed, ${passedRuns} passed). Likely async race or resource starvation.`
					: `Non-deterministic exit codes observed across ${attempts.length} consecutive runs (${failedRuns} failed, ${passedRuns} passed).`,
				recommendedAction: isTimingRelated ? "fix_timeout" : "quarantine",
				suggestedConfigSnippet: JSON.stringify(
					{
						ignoreFlaky: [options.testTarget || command],
					},
					null,
					2,
				),
			};
		}

		return {
			command,
			testTarget: options.testTarget,
			classification,
			totalRuns: attempts.length,
			passedRuns,
			failedRuns,
			flakinessScore,
			durationVarianceMs: Math.round(variance),
			attempts,
			quarantineHint,
		};
	}

	async analyzeMultiple(
		commands: string[],
		options: FlakyDetectionOptions,
	): Promise<FlakyAnalysisReport> {
		const results: FlakyTestResult[] = [];
		for (const cmd of commands) {
			const res = await this.analyzeCommand(cmd, options);
			if (res.classification === "flaky") {
				results.push(res);
			}
		}

		const hasFlakes = results.length > 0;
		const summary = hasFlakes
			? `Detected ${results.length} flaky test suite(s) with intermittent failures.`
			: `All ${commands.length} test suite(s) exhibited deterministic behavior.`;

		return {
			scannedCommands: commands.length,
			flakyCommands: results,
			hasFlakes,
			summary,
		};
	}
}
