import { truncate, visibleWidth } from "./screen.js";
import { bold, dim, fg } from "./theme.js";
import { renderFlash, spinner, sweepRule } from "./motion.js";

/**
 * The single row under the composer.
 *
 * Ported from v1's `statusLine`/`sessionStatus`: which keys are live on the
 * left, which session you are in on the right. Always exactly one row, so the
 * layout never shifts under the user — a status bar that grows a line when
 * something happens moves every other row at the worst possible moment.
 */
export interface StatusData {
	/** Set while a task is running; replaces the key hints with live progress. */
	busy?: BusyState;
	/** True when edits land without asking. Never rendered subtly. */
	autoApprove?: boolean;
	/** Set while the wiki browser is running. */
	serving?: boolean;
	model?: string;
	/** Cumulative prompt + completion tokens for the active model. */
	tokens?: number;
	costUsd?: number;
	/** Fraction of the usable context consumed, 0..1. Hidden below half. */
	contextFill?: number;
	/** A transient confirmation, shown in place of the hints while it lives. */
	flash?: FlashState;
}

/**
 * The seam between the header and the transcript.
 *
 * A clean, static rule dividing the header from the transcript.
 */
export function renderSeam(width: number, _busy?: BusyState | undefined): string {
	return sweepRule(width, 0, false);
}

/**
 * The progress row, previously shown under the seam while an engine command runs.
 * Disabled so that only a single loading animation (the status line spinner) is active.
 */
export function renderProgress(_width?: number, _busy?: BusyState | undefined): string[] {
	return [];
}

export interface BusyState {
	/** What is running: "thinking", "generating the wiki", a tool's output. */
	text: string;
	elapsedMs: number;
}

/** A transient confirmation, shown in place of the hints and then gone. */
export interface FlashState {
	text: string;
	elapsedMs: number;
}

const IDLE_HINTS = "/ commands · alt+enter newline · ctrl+d quit";

export function renderStatusLine(data: StatusData, cols: number): string {
	const left = renderLeft(data);
	const right = renderRight(data);
	const gap = cols - visibleWidth(left) - visibleWidth(right);
	// Too narrow to carry both: the keys matter more than the readout.
	if (!right || gap < 2) return truncate(left, cols);
	return left + " ".repeat(gap) + right;
}

function renderLeft(data: StatusData): string {
	// A flash outranks the hints: it is transient, and the hints are always
	// one keystroke away anyway.
	if (data.flash) {
		const rendered = renderFlash(data.flash.text, data.flash.elapsedMs);
		if (rendered) return rendered;
	}
	if (!data.busy) return dim(IDLE_HINTS);
	return (
		`${fg("spinner", spinner(data.busy.elapsedMs))} ${dim(data.busy.text)}` +
		`${dim(" · ")}${fg("elapsed", elapsed(data.busy.elapsedMs))}${dim(" · esc to stop")}`
	);
}

/**
 * The right-hand readout: mode, model and spend.
 *
 * The banner at the top of the scrollback says the same things once, but it
 * scrolls away — this stays. Entries are dropped least-missed-first when the
 * row will not hold them all; the model id goes first because it is both the
 * longest and the least surprising, since it does not change during a session.
 */
function renderRight(data: StatusData): string {
	const parts: string[] = [];
	const fill = renderContextFill(data.contextFill);
	if (fill) parts.push(fill);
	if (data.serving) parts.push(dim("serving"));
	if (data.model) parts.push(dim(shortModel(data.model)));
	if (data.tokens && data.tokens > 0) parts.push(dim(`${humanTokens(data.tokens)} tok`));
	if (data.costUsd && data.costUsd > 0) parts.push(dim(`$${data.costUsd.toFixed(2)}`));
	let out = parts.join(dim(" · "));
	// auto-approve means edits land without asking. It should never be subtle,
	// so it leads and it is the one entry that is never dropped.
	if (data.autoApprove) {
		out = out ? `${bold(fg("warn", "yolo"))}${dim(" · ")}${out}` : bold(fg("warn", "yolo"));
	}
	return out;
}

/**
 * How full the context is, as a fraction of what a conversation may occupy
 * before it is reduced automatically — not of the raw window, which would read
 * low right up to the moment compaction fires.
 *
 * Hidden below halfway, deliberately. A fresh session at 3% is noise, and the
 * only decision this number informs — compact now, or start fresh — does not
 * arise until the context is genuinely filling. Once it appears, the colour
 * tracks urgency.
 */
function renderContextFill(fill: number | undefined): string | null {
	if (fill === undefined || fill < 0.5) return null;
	const pct = Math.min(100, Math.round(fill * 100));
	const label = `ctx ${pct}%`;
	return pct >= 80 ? fg("warn", label) : dim(label);
}

export function humanTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)}M`;
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

/** 9s, 1m04s, 1h02m — bounded width, so the bar cannot jitter as time passes. */
export function elapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	if (s < 60) return `${s}s`;
	if (s < 3600) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
	return `${Math.floor(s / 3600)}h${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

const MODEL_LABEL_WIDTH = 22;

/**
 * Drop the vendor prefix — what distinguishes one model from another lives
 * after the slash — and trim the middle of anything still too long, keeping
 * the tail where `:free` and version suffixes live.
 */
export function shortModel(id: string): string {
	const slash = id.lastIndexOf("/");
	const name = slash >= 0 && slash + 1 < id.length ? id.slice(slash + 1) : id;
	const chars = [...name];
	if (chars.length <= MODEL_LABEL_WIDTH) return name;
	return `${chars.slice(0, MODEL_LABEL_WIDTH - 8).join("")}…${chars.slice(-7).join("")}`;
}
