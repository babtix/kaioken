import { truncate, visibleWidth } from "./screen.js";
import { bold, colorEnabled, dim, fg, palette, SELECTION } from "./theme.js";
import { filterCommands, type Command } from "./commands.js";

/**
 * The composer frame and the slash-command palette.
 *
 * The editing itself belongs to pi-tui's `Editor` — multiline, kill-ring,
 * undo, bracketed paste, history recall on ↑/↓ from the first line. This file
 * owns everything around it: the prompt glyph that carries the current mode,
 * the filtered command menu that opens on `/`, and the hint row.
 *
 * All of it is pure: lines in, lines out. The editor hands over its rendered
 * lines and gets back a framed block, which is what keeps the composer
 * testable without a terminal even though the editor itself needs one.
 */

/** The completion menu's state. */
export interface PaletteState {
	active: boolean;
	items: Command[];
	selected: number;
	/** First visible row, for scrolling past `MAX_PALETTE_ROWS`. */
	offset: number;
	/**
	 * The composer value at which the menu was closed with esc or tab, so it
	 * stays closed until the input actually changes again.
	 */
	dismissed: string;
}

/** How many entries are visible at once. */
export const MAX_PALETTE_ROWS = 8;

export function emptyPalette(): PaletteState {
	return { active: false, items: [], selected: 0, offset: 0, dismissed: "" };
}

/**
 * Recompute the palette from the composer's current contents.
 *
 * The menu only appears while the command NAME is being typed. Once there is a
 * space the user is writing arguments, and a menu that keeps filtering on the
 * whole line would flicker in and out under them — the v1 TUI learned this and
 * the rule is worth carrying forward verbatim.
 */
export function refreshPalette(state: PaletteState, value: string, commands: readonly Command[]): void {
	state.active = false;
	state.items = [];
	if (!value.startsWith("/")) {
		state.dismissed = "";
		return;
	}
	if (/[\s]/.test(value)) return;
	if (value === state.dismissed) return;
	state.dismissed = "";

	state.items = filterCommands(value.slice(1), commands);
	state.active = state.items.length > 0;
	if (state.selected >= state.items.length) state.selected = 0;
	clampPalette(state);
}

export function clampPalette(state: PaletteState): void {
	if (state.selected < state.offset) state.offset = state.selected;
	if (state.selected >= state.offset + MAX_PALETTE_ROWS) {
		state.offset = state.selected - MAX_PALETTE_ROWS + 1;
	}
	if (state.offset < 0) state.offset = 0;
}

/** Step the selection, wrapping at both ends so ↑ from the top reaches the end. */
export function movePalette(state: PaletteState, delta: number): void {
	if (state.items.length === 0) return;
	state.selected = (state.selected + delta + state.items.length) % state.items.length;
	clampPalette(state);
}

export function paletteHeight(state: PaletteState): number {
	if (!state.active) return 0;
	return Math.min(state.items.length, MAX_PALETTE_ROWS) + 1;
}

/**
 * Render the menu above the composer.
 *
 * The selected row is a filled bar across the full width rather than bolder
 * text: the eye finds a block far faster than a weight change, and a bar that
 * stops at the end of the summary reads as ragged rather than selected.
 */
export function renderPalette(state: PaletteState, width: number): string[] {
	if (!state.active) return [];
	const end = Math.min(state.offset + MAX_PALETTE_ROWS, state.items.length);
	const visible = state.items.slice(state.offset, end);

	let column = 0;
	for (const command of visible) {
		column = Math.max(column, command.name.length + (command.args ?? "").length + 2);
	}

	const lines: string[] = [];
	for (let i = 0; i < visible.length; i++) {
		const command = visible[i] as Command;
		const selected = state.offset + i === state.selected;
		const name = `/${command.name}`;
		const plain = command.args ? `${name} ${command.args}` : name;
		const gap = " ".repeat(Math.max(column - plain.length + 2, 1));

		if (!selected) {
			const row = ` ${fg("user", name)}${command.args ? ` ${fg("dim", command.args)}` : ""}${gap}${dim(command.summary)}`;
			lines.push(truncate(row, width));
			continue;
		}
		const body = `${bold(fg("warn", name))}${command.args ? fg("dim", ` ${command.args}`) : ""}${gap}${fg("text", command.summary)}`;
		lines.push(barRow(`${fg("accent", SELECTION)}${body}`, width));
	}

	const position = state.items.length > MAX_PALETTE_ROWS ? `${state.selected + 1}/${state.items.length}  ` : "";
	lines.push(truncate(dim(`  ${position}↑↓ move · tab complete · enter run · esc close`), width));
	return lines;
}

/**
 * The composer itself: a gutter, the editor's own lines, and a hint row.
 *
 * The prompt glyph carries the mode — idle, busy, auto-approve — so the state
 * is visible where the eye already is, not only at the far end of the status
 * bar. Hermes does the same thing with its `⚕` and it works.
 */
export interface ComposerChrome {
	busy: boolean;
	autoApprove: boolean;
	/** Shown in place of the editor's content while it is empty. */
	placeholder: string;
	empty: boolean;
	/** Direct powershell / shell execution mode. */
	shell?: boolean;
}

export function promptGlyph(chrome: ComposerChrome): string {
	if (chrome.shell) return `${bold(fg("warn", "! powershell"))} ${bold(fg("prompt", "›"))}`;
	if (chrome.busy) return bold(fg("hint", "›"));
	if (chrome.autoApprove) return bold(fg("warn", "›"));
	return bold(fg("prompt", "›"));
}

/**
 * Frame the editor's rendered lines.
 *
 * The editor brackets its content with horizontal rules of its own. The top
 * one earns its place — it is the seam between the transcript and the input,
 * which both reference TUIs draw — but the bottom one only repeats the
 * separation the hint row already provides, so it goes.
 *
 * The glyph belongs beside the first line of *text*, not on the rule above it.
 * Continuation rows get an aligned blank, so a pasted three-line prompt reads
 * as one block rather than three separate prompts.
 */
export function renderComposer(editorLines: readonly string[], chrome: ComposerChrome, width: number): string[] {
	const glyph = promptGlyph(chrome);
	const source = chrome.empty && !chrome.busy ? [dim(chrome.placeholder)] : [...editorLines];
	if (source.length === 0) source.push("");

	const indent = " ".repeat(visibleWidth(glyph) + 1);
	const lines: string[] = [];
	let seenText = false;
	for (let i = 0; i < source.length; i++) {
		const line = source[i] as string;
		if (isRule(line)) {
			// Leading rules are the seam; trailing ones are noise.
			if (!seenText) {
				if (chrome.shell) {
					const label = " ! powershell ";
					const right = "─".repeat(Math.max(0, width - 2 - label.length));
					lines.push(truncate(`${fg("warn", "──")}${bold(fg("warn", label))}${fg("warn", right)}`, width));
				} else {
					lines.push(truncate(line, width));
				}
			}
			continue;
		}
		const lead = seenText ? indent : `${glyph} `;
		seenText = true;
		lines.push(truncate(`${lead}${line}`, width));
	}
	return lines.length > 0 ? lines : [truncate(`${glyph} `, width)];
}

/**
 * Whether a rendered row is one of the editor's own horizontal rules.
 *
 * Detected from the glyphs rather than from a row index because the editor
 * decides how many rows it needs; hard-coding "the first row is a border"
 * puts the prompt glyph on the rule the moment that changes.
 */
function isRule(line: string): boolean {
	const bare = stripEscapes(line).trim();
	return bare.length > 0 && /^[─━┄┈╌\s]+$/.test(bare);
}

function stripEscapes(text: string): string {
	// biome-ignore lint: matching escape sequences is the whole job.
	return text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

/** Paint a row across the full width on the selection ground. */
function barRow(content: string, width: number): string {
	const clipped = truncate(content, width);
	// The bar's background is written raw, so it owes the colour switch the
	// same check the gradient in logo.ts makes.
	if (!colorEnabled()) return clipped;
	const fill = " ".repeat(Math.max(0, width - visibleWidth(clipped)));
	return `\x1b[48;5;${palette().selectionBg}m${clipped}${fill}\x1b[0m`;
}
