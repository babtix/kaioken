import { truncate, visibleWidth } from "./screen.js";
import { bold, dim, fg, palette, type Role } from "./theme.js";

/**
 * Motion.
 *
 * DESIGN.md's axiom is binding here: *if everything glows, nothing
 * communicates*. Every effect in this file indicates a state — work in
 * flight, a stream still arriving, a power level that costs real money, an
 * armed destructive action. None of them is decoration, and none of them runs
 * while the interface is idle.
 *
 * Two rules make that practical:
 *
 * - Every animation is a **pure function of elapsed milliseconds**. The phase
 *   comes from the wall clock, not from a frame counter, so the durations are
 *   exactly the ones in DESIGN.md §2.5 no matter how fast the shell ticks —
 *   and every frame is reachable from a test with no terminal and no timers.
 * - Motion can be switched off wholesale. §6.5 requires it, and a terminal
 *   multiplexer over a slow link is reason enough on its own.
 */

/** Durations, from the keyframe matrix in DESIGN.md §2.5. */
export const TIMING = {
	/** `caret-blink`, step-end infinite. */
	caretBlink: 1050,
	/** `rise-in`, the hero entrance. */
	riseIn: 550,
	/** `rule-sweep`, linear infinite. */
	ruleSweep: 6000,
	/** `shimmer`, ease infinite. */
	shimmer: 2400,
	/** The spinner's own cadence. Not in the matrix; 80ms reads as motion. */
	spinner: 80,
	/** How long an armed destructive action takes to pulse once. */
	pulse: 1400,
} as const;

let enabled = true;

/**
 * Turn motion on or off for the whole interface.
 *
 * Off is not "freeze mid-frame": every function below returns its settled,
 * final state, so a reduced-motion terminal gets a legible static interface
 * rather than an arbitrary frame of an animation that stopped.
 */
export function setMotion(on: boolean): void {
	enabled = on;
}

export function motionEnabled(): boolean {
	return enabled;
}

/**
 * Whether the environment is asking for stillness.
 *
 * `NO_MOTION` is the explicit switch. `NO_COLOR` is honoured too because a
 * terminal that has opted out of colour has opted out of decoration, and every
 * effect here is expressed in colour.
 */
export function motionFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.KAIOKEN_NO_MOTION || env.NO_MOTION) return false;
	if (env.NO_COLOR) return false;
	// A dumb terminal cannot repaint a row without flicker.
	if (env.TERM === "dumb") return false;
	return true;
}

/** Position within one cycle, 0..1. */
export function phase(elapsedMs: number, durationMs: number): number {
	if (durationMs <= 0) return 1;
	const t = (elapsedMs % durationMs) / durationMs;
	return t < 0 ? t + 1 : t;
}

/**
 * `cubic-bezier(0.22, 1, 0.36, 1)` — the `rise-in` curve, closely enough.
 *
 * An exact bezier solve costs a Newton iteration per call for a difference no
 * one can see at 15fps in a terminal; this is the same shape: fast out of the
 * gate, a long settle.
 */
export function easeOut(t: number): number {
	const clamped = Math.min(1, Math.max(0, t));
	return 1 - (1 - clamped) ** 3;
}

// ---- the spinner ----

/** Braille: one column wide in every terminal, unlike emoji. */
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export function spinner(elapsedMs: number): string {
	if (!enabled) return "•";
	const index = Math.floor(elapsedMs / TIMING.spinner) % SPINNER_FRAMES.length;
	return SPINNER_FRAMES[index] as string;
}

// ---- the caret ----

/**
 * The streaming cursor.
 *
 * `step-end` means it is on for the first half of the cycle and off for the
 * second — a hard switch, not a fade. Terminals cannot fade, and a caret that
 * tried would just flicker.
 */
export function caret(elapsedMs: number): string {
	if (!enabled) return fg("accent", "▌");
	return phase(elapsedMs, TIMING.caretBlink) < 0.5 ? fg("accent", "▌") : " ";
}

// ---- the sweep ----

/**
 * A rule with a highlight travelling along it.
 *
 * This is the ambient "something is happening" signal: it sits under the
 * header while a task runs, moves slowly enough to read as alive rather than
 * urgent, and costs one row that was a plain rule anyway.
 */
export function sweepRule(width: number, elapsedMs: number, active = true): string {
	const size = Math.max(1, width);
	if (!enabled || !active) return fg("line", "─".repeat(size));

	// The highlight is a short band, so most of the rule stays quiet.
	const band = Math.max(3, Math.floor(size / 8));
	const head = Math.floor(phase(elapsedMs, TIMING.ruleSweep) * (size + band)) - band;

	let out = "";
	let run = "";
	let runRole: Role | null = null;
	for (let i = 0; i < size; i++) {
		const distance = i - head;
		const role: Role = distance >= 0 && distance < band ? (distance < band / 2 ? "accent" : "warn") : "line";
		if (role !== runRole) {
			if (runRole) out += fg(runRole, run);
			run = "";
			runRole = role;
		}
		run += "─";
	}
	if (runRole) out += fg(runRole, run);
	return out;
}

// ---- indeterminate progress ----

/**
 * A shimmer bar for work whose length is unknown.
 *
 * Most engine commands cannot say how far along they are — a wiki run
 * discovers its own size as it goes. A bar that invented a percentage would be
 * lying; a bar that only says "still moving" is the honest version of the same
 * reassurance.
 */
export function shimmerBar(width: number, elapsedMs: number, label = ""): string {
	const size = Math.max(4, width);
	if (!enabled) {
		const filled = fg("line", "─".repeat(size));
		return label ? `${filled} ${dim(label)}` : filled;
	}

	const band = Math.max(4, Math.floor(size / 5));
	const head = Math.floor(phase(elapsedMs, TIMING.shimmer) * (size + band)) - band;

	let bar = "";
	for (let i = 0; i < size; i++) {
		const distance = i - head;
		if (distance < 0 || distance >= band) {
			bar += fg("line", "░");
			continue;
		}
		// Brightest in the middle of the band, so it reads as a sweep rather
		// than a block sliding past.
		const centre = Math.abs(distance - (band - 1) / 2) / ((band - 1) / 2 || 1);
		bar += fg(centre < 0.4 ? "accent" : centre < 0.8 ? "warn" : "tool", "█");
	}
	return label ? `${bar} ${dim(label)}` : bar;
}

// ---- the power dial ----

/**
 * The Kaioken multiplier, as a meter.
 *
 * DESIGN.md §6.3 makes this dial a cost control, not a decoration: ×1 is one
 * pass, ×3 the default, ×4–×6 add critique-and-revise loops, and ×7 and above
 * spend fifteen to thirty times the baseline in model calls. The meter earns
 * its row by making that visible *before* the run starts, and it pulses red
 * above the threshold because that is the only band where the number is a
 * decision rather than a setting.
 */
export const HIGH_POWER = 7;

export function powerBand(multiplier: number): { role: Role; note: string } {
	if (multiplier >= HIGH_POWER) {
		return { role: "diffDel", note: "deep recursive multi-agent · 15–30× the calls" };
	}
	if (multiplier >= 4) return { role: "warn", note: "adds critique-and-revise passes · 6–10× the calls" };
	if (multiplier >= 2) return { role: "accent", note: "standard thorough coverage" };
	return { role: "toolResult", note: "single fast pass" };
}

export function powerMeter(multiplier: number, elapsedMs = 0, width = 10): string {
	const level = Math.max(1, Math.min(10, Math.round(multiplier)));
	const { role, note } = powerBand(level);
	const filled = Math.max(1, Math.round((level / 10) * width));

	// Above the threshold the meter breathes, so a ×9 run cannot be started
	// from muscle memory without the screen having said something about it.
	const hot = level >= HIGH_POWER && enabled && phase(elapsedMs, TIMING.pulse) < 0.5;
	const barRole: Role = hot ? "warn" : role;

	// `×10` is a column wider than `×1`, which would shift the meter under it.
	// Padding the label keeps the bar in the same place at every level.
	const label = `POWER ×${level}`.padEnd(9);
	const empty = width - filled;
	return (
		`${fg(role, "▎")} ${bold(fg(role, label))}  ` +
		`${fg(barRole, "█".repeat(filled))}${empty > 0 ? fg("line", "░".repeat(empty)) : ""}  ${dim(note)}`
	);
}

// ---- the entrance ----

/**
 * How many rows of a block have risen in yet.
 *
 * The banner arrives a row at a time rather than all at once. It is the one
 * purely-for-pleasure moment in the interface and it is over in half a second;
 * after that the header never animates again, because a masthead that keeps
 * moving is a masthead you stop reading.
 */
export function revealedRows(total: number, elapsedMs: number): number {
	if (!enabled) return total;
	if (total <= 0) return 0;
	return Math.min(total, Math.ceil(easeOut(elapsedMs / TIMING.riseIn) * total));
}

/** Whether the entrance is still playing. */
export function isRevealing(total: number, elapsedMs: number): boolean {
	return enabled && revealedRows(total, elapsedMs) < total;
}

/**
 * The wordmark's charge-up.
 *
 * The gradient ramp is offset while the entrance plays and settles to its
 * fixed diagonal, so the logo reads as powering on rather than fading in — the
 * Dragon Ball metaphor DESIGN.md builds the whole palette around, spent once
 * at startup and never again.
 */
export function chargeOffset(elapsedMs: number): number {
	if (!enabled) return 0;
	const t = elapsedMs / TIMING.riseIn;
	if (t >= 1) return 0;
	return Math.round((1 - easeOut(t)) * 5);
}

// ---- transient notices ----

/**
 * A flash: a confirmation that should be seen and then forgotten.
 *
 * `/theme light` and `/yolo` change something invisible; a line in the
 * scrollback is the wrong weight for that, and a modal is far too much. The
 * flash fades out of the status row on its own.
 */
export const FLASH_MS = 2200;

export function flashAlive(elapsedMs: number): boolean {
	return elapsedMs < FLASH_MS;
}

export function renderFlash(text: string, elapsedMs: number, role: Role = "accent"): string {
	if (!flashAlive(elapsedMs)) return "";
	// The last quarter dims, so it reads as leaving rather than vanishing.
	const leaving = elapsedMs > FLASH_MS * 0.75;
	const body = ` ${text} `;
	return enabled && leaving ? dim(body) : bold(fg(role, body));
}

/**
 * A pulsing label, for a state that is armed and waiting on the user.
 *
 * Used by the approval prompt: nothing has been written yet, the run is
 * blocked, and the interface should not look settled while that is true.
 */
export function pulseText(text: string, elapsedMs: number, hot: Role = "warn", cool: Role = "tool"): string {
	if (!enabled) return bold(fg(hot, text));
	return bold(fg(phase(elapsedMs, TIMING.pulse) < 0.5 ? hot : cool, text));
}

/**
 * A bar that fills once, left to right, over a known duration.
 *
 * DESIGN.md's `tour-fill`. The approval prompt's auto-deny countdown is the
 * one place the shell knows exactly how long is left, so it is the one place a
 * determinate bar is honest.
 */
export function fillBar(width: number, elapsedMs: number, durationMs: number, role: Role = "warn"): string {
	const size = Math.max(1, width);
	const done = Math.min(1, Math.max(0, durationMs <= 0 ? 1 : elapsedMs / durationMs));
	const filled = Math.round(done * size);
	return `${fg(role, "█".repeat(filled))}${fg("line", "░".repeat(size - filled))}`;
}

/** Pad a rendered, coloured string to an exact column width. */
export function padVisible(text: string, width: number): string {
	const shown = visibleWidth(text);
	return shown >= width ? truncate(text, width) : text + " ".repeat(width - shown);
}

/** The palette's own accent, for callers building ad-hoc effects. */
export function accentCode(): string {
	return palette().accent;
}
