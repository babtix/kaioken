import { posix } from "../path.js";

interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: string[];
}

/**
 * Generate a clean unified diff snippet for file edits.
 * Self-contained without external dependencies.
 */
export function generateUnifiedDiff(
	filePath: string,
	oldContent: string,
	newContent: string,
	contextLines = 3,
): string {
	const normalizedPath = posix(filePath);
	if (oldContent === newContent) {
		return "";
	}

	const oldLines = oldContent.split(/\r?\n/);
	const newLines = newContent.split(/\r?\n/);

	// Compute LCS (Longest Common Subsequence) diff
	const edits = computeLineEdits(oldLines, newLines);
	const hunks = buildDiffHunks(edits, oldLines.length, newLines.length, contextLines);

	if (hunks.length === 0) {
		return "";
	}

	const header = `--- a/${normalizedPath}\n+++ b/${normalizedPath}\n`;
	const hunkStrings = hunks.map((hunk) => {
		const hunkHeader = `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`;
		return `${hunkHeader}\n${hunk.lines.join("\n")}`;
	});

	return `${header}${hunkStrings.join("\n")}\n`;
}

type EditOp =
	| { type: "equal"; line: string; oldIndex: number; newIndex: number }
	| { type: "delete"; line: string; oldIndex: number }
	| { type: "insert"; line: string; newIndex: number };

function computeLineEdits(oldLines: string[], newLines: string[]): EditOp[] {
	const m = oldLines.length;
	const n = newLines.length;

	// Optimization for identical prefixes and suffixes
	let prefixLen = 0;
	while (prefixLen < m && prefixLen < n && oldLines[prefixLen] === newLines[prefixLen]) {
		prefixLen++;
	}

	let suffixLen = 0;
	while (
		suffixLen < m - prefixLen &&
		suffixLen < n - prefixLen &&
		oldLines[m - 1 - suffixLen] === newLines[n - 1 - suffixLen]
	) {
		suffixLen++;
	}

	const trimmedOld = oldLines.slice(prefixLen, m - suffixLen);
	const trimmedNew = newLines.slice(prefixLen, n - suffixLen);

	// Dynamic programming table for trimmed region
	const dp: number[][] = Array.from({ length: trimmedOld.length + 1 }, () =>
		new Array(trimmedNew.length + 1).fill(0),
	);

	for (let i = 0; i < trimmedOld.length; i++) {
		for (let j = 0; j < trimmedNew.length; j++) {
			if (trimmedOld[i] === trimmedNew[j]) {
				dp[i + 1]![j + 1] = dp[i]![j]! + 1;
			} else {
				dp[i + 1]![j + 1] = Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
			}
		}
	}

	const result: EditOp[] = [];

	// Leading common lines
	for (let i = 0; i < prefixLen; i++) {
		result.push({ type: "equal", line: oldLines[i]!, oldIndex: i + 1, newIndex: i + 1 });
	}

	// Backtrack trimmed LCS
	let i = trimmedOld.length;
	let j = trimmedNew.length;
	const trimmedEdits: EditOp[] = [];

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && trimmedOld[i - 1] === trimmedNew[j - 1]) {
			trimmedEdits.push({
				type: "equal",
				line: trimmedOld[i - 1]!,
				oldIndex: prefixLen + i,
				newIndex: prefixLen + j,
			});
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
			trimmedEdits.push({
				type: "insert",
				line: trimmedNew[j - 1]!,
				newIndex: prefixLen + j,
			});
			j--;
		} else if (i > 0 && (j === 0 || dp[i]![j - 1]! < dp[i - 1]![j]!)) {
			trimmedEdits.push({
				type: "delete",
				line: trimmedOld[i - 1]!,
				oldIndex: prefixLen + i,
			});
			i--;
		}
	}

	trimmedEdits.reverse();
	result.push(...trimmedEdits);

	// Trailing common lines
	for (let k = 0; k < suffixLen; k++) {
		const oldIdx = m - suffixLen + k;
		const newIdx = n - suffixLen + k;
		result.push({ type: "equal", line: oldLines[oldIdx]!, oldIndex: oldIdx + 1, newIndex: newIdx + 1 });
	}

	return result;
}

function buildDiffHunks(
	edits: EditOp[],
	totalOldLines: number,
	totalNewLines: number,
	contextLines: number,
): DiffHunk[] {
	const hunks: DiffHunk[] = [];

	// Find groups of changes with context around them
	let i = 0;
	while (i < edits.length) {
		if (edits[i]!.type === "equal") {
			i++;
			continue;
		}

		// Found a change at index i
		let start = Math.max(0, i - contextLines);
		let end = i;

		while (end < edits.length) {
			if (edits[end]!.type !== "equal") {
				end++;
			} else {
				// Check if next change is within 2 * contextLines
				let nextChange = -1;
				for (let k = end; k < Math.min(edits.length, end + 2 * contextLines + 1); k++) {
					if (edits[k]!.type !== "equal") {
						nextChange = k;
						break;
					}
				}
				if (nextChange !== -1) {
					end = nextChange + 1;
				} else {
					break;
				}
			}
		}

		end = Math.min(edits.length, end + contextLines);

		const hunkSlice = edits.slice(start, end);
		let oldStart = 1;
		let newStart = 1;
		let oldCount = 0;
		let newCount = 0;
		const lines: string[] = [];

		let firstOld = true;
		let firstNew = true;

		for (const op of hunkSlice) {
			if (op.type === "equal") {
				if (firstOld) {
					oldStart = op.oldIndex;
					firstOld = false;
				}
				if (firstNew) {
					newStart = op.newIndex;
					firstNew = false;
				}
				oldCount++;
				newCount++;
				lines.push(` ${op.line}`);
			} else if (op.type === "delete") {
				if (firstOld) {
					oldStart = op.oldIndex;
					firstOld = false;
				}
				oldCount++;
				lines.push(`-${op.line}`);
			} else if (op.type === "insert") {
				if (firstNew) {
					newStart = op.newIndex;
					firstNew = false;
				}
				newCount++;
				lines.push(`+${op.line}`);
			}
		}

		hunks.push({
			oldStart: oldCount === 0 ? 0 : oldStart,
			oldCount,
			newStart: newCount === 0 ? 0 : newStart,
			newCount,
			lines,
		});

		i = end;
	}

	return hunks;
}
