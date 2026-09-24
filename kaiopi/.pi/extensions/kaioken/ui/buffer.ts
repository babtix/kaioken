/**
 * Anti-flicker double-buffering terminal render pass and synchronized frame updater.
 *
 * Implements Features #UX-0021 – #UX-0030.
 *
 * Prevents screen flicker and tearing during rapid terminal animations (spinners,
 * live log streams, and progress meters) by:
 * 1. Maintaining front and back visual line buffers
 * 2. Emitting only localized deltas (cursor addressing + line writes) rather than full clears
 * 3. Wrapping updates in DEC Mode 2026 synchronized output escapes when available
 */

export interface BufferFrameDelta {
	deltaAnsi: string;
	changedLines: number;
	totalLines: number;
}

export class DoubleBufferRenderer {
	private frontBuffer: string[] = [];
	private backBuffer: string[] = [];
	private width: number;
	private height: number;
	private enableSyncOutput: boolean;

	constructor(width = 80, height = 24, enableSyncOutput = true) {
		this.width = width;
		this.height = height;
		this.enableSyncOutput = enableSyncOutput;
		this.reset();
	}

	resize(width: number, height: number): void {
		this.width = Math.max(1, width);
		this.height = Math.max(1, height);
		// Force full repaint on resize
		this.frontBuffer = [];
	}

	reset(): void {
		this.frontBuffer = [];
		this.backBuffer = [];
	}

	getFrontBuffer(): readonly string[] {
		return this.frontBuffer;
	}

	/**
	 * Takes the desired new frame content and computes the minimal ANSI escape sequence
	 * required to update the terminal without flickering.
	 */
	render(lines: readonly string[]): BufferFrameDelta {
		const targetHeight = Math.min(this.height, lines.length);
		this.backBuffer = lines.slice(0, targetHeight);

		let changedLines = 0;
		let delta = "";

		const maxLines = Math.max(this.frontBuffer.length, this.backBuffer.length);

		for (let i = 0; i < maxLines; i++) {
			const front = this.frontBuffer[i];
			const back = this.backBuffer[i];

			if (front !== back) {
				changedLines++;
				const row = i + 1;
				// Move to row, column 1, clear line, write new content
				delta += `\x1b[${row};1H\x1b[2K${back ?? ""}`;
			}
		}

		// Update front buffer
		this.frontBuffer = [...this.backBuffer];

		// If no lines changed, return empty
		if (changedLines === 0) {
			return { deltaAnsi: "", changedLines: 0, totalLines: this.frontBuffer.length };
		}

		// Wrap with synchronized update escapes (DEC Mode 2026) to eliminate tearing
		const wrappedAnsi = this.enableSyncOutput
			? `\x1b[?2026h${delta}\x1b[?2026l`
			: delta;

		return {
			deltaAnsi: wrappedAnsi,
			changedLines,
			totalLines: this.frontBuffer.length,
		};
	}
}
