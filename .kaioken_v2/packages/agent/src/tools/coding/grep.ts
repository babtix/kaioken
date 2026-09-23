import { formatTruncatedTail, truncateLine, truncateTail } from "../../core/truncate.js";
import type { CodingTool, ShellPort, ToolResult, ToolRunOptions } from "../../types.js";
import { resolveInside, posix } from "../path.js";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		pattern: {
			type: "string",
			description: "Search pattern (regex). Passed to ripgrep.",
		},
		path: {
			type: "string",
			description:
				"Directory or file to search, relative to workspace. Default: workspace root.",
		},
		include: {
			type: "string",
			description: "Glob pattern for files to include (e.g. '*.ts').",
		},
	},
	required: ["pattern"],
} as const;

export function createGrepTool(cwd: string, shell: ShellPort): CodingTool {
	return {
		name: "grep",
		label: "grep",
		description:
			"Search for a pattern across files using ripgrep. Returns matching " +
			"lines with file paths and line numbers. Output is capped.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const pattern = typeof args["pattern"] === "string" ? args["pattern"].trim() : "";
			if (!pattern) return { text: "give a `pattern`.", isError: true };

			const searchPath = typeof args["path"] === "string" ? args["path"].trim() : ".";
			const include = typeof args["include"] === "string" ? args["include"].trim() : "";

			const resolved = resolveInside(cwd, searchPath);
			if (!resolved) {
				return { text: `refused: ${searchPath} is outside the workspace.`, isError: true };
			}

			// Build ripgrep command.
			const parts = [
				"rg",
				"--line-number",
				"--no-heading",
				"--color", "never",
				"--max-count", "200",
			];
			if (include) {
				parts.push("--glob", include);
			}
			parts.push("--", JSON.stringify(pattern).slice(1, -1));
			parts.push(posix(searchPath));

			let outcome: { exitCode: number | null; stdout: string; stderr: string };
			try {
				outcome = await shell.exec(parts.join(" "), {
					cwd,
					signal: options?.signal,
					timeoutMs: 30_000,
				});
			} catch (error) {
				return {
					text: `grep failed: ${error instanceof Error ? error.message : String(error)}`,
					isError: true,
				};
			}

			// rg exit code 1 = no matches, not an error.
			if (outcome.exitCode === 1 && !outcome.stdout.trim()) {
				return {
					text: `no matches for "${pattern}"${include ? ` in ${include} files` : ""}.`,
					details: { pattern, matches: 0 },
				};
			}

			if (outcome.exitCode !== 0 && outcome.exitCode !== 1) {
				return {
					text: `rg exited with code ${outcome.exitCode}:\n${outcome.stderr.trim() || outcome.stdout.trim()}`,
					isError: true,
				};
			}

			// Truncate individual lines, then the whole output.
			const lines = outcome.stdout.split("\n").filter(Boolean);
			const truncatedLines = lines.map((line) => truncateLine(line).text);
			const body = truncatedLines.join("\n");
			const result = truncateTail(body);
			const display = formatTruncatedTail(result);

			return {
				text: display || "(no output)",
				details: { pattern, matches: lines.length, truncated: result.truncated },
			};
		},
	};
}
