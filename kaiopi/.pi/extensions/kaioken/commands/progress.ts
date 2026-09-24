/**
 * In-place live-updating progress cards with sub-phase spinners and status tracking.
 *
 * Implements Features #UX-0101 – #UX-0110.
 *
 * Provides real-time visual progress rendering for long-running workflows:
 * - Animated multi-frame spinners (braille with ASCII fallback)
 * - Visual progress bar with percentage and step indicators
 * - Multi-stage subtask progress tracking
 * - Theme-aware TUI Box/Text and ANSI line renderers
 */

import { Box, Text } from "@earendil-works/pi-tui";
import { getSpinnerFrame, resolveGlyph } from "../ui/glyphs.ts";
import type { PaintTheme } from "../ui/theme.ts";

export type ProgressStatus = "running" | "done" | "error" | "paused";

export interface SubTask {
	name: string;
	status: "pending" | "running" | "done" | "error";
	detail?: string;
}

export interface ProgressState {
	scope: string;
	title: string;
	phase: string;
	subphase?: string;
	current?: number;
	total?: number;
	status: ProgressStatus;
	subtasks?: SubTask[];
	elapsedMs?: number;
}

export function renderProgressBar(
	current: number,
	total: number,
	width = 20,
	unicode = true,
): string {
	if (total <= 0) return "";
	const safeCurrent = Math.max(0, Math.min(total, current));
	const ratio = safeCurrent / total;
	const filledChars = Math.round(ratio * width);
	const emptyChars = width - filledChars;

	const fullGlyph = unicode ? "█" : "#";
	const emptyGlyph = unicode ? "░" : "-";

	const bar = `${fullGlyph.repeat(filledChars)}${emptyGlyph.repeat(emptyChars)}`;
	const pct = Math.round(ratio * 100);
	return `[${bar}] ${pct}% (${safeCurrent}/${total})`;
}

export function renderProgressCard(
	state: ProgressState,
	options: { expanded?: boolean; frame?: number; unicode?: boolean } = {},
	theme?: PaintTheme,
): Box {
	const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);
	const bold = (text: string) => (theme?.bold ? theme.bold(text) : text);

	const frame = options.frame ?? 0;
	const unicode = options.unicode ?? true;

	let statusIcon = "";
	let statusColor = "accent";

	switch (state.status) {
		case "running":
			statusIcon = getSpinnerFrame(frame, unicode);
			statusColor = "accent";
			break;
		case "done":
			statusIcon = resolveGlyph("ok", unicode);
			statusColor = "success";
			break;
		case "error":
			statusIcon = resolveGlyph("fail", unicode);
			statusColor = "error";
			break;
		case "paused":
			statusIcon = "⏸";
			statusColor = "warning";
			break;
	}

	const badge = fg("accent", `[${state.scope}]`);
	const headerLine = `${fg(statusColor, statusIcon)} ${badge} ${bold(state.title)} · ${fg("dim", state.phase)}`;

	const lines: string[] = [headerLine];

	if (state.subphase) {
		lines.push(`   ${fg("dim", "↳")} ${state.subphase}`);
	}

	if (state.current !== undefined && state.total !== undefined && state.total > 0) {
		const bar = renderProgressBar(state.current, state.total, 20, unicode);
		lines.push(`   ${fg("accent", bar)}`);
	}

	if (options.expanded && state.subtasks && state.subtasks.length > 0) {
		lines.push("");
		for (const task of state.subtasks) {
			let taskIcon = "○";
			let taskColor = "dim";
			if (task.status === "running") {
				taskIcon = getSpinnerFrame(frame, unicode);
				taskColor = "accent";
			} else if (task.status === "done") {
				taskIcon = resolveGlyph("ok", unicode);
				taskColor = "success";
			} else if (task.status === "error") {
				taskIcon = resolveGlyph("fail", unicode);
				taskColor = "error";
			}
			const taskDetail = task.detail ? fg("dim", ` (${task.detail})`) : "";
			lines.push(`     ${fg(taskColor, taskIcon)} ${task.name}${taskDetail}`);
		}
	}

	if (state.elapsedMs !== undefined && options.expanded) {
		const sec = (state.elapsedMs / 1000).toFixed(1);
		lines.push(`   ${fg("dim", `Time elapsed: ${sec}s`)}`);
	}

	const box = new Box(1, 0);
	box.addChild(new Text(lines.join("\n"), 0, 0));
	return box;
}
