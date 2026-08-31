/**
 * The Kaioken palette, as ANSI.
 *
 * These are the v1 Go TUI's colours, role for role, taken from
 * `.kaioken_v1/cli/internal/tui/theme.go` and `palette.go`. They are not an
 * approximation: DESIGN.md §2.1 derives the web and desktop tokens from this
 * same ANSI-256 ramp so that moving between surfaces costs no re-learning, and
 * v1 is where the ramp was fixed.
 *
 * Roles, not colours, are what the rest of the TUI names. `fg("stale", …)`
 * survives a theme switch; `\x1b[38;5;203m` does not.
 */

/** A role → ANSI-256 code mapping. Every theme fills the same roles. */
export interface Palette {
	/** The composer prompt when idle. Purple, per v1. */
	prompt: string;
	/** Key hints and other quiet chrome. */
	hint: string;
	/** Success, additions, fresh modules, a saved key. */
	ok: string;
	/** Errors, deletions, timeouts, a missing key. */
	error: string;
	/** Warnings, approval prompts, auto-approve, the diff gutter. */
	warn: string;
	/** Muted secondary copy. */
	dim: string;
	/** The user's own words, links, query paths. */
	user: string;
	/** Assistant prose. */
	assistant: string;
	/** Tool invocations and inline code. */
	tool: string;
	/** Tool results and source references. */
	toolResult: string;
	/** Diff additions. */
	diffAdd: string;
	/** Diff deletions. */
	diffDel: string;
	/** The spinner. */
	spinner: string;
	/** The elapsed clock beside the spinner. */
	elapsed: string;
	/** Brand accent: the wordmark's warm end, panel headings, gutters. */
	accent: string;
	/** Structural rules and separators. */
	line: string;
	/** Keycap foreground and background. */
	keycapFg: string;
	keycapBg: string;
	/** Selection bar background. */
	selectionBg: string;
	/** Status bar background. */
	statusBg: string;
	/** Primary body text. */
	text: string;
	/** Muted copy, one step above `dim`. */
	muted: string;
}

/**
 * The three themes v1 shipped, with v1's values.
 *
 * `default` is the dark-terminal original. `light` exists because a palette
 * tuned for a near-black canvas is illegible on a white one, and
 * `highcontrast` because 256-colour ramps compress badly under some
 * accessibility settings. Config key: theme; switched at runtime with
 * `/theme <name>`.
 */
export const PALETTES: Record<string, Palette> = {
	default: {
		prompt: "63", hint: "240", ok: "42", error: "203", warn: "214", dim: "244",
		user: "117", assistant: "252", tool: "180", toolResult: "108",
		diffAdd: "42", diffDel: "203", spinner: "63", elapsed: "246",
		accent: "208", line: "236", keycapFg: "232", keycapBg: "214",
		selectionBg: "236", statusBg: "234", text: "252", muted: "244",
	},
	light: {
		prompt: "25", hint: "245", ok: "28", error: "196", warn: "208", dim: "240",
		user: "27", assistant: "235", tool: "130", toolResult: "22",
		diffAdd: "28", diffDel: "196", spinner: "25", elapsed: "240",
		accent: "166", line: "252", keycapFg: "231", keycapBg: "130",
		selectionBg: "254", statusBg: "253", text: "235", muted: "240",
	},
	highcontrast: {
		prompt: "51", hint: "250", ok: "46", error: "196", warn: "226", dim: "250",
		user: "195", assistant: "255", tool: "229", toolResult: "158",
		diffAdd: "46", diffDel: "196", spinner: "51", elapsed: "252",
		accent: "214", line: "250", keycapFg: "16", keycapBg: "226",
		selectionBg: "238", statusBg: "235", text: "255", muted: "250",
	},
};

export type Role = keyof Palette;

/** Stable order, so `/theme` with no argument lists them the same way twice. */
export const THEME_NAMES = ["default", "light", "highcontrast"];

const ESC = "\x1b";
export const RESET = `${ESC}[0m`;

let active: Palette = PALETTES.default as Palette;
let activeName = "default";

/**
 * Whether to emit colour at all.
 *
 * `NO_COLOR` is a cross-tool convention, and honouring it halfway — as this
 * did, for motion but not for colour — is worse than not honouring it: the
 * user asked for plain text and got escape codes anyway. Everything still
 * renders; it just renders without the escapes, which is what a pipe, a log
 * file and a screen reader all want.
 */
let coloured = true;

export function setColor(on: boolean): void {
	coloured = on;
}

export function colorEnabled(): boolean {
	return coloured;
}

export function colorFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.NO_COLOR) return false;
	if (env.KAIOKEN_NO_COLOR) return false;
	if (env.TERM === "dumb") return false;
	return true;
}

export function setTheme(name: string): boolean {
	const found = PALETTES[name];
	if (!found) return false;
	active = found;
	activeName = name;
	return true;
}

export function themeName(): string {
	return activeName;
}

export function palette(): Palette {
	return active;
}

export function fg(role: Role, text: string): string {
	if (!coloured) return text;
	return `${ESC}[38;5;${active[role]}m${text}${RESET}`;
}

export function bg(role: Role, text: string): string {
	if (!coloured) return text;
	return `${ESC}[48;5;${active[role]}m${text}${RESET}`;
}

export function bold(text: string): string {
	if (!coloured) return text;
	return `${ESC}[1m${text}${RESET}`;
}

export function dim(text: string): string {
	if (!coloured) return text;
	return `${ESC}[2m${text}${RESET}`;
}

export function italic(text: string): string {
	if (!coloured) return text;
	return `${ESC}[3m${text}${RESET}`;
}

export function underline(text: string): string {
	if (!coloured) return text;
	return `${ESC}[4m${text}${RESET}`;
}

/** Only the markdown theme asks for this; nothing else in the TUI does. */
export function strikethrough(text: string): string {
	if (!coloured) return text;
	return `${ESC}[9m${text}${RESET}`;
}

/**
 * A keycap: the label of a key the user can press right now.
 *
 * Dark text on amber, as in v1 — a filled cap reads as pressable at a glance
 * where bracketed text reads as punctuation.
 */
export function keycap(label: string): string {
	if (!coloured) return `[${label}]`;
	return `${ESC}[48;5;${active.keycapBg}m${ESC}[38;5;${active.keycapFg}m${ESC}[1m ${label} ${RESET}`;
}

/**
 * The section gutter, `▎`, and the heavier selection bar, `▌`.
 *
 * They were the same glyph once, which meant a list's own header read as a
 * selected row. Weight is the distinction: a section marker is structure, a
 * selected row is where you are.
 */
export const GUTTER = "▎";
export const SELECTION = "▌";

/** The block gutter v1 draws down the left of a proposed diff. */
export const DIFF_GUTTER = "│ ";

/**
 * A section eyebrow: `▎ 01 · REPOSITORY`, or `▎ SEARCH` where there is
 * nothing to number.
 *
 * DESIGN.md's `section-eyebrow` token. Where a screen has several blocks the
 * numbering fixes a reading order that survives one of them collapsing to a
 * single line; a screen with one block has no order to fix, so it gets the
 * bare label rather than a placeholder where the number would be.
 */
export function eyebrow(title: string, index?: string): string {
	const label = bold(fg("accent", title));
	return index ? `${fg("accent", GUTTER)} ${dim(index)} ${dim("·")} ${label}` : `${fg("accent", GUTTER)} ${label}`;
}

/** Strip every escape sequence. Tests assert on what a human would read. */
export function stripAnsi(text: string): string {
	// biome-ignore lint: the control characters are the point.
	return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}
