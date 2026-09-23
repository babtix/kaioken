import { exec } from "node:child_process";
import type { ShellPort } from "@kaioken/agent";

/**
 * Detect the appropriate shell to use for running commands.
 * On Windows, detects whether PowerShell or cmd.exe should be preferred.
 */
export function detectShell(): string {
	if (process.platform !== "win32") {
		return process.env.SHELL || "/bin/sh";
	}

	// 1. Explicit SHELL setting if pointing to PowerShell / pwsh
	if (process.env.SHELL && /powershell|pwsh/i.test(process.env.SHELL)) {
		return process.env.SHELL;
	}

	// 2. PowerShell detection: if PSModulePath or PWSH exists, use PowerShell
	if (process.env.PSModulePath || process.env.PWSH) {
		const systemRoot = process.env.SystemRoot || "C:\\Windows";
		const defaultPs = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
		return defaultPs;
	}

	// 3. Fallback to ComSpec (typically cmd.exe) or cmd.exe
	return process.env.ComSpec || "cmd.exe";
}

/**
 * Concrete ShellPort backed by node:child_process.
 *
 * Implements the ShellPort contract from `@kaioken/agent`. Handles:
 * - Proper shell selection on Windows (PowerShell vs cmd.exe)
 * - AbortSignal forwarding to terminate child processes
 * - timeoutMs enforcement
 * - Safe stdout / stderr capturing with exit code reporting
 */
export function createNodeShellPort(customShell?: string): ShellPort {
	const shell = customShell ?? detectShell();

	return {
		exec(
			command: string,
			options: {
				cwd: string;
				signal?: AbortSignal;
				timeoutMs?: number;
				env?: Record<string, string>;
				onChunk?: (chunk: string) => void;
			},
		): Promise<{ exitCode: number | null; stdout: string; stderr: string }> {
			return new Promise((resolve) => {
				// If signal is already aborted before starting
				if (options.signal?.aborted) {
					resolve({
						exitCode: null,
						stdout: "",
						stderr: "operation was aborted before execution",
					});
					return;
				}

				const child = exec(
					command,
					{
						cwd: options.cwd,
						timeout: options.timeoutMs,
						maxBuffer: 32 * 1024 * 1024,
						windowsHide: true,
						shell,
						signal: options.signal,
						env: options.env ? { ...process.env, ...options.env } : undefined,
					},
					(error, stdout, stderr) => {
						const killed = Boolean(
							(error as NodeJS.ErrnoException & { killed?: boolean })?.killed ||
								options.signal?.aborted,
						);

						let exitCode: number | null = 0;
						if (killed) {
							exitCode = null;
						} else if (error) {
							exitCode = typeof error.code === "number" ? error.code : 1;
						}

						resolve({
							exitCode,
							stdout: String(stdout ?? ""),
							stderr: String(stderr ?? ""),
						});
					},
				);

				if (options.onChunk) {
					child.stdout?.on("data", (data) => options.onChunk?.(String(data)));
					child.stderr?.on("data", (data) => options.onChunk?.(String(data)));
				}

				// Extra safeguard: ensure child is killed if signal fires
				if (options.signal) {
					const onAbort = () => {
						try {
							child.kill();
						} catch {
							// Process may have already exited
						}
					};
					options.signal.addEventListener("abort", onAbort, { once: true });
				}
			});
		},
	};
}
