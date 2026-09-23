import { join } from "node:path";
import { formatTruncatedHead, truncateHead } from "../../core/truncate.js";
import type { CodingTool, FileSystemPort, ToolResult, ToolRunOptions } from "../../types.js";
import { resolveInside, posix } from "../path.js";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		path: {
			type: "string",
			description: "Directory to list, relative to workspace. Default: workspace root.",
		},
	},
} as const;

function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function createLsTool(cwd: string, fs: FileSystemPort): CodingTool {
	return {
		name: "ls",
		label: "ls",
		description:
			"List the contents of a directory with file sizes. " +
			"Directories are shown with a trailing slash. " +
			"Paths are relative to the workspace.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const path = typeof args["path"] === "string" ? args["path"].trim() : ".";

			const resolved = resolveInside(cwd, path);
			if (!resolved) {
				return { text: `refused: ${path} is outside the workspace.`, isError: true };
			}

			let entries;
			try {
				entries = await fs.readdir(resolved);
			} catch {
				return { text: `cannot list ${posix(path)} — no such directory.`, isError: true };
			}

			if (entries.length === 0) {
				return {
					text: `${posix(path)}: empty directory`,
					details: { path: posix(path), entries: 0 },
				};
			}

			// Sort: directories first, then alphabetical.
			entries.sort((a, b) => {
				if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
				return a.name.localeCompare(b.name);
			});

			const lines = entries.map((entry) => {
				if (entry.isDirectory) return `${entry.name}/`;
				return `${entry.name}  ${formatSize(entry.size)}`;
			});

			const body = lines.join("\n");
			const result = truncateHead(body);
			const header = `${posix(path)}  (${entries.length} entries)`;
			const display = formatTruncatedHead(result);

			return {
				text: `${header}\n${display}`,
				details: { path: posix(path), entries: entries.length, truncated: result.truncated },
			};
		},
	};
}
