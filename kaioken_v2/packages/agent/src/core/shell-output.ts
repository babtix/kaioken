import type { ToolResult } from "../types.js";
import { formatTruncatedTail, truncateTail, type TruncationResult } from "./truncate.js";

export interface ShellOutputOptions {
	maxLines?: number;
	maxChars?: number;
}

/**
 * Incrementally accumulates stdout/stderr stream data from child processes,
 * manages line/byte limits, formats exit codes, and provides snapshots
 * for streaming tool execution updates.
 */
export class ShellOutputAccumulator {
	private stdout = "";
	private stderr = "";
	private exitCode: number | null | undefined = undefined;
	private readonly maxLines?: number;
	private readonly maxChars?: number;

	constructor(options: ShellOutputOptions = {}) {
		this.maxLines = options.maxLines;
		this.maxChars = options.maxChars;
	}

	appendStdout(chunk: string): void {
		this.stdout += chunk;
	}

	appendStderr(chunk: string): void {
		this.stderr += chunk;
	}

	append(chunk: string, stream: "stdout" | "stderr" = "stdout"): void {
		if (stream === "stderr") {
			this.stderr += chunk;
		} else {
			this.stdout += chunk;
		}
	}

	setExitCode(code: number | null): void {
		this.exitCode = code;
	}

	getStdout(): string {
		return this.stdout;
	}

	getStderr(): string {
		return this.stderr;
	}

	getCombined(): string {
		return `${this.stdout}${this.stderr}`;
	}

	isEmpty(): boolean {
		return this.stdout.length === 0 && this.stderr.length === 0;
	}

	/**
	 * Create a current snapshot of accumulated text and truncation state.
	 */
	snapshot(): {
		text: string;
		display: string;
		truncation: TruncationResult;
		exitInfo: string;
	} {
		const combined = this.getCombined();
		const truncation = truncateTail(combined, {
			maxLines: this.maxLines,
			maxChars: this.maxChars,
		});
		const display = formatTruncatedTail(truncation);

		const exitInfo =
			this.exitCode === undefined
				? ""
				: this.exitCode === null
					? "process was killed (timeout or signal)"
					: this.exitCode === 0
						? ""
						: `exit code ${this.exitCode}`;

		const header = exitInfo ? `${exitInfo}\n` : "";
		const text = display.trim() ? `${header}${display}` : header ? header.trimEnd() : "(no output)";

		return { text, display, truncation, exitInfo };
	}

	/**
	 * Convert accumulated output into a final or partial ToolResult.
	 */
	toToolResult(command?: string): ToolResult {
		const { text, truncation } = this.snapshot();
		const isError =
			this.exitCode !== undefined && this.exitCode !== 0 ? true : undefined;

		return {
			text,
			details: {
				...(command ? { command } : {}),
				exitCode: this.exitCode,
				truncated: truncation.truncated,
				totalLines: truncation.totalLines,
			},
			isError,
		};
	}
}
