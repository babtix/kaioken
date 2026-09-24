/**
 * Auto-scrolling lock-to-bottom toggle with mouse wheel pause and status telemetry.
 *
 * Implements Features #UX-0131 – #UX-0140.
 *
 * Manages chat transcript follow behavior:
 * - Automatically keeps transcript pinned to bottom during streaming output
 * - Pauses follow immediately when the user scrolls upwards with mouse wheel or keys
 * - Resumes follow when user scrolls back to bottom or explicitly presses hotkey
 * - Provides visual telemetry pill showing current follow/paused state
 */

import { Box, Text } from "@earendil-works/pi-tui";
import type { PaintTheme } from "../ui/theme.ts";

export interface ScrollState {
	isLocked: boolean;
	pausedByWheel: boolean;
	currentOffset: number;
	maxOffset: number;
}

export class AutoScrollController {
	private isLocked: boolean;
	private pausedByWheel: boolean;
	private currentOffset: number;
	private maxOffset: number;

	constructor(initLocked = true) {
		this.isLocked = initLocked;
		this.pausedByWheel = false;
		this.currentOffset = 0;
		this.maxOffset = 0;
	}

	getState(): ScrollState {
		return {
			isLocked: this.isLocked,
			pausedByWheel: this.pausedByWheel,
			currentOffset: this.currentOffset,
			maxOffset: this.maxOffset,
		};
	}

	updateBounds(current: number, max: number): void {
		this.currentOffset = Math.max(0, current);
		this.maxOffset = Math.max(0, max);
		if (this.currentOffset >= this.maxOffset) {
			this.isLocked = true;
			this.pausedByWheel = false;
		}
	}

	onWheel(deltaY: number): void {
		if (deltaY < 0) {
			// Scrolled up
			this.isLocked = false;
			this.pausedByWheel = true;
			this.currentOffset = Math.max(0, this.currentOffset + deltaY);
		} else if (deltaY > 0) {
			// Scrolled down
			this.currentOffset = Math.min(this.maxOffset, this.currentOffset + deltaY);
			if (this.currentOffset >= this.maxOffset) {
				this.isLocked = true;
				this.pausedByWheel = false;
			}
		}
	}

	onUserScrollUp(): void {
		this.isLocked = false;
		this.pausedByWheel = true;
	}

	onUserScrollBottom(): void {
		this.isLocked = true;
		this.pausedByWheel = false;
		this.currentOffset = this.maxOffset;
	}

	toggleLock(): boolean {
		this.isLocked = !this.isLocked;
		if (this.isLocked) {
			this.pausedByWheel = false;
			this.currentOffset = this.maxOffset;
		}
		return this.isLocked;
	}

	resume(): void {
		this.isLocked = true;
		this.pausedByWheel = false;
		this.currentOffset = this.maxOffset;
	}

	renderStatus(theme?: PaintTheme): string {
		const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);

		if (this.isLocked) {
			return fg("success", "[▼ auto-scroll: active]");
		}
		if (this.pausedByWheel) {
			return `${fg("warning", "[⏸ auto-scroll: paused]")} ${fg("dim", "(scroll down or press G to resume)")}`;
		}
		return fg("dim", "[▽ auto-scroll: off]");
	}

	renderWidget(theme?: PaintTheme): Box {
		const box = new Box(1, 0);
		box.addChild(new Text(this.renderStatus(theme), 0, 0));
		return box;
	}
}
