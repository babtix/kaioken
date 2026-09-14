import { ShellOutputAccumulator } from "../../core/shell-output.js";
import type { CodingTool, ShellPort, ToolResult, ToolRunOptions } from "../../types.js";

const MAX_TIMEOUT_SECONDS = 600;

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		command: { type: "string", description: "Shell command to execute." },
		timeout: {
			type: "number",
			description: `Timeout in seconds. Max ${MAX_TIMEOUT_SECONDS}.`,
		},
	},
	required: ["command"],
} as const;

export function createBashTool(cwd: string, shell: ShellPort): CodingTool {
	return {
		name: "bash",
		label: "bash",
		description:
			"Execute a shell command in this repository. Output is capped; " +
			"run focused commands rather than dumping entire files. " +
			"Use this for builds, tests, git operations and any task that " +
			"needs a process.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const command = typeof args["command"] === "string" ? args["command"].trim() : "";
			if (!command) {
				return { text: "give a `command`.", isError: true };
			}

			const rawTimeout =
				typeof args["timeout"] === "number" ? args["timeout"] : undefined;
			const timeoutMs =
				rawTimeout !== undefined
					? Math.min(Math.max(rawTimeout, 0.1), MAX_TIMEOUT_SECONDS) * 1000
					: undefined;

			const accumulator = new ShellOutputAccumulator();

			const onChunk = (chunk: string) => {
				accumulator.append(chunk);
				if (options?.onUpdate) {
					options.onUpdate(accumulator.toToolResult(command));
				}
			};

			let outcome: { exitCode: number | null; stdout: string; stderr: string };
			try {
				outcome = await shell.exec(command, {
					cwd,
					signal: options?.signal,
					timeoutMs,
					onChunk,
				});
			} catch (error) {
				return {
					text: `failed to execute: ${error instanceof Error ? error.message : String(error)}`,
					isError: true,
				};
			}

			// If shell port returned stdout/stderr in final outcome and didn't stream via onChunk
			if (accumulator.isEmpty()) {
				if (outcome.stdout) accumulator.appendStdout(outcome.stdout);
				if (outcome.stderr) accumulator.appendStderr(outcome.stderr);
			}

			accumulator.setExitCode(outcome.exitCode);
			return accumulator.toToolResult(command);
		},
	};
}
