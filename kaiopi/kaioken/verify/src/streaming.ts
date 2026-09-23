import { spawn } from "node:child_process";
import type {
	CommandRunner,
	RunOutcome,
	StreamChunk,
	StreamExecutionOptions,
	StreamListener,
	StreamRunResult,
} from "./types.ts";

export const DEFAULT_MAX_TAIL_LINES = 60;
export const DEFAULT_MAX_TAIL_CHARS = 8000;
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

/**
 * Bounded ring buffer for streaming line output to prevent unbounded memory growth.
 */
export class LineRingBuffer {
	private readonly capacity: number;
	private readonly maxChars: number;
	private lines: string[] = [];
	private totalCharCount = 0;

	constructor(capacity = DEFAULT_MAX_TAIL_LINES, maxChars = DEFAULT_MAX_TAIL_CHARS) {
		this.capacity = capacity;
		this.maxChars = maxChars;
	}

	push(line: string): void {
		this.lines.push(line);
		this.totalCharCount += line.length + 1;

		while (this.lines.length > this.capacity || this.totalCharCount > this.maxChars) {
			const removed = this.lines.shift();
			if (removed !== undefined) {
				this.totalCharCount -= removed.length + 1;
			}
		}
	}

	getLines(): string[] {
		return [...this.lines];
	}

	toString(): string {
		let text = this.lines.join("\n");
		if (text.length > this.maxChars) {
			text = text.slice(-this.maxChars);
		}
		return text;
	}

	clear(): void {
		this.lines = [];
		this.totalCharCount = 0;
	}
}

export function tail(
	text: string,
	maxLines = DEFAULT_MAX_TAIL_LINES,
	maxChars = DEFAULT_MAX_TAIL_CHARS,
): string {
	const trimmed = text.replace(/\r\n/g, "\n").trimEnd();
	if (!trimmed) return "";

	const lines = trimmed.split("\n");
	let out = lines.slice(-maxLines).join("\n");
	if (out.length > maxChars) {
		out = out.slice(-maxChars);
	}
	return out;
}

export class StreamingTestConsole implements CommandRunner {
	private listeners: StreamListener[] = [];

	addListener(listener: StreamListener): () => void {
		this.listeners.push(listener);
		return () => {
			this.listeners = this.listeners.filter((l) => l !== listener);
		};
	}

	private emitChunk(chunk: StreamChunk, extraListener?: StreamListener): void {
		for (const listener of this.listeners) {
			try {
				listener(chunk);
			} catch {
				// Prevent listener exceptions from breaking stream execution
			}
		}
		if (extraListener) {
			try {
				extraListener(chunk);
			} catch {
				// Ignore listener errors
			}
		}
	}

	/**
	 * Conforms to the standard CommandRunner interface while streaming live chunks.
	 */
	async run(
		command: string,
		options: {
			cwd: string;
			timeoutMs: number;
			signal?: AbortSignal;
			env?: Record<string, string>;
		},
	): Promise<RunOutcome> {
		const res = await this.execute(command, options);
		return {
			exitCode: res.exitCode,
			stdout: res.stdout,
			stderr: res.stderr,
			durationMs: res.durationMs,
			timedOut: res.timedOut,
		};
	}

	/**
	 * Rich streaming execution with line ring buffering and live notifications.
	 */
	async execute(
		command: string,
		options: StreamExecutionOptions,
	): Promise<StreamRunResult> {
		const isWin = process.platform === "win32";
		const start = Date.now();
		const shell = isWin ? (process.env.ComSpec || "cmd.exe") : "/bin/sh";
		const shellArgs = isWin ? ["/d", "/s", "/c", command] : ["-c", command];
		const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const ringBuffer = new LineRingBuffer(
			options.maxTailLines ?? DEFAULT_MAX_TAIL_LINES,
			options.maxTailChars ?? DEFAULT_MAX_TAIL_CHARS,
		);

		let stdoutFull = "";
		let stderrFull = "";
		let stdoutLineBuffer = "";
		let stderrLineBuffer = "";
		let chunksCount = 0;
		let lineCount = 0;
		let timedOut = false;
		let timer: NodeJS.Timeout | null = null;

		return new Promise<StreamRunResult>((resolve) => {
			let child: ReturnType<typeof spawn>;

			try {
				child = spawn(shell, shellArgs, {
					cwd: options.cwd,
					env: { ...process.env, ...options.env },
					stdio: ["ignore", "pipe", "pipe"],
					windowsHide: true,
				});
			} catch (err: unknown) {
				const errMsg = err instanceof Error ? err.message : String(err);
				return resolve({
					exitCode: -1,
					stdout: "",
					stderr: errMsg,
					durationMs: Date.now() - start,
					timedOut: false,
					chunksCount: 0,
					lineCount: 0,
				});
			}

			const processLine = (rawLine: string, type: "stdout" | "stderr") => {
				lineCount++;
				ringBuffer.push(rawLine);
				options.onLine?.(rawLine, type);
			};

			const handleStreamData = (data: Buffer | string, type: "stdout" | "stderr") => {
				const text = data.toString();
				chunksCount++;
				if (type === "stdout") stdoutFull += text;
				else stderrFull += text;

				this.emitChunk(
					{
						type,
						text,
						timestamp: Date.now(),
					},
					options.onChunk,
				);

				// Line accumulation
				const combined = (type === "stdout" ? stdoutLineBuffer : stderrLineBuffer) + text;
				const parts = combined.split(/\r?\n/);
				const remainder = parts.pop() ?? "";

				if (type === "stdout") stdoutLineBuffer = remainder;
				else stderrLineBuffer = remainder;

				for (const line of parts) {
					processLine(line, type);
				}
			};

			child.stdout?.on("data", (data) => handleStreamData(data, "stdout"));
			child.stderr?.on("data", (data) => handleStreamData(data, "stderr"));

			const killChild = () => {
				try {
					if (isWin) {
						spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
					} else {
						child.kill("SIGKILL");
					}
				} catch {
					// Process might already be dead
				}
			};

			if (timeoutMs > 0 && timeoutMs < Number.MAX_SAFE_INTEGER) {
				timer = setTimeout(() => {
					timedOut = true;
					this.emitChunk(
						{
							type: "status",
							text: `[TIMEOUT] Command exceeded ${timeoutMs}ms limit`,
							timestamp: Date.now(),
						},
						options.onChunk,
					);
					killChild();
				}, timeoutMs);
			}

			if (options.signal) {
				if (options.signal.aborted) {
					killChild();
				} else {
					options.signal.addEventListener("abort", () => {
						this.emitChunk(
							{
								type: "status",
								text: "[ABORTED] Execution aborted by signal",
								timestamp: Date.now(),
							},
							options.onChunk,
						);
						killChild();
					});
				}
			}

			const cleanup = () => {
				if (timer) clearTimeout(timer);
				// Flush any remaining partial lines
				if (stdoutLineBuffer) processLine(stdoutLineBuffer, "stdout");
				if (stderrLineBuffer) processLine(stderrLineBuffer, "stderr");
			};

			child.on("error", (error) => {
				cleanup();
				resolve({
					exitCode: -1,
					stdout: stdoutFull,
					stderr: stderrFull || error.message,
					durationMs: Date.now() - start,
					timedOut,
					chunksCount,
					lineCount,
				});
			});

			child.on("close", (code) => {
				cleanup();
				const exitCode = timedOut ? -1 : (code ?? 0);
				resolve({
					exitCode,
					stdout: stdoutFull,
					stderr: stderrFull,
					durationMs: Date.now() - start,
					timedOut,
					chunksCount,
					lineCount,
				});
			});
		});
	}
}
