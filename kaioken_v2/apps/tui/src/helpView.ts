import { DIM, RESET, BOLD } from "./screen.js";

/**
 * The help view: the whole keyboard, on one screen, always one key away.
 *
 * Pure rendering — the shell shows it for `?` from any view and restores the
 * previous view on any key. Kept as data so tests assert on plain text.
 */
export function renderHelp(): string[] {
	const lines: string[] = [];
	lines.push(`${BOLD}Kaioken TUI — keys${RESET}`);
	lines.push("");
	const rows: Array<[string, string]> = [
		["1 / 2 / 3 / 4", "dashboard / search / chat / documents"],
		["tab", "next view"],
		["?", "this help (any view)"],
		["up / down", "scroll (lists and documents)"],
		["pgup / pgdn", "scroll by page"],
		["enter", "search / chat: send;  documents: open"],
		["esc", "back to dashboard (or close detail)"],
		["r", "reload dashboard data from disk"],
		["q", "quit (dashboard; ctrl-c works everywhere)"],
	];
	for (const [keys, description] of rows) {
		lines.push(`  ${keys.padEnd(16)} ${description}`);
	}
	lines.push("");
	lines.push(`${DIM}ctrl-c quits from anywhere, including mid-generation.${RESET}`);
	return lines;
}
