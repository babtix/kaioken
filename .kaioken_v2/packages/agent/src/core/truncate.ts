/**
 * Shared truncation for tool outputs.
 *
 * Two modes, each with two independent limits (whichever is hit first):
 * - truncateHead (read, ls, find): keep first N lines, up to 50 KB.
 * - truncateTail (bash, grep):    keep last  N lines, up to 8 000 chars.
 *
 * Every truncated result includes a visible marker line so the model knows
 * output was cut and how much was omitted.
 */

export const HEAD_MAX_LINES = 2000;
export const HEAD_MAX_BYTES = 50 * 1024;

export const TAIL_MAX_LINES = 2000;
export const TAIL_MAX_CHARS = 8000;

export interface TruncationResult {
	/** The truncated content (without marker). */
	content: string;
	truncated: boolean;
	totalLines: number;
	outputLines: number;
	/** Pre-formatted marker line, empty when not truncated. */
	marker: string;
}

export interface TruncateHeadOptions {
	maxLines?: number;
	maxBytes?: number;
}

export interface TruncateTailOptions {
	maxLines?: number;
	maxChars?: number;
}

function splitLines(text: string): string[] {
	if (text.length === 0) return [];
	const lines = text.split("\n");
	if (text.endsWith("\n") && lines.length > 0) lines.pop();
	return lines;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes}B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

/**
 * Keep the first N lines / bytes. Suitable for file reads and directory
 * listings where the beginning is most informative.
 */
export function truncateHead(
	text: string,
	options: TruncateHeadOptions = {},
): TruncationResult {
	const maxLines = options.maxLines ?? HEAD_MAX_LINES;
	const maxBytes = options.maxBytes ?? HEAD_MAX_BYTES;

	const lines = splitLines(text);
	const totalLines = lines.length;
	const totalBytes = Buffer.byteLength(text, "utf-8");

	if (totalLines <= maxLines && totalBytes <= maxBytes) {
		return { content: text, truncated: false, totalLines, outputLines: totalLines, marker: "" };
	}

	const kept: string[] = [];
	let bytesSoFar = 0;

	for (let i = 0; i < lines.length && i < maxLines; i++) {
		const line = lines[i]!;
		const lineBytes = Buffer.byteLength(line, "utf-8") + (i > 0 ? 1 : 0);
		if (bytesSoFar + lineBytes > maxBytes) break;
		kept.push(line);
		bytesSoFar += lineBytes;
	}

	const outputLines = kept.length;
	const omitted = totalLines - outputLines;
	const content = kept.join("\n");
	const marker =
		`… [truncated: ${omitted} lines (${formatBytes(totalBytes - bytesSoFar)}) omitted, ` +
		`showing first ${outputLines} lines]`;

	return { content, truncated: true, totalLines, outputLines, marker };
}

/**
 * Keep the last N lines / chars. Suitable for bash output and grep results
 * where errors and final results appear at the end.
 */
export function truncateTail(
	text: string,
	options: TruncateTailOptions = {},
): TruncationResult {
	const maxLines = options.maxLines ?? TAIL_MAX_LINES;
	const maxChars = options.maxChars ?? TAIL_MAX_CHARS;

	const lines = splitLines(text);
	const totalLines = lines.length;

	if (totalLines <= maxLines && text.length <= maxChars) {
		return { content: text, truncated: false, totalLines, outputLines: totalLines, marker: "" };
	}

	// Take the last maxLines lines.
	const tailLines = lines.slice(-maxLines);
	let content = tailLines.join("\n");

	// If still over the char limit, cut from the front of that slice.
	if (content.length > maxChars) {
		content = content.slice(-maxChars);
		// Drop the first (likely partial) line to avoid broken output.
		const firstNewline = content.indexOf("\n");
		if (firstNewline !== -1) {
			content = content.slice(firstNewline + 1);
		}
	}

	const outputLines = splitLines(content).length;
	const omitted = totalLines - outputLines;
	const marker =
		`… [truncated: ${omitted} lines omitted, showing last ${outputLines} lines]`;

	return { content, truncated: true, totalLines, outputLines, marker };
}

/** Truncate a single line to max chars, appending `[truncated]`. */
export function truncateLine(
	line: string,
	maxChars = 500,
): { text: string; wasTruncated: boolean } {
	if (line.length <= maxChars) return { text: line, wasTruncated: false };
	return { text: `${line.slice(0, maxChars)}… [truncated]`, wasTruncated: true };
}

/**
 * Combine content and marker into model-facing output.
 * Head → marker at the end; Tail → marker at the start.
 */
export function formatTruncatedHead(result: TruncationResult): string {
	if (!result.truncated) return result.content;
	return `${result.content}\n${result.marker}`;
}

export function formatTruncatedTail(result: TruncationResult): string {
	if (!result.truncated) return result.content;
	return `${result.marker}\n${result.content}`;
}
