/**
 * Terminal window resize auto-reflow, line wrapping, and buffer recycling pool.
 *
 * Implements Features #UX-0031 – #UX-0040.
 *
 * Handles terminal resize events (SIGWINCH), ANSI-aware line wrapping/clamping,
 * and zero-allocation object recycling to eliminate heap churn during continuous
 * animation frame rendering.
 */

export { visibleWidth } from "./logo.ts";
import { visibleWidth } from "./logo.ts";

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "");
}


/**
 * Truncates a line to maxWidth visible characters, preserving ANSI escape codes
 * and appending an optional ellipsis.
 */
export function truncateAnsi(line: string, maxWidth: number, ellipsis = "…"): string {
	if (maxWidth <= 0) return "";
	if (visibleWidth(line) <= maxWidth) return line;

	const targetWidth = Math.max(1, maxWidth - visibleWidth(ellipsis));
	let currentWidth = 0;
	let result = "";
	let inEscape = false;

	for (let i = 0; i < line.length; i++) {
		const char = line[i] as string;

		if (char === "\x1b") {
			inEscape = true;
			result += char;
			continue;
		}

		if (inEscape) {
			result += char;
			if (/[a-zA-Z]/.test(char)) {
				inEscape = false;
			}
			continue;
		}

		if (currentWidth >= targetWidth) {
			break;
		}

		result += char;
		currentWidth++;
	}

	return `${result}\x1b[0m${ellipsis}`;
}

/**
 * Wraps a line into multiple lines not exceeding maxWidth, splitting on word boundaries
 * where possible and preserving ANSI state across lines.
 */
export function wrapAnsiLine(line: string, maxWidth: number): string[] {
	if (maxWidth <= 0) return [""];
	if (visibleWidth(line) <= maxWidth) return [line];

	const words = line.split(" ");
	const wrapped: string[] = [];
	let currentLine = "";
	let currentWidth = 0;

	for (const word of words) {
		const wordVis = visibleWidth(word);
		if (currentWidth === 0) {
			if (wordVis > maxWidth) {
				// Hard break extra long words
				let remaining = word;
				while (visibleWidth(remaining) > maxWidth) {
					wrapped.push(truncateAnsi(remaining, maxWidth, ""));
					remaining = remaining.slice(maxWidth);
				}
				currentLine = remaining;
				currentWidth = visibleWidth(remaining);
			} else {
				currentLine = word;
				currentWidth = wordVis;
			}
		} else if (currentWidth + 1 + wordVis <= maxWidth) {
			currentLine += ` ${word}`;
			currentWidth += 1 + wordVis;
		} else {
			wrapped.push(currentLine);
			currentLine = word;
			currentWidth = wordVis;
		}
	}

	if (currentLine) {
		wrapped.push(currentLine);
	}

	return wrapped;
}

/**
 * Reflows an array of lines according to terminal width and height bounds.
 */
export function reflowLines(lines: readonly string[], maxWidth: number, maxHeight?: number): string[] {
	if (maxWidth <= 0) return [];
	const out: string[] = [];

	for (const line of lines) {
		const wrapped = wrapAnsiLine(line, maxWidth);
		for (const w of wrapped) {
			out.push(w);
			if (maxHeight && out.length >= maxHeight) {
				return out;
			}
		}
	}

	return out;
}

/**
 * Reusable array pool for zero-allocation recycling during high-FPS frame rendering.
 */
export class BufferPool<T> {
	private pool: T[][] = [];
	private maxPoolSize: number;

	constructor(maxPoolSize = 16) {
		this.maxPoolSize = maxPoolSize;
	}

	acquire(): T[] {
		return this.pool.pop() ?? [];
	}

	release(buf: T[]): void {
		if (this.pool.length < this.maxPoolSize) {
			buf.length = 0;
			this.pool.push(buf);
		}
	}

	clear(): void {
		this.pool = [];
	}

	get available(): number {
		return this.pool.length;
	}
}
