import { dirname } from "node:path";
import type { CodingTool, FileSystemPort, ToolResult, ToolRunOptions } from "../../types.js";
import { resolveInside, posix } from "../path.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		path: {
			type: "string",
			description: "File path relative to the workspace root. Parent directories are created.",
		},
		content: {
			type: "string",
			description: "Complete file content to write.",
		},
	},
	required: ["path", "content"],
} as const;

export function createWriteTool(cwd: string, fs: FileSystemPort): CodingTool {
	return {
		name: "write",
		label: "write",
		description:
			"Create or overwrite a file with the given content. " +
			"Parent directories are created automatically. " +
			"Use `edit` for precise changes to existing files; " +
			"use `write` only when creating new files or replacing entire content.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const path = typeof args["path"] === "string" ? args["path"].trim() : "";
			const content = typeof args["content"] === "string" ? args["content"] : "";

			if (!path) return { text: "give a `path`.", isError: true };

			const inside = resolveInside(cwd, path);
			if (!inside) {
				return { text: `refused: ${path} is outside the workspace.`, isError: true };
			}

			return withFileMutationQueue(inside, async () => {
				const existed = await fs.exists(inside);

				try {
					await fs.mkdir(dirname(inside));
					await fs.writeFile(inside, content);
				} catch (error) {
					return {
						text: `failed to write ${posix(path)}: ${error instanceof Error ? error.message : String(error)}`,
						isError: true,
					};
				}

				const lines = content.split("\n").length;
				const verb = existed ? "overwrote" : "created";

				return {
					text: `${verb} ${posix(path)} (${lines} lines)`,
					details: { path: posix(path), created: !existed, lines },
				};
			});
		},
	};
}
