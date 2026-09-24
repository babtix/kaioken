/**
 * Visual Keyboard Cheat-Sheet Overlay Displaying Shortcuts.
 *
 * Implements Step 20.5 (Category 04: #UX-0341 - #UX-0350).
 * Renders an elegant categorized keyboard reference card with
 * TrueColor/ASCII fallback, responsive formatting, and quick dismissal.
 */

import { supportsUnicode } from "./glyphs.ts";
import { truncateAnsi, visibleWidth } from "./reflow.ts";

export interface ShortcutEntry {
	key: string;
	description: string;
	scope?: string;
}

export interface CheatSheetSection {
	title: string;
	shortcuts: ShortcutEntry[];
}

export const DEFAULT_CHEAT_SHEET_SECTIONS: CheatSheetSection[] = [
	{
		title: "Navigation (Vim Mode)",
		shortcuts: [
			{ key: "j / ↓", description: "Move down one item / wrap at end" },
			{ key: "k / ↑", description: "Move up one item / wrap at start" },
			{ key: "g / Home", description: "Jump to first item in list" },
			{ key: "G / End", description: "Jump to last item in list" },
			{ key: "Ctrl+D / PgDn", description: "Scroll down half page" },
			{ key: "Ctrl+U / PgUp", description: "Scroll up half page" },
		],
	},
	{
		title: "Global Panes & Toggles",
		shortcuts: [
			{ key: "Ctrl+H / F2", description: "Toggle telemetry HUD sparklines" },
			{ key: "Ctrl+B / F3", description: "Toggle side drawer / inspector" },
			{ key: "Ctrl+P", description: "Open fuzzy command palette" },
			{ key: "? / F1", description: "Show this keyboard cheat-sheet" },
		],
	},
	{
		title: "Context Actions & Selection",
		shortcuts: [
			{ key: "Alt+Enter", description: "Contextual quick-action menu on symbols & cards" },
			{ key: "1 - 9", description: "Trigger action directly by number" },
			{ key: "Enter", description: "Confirm selection / execute action" },
			{ key: "Esc / Ctrl+C", description: "Dismiss active modal / cancel selection" },
		],
	},
	{
		title: "Search & Filtering",
		shortcuts: [
			{ key: "/", description: "Filter slash command list" },
			{ key: "Tab", description: "Cycle autocomplete suggestions" },
			{ key: "Backspace", description: "Delete query character" },
		],
	},
	{
		title: "GitOps & Worktree",
		shortcuts: [
			{ key: "Ctrl+G", description: "Worktree task switcher" },
			{ key: "Alt+D", description: "Review unified diff chunks" },
		],
	},
];

export class KeyboardCheatSheet {
	private sections: CheatSheetSection[];
	private isOpen = true;
	private scrollOffset = 0;

	constructor(sections: CheatSheetSection[] = DEFAULT_CHEAT_SHEET_SECTIONS) {
		this.sections = sections;
	}

	isOpenSheet(): boolean {
		return this.isOpen;
	}

	open(): void {
		this.isOpen = true;
		this.scrollOffset = 0;
	}

	close(): void {
		this.isOpen = false;
	}

	handleKey(keyData: string): { closed?: boolean; render?: boolean } {
		if (!this.isOpen) return {};

		if (keyData === "\x1b" || keyData === "escape" || keyData === "q" || keyData === "?") {
			this.close();
			return { closed: true, render: true };
		}

		if (keyData === "j" || keyData === "\x1b[B" || keyData === "down") {
			this.scrollOffset++;
			return { render: true };
		}

		if (keyData === "k" || keyData === "\x1b[A" || keyData === "up") {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
			return { render: true };
		}

		return {};
	}

	render(width = 80, height = 30): string[] {
		const lines: string[] = [];
		const useUni = supportsUnicode();
		const tl = useUni ? "┌" : "+";
		const tr = useUni ? "┐" : "+";
		const bl = useUni ? "└" : "+";
		const br = useUni ? "┘" : "+";
		const hz = useUni ? "─" : "-";
		const vt = useUni ? "│" : "|";

		const innerW = Math.max(40, width - 4);
		const borderHz = hz.repeat(innerW);

		// Header
		lines.push(`${tl}${borderHz}${tr}`);
		const title = " ⌨  KAIOKEN KEYBOARD SHORTCUTS & ERGONOMICS ";
		const centeredTitle = title.padStart((innerW + title.length) / 2).padEnd(innerW);
		lines.push(`${vt}${centeredTitle}${vt}`);
		lines.push(`${vt}${borderHz}${vt}`);

		// Content rows
		const contentRows: string[] = [];
		for (const section of this.sections) {
			contentRows.push(` \x1b[1;38;5;208m${section.title}\x1b[0m`);
			for (const sc of section.shortcuts) {
				const keyPill = `  [${sc.key}]`.padEnd(20);
				const desc = sc.description;
				contentRows.push(`${keyPill} ${desc}`);
			}
			contentRows.push("");
		}

		// Paginate / scroll if constrained
		const visibleRowCount = Math.max(5, height - 7);
		const startRow = Math.min(this.scrollOffset, Math.max(0, contentRows.length - visibleRowCount));
		const endRow = Math.min(startRow + visibleRowCount, contentRows.length);

		for (let i = startRow; i < endRow; i++) {
			const row = contentRows[i] ?? "";
			lines.push(`${vt} ${truncateAnsi(row.padEnd(innerW - 2), innerW - 2)} ${vt}`);
		}

		// Footer
		lines.push(`${vt}${borderHz}${vt}`);
		const footer = " [j/k] Scroll  [Esc / q / ?] Close Cheat-Sheet";
		lines.push(`${vt} ${truncateAnsi(footer.padEnd(innerW - 2), innerW - 2)} ${vt}`);
		lines.push(`${bl}${borderHz}${br}`);

		return lines;
	}
}
