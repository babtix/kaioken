import { pad, DIM, REVERSE, RESET } from "./screen.js";

/**
 * The status bar: one reversed line at the bottom of every frame.
 *
 * It is the TUI's constant answer to "where am I and what can I press" —
 * view name left, context hints middle, root right. The shell renders it;
 * views never do, so hints cannot drift per-view.
 */
export interface StatusBarData {
	view: string;
	/** Short context line, e.g. the search query being typed. */
	context?: string;
	root: string;
}

export function renderStatusBar(data: StatusBarData, cols: number): string {
	const left = ` ${data.view} `;
	const middle = data.context ? ` ${data.context} ` : "";
	const rootName = data.root.split(/[\\/]/).filter(Boolean).pop() ?? data.root;
	const right = ` ${rootName} `;
	const room = Math.max(0, cols - left.length - middle.length - right.length);
	return `${REVERSE}${left}${middle}${DIM}${" ".repeat(room)}${RESET}${right}${RESET}`;
}

export function padHelper(text: string, width: number): string {
	return pad(text, width);
}

void REVERSE;
