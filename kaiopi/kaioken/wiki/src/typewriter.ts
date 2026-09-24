/**
 * Typewriter effect configuration options (UX-1411 to UX-1420).
 */
export interface TypewriterOptions {
	/** Words per minute typing speed simulation (default: 300). */
	wpm?: number;
	/** Number of characters emitted per animation frame/tick (default: 3). */
	charsPerTick?: number;
	/** Milliseconds delay between ticks (default: 15). */
	delayMs?: number;
	/** Optional terminal cursor glyph to append during streaming (e.g. "▊", "▌", "_"). */
	cursorGlyph?: string;
	/** Immediate mode: flush without delays (auto-enabled on non-TTY or dumb terminals). */
	immediate?: boolean;
}

/**
 * Real-time token streaming typewriter formatter and emitter (UX-1411 to UX-1420).
 * Simulates a smooth typing cadence for generated documentation in terminal interfaces,
 * with graceful fallback on non-TTY / dumb terminal environments.
 */
export class TypewriterStream {
	private buffer = "";
	private readonly options: Required<TypewriterOptions>;
	private readonly isInteractive: boolean;

	constructor(options: TypewriterOptions = {}) {
		const isDumb = typeof process !== "undefined" && process.env?.TERM === "dumb";
		const isTTY = typeof process !== "undefined" && Boolean(process.stdout?.isTTY);
		const immediate = options.immediate ?? (!isTTY || isDumb);

		this.options = {
			wpm: options.wpm ?? 300,
			charsPerTick: options.charsPerTick ?? 3,
			delayMs: options.delayMs ?? 15,
			cursorGlyph: options.cursorGlyph ?? "▊",
			immediate,
		};
		this.isInteractive = !immediate;
	}

	/**
	 * Append a chunk of text or token to the typewriter buffer.
	 */
	append(chunk: string): void {
		this.buffer += chunk;
	}

	/**
	 * Stream all buffered text character-by-character or chunk-by-chunk to the callback.
	 */
	async flush(onOutput: (chunk: string) => void): Promise<void> {
		if (this.buffer.length === 0) return;

		if (this.options.immediate || !this.isInteractive) {
			onOutput(this.buffer);
			this.buffer = "";
			return;
		}

		const text = this.buffer;
		this.buffer = "";
		let index = 0;

		while (index < text.length) {
			const nextChunk = text.slice(index, index + this.options.charsPerTick);
			index += this.options.charsPerTick;

			const hasCursor = index < text.length && Boolean(this.options.cursorGlyph);
			onOutput(hasCursor ? `${nextChunk}${this.options.cursorGlyph}` : nextChunk);

			if (this.options.delayMs > 0) {
				await new Promise((resolve) => setTimeout(resolve, this.options.delayMs));
			}
		}
	}

	/**
	 * Retrieve remaining buffered text without streaming.
	 */
	drain(): string {
		const content = this.buffer;
		this.buffer = "";
		return content;
	}
}

/**
 * Format a token chunk with an optional trailing typewriter cursor glyph.
 */
export function formatTypewriterChunk(chunk: string, options: TypewriterOptions = {}): string {
	const cursor = options.cursorGlyph ?? "";
	return cursor ? `${chunk}${cursor}` : chunk;
}

/**
 * Stream a complete document or section text through the typewriter effect.
 */
export async function streamTypewriterText(
	text: string,
	onChunk: (chunk: string) => void,
	options: TypewriterOptions = {},
): Promise<void> {
	const stream = new TypewriterStream(options);
	stream.append(text);
	await stream.flush(onChunk);
}
