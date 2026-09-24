/**
 * Syntax-highlighted unified diff blocks with collapsible folds and hunk parsing.
 *
 * Implements Features #UX-0111 – #UX-0120.
 *
 * Formats git/unified diffs into structured, syntax-highlighted TUI components
 * with support for:
 * - Hunk header recognition and symbol coloration
 * - Additions (+ green/success) and deletions (- red/error)
 * - Collapsible fold views showing summary statistics (+lines, -lines, files)
 */

import { Box, Text } from "@earendil-works/pi-tui";
import type { PaintTheme } from "../ui/theme.ts";

export interface DiffHunk {
	header: string;
	lines: string[];
	added: number;
	deleted: number;
}

export interface DiffFile {
	from: string;
	to: string;
	hunks: DiffHunk[];
	added: number;
	deleted: number;
}

export interface ParsedDiff {
	files: DiffFile[];
	totalAdded: number;
	totalDeleted: number;
}

export function parseUnifiedDiff(diffText: string): ParsedDiff {
	const lines = diffText.split(/\r?\n/);
	const files: DiffFile[] = [];
	let currentFile: DiffFile | null = null;
	let currentHunk: DiffHunk | null = null;
	let totalAdded = 0;
	let totalDeleted = 0;

	for (const line of lines) {
		if (line.startsWith("diff --git ") || line.startsWith("--- ")) {
			if (line.startsWith("diff --git ")) {
				const parts = line.split(" ");
				const from = parts[2]?.replace(/^a\//, "") ?? "unknown";
				const to = parts[3]?.replace(/^b\//, "") ?? "unknown";
				currentFile = { from, to, hunks: [], added: 0, deleted: 0 };
				files.push(currentFile);
				currentHunk = null;
			}
			continue;
		}

		if (line.startsWith("+++ ")) {
			if (currentFile && currentFile.to === "unknown") {
				currentFile.to = line.replace(/^\+\+\+\s+(b\/)?/, "");
			}
			continue;
		}

		if (line.startsWith("@@ ")) {
			currentHunk = { header: line, lines: [], added: 0, deleted: 0 };
			if (!currentFile) {
				currentFile = { from: "unknown", to: "unknown", hunks: [], added: 0, deleted: 0 };
				files.push(currentFile);
			}
			currentFile.hunks.push(currentHunk);
			continue;
		}

		if (currentHunk) {
			currentHunk.lines.push(line);
			if (line.startsWith("+")) {
				currentHunk.added++;
				if (currentFile) currentFile.added++;
				totalAdded++;
			} else if (line.startsWith("-")) {
				currentHunk.deleted++;
				if (currentFile) currentFile.deleted++;
				totalDeleted++;
			}
		}
	}

	return { files, totalAdded, totalDeleted };
}

export function renderDiffLines(
	diffText: string,
	theme?: PaintTheme,
): string[] {
	const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);
	const bold = (text: string) => (theme?.bold ? theme.bold(text) : text);

	const rawLines = diffText.split(/\r?\n/);
	const out: string[] = [];

	for (const line of rawLines) {
		if (line.startsWith("diff --git ")) {
			out.push(bold(fg("accent", line)));
		} else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
			out.push(bold(fg("warning", line)));
		} else if (line.startsWith("@@ ")) {
			out.push(fg("mdLink", line));
		} else if (line.startsWith("+")) {
			out.push(fg("success", line));
		} else if (line.startsWith("-")) {
			out.push(fg("error", line));
		} else {
			out.push(fg("dim", line));
		}
	}

	return out;
}

export function renderDiffBlock(
	diffText: string,
	options: { collapsed?: boolean; expanded?: boolean; maxLines?: number } = {},
	theme?: PaintTheme,
): Box {
	const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);
	const bold = (text: string) => (theme?.bold ? theme.bold(text) : text);

	const parsed = parseUnifiedDiff(diffText);
	const isCollapsed = options.collapsed ?? !options.expanded;

	const fileSummary =
		parsed.files.length === 1
			? (parsed.files[0]?.to || "file")
			: `${parsed.files.length} files`;

	const statsPill = `${fg("success", `+${parsed.totalAdded}`)} / ${fg("error", `-${parsed.totalDeleted}`)}`;

	if (isCollapsed) {
		const header = `${bold(fg("accent", "▶ diff:"))} ${fileSummary} (${statsPill}) ${fg("dim", "[folded - click/expand to view]")}`;
		const box = new Box(1, 0);
		box.addChild(new Text(header, 0, 0));
		return box;
	}

	const header = `${bold(fg("accent", "▼ diff:"))} ${fileSummary} (${statsPill})`;
	const styledLines = renderDiffLines(diffText, theme);

	const renderedLines: string[] = [header, ""];
	const max = options.maxLines ?? 100;

	if (styledLines.length > max) {
		renderedLines.push(...styledLines.slice(0, max));
		renderedLines.push(fg("dim", `... (${styledLines.length - max} more lines truncated)`));
	} else {
		renderedLines.push(...styledLines);
	}

	const box = new Box(1, 0);
	box.addChild(new Text(renderedLines.join("\n"), 0, 0));
	return box;
}
