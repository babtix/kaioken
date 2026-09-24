/**
 * One-click copy-to-clipboard code snippet action and OSC 52 terminal copy utility.
 *
 * Implements Features #UX-0121 – #UX-0130.
 *
 * Provides instant code snippet formatting and copying directly from TUI/terminal
 * environments using ANSI OSC 52 sequences, ensuring clean text without escape codes
 * or line number artifacts.
 */

import { Box, Text } from "@earendil-works/pi-tui";
import type { PaintTheme } from "../ui/theme.ts";

const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;

export function stripAnsi(text: string): string {
	return text.replace(ANSI_REGEX, "");
}

/**
 * Generates an ANSI OSC 52 escape sequence that copies text to the system clipboard
 * across compatible terminals (SSH, tmux, Windows Terminal, iTerm2, Alacritty, Kitty).
 */
export function osc52Copy(text: string): string {
	const clean = stripAnsi(text);
	const base64 = Buffer.from(clean, "utf-8").toString("base64");
	return `\x1b]52;c;${base64}\x07`;
}

export function copySnippetAction(code: string): { clean: string; osc52: string } {
	const clean = stripAnsi(code);
	return {
		clean,
		osc52: osc52Copy(clean),
	};
}

export function renderCodeSnippet(
	code: string,
	language = "text",
	options: { showLineNumbers?: boolean; showCopyAction?: boolean } = {},
	theme?: PaintTheme,
): Box {
	const fg = (token: any, text: string) => (theme?.fg ? theme.fg(token, text) : text);
	const bold = (text: string) => (theme?.bold ? theme.bold(text) : text);

	const showLineNumbers = options.showLineNumbers ?? true;
	const showCopy = options.showCopyAction ?? true;

	const rawLines = code.split(/\r?\n/);
	const totalLines = rawLines.length;
	const padWidth = String(totalLines).length;

	const headerParts: string[] = [
		bold(fg("accent", `[${language}]`)),
	];

	if (showCopy) {
		headerParts.push(fg("mdLink", "[📋 click / press 'c' to copy]"));
	}

	const lines: string[] = [headerParts.join(" "), fg("border", "─".repeat(50))];

	for (let i = 0; i < totalLines; i++) {
		const lineNum = String(i + 1).padStart(padWidth, " ");
		const prefix = showLineNumbers ? fg("dim", `${lineNum} │ `) : "";
		lines.push(`${prefix}${rawLines[i] ?? ""}`);
	}

	lines.push(fg("border", "─".repeat(50)));

	const box = new Box(1, 0);
	box.addChild(new Text(lines.join("\n"), 0, 0));
	return box;
}
