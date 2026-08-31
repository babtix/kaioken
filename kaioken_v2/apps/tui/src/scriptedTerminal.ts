import type { Terminal } from "@earendil-works/pi-tui";

/**
 * A terminal that is a variable.
 *
 * The project's testing thesis is that anything needing a real pty or an API
 * key to exercise is designed wrong. pi-tui already takes its terminal as a
 * constructor argument, so the whole event loop — key grammar, view machine,
 * composer, palette, approvals — can be driven from a test with no pty at all:
 * feed it keystrokes, read back the frames it painted.
 *
 * It records writes rather than interpreting them. A test that wants to know
 * what the user would see asks for `frames()`; one that needs to address a
 * particular row asks for `rows()`.
 */
export class ScriptedTerminal implements Terminal {
	private input: ((data: string) => void) | undefined;
	private resize: (() => void) | undefined;
	private readonly writes: string[] = [];
	private cursorHidden = false;
	private title = "";

	constructor(
		public columns = 80,
		public rowCount = 24,
	) {}

	get rows(): number {
		return this.rowCount;
	}

	get kittyProtocolActive(): boolean {
		return false;
	}

	start(onInput: (data: string) => void, onResize: () => void): void {
		this.input = onInput;
		this.resize = onResize;
	}

	stop(): void {
		this.input = undefined;
		this.resize = undefined;
	}

	async drainInput(): Promise<void> {}

	write(data: string): void {
		this.writes.push(data);
	}

	/** Deliver a keystroke, exactly as a terminal would. */
	send(data: string): void {
		this.input?.(data);
	}

	/** Resize, so layout under a narrow terminal is testable too. */
	resizeTo(columns: number, rows: number): void {
		this.columns = columns;
		this.rowCount = rows;
		this.resize?.();
	}

	/** Everything written since the last `clear()`, escapes included. */
	output(): string {
		return this.writes.join("");
	}

	/**
	 * The painted text with escapes and cursor movement removed.
	 *
	 * Not a terminal emulator: it answers "did this string reach the screen",
	 * which is the question a shell test usually has.
	 */
	frames(): string {
		return strip(this.output());
	}

	/**
	 * The painted rows, by 1-based row number.
	 *
	 * pi-tui positions each row with a cursor move before writing it, so the
	 * row numbers are already in the output. Splitting on them lets a test ask
	 * what is in the header or on the composer rather than searching the whole
	 * frame — "is the composer empty" gets the wrong answer from a frame whose
	 * scrollback happens to quote the same text.
	 */
	rowsPainted(): string[] {
		const out: string[] = [];
		// biome-ignore lint: the cursor-position sequence is the delimiter.
		const parts = this.output().split(/\x1b\[(\d+);1H/);
		for (let i = 1; i < parts.length; i += 2) {
			out[Number(parts[i])] = strip(parts[i + 1] ?? "");
		}
		return out;
	}

	/** The last `count` painted rows, in order: composer and status line. */
	bottomRows(count: number): string[] {
		return this.rowsPainted().filter((row) => row !== undefined).slice(-count);
	}

	clear(): void {
		this.writes.length = 0;
	}

	moveBy(): void {}
	hideCursor(): void {
		this.cursorHidden = true;
	}
	showCursor(): void {
		this.cursorHidden = false;
	}
	isCursorHidden(): boolean {
		return this.cursorHidden;
	}
	clearLine(): void {}
	clearFromCursor(): void {}
	clearScreen(): void {}
	setTitle(title: string): void {
		this.title = title;
	}
	getTitle(): string {
		return this.title;
	}
	setProgress(): void {}
}

/** Remove escapes, OSC sequences and the APC cursor marker pi-tui emits. */
function strip(text: string): string {
	return (
		text
			// biome-ignore lint: matching escape sequences is the whole job.
			.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "")
			// biome-ignore lint: OSC sequences terminate on BEL or ST.
			.replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
			// biome-ignore lint: APC sequences too — pi-tui's kitty graphics
			// query is ST-terminated, and a frame that quotes "_Ga=" is noise.
			.replace(/\x1b_[^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
	);
}
