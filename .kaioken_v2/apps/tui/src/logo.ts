/**
 * The KAIOKEN wordmark and the sticky header.
 *
 * Ported from the v1 Go TUI (`logo.go`) so the two generations are visibly the
 * same product: block glyphs under a diagonal amber→red gradient on the left,
 * a neofetch-style `kaioken@<repo>` panel on the right, a rule, and one line
 * telling you what to do next.
 *
 * Pure: data in, styled lines out.
 */
import { pad, truncate, visibleWidth } from "./screen.js";
import { bold, colorEnabled, dim, fg, palette } from "./theme.js";
import { chargeOffset, revealedRows } from "./motion.js";
import { isEmpty, type RepoState } from "./repoState.js";

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
 */
const RAMP = ["214", "208", "202", "196", "196", "196"];

/** The width the block art needs, and the rule drawn under it. */
export const LOGO_WIDTH = 54;

/**
 * Gradient index for a letter column and glyph row: up and right runs hot.
 *
 * `offset` shifts the whole ramp toward the cool end, which is what makes the
 * wordmark look like it is charging up during the entrance. At rest it is
 * zero and the gradient is the fixed diagonal v1 shipped.
 */
function rampColor(col: number, row: number, offset = 0): string {
	const maxCol = WORD.length - 1;
	const maxRow = ROWS - 1;
	const t = Math.floor(((col + (maxRow - row)) * (RAMP.length - 1)) / (maxCol + maxRow)) - offset;
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
export function renderLogo(width: number, elapsedMs?: number): string[] {
	if (width > 0 && width < LOGO_WIDTH + 2) {
		return [bold(fg("accent", WORD))];
	}
	// The gradient below is written as raw 256-colour escapes because it is
	// brand art, not themed text — which also means it is the one place that
	// must check the colour switch itself, or NO_COLOR gets a rainbow.
	if (!colorEnabled()) return logoPlain();
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
 * The left column: the wordmark, and what sits under it.
 *
 * The panel on the right is taller than six rows of block art, which left a
 * hole beside it. What goes there is the keyboard — because every one of these
 * keys already worked and none of them was visible anywhere except `/help`,
 * which you have to know exists before you can discover that scrolling and
 * search are bound at all.
 *
 * It is static, and that is the point: a legend you stop reading after a week
 * has still paid for itself in the first hour, and the space was empty anyway.
 * It stays conditional on knowing the repository's state, exactly like the
 * panel's added rows, so the header's degradation ladder is unchanged.
 */
export function logoBlock(width: number, state?: RepoState, elapsedMs?: number): string[] {
	const art = renderLogo(width, elapsedMs);
	// The narrow fallback is a single bold word; hanging a legend off it would
	// be more chrome than the terminal has room for.
	if (!state || art.length === 1) return art;
	return [...art, logoRule(width), "", ...keyLegend()];
}

/**
 * The keys worth knowing, in the order you meet them.
 *
 * Sending first, then editing, then moving around. Three rows because that is
 * what the wordmark leaves beside a full panel, and every row is kept inside
 * the art's own width so the block stays rectangular.
 */
export function keyLegend(): string[] {
	const rows: ReadonlyArray<ReadonlyArray<readonly [string, string]>> = [
		[
			["enter", "send"],
			["alt+enter", "newline"],
			["/", "commands"],
		],
		[
			["tab", "complete"],
			["↑↓", "history"],
			["pgup/pgdn", "scroll"],
		],
		[
			["ctrl+shift+f", "search"],
			["ctrl+c", "twice to quit"],
		],
	];
	return rows.map((row) => row.map(([key, what]) => `${fg("accent", key)} ${dim(what)}`).join(dim("  ·  ")));
}

/** What the header panel reports. Everything is a string so it renders as-is. */
export interface HeaderInfo {
	version: string;
	repo: string;
	model: string;
	provider: string;
	hasKey: boolean;
	/** Shown under the panel when the agent is not in its default mode. */
	mode?: string;
	/** What this repository already has. Rows appear only when it has any. */
	knowledge?: RepoState;
}

/**
 * Strip redundant provider prefix from model id when provider is shown alongside it.
 * E.g. "openrouter/z-ai/glm-5.3-flash" with provider "openrouter" -> "z-ai/glm-5.3-flash".
 */
export function displayModel(model: string, provider?: string): string {
	if (provider && model.startsWith(`${provider}/`)) {
		return model.slice(provider.length + 1);
	}
	return model;
}

/**
 * The right-hand info block: `kaioken@<repo>`, a rule, then aligned fields.
 *
 * Split out so it can be reprinted on its own after a `/model`, `/provider` or
 * `/key` change — the header scrolls out of reach, and this is otherwise the
 * only place those three are visible together.
 */
export function statusPanel(info: HeaderInfo): string[] {
	const heading = `kaioken@${repoLabel(info.repo)}`;
	const key = info.hasKey ? fg("ok", "saved ✓") : fg("error", "not set — /key to add one");

	const rows: Array<readonly [string, string]> = [
		["Version", info.version],
		["Repo", shortPath(info.repo)],
	];
	// Every added row has to earn itself. A branch is only worth naming when
	// there is one, so a non-git directory keeps the shorter panel.
	const state = info.knowledge;
	if (state?.branch) rows.push(["Branch", fg("user", state.branch)]);
	// A model-less header is the one state that blocks every generating
	// command, so the row names the way out instead of just "(none)".
	const modelText = displayModel(info.model, info.provider);
	rows.push(
		["Model", modelText || dim("(none — /model to pick)")],
		["Provider", info.provider || dim("(none)")],
		["API Key", key],
	);
	// The knowledge row is the one thing the header could never say, and the
	// question the tool exists to answer. It is always worth a row, because
	// "nothing yet" is the answer that most needs acting on.
	if (state) rows.push(["Knowledge", knowledgeSummary(state)]);

	return [bold(fg("accent", heading)), dim("─".repeat([...heading].length)), ...kv(rows)];
}

/**
 * The knowledge row: what exists, and whether it is still true.
 *
 * One row rather than four. The counts matter less than the two decisions they
 * drive — generate something, or refresh what drifted — so the row leads with
 * scale, ends with freshness, and says outright what to run when it is empty.
 */
export function knowledgeSummary(state: RepoState): string {
	if (isEmpty(state)) {
		return `${dim("nothing generated yet —")} ${fg("accent", "/wiki")}${dim(" or ")}${fg("accent", "/cards")}`;
	}

	const parts: string[] = [];
	if (state.files) parts.push(dim(`${state.files} files`));
	if (state.documents) parts.push(`${state.documents} ${dim("docs")}`);
	if (state.cards) parts.push(`${state.cards} ${dim("cards")}`);
	if (state.research) parts.push(`${state.research} ${dim("research")}`);

	if (state.freshness !== undefined) {
		const pct = Math.round(state.freshness * 100);
		const role = pct >= 80 ? "ok" : pct >= 50 ? "warn" : "error";
		parts.push(fg(role, `${pct}% fresh`));
		// Only when there is drift to act on; `/update` is the next step.
		if (state.stale) parts.push(fg("warn", `${state.stale} stale`));
	}
	return parts.join(dim(" · "));
}

/**
 * Wordmark left, panel right, joined at the top.
 *
 * Falls back to a stacked layout when the terminal cannot hold both columns —
 * a squeezed two-column banner is less legible than an honest one-column one.
 */
export function welcomeBanner(info: HeaderInfo, termWidth: number, elapsedMs?: number): string[] {
	const left = logoBlock(termWidth, info.knowledge, elapsedMs);
	const right = [
		...statusPanel(info),
		"",
		dim("type to chat · press / for commands · /tutorial to learn them"),
	];

	const gap = "   ";
	if (termWidth > 0 && termWidth < blockWidth(left) + gap.length + blockWidth(right) + 2) {
		return [...left, "", ...right];
	}
	return joinHorizontal(left, right, gap);
}

/**
 * The fixed top block: wordmark plus live status, held above the transcript so
 * repo, model, provider and key stay visible while the scrollback moves — the
 * top counterpart of the pinned composer.
 *
 * The header may claim at most about two-fifths of the screen. Past that the
 * conversation area is unusably small, so the art is traded for a compact
 * strip that says the same things in two rows.
 *
 * `elapsedMs` plays the entrance: the wordmark charges up through the gradient
 * and the rows rise in one at a time. It runs once, at startup. Passing
 * `undefined` — which every caller but the shell does — renders the settled
 * header, because a masthead that keeps moving is one you stop reading.
 */
export function stickyHeader(
	info: HeaderInfo,
	termWidth: number,
	termHeight: number,
	elapsedMs?: number,
): string[] {
	const fits = (block: readonly string[]): boolean => termHeight <= 0 || block.length * 5 <= termHeight * 2;

	// Three steps down, not one. The branch and knowledge rows are additions
	// to v1's panel, so they are what a short terminal gives up first — losing
	// the wordmark to make room for a row that was never there before would be
	// the wrong trade.
	const full = welcomeBanner(info, termWidth, elapsedMs);
	let lines: string[];
	if (fits(full)) {
		lines = full;
	} else {
		const lean = welcomeBanner({ ...info, knowledge: undefined }, termWidth, elapsedMs);
		lines = fits(lean) ? lean : compactHeader(info, termWidth);
	}
	if (info.mode) lines.push(fg("warn", `mode ${info.mode}`));

	// The rows arrive top-down. The block keeps its full height throughout so
	// the transcript below does not jump as each row lands.
	if (elapsedMs === undefined) return lines;
	const shown = revealedRows(lines.length, elapsedMs);
	return lines.map((line, i) => (i < shown ? line : ""));
}

/** The short-terminal fallback: one row of branding, one row of live status. */
export function compactHeader(info: HeaderInfo, termWidth: number): string[] {
	const key = info.hasKey ? fg("ok", "saved ✓") : fg("error", "not set");
	const modelText = displayModel(info.model, info.provider);
	const summary =
		`${dim("Model: ")}${modelText || "(none)"}` +
		`${dim("  Provider: ")}${info.provider || "(none)"}` +
		`${dim("  API Key: ")}${key}`;
	return [truncate(bold(fg("accent", WORD)), termWidth), truncate(summary, termWidth)];
}

/** Render `label: value` pairs with the colons aligned, neofetch-style. */
export function kv(pairs: ReadonlyArray<readonly [string, string]>): string[] {
	let widest = 0;
	for (const [label] of pairs) widest = Math.max(widest, label.length + 1);
	return pairs.map(([label, value]) => {
		const rendered = bold(fg("accent", `${label}:`));
		return `${rendered}${" ".repeat(widest - label.length - 1)} ${value}`;
	});
}

/**
 * Lay two blocks side by side, top-aligned.
 *
 * Lipgloss did this in v1; here it is eight lines because the only case that
 * matters is two blocks and a fixed gap. The left column is padded to its own
 * widest row so the right column starts at one column for every row.
 */
export function joinHorizontal(left: readonly string[], right: readonly string[], gap: string): string[] {
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
export function repoLabel(repo: string): string {
	const name = repo.replace(/[\\/]+$/, "").split(/[\\/]/).filter(Boolean).pop();
	return !name || name === "." ? "repo" : name;
}

/** Keep the tail: the end of a path says more about it than the start. */
export function shortPath(path: string): string {
	const slashed = path.replace(/\\/g, "/");
	return slashed.length <= 40 ? slashed : `…${slashed.slice(-39)}`;
}

/** The rule drawn under the wordmark when it stands alone. */
export function logoRule(width: number): string {
	const rule = "═".repeat(Math.min(Math.max(width, 8), LOGO_WIDTH));
	if (!colorEnabled()) return rule;
	return `${ESC}[38;5;${palette().accent}m${rule}${RESET}`;
}
