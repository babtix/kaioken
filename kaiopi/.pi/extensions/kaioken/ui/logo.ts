/**
 * The KAIOKEN wordmark.
 *
 * Ported from the v2 TUI (`kaioken_v2/apps/tui/src/logo.ts`), which was itself
 * ported from the v1 Go TUI, so all three generations are visibly the same
 * product: block glyphs under a diagonal amber→red gradient on the left, a
 * neofetch-style `kaioken@<repo>` panel on the right, a rule, and one line
 * telling you what to do next.
 *
 * Pure: data in, styled lines out. Nothing here touches the terminal, which is
 * what lets every frame be asserted in a test.
 */
import { bold, dim, fg, type Painter } from "./theme.ts";
import { chargeOffset, revealedRows } from "./motion.ts";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;

/** The 6-row "ANSI Shadow" block glyphs, one entry per letter of the word. */
const LETTERS: Record<string, readonly string[]> = {
	K: ["██╗  ██╗", "██║ ██╔╝", "█████╔╝ ", "██╔═██╗ ", "██║  ██╗", "╚═╝  ╚═╝"],
	A: [" █████╗ ", "██╔══██╗", "███████║", "██╔══██║", "██║  ██║", "╚═╝  ╚═╝"],
	I: ["██╗", "██║", "██║", "██║", "██║", "╚═╝"],
	O: [" ██████╗ ", "██╔═══██╗", "██║   ██║", "██║   ██║", "╚██████╔╝", " ╚═════╝ "],
	E: ["███████╗", "██╔════╝", "█████╗  ", "██╔══╝  ", "███████╗", "╚══════╝"],
	N: ["███╗   ██╗", "████╗  ██║", "██╔██╗ ██║", "██║╚██╗██║", "██║ ╚████║", "╚═╝  ╚═══╝"],
};

const WORD = "KAIOKEN";
const ROWS = 6;

/**
 * The diagonal gradient ramp, amber at the low end and red at the high end.
 * The last three entries repeat so the hot corner saturates rather than
 * fading back through orange.
 *
 * These are raw 256-colour codes rather than theme roles, because the wordmark
 * is brand art and not themed text — the same exception v2 made, and the same
 * one it pays for by checking the colour switch itself.
 */
const RAMP = ["214", "208", "202", "196", "196", "196"];

/** The width the block art needs. */
export const LOGO_WIDTH = 54;

/**
 * Gradient index for a letter column and glyph row: up and right runs hot.
 *
 * `offset` shifts the whole ramp toward the cool end, which is what makes the
 * wordmark look like it is charging up during the entrance. At rest it is zero
 * and the gradient is the fixed diagonal v1 shipped.
 */
function rampColor(col: number, row: number, offset = 0): string {
	const maxCol = WORD.length - 1;
	const maxRow = ROWS - 1;
	const t =
		Math.floor(((col + (maxRow - row)) * (RAMP.length - 1)) / (maxCol + maxRow)) - offset;
	return RAMP[Math.min(RAMP.length - 1, Math.max(0, t))] as string;
}

/** The wordmark without colour, for files and non-TTY output. */
export function logoPlain(): string[] {
	const rows: string[] = new Array(ROWS).fill("");
	for (const ch of WORD) {
		const glyph = LETTERS[ch];
		if (!glyph) continue;
		for (let i = 0; i < ROWS; i++) rows[i] = `${rows[i] ?? ""}${glyph[i] ?? ""}`;
	}
	return rows;
}

/**
 * The wordmark, gradient-coloured and fitted to the terminal.
 *
 * Below the art's natural width there is no honest way to shrink block glyphs,
 * so a narrow terminal gets a bold one-liner instead of a mangled banner.
 */
export function renderLogo(paint: Painter, width: number, elapsedMs?: number): string[] {
	if (width > 0 && width < LOGO_WIDTH + 2) {
		return [bold(paint, fg(paint, "accent", WORD))];
	}
	if (!paint.colored) return logoPlain();

	const offset = elapsedMs === undefined ? 0 : chargeOffset(elapsedMs);
	const rows: string[] = new Array(ROWS).fill("");
	const chars = [...WORD];
	for (let col = 0; col < chars.length; col++) {
		const glyph = LETTERS[chars[col] as string];
		if (!glyph) continue;
		for (let row = 0; row < ROWS; row++) {
			rows[row] = `${rows[row] ?? ""}${ESC}[38;5;${rampColor(col, row, offset)}m${glyph[row]}${RESET}`;
		}
	}
	return rows;
}

/**
 * The keys worth knowing, in the order you meet them.
 *
 * Sending first, then editing, then moving around. Three rows because that is
 * what the wordmark leaves beside a full panel, and every row is kept inside
 * the art's own width so the block stays rectangular.
 *
 * These are Pi's own bindings, not v2's — the legend is only worth printing if
 * it is true for the shell you are actually in.
 */
export function keyLegend(paint: Painter): string[] {
	const rows: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
		[
			["enter", "send"],
			["alt+enter", "newline"],
			["/", "commands"],
		],
		[
			["tab", "complete"],
			["↑↓", "history"],
			["ctrl+c", "twice to quit"],
		],
	];
	return rows.map((row) =>
		row
			.map(([key, what]) => `${fg(paint, "accent", key)} ${dim(paint, what)}`)
			.join(dim(paint, "  ·  ")),
	);
}

/** What the header panel reports. Everything is a string so it renders as-is. */
export interface HeaderInfo {
	version: string;
	repo: string;
	model: string;
	provider: string;
	hasKey: boolean;
	/** What this repository already has. Rows appear only when it has any. */
	knowledge?: RepoState;
}

/** What `.kaioken/` currently holds, for the one row that reports it. */
export interface RepoState {
	files?: number;
	documents?: number;
	cards?: number;
	branch?: string;
	/** Share of documents still matching their sources, 0..1. */
	freshness?: number;
	/** Documents whose sources have changed. */
	stale?: number;
}

export function isEmpty(state: RepoState): boolean {
	return !state.files && !state.documents && !state.cards && state.freshness === undefined;
}

/**
 * The right-hand info block: `kaioken@<repo>`, a rule, then aligned fields.
 *
 * The knowledge row is the one thing a stock header could never say, and the
 * question the tool exists to answer. It is always worth a row, because
 * "nothing yet" is the answer that most needs acting on.
 */
export function statusPanel(paint: Painter, info: HeaderInfo): string[] {
	const heading = `kaioken@${repoLabel(info.repo)}`;
	const key = info.hasKey ? fg(paint, "ok", "saved ✓") : fg(paint, "error", "not set");

	const rows: Array<readonly [string, string]> = [
		["Version", info.version],
		["Repo", shortPath(info.repo)],
	];
	if (info.knowledge?.branch) rows.push(["Branch", fg(paint, "user", info.knowledge.branch)]);
	rows.push(
		["Model", displayModel(info.model, info.provider) || dim(paint, "(none)")],
		["Provider", info.provider || dim(paint, "(none)")],
		["API Key", key],
	);
	if (info.knowledge) rows.push(["Knowledge", knowledgeSummary(paint, info.knowledge)]);

	return [
		bold(paint, fg(paint, "accent", heading)),
		dim(paint, "─".repeat([...heading].length)),
		...kv(paint, rows),
	];
}

/** The knowledge row: what exists, and whether it is still true. */
export function knowledgeSummary(paint: Painter, state: RepoState): string {
	if (isEmpty(state)) {
		return `${dim(paint, "nothing generated yet —")} ${fg(paint, "accent", "/kaio-wiki")}`;
	}

	const parts: string[] = [];
	if (state.files) parts.push(dim(paint, `${state.files} files`));
	if (state.documents) parts.push(`${state.documents} ${dim(paint, "docs")}`);
	if (state.cards) parts.push(`${state.cards} ${dim(paint, "cards")}`);

	if (state.freshness !== undefined) {
		const pct = Math.round(state.freshness * 100);
		const role = pct >= 80 ? "ok" : pct >= 50 ? "warn" : "error";
		parts.push(fg(paint, role, `${pct}% fresh`));
		if (state.stale) parts.push(fg(paint, "warn", `${state.stale} stale`));
	}
	return parts.join(dim(paint, " · "));
}

/** Render `label: value` pairs with the colons aligned, neofetch-style. */
export function kv(paint: Painter, pairs: ReadonlyArray<readonly [string, string]>): string[] {
	let widest = 0;
	for (const [label] of pairs) widest = Math.max(widest, label.length + 1);
	return pairs.map(([label, value]) => {
		const rendered = bold(paint, fg(paint, "accent", `${label}:`));
		return `${rendered}${" ".repeat(widest - label.length - 1)} ${value}`;
	});
}

/**
 * Wordmark left, panel right, joined at the top.
 *
 * Falls back to a stacked layout when the terminal cannot hold both columns —
 * a squeezed two-column banner is less legible than an honest one-column one.
 */
export function welcomeBanner(
	paint: Painter,
	info: HeaderInfo,
	termWidth: number,
	elapsedMs?: number,
): string[] {
	const left = logoBlock(paint, termWidth, info.knowledge, elapsedMs);
	const right = [
		...statusPanel(paint, info),
		"",
		dim(paint, "type to chat · press / for commands"),
	];

	const gap = "   ";
	if (termWidth > 0 && termWidth < blockWidth(left) + gap.length + blockWidth(right) + 2) {
		return [...left, "", ...right];
	}
	return joinHorizontal(left, right, gap);
}

/** The left column: the wordmark, and what sits under it. */
export function logoBlock(
	paint: Painter,
	width: number,
	state?: RepoState,
	elapsedMs?: number,
): string[] {
	const art = renderLogo(paint, width, elapsedMs);
	// The narrow fallback is a single bold word; hanging a legend off it would
	// be more chrome than the terminal has room for.
	if (!state || art.length === 1) return art;
	return [...art, logoRule(paint, width), "", ...keyLegend(paint)];
}

/** The rule under the wordmark, as wide as the art. */
export function logoRule(paint: Painter, width: number): string {
	const size = Math.min(LOGO_WIDTH, width > 0 ? width : LOGO_WIDTH);
	return fg(paint, "line", "─".repeat(Math.max(1, size)));
}

/**
 * The header, with the entrance applied.
 *
 * The header may claim at most about two-fifths of the screen. Past that the
 * conversation area is unusably small, so the art is traded for a compact
 * strip that says the same things in two rows.
 *
 * `elapsedMs` plays the entrance: the wordmark charges up through the gradient
 * and the rows rise in one at a time. It runs once, at startup. Passing
 * `undefined` renders the settled header, because a masthead that keeps moving
 * is one you stop reading.
 */
export function stickyHeader(
	paint: Painter,
	info: HeaderInfo,
	termWidth: number,
	termHeight: number,
	elapsedMs?: number,
): string[] {
	const fits = (block: readonly string[]): boolean =>
		termHeight <= 0 || block.length * 5 <= termHeight * 2;

	// Two steps down, not one: losing the wordmark to make room for the
	// knowledge row would be the wrong trade, so the row goes first.
	const full = welcomeBanner(paint, info, termWidth, elapsedMs);
	let lines: string[];
	if (fits(full)) {
		lines = full;
	} else {
		const lean = welcomeBanner(paint, { ...info, knowledge: undefined }, termWidth, elapsedMs);
		lines = fits(lean) ? lean : compactHeader(paint, info, termWidth);
	}

	if (elapsedMs === undefined) return lines;
	const shown = revealedRows(lines.length, elapsedMs);
	return lines.map((line, i) => (i < shown ? line : ""));
}

/** The short-terminal fallback: one row of branding, one row of live status. */
export function compactHeader(paint: Painter, info: HeaderInfo, termWidth: number): string[] {
	const key = info.hasKey ? fg(paint, "ok", "saved ✓") : fg(paint, "error", "not set");
	const modelText = displayModel(info.model, info.provider);
	const summary =
		`${dim(paint, "Model: ")}${modelText || "(none)"}` +
		`${dim(paint, "  Provider: ")}${info.provider || "(none)"}` +
		`${dim(paint, "  API Key: ")}${key}`;
	return [truncate(bold(paint, fg(paint, "accent", WORD)), termWidth), truncate(summary, termWidth)];
}

/**
 * Strip redundant provider prefix from model id when provider is shown beside it.
 * E.g. "openrouter/z-ai/glm-5.3-flash" with provider "openrouter" -> "z-ai/glm-5.3-flash".
 */
export function displayModel(model: string, provider?: string): string {
	if (provider && model.startsWith(`${provider}/`)) return model.slice(provider.length + 1);
	return model;
}

/**
 * Lay two blocks side by side, top-aligned.
 *
 * The left column is padded to its own widest row so the right column starts
 * at one column for every row.
 */
export function joinHorizontal(
	left: readonly string[],
	right: readonly string[],
	gap: string,
): string[] {
	const column = blockWidth(left);
	const rows = Math.max(left.length, right.length);
	const out: string[] = [];
	for (let i = 0; i < rows; i++) {
		const l = pad(left[i] ?? "", column);
		const r = right[i] ?? "";
		out.push(r ? `${l}${gap}${r}` : l.trimEnd());
	}
	return out;
}

export function blockWidth(lines: readonly string[]): number {
	let widest = 0;
	for (const line of lines) widest = Math.max(widest, visibleWidth(line));
	return widest;
}

/** The repository's own name, which is what "which repo am I in" wants. */
export function repoLabel(root: string): string {
	const parts = root.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? root;
}

/** A path shortened to its last two segments, so the panel stays one column. */
export function shortPath(root: string): string {
	const parts = root.split(/[\\/]/).filter(Boolean);
	if (parts.length <= 2) return root;
	return `…/${parts.slice(-2).join("/")}`;
}

// ---- width helpers ----
//
// ANSI-aware, because every string above carries colour codes. Counting the
// escapes would make every column twice as wide as it looks.

/** Printable width, ignoring escape sequences and counting wide glyphs twice. */
export function visibleWidth(text: string): number {
	let width = 0;
	let i = 0;
	while (i < text.length) {
		const code = text.charCodeAt(i);
		if (code === 0x1b) {
			// CSI (`ESC [ … letter`) and OSC (`ESC ] … BEL`).
			const next = text[i + 1];
			if (next === "[") {
				i += 2;
				while (i < text.length && !/[@-~]/.test(text[i] as string)) i++;
				i++;
				continue;
			}
			if (next === "]") {
				i += 2;
				while (i < text.length && text[i] !== "\x07") i++;
				i++;
				continue;
			}
			i++;
			continue;
		}
		const char = text[i] as string;
		// Block-drawing glyphs and the box characters here are all narrow, but
		// CJK and emoji are not; a rough wide test keeps alignment honest.
		width += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
			char,
		)
			? 2
			: 1;
		i++;
	}
	return width;
}

export function pad(text: string, width: number): string {
	const shown = visibleWidth(text);
	return shown >= width ? text : text + " ".repeat(width - shown);
}

export function truncate(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	// Truncating styled text has to walk the escapes, or it cuts mid-sequence
	// and the rest of the line inherits a colour nobody asked for.
	let out = "";
	let shown = 0;
	let i = 0;
	while (i < text.length && shown < width) {
		if (text.charCodeAt(i) === 0x1b) {
			const next = text[i + 1];
			if (next === "[") {
				let j = i + 2;
				while (j < text.length && !/[@-~]/.test(text[j] as string)) j++;
				out += text.slice(i, j + 1);
				i = j + 1;
				continue;
			}
			if (next === "]") {
				let j = i + 2;
				while (j < text.length && text[j] !== "\x07") j++;
				out += text.slice(i, j + 1);
				i = j + 1;
				continue;
			}
		}
		out += text[i];
		shown++;
		i++;
	}
	return `${out}${RESET}`;
}
