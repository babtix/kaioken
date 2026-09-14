import { join } from "node:path";
import { formatTruncatedHead, truncateHead } from "../../core/truncate.js";
import type { CodingTool, FileSystemPort, ToolResult, ToolRunOptions } from "../../types.js";
import { resolveInside, posix } from "../path.js";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		pattern: {
			type: "string",
			description: "Glob or name pattern to match (e.g. '*.test.ts', 'README').",
		},
		path: {
			type: "string",
			description: "Directory to search, relative to workspace. Default: workspace root.",
		},
		type: {
			type: "string",
			description: "'f' for files only, 'd' for directories only. Default: both.",
		},
	},
	required: ["pattern"],
} as const;

const MAX_RESULTS = 1000;
const SKIP_DIRS = new Set([
	"node_modules", ".git", "dist", "__pycache__", ".cache",
	".next", ".nuxt", "build", "coverage", ".kaioken",
]);

function globToRegex(glob: string): RegExp {
	const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
	const pattern = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
	return new RegExp(`^${pattern}$`, "i");
}

export function createFindTool(cwd: string, fs: FileSystemPort): CodingTool {
	return {
		name: "find",
		label: "find",
		description:
			"Find files and directories by name pattern. Searches recursively, " +
			"skipping node_modules, .git and other common ignored directories. " +
			"Results are capped at 1000 entries.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const pattern = typeof args["pattern"] === "string" ? args["pattern"].trim() : "";
			if (!pattern) return { text: "give a `pattern`.", isError: true };

			const searchPath = typeof args["path"] === "string" ? args["path"].trim() : ".";
			const typeFilter = typeof args["type"] === "string" ? args["type"].trim() : "";

			const resolved = resolveInside(cwd, searchPath);
			if (!resolved) {
				return { text: `refused: ${searchPath} is outside the workspace.`, isError: true };
			}

			const regex = globToRegex(pattern);
			const results: string[] = [];
			let capped = false;

			async function walk(dir: string, relDir: string): Promise<void> {
				if (results.length >= MAX_RESULTS) { capped = true; return; }
				if (options?.signal?.aborted) return;

				let entries;
				try {
					entries = await fs.readdir(dir);
				} catch {
					return;
				}

				for (const entry of entries) {
					if (results.length >= MAX_RESULTS) { capped = true; return; }

					const entryRel = relDir ? `${relDir}/${entry.name}` : entry.name;

					if (entry.isDirectory && SKIP_DIRS.has(entry.name)) continue;

					const matchesType =
						!typeFilter ||
						(typeFilter === "f" && !entry.isDirectory) ||
						(typeFilter === "d" && entry.isDirectory);

					if (matchesType && regex.test(entry.name)) {
						results.push(entry.isDirectory ? `${entryRel}/` : entryRel);
					}

					if (entry.isDirectory) {
						await walk(join(dir, entry.name), entryRel);
					}
				}
			}

			await walk(resolved, posix(searchPath) === "." ? "" : posix(searchPath));

			if (results.length === 0) {
				return {
					text: `no files matching "${pattern}" found in ${posix(searchPath)}.`,
					details: { pattern, matches: 0 },
				};
			}

			const body = results.join("\n");
			const result = truncateHead(body);
			const display = formatTruncatedHead(result);
			const suffix = capped ? `\n… [results capped at ${MAX_RESULTS}]` : "";

			return {
				text: `${display}${suffix}`,
				details: { pattern, matches: results.length, capped },
			};
		},
	};
}
