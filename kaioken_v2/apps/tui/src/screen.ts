/**
 * The screen.
 *
 * A TUI needs exactly three operations from a terminal: clear and repaint,
 * move the cursor, and read raw keys. Everything else — borders, lists,
 * scrollback, the chat transcript — is composed here from those three, so the
 * whole interface stays inspectable and testable without a pty.
 *
 * No framework. Ink/Bless would buy event wiring this file already owns, at
 * the cost of a React runtime inside a command the user runs for seconds at a
 * time. The loop is small enough to be read in one sitting, which is worth
 * more than the abstractions.
 */

/** ANSI escape helpers. Kept as functions so tests can assert on output. */
export const ESC = "\x1b";
export const CLEAR = `${ESC}[2J`;
export const HOME = `${ESC}[H`;
export const HIDE_CURSOR = `${ESC}[?25l`;
export const SHOW_CURSOR = `${ESC}[?25h`;
export const DIM = `${ESC}[2m`;
export const BOLD = `${ESC}[1m`;
export const REVERSE = `${ESC}[7m`;
export const RESET = `${ESC}[0m`;

export interface Size {
	rows: number;
	cols: number;
}

export function sizeOf(stream: { columns?: number; rows?: number }): Size {
	return {
		cols: Math.max(20, stream.columns ?? 80),
		rows: Math.max(8, stream.rows ?? 24),
	};
}

/** Truncate a string to fit a column width, honouring no escapes in `text`. */
export function truncate(text: string, width: number): string {
	if (text.length <= width) return text;
	return width > 1 ? `${text.slice(0, width - 1)}…` : text.slice(0, width);
}

export function pad(text: string, width: number): string {
	return text.length >= width ? truncate(text, width) : text + " ".repeat(width - text.length);
}

/** One repainted frame. */
export interface Frame {
	lines: string[];
}

/** Join a frame's lines for tests: assertions run on plain text. */
export function renderToStringHelper(lines: readonly string[]): string {
	return lines.join("\n");
}

/**
 * A scrollable viewport over more content than fits.
 *
 * Pure arithmetic: content in, window out. The TUI keeps one of these per
 * scrollable view and re-slices on every repaint, so scrolling is testable
 * without a terminal and cannot desynchronise from the content.
 */
export interface Viewport {
	/** Index of the first visible line. */
	offset: number;
	/** How many lines are visible. */
	height: number;
	/** Total content length the viewport was last fitted against. */
	total: number;
}

export function emptyViewport(height: number): Viewport {
	return { offset: 0, height: Math.max(1, height), total: 0 };
}

/**
 * Fit a viewport to current content: clamps offset into range and returns
 * the start index actually applied. `stickToBottom` keeps the newest content
 * in view, which is what a chat transcript wants; lists stay where the user
 * parked them (until they scroll past the end, which is clamped).
 */
export function fitViewport(viewport: Viewport, contentLength: number, stickToBottom = false): number {
	const length = Math.max(0, contentLength);
	viewport.total = length;
	viewport.height = Math.max(1, viewport.height);
	const maxOffset = Math.max(0, length - viewport.height);
	if (stickToBottom || viewport.offset > maxOffset) viewport.offset = maxOffset;
	return viewport.offset;
}

/** The visible slice: take after fitting. */
export function sliceVisible(lines: readonly string[], viewport: Viewport): string[] {
	return lines.slice(viewport.offset, viewport.offset + viewport.height);
}

/** Scroll by lines (positive down); clamps to the fitted range. */
export function scrollViewport(viewport: Viewport, delta: number): void {
	viewport.offset = Math.max(0, Math.min(viewport.total - viewport.height, viewport.offset + delta));
}

export class Screen {
	private readonly out: NodeJS.WriteStream;

	constructor(out: NodeJS.WriteStream = process.stdout) {
		this.out = out;
	}

	enter(): void {
		this.out.write(`${CLEAR}${HOME}${HIDE_CURSOR}`);
	}

	leave(): void {
		this.out.write(`${SHOW_CURSOR}${RESET}\n`);
	}

	/**
	 * Repaint the whole screen from a frame.
	 *
	 * Full repaints per keypress are fine at this scale: the frames are a few
	 * hundred bytes, terminals buffer writes, and diff-based partial repaint
	 * would add state for no perceivable gain.
	 */
	render(frame: Frame): void {
		const { rows } = sizeOf(this.out);
		const lines = frame.lines.slice(0, rows - 1);
		while (lines.length < rows - 1) lines.push("");
		this.out.write(`${CLEAR}${HOME}${lines.join("\r\n")}\r\n`);
	}

	renderString(rendered: string): void {
		this.out.write(rendered);
	}
}

/**
 * A key event, normalised across the platform quirks that matter here.
 */
export type Key =
	| { type: "char"; char: string }
	| { type: "enter" }
	| { type: "backspace" }
	| { type: "tab" }
	| { type: "up" }
	| { type: "down" }
	| { type: "pageup" }
	| { type: "pagedown" }
	| { type: "escape" };

/** Parse one raw stdin chunk into keys. Sequences arrive as one chunk. */
export function parseKeys(chunk: string): Key[] {
	const keys: Key[] = [];
	for (let i = 0; i < chunk.length; i++) {
		const ch = chunk[i] as string;
		if (ch !== ESC) {
			if (ch === "\r" || ch === "\n") keys.push({ type: "enter" });
			else if (ch === "\t") keys.push({ type: "tab" });
			else if (ch === "\b" || ch === "\x7f") keys.push({ type: "backspace" });
			else if (ch >= " ") keys.push({ type: "char", char: ch });
			continue;
		}
		const next = chunk[i + 1];
		if (next === "[") {
			const cmd = chunk[i + 2];
			i += 2;
			switch (cmd) {
				case "A":
					keys.push({ type: "up" });
					continue;
				case "B":
					keys.push({ type: "down" });
					continue;
				case "H":
					keys.push({ type: "pageup" });
					continue;
				case "F":
					keys.push({ type: "pagedown" });
					continue;
				default:
					continue;
			}
		}
		// A lone ESC.
		keys.push({ type: "escape" });
	}
	return keys;
}
