import type { CodingTool, FileSystemPort, ToolResult, ToolRunOptions } from "../../types.js";
import { resolveInside, posix } from "../path.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import { generateUnifiedDiff } from "./edit-diff.js";

const INPUT_SCHEMA = {
	type: "object",
	properties: {
		path: {
			type: "string",
			description: "File path relative to the workspace root.",
		},
		oldText: {
			type: "string",
			description:
				"Exact text to find in the file. Must appear exactly once. " +
				"Keep it as small as possible while still being unique.",
		},
		newText: {
			type: "string",
			description: "Replacement text.",
		},
	},
	required: ["path", "oldText", "newText"],
} as const;

/** Detect the dominant line ending in a file. */
function detectLineEnding(content: string): "\r\n" | "\n" {
	const crlf = (content.match(/\r\n/g) ?? []).length;
	const lf = (content.match(/(?<!\r)\n/g) ?? []).length;
	return crlf > lf ? "\r\n" : "\n";
}

function normalizeToLF(text: string): string {
	return text.replace(/\r\n/g, "\n");
}

function restoreLineEndings(text: string, ending: "\r\n" | "\n"): string {
	if (ending === "\n") return text;
	return text.replace(/\n/g, "\r\n");
}

export function createEditTool(cwd: string, fs: FileSystemPort): CodingTool {
	return {
		name: "edit",
		label: "edit",
		description:
			"Make a precise text replacement in a file. Give the exact `oldText` " +
			"to find (must be unique in the file) and the `newText` to replace it " +
			"with. Keep `oldText` as small as possible while still being unique.",
		inputSchema: INPUT_SCHEMA as unknown as Record<string, unknown>,
		async run(args: Record<string, unknown>, options?: ToolRunOptions): Promise<ToolResult> {
			const path = typeof args["path"] === "string" ? args["path"].trim() : "";
			const oldText = typeof args["oldText"] === "string" ? args["oldText"] : "";
			const newText = typeof args["newText"] === "string" ? args["newText"] : "";

			if (!path) return { text: "give a `path`.", isError: true };
			if (!oldText) return { text: "give `oldText` to find.", isError: true };

			const inside = resolveInside(cwd, path);
			if (!inside) {
				return { text: `refused: ${path} is outside the workspace.`, isError: true };
			}

			return withFileMutationQueue(inside, async () => {
				// Read current file content.
				let raw: string;
				try {
					raw = await fs.readFile(inside, "utf8");
				} catch {
					return { text: `cannot read ${posix(path)} — no such file.`, isError: true };
				}

				const originalEnding = detectLineEnding(raw);
				const content = normalizeToLF(raw);
				const normalizedOld = normalizeToLF(oldText);
				const normalizedNew = normalizeToLF(newText);

				// Exact match — must be unique.
				let matchMode: "exact" | "whitespace-normalized" = "exact";
				let matchIndex = content.indexOf(normalizedOld);
				let matchLength = normalizedOld.length;

				if (matchIndex === -1) {
					// Whitespace-tolerant fallback: collapse runs of whitespace.
					const collapseWS = (s: string) => s.replace(/[ \t]+/g, " ").trim();
					const collapsedContent = collapseWS(content);
					const collapsedOld = collapseWS(normalizedOld);

					if (collapsedOld && collapsedContent.includes(collapsedOld)) {
						// Find the matching region in the original content.
						const found = findWhitespaceMatch(content, normalizedOld);
						if (found) {
							matchIndex = found.start;
							matchLength = found.length;
							matchMode = "whitespace-normalized";
						} else {
							return {
								text:
									`oldText not found in ${posix(path)}.\n` +
									"Check that it matches the file exactly.",
								isError: true,
								details: { path: posix(path), found: false },
							};
						}
					} else {
						return {
							text:
								`oldText not found in ${posix(path)}.\n` +
								"Check that it matches the file exactly.",
							isError: true,
							details: { path: posix(path), found: false },
						};
					}
				}

				// Check uniqueness: must not appear a second time.
				if (matchMode === "exact") {
					const secondIndex = content.indexOf(normalizedOld, matchIndex + 1);
					if (secondIndex !== -1) {
						const count = countOccurrences(content, normalizedOld);
						return {
							text:
								`oldText appears ${count} times in ${posix(path)}; it must be unique.\n` +
								"Add surrounding context to disambiguate.",
							isError: true,
							details: { path: posix(path), occurrences: count },
						};
					}
				}

				// Apply the edit.
				const edited = content.slice(0, matchIndex) + normalizedNew + content.slice(matchIndex + matchLength);
				const restored = restoreLineEndings(edited, originalEnding);

				try {
					await fs.writeFile(inside, restored);
				} catch (error) {
					return {
						text: `failed to write ${posix(path)}: ${error instanceof Error ? error.message : String(error)}`,
						isError: true,
					};
				}

				// Line number of the change for navigation.
				const lineNumber = content.slice(0, matchIndex).split("\n").length;
				const diff = generateUnifiedDiff(posix(path), raw, restored);

				return {
					text: `edited ${posix(path)} (line ${lineNumber}, ${matchMode} match, ${originalEnding === "\r\n" ? "CRLF" : "LF"} preserved)`,
					details: {
						path: posix(path),
						line: lineNumber,
						matchMode,
						lineEnding: originalEnding === "\r\n" ? "CRLF" : "LF",
						diff,
					},
				};
			});
		},
	};
}

function countOccurrences(haystack: string, needle: string): number {
	let count = 0;
	let pos = 0;
	while (true) {
		const index = haystack.indexOf(needle, pos);
		if (index === -1) break;
		count++;
		pos = index + 1;
	}
	return count;
}

/**
 * Whitespace-tolerant search: find a region in `content` that matches `needle`
 * when runs of horizontal whitespace are collapsed.
 */
function findWhitespaceMatch(
	content: string,
	needle: string,
): { start: number; length: number } | null {
	const collapse = (s: string) => s.replace(/[ \t]+/g, " ");
	const collapsedNeedle = collapse(needle).trim();
	if (!collapsedNeedle) return null;

	// Sliding window: walk content lines to find a matching region.
	const contentLines = content.split("\n");
	const needleLines = collapse(needle).trim().split("\n");
	const needleLineCount = needleLines.length;

	for (let i = 0; i <= contentLines.length - needleLineCount; i++) {
		const candidate = contentLines
			.slice(i, i + needleLineCount)
			.join("\n");
		if (collapse(candidate).trim() === collapsedNeedle) {
			// Calculate byte offset.
			const before = contentLines.slice(0, i).join("\n");
			const start = before.length > 0 ? before.length + 1 : 0;
			return { start, length: candidate.length };
		}
	}
	return null;
}
