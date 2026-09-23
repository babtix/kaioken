import type { DiffHunk, DiffHunkLine } from "./types.ts";

/**
 * Compute line-by-line differences between two strings and produce unified diff hunks.
 *
 * Implemented in pure TypeScript to guarantee Invariant 10: 100% offline verification,
 * zero subprocess calls, zero git dependencies.
 */
export function computeLineDiff(
	oldText: string,
	newText: string,
	contextLines = 3,
): DiffHunk[] {
	const a = oldText === "" ? [] : oldText.replace(/\r\n/g, "\n").split("\n");
	const b = newText === "" ? [] : newText.replace(/\r\n/g, "\n").split("\n");

	// Quick check: identical strings
	if (oldText === newText) return [];

	// Fast prefix trim
	let prefix = 0;
	while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) {
		prefix++;
	}

	// Fast suffix trim
	let suffix = 0;
	while (
		suffix < a.length - prefix &&
		suffix < b.length - prefix &&
		a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
	) {
		suffix++;
	}

	const midA = a.slice(prefix, a.length - suffix);
	const midB = b.slice(prefix, b.length - suffix);

	// Compute LCS on middle section
	const matrix: number[][] = Array.from({ length: midA.length + 1 }, () =>
		new Array(midB.length + 1).fill(0),
	);

	for (let i = 0; i < midA.length; i++) {
		for (let j = 0; j < midB.length; j++) {
			if (midA[i] === midB[j]) {
				matrix[i + 1][j + 1] = matrix[i][j] + 1;
			} else {
				matrix[i + 1][j + 1] = Math.max(matrix[i + 1][j], matrix[i][j + 1]);
			}
		}
	}

	// Backtrack edit sequence
	type Edit = { type: "add" | "delete" | "context"; text: string; oldLine?: number; newLine?: number };
	const edits: Edit[] = [];

	let i = midA.length;
	let j = midB.length;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && midA[i - 1] === midB[j - 1]) {
			edits.push({
				type: "context",
				text: midA[i - 1],
				oldLine: prefix + i,
				newLine: prefix + j,
			});
			i--;
			j--;
		} else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
			edits.push({
				type: "add",
				text: midB[j - 1],
				newLine: prefix + j,
			});
			j--;
		} else if (i > 0) {
			edits.push({
				type: "delete",
				text: midA[i - 1],
				oldLine: prefix + i,
			});
			i--;
		}
	}

	edits.reverse();

	// Prepend prefix context lines
	const prefixContextStart = Math.max(0, prefix - contextLines);
	const prefixContext: Edit[] = [];
	for (let p = prefixContextStart; p < prefix; p++) {
		prefixContext.push({
			type: "context",
			text: a[p],
			oldLine: p + 1,
			newLine: p + 1,
		});
	}

	// Append suffix context lines
	const suffixContextEnd = Math.min(a.length, a.length - suffix + contextLines);
	const suffixContext: Edit[] = [];
	for (let s = a.length - suffix; s < suffixContextEnd; s++) {
		const offset = s - (a.length - suffix);
		suffixContext.push({
			type: "context",
			text: a[s],
			oldLine: s + 1,
			newLine: b.length - suffix + offset + 1,
		});
	}

	const allEdits = [...prefixContext, ...edits, ...suffixContext];
	if (allEdits.every((e) => e.type === "context")) return [];

	// Group into hunks
	const hunks: DiffHunk[] = [];
	let currentHunkLines: DiffHunkLine[] = [];
	let oldStart = 0;
	let newStart = 0;
	let oldCount = 0;
	let newCount = 0;
	let consecutiveContext = 0;

	for (let idx = 0; idx < allEdits.length; idx++) {
		const edit = allEdits[idx];

		if (currentHunkLines.length === 0) {
			oldStart = edit.oldLine ?? 1;
			newStart = edit.newLine ?? 1;
			oldCount = 0;
			newCount = 0;
			consecutiveContext = 0;
		}

		currentHunkLines.push({
			type: edit.type,
			text: edit.text,
			oldLine: edit.oldLine,
			newLine: edit.newLine,
		});

		if (edit.type === "context") {
			oldCount++;
			newCount++;
			consecutiveContext++;
		} else if (edit.type === "delete") {
			oldCount++;
			consecutiveContext = 0;
		} else if (edit.type === "add") {
			newCount++;
			consecutiveContext = 0;
		}

		// Split hunks if we exceed 2 * contextLines of consecutive context
		if (consecutiveContext > contextLines * 2 && idx < allEdits.length - 1) {
			const trailingContextToRemove = consecutiveContext - contextLines;
			const trimmedLines = currentHunkLines.slice(0, -trailingContextToRemove);
			hunks.push({
				oldStart,
				oldCount: oldCount - trailingContextToRemove,
				newStart,
				newCount: newCount - trailingContextToRemove,
				lines: trimmedLines,
			});
			currentHunkLines = [];
			idx -= contextLines; // Keep contextLines for next hunk
		}
	}

	if (currentHunkLines.length > 0 && currentHunkLines.some((l) => l.type !== "context")) {
		hunks.push({
			oldStart,
			oldCount,
			newStart,
			newCount,
			lines: currentHunkLines,
		});
	}

	return hunks;
}

/**
 * Format hunks into a standard unified diff string.
 */
export function formatUnifiedDiff(path: string, hunks: readonly DiffHunk[]): string {
	if (hunks.length === 0) return "";
	const out: string[] = [`--- a/${path}`, `+++ b/${path}`];

	for (const hunk of hunks) {
		out.push(`@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`);
		for (const line of hunk.lines) {
			const prefix = line.type === "add" ? "+" : line.type === "delete" ? "-" : " ";
			out.push(`${prefix}${line.text}`);
		}
	}

	return out.join("\n");
}
