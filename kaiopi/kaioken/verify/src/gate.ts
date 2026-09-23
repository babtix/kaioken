import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
	detectCommands,
	detectPackageManager,
	VERIFY_CONFIG,
} from "./detect.ts";
import {
	extractFailures,
	extractStructuredFailures,
	formatFailureSummary,
} from "./extractor.ts";
import { REPAIR_PROTOCOL } from "./repair.ts";
import {
	DEFAULT_TIMEOUT_MS,
	stripAnsi,
	tail,
} from "./streaming.ts";
import type {
	CommandRunner,
	GateCommand,
	GateReport,
	GateResult,
	GateVerdict,
	PackageManager,
	RunOutcome,
	TestFailure,
} from "./types.ts";

const runExec = promisify(execFile);

export {
	detectCommands,
	detectPackageManager,
	extractFailures,
	formatFailureSummary,
	REPAIR_PROTOCOL,
	stripAnsi,
	tail,
	VERIFY_CONFIG,
};

export type {
	CommandRunner,
	GateCommand,
	GateReport,
	GateResult,
	GateVerdict,
	PackageManager,
	RunOutcome,
	TestFailure,
};

export class SystemCommandRunner implements CommandRunner {
	async run(
		command: string,
		options: { cwd: string; timeoutMs: number; signal?: AbortSignal; env?: Record<string, string> },
	): Promise<RunOutcome> {
		const isWin = process.platform === "win32";
		const start = Date.now();
		const shell = isWin ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
		const args = isWin ? ["/d", "/s", "/c", command] : ["-c", command];
		try {
			const { stdout, stderr } = await runExec(shell, args, {
				cwd: options.cwd,
				timeout: options.timeoutMs,
				signal: options.signal,
				env: { ...process.env, ...options.env },
				maxBuffer: 1e7,
			});
			return {
				exitCode: 0,
				stdout: stdout ?? "",
				stderr: stderr ?? "",
				durationMs: Date.now() - start,
			};
		} catch (error: unknown) {
			const err = error as {
				code?: number | string;
				stdout?: string;
				stderr?: string;
				killed?: boolean;
				message?: string;
			};
			const timedOut = Boolean(err.killed);
			const exitCode = typeof err.code === "number" ? err.code : 1;
			return {
				exitCode,
				stdout: err.stdout ?? "",
				stderr: err.stderr ?? err.message ?? (error instanceof Error ? error.message : String(error)),
				durationMs: Date.now() - start,
				timedOut,
			};
		}
	}
}

export async function runGate(
	commands: readonly GateCommand[],
	runner: CommandRunner,
	options: { cwd: string; timeoutMs?: number; signal?: AbortSignal },
): Promise<GateReport> {
	if (commands.length === 0) {
		return {
			verdict: "unverifiable",
			results: [],
			failed: [],
			reason:
				"no build or test command could be discovered — " +
				`declare them in ${VERIFY_CONFIG} to make the gate meaningful`,
		};
	}

	const results: GateResult[] = [];
	for (const command of commands) {
		if (options.signal?.aborted) {
			results.push({
				...command,
				ok: false,
				exitCode: -1,
				durationMs: 0,
				timedOut: false,
				output: "aborted by signal",
			});
			break;
		}

		let outcome: RunOutcome;
		try {
			outcome = await runner.run(command.command, {
				cwd: options.cwd,
				timeoutMs: command.timeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
				signal: options.signal,
				env: command.env,
			});
		} catch (error) {
			outcome = {
				exitCode: -1,
				stdout: "",
				stderr: error instanceof Error ? error.message : String(error),
				durationMs: 0,
			};
		}

		const isOk = outcome.exitCode === 0 && outcome.timedOut !== true && !options.signal?.aborted;
		const rawOutput = `${outcome.stdout}${outcome.stderr}`;
		const structured = isOk ? [] : extractStructuredFailures(rawOutput);

		results.push({
			...command,
			ok: isOk,
			exitCode: outcome.exitCode,
			durationMs: outcome.durationMs,
			timedOut: outcome.timedOut === true,
			output: isOk ? tail(rawOutput) : formatFailureSummary(rawOutput),
			failures: structured.length > 0 ? structured : undefined,
		});

		if (options.signal?.aborted) break;
	}

	const failed = results.filter((result) => !result.ok);
	return { verdict: failed.length === 0 ? "passed" : "failed", results, failed };
}

export async function runVerify(
	root: string,
	timeoutMs = DEFAULT_TIMEOUT_MS,
	runner: CommandRunner = new SystemCommandRunner(),
): Promise<{ pass: boolean; summary: string }> {
	const { commands } = await detectCommands(root);
	if (commands.length === 0) {
		return { pass: false, summary: "unverifiable: no native suite detected" };
	}

	const report = await runGate(commands, runner, {
		cwd: root,
		timeoutMs,
	});

	if (report.verdict === "passed") {
		const combined = report.results
			.map((r) => r.output)
			.filter(Boolean)
			.join("\n");
		return {
			pass: true,
			summary: tail(combined.slice(-2000)) || "all checks passed",
		};
	}

	const failedOutputs = report.failed
		.map((f) => f.output)
		.filter(Boolean)
		.join("\n");
	const combinedFailed = failedOutputs || report.reason || "verification failed";
	return {
		pass: false,
		summary: formatFailureSummary(combinedFailed),
	};
}
