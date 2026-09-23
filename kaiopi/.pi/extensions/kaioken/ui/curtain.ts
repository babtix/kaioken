/**
 * The curtain: the two animations that play when nothing else is on screen.
 *
 * Ported from the v2 TUI (`kaioken_v2/apps/tui/src/curtain.ts`). Everything in
 * `motion.ts` indicates a state — work in flight, a stream still arriving, an
 * armed destructive action. The curtain indicates a *boundary*: the session
 * starting, and the session ending. That is the whole of its job, which is why
 * there are exactly two of them. DESIGN.md's axiom still binds — *if
 * everything glows, nothing communicates* — and a shell that flourished on
 * every command would have spent this budget before you reached the prompt.
 *
 * The two are different animations, not one played in both directions:
 *
 * - **Opening** — a boot. The wordmark rises in a row at a time, an aura opens
 *   under it, and three lines type themselves out with a caret at the write
 *   head. It builds, and it talks.
 * - **Closing** — a CRT switching off. The picture is crushed into a bright
 *   scanline and the scanline collapses to a point. It is wordless, and it is
 *   over in a beat.
 *
 * An exit that ran the entrance backwards was the obvious thing to build and
 * the wrong thing to watch: un-building is the same idea twice, and it made
 * leaving feel like a startup in reverse rather than like something ending.
 * A power-off is understood without being explained, which is what the last
 * half-second of a session is for.
 *
 * Both take the alternate screen. On the way in that means the shell's
 * scrollback is untouched underneath; on the way out it means the transcript
 * Pi has just restored to the main screen is only hidden for a moment, and
 * comes back — with the goodbye under it — the instant the curtain lifts.
 *
 * The same two rules as `motion.ts` apply, for the same reasons:
 *
 * - Every frame is a **pure function of elapsed milliseconds**, so a test names
 *   the instant it wants and gets exactly that frame — no pty, no timers.
 * - Motion off means *no curtain at all*. A transient has no settled state to
 *   fall back to: the honest still version of a flourish is not showing it.
 */
import { renderLogo } from "./logo.ts";
import { caret, motionEnabled, TIMING } from "./motion.ts";
import { visibleWidth, truncate } from "./logo.ts";
import { bold, dim, fg, type Painter, type Role } from "./theme.ts";

/**
 * Durations.
 *
 * Not from DESIGN.md §2.5 — the keyframe matrix has no curtain in it, and
 * these are longer than anything in it on purpose. The first pass in v2 sat in
 * the `rise-in` family at half a second and was over before it registered: a
 * boundary marker nobody sees is not marking a boundary.
 *
 * The opening is paced by its text, because typing has a legible speed — under
 * about eight milliseconds a character it stops reading as typing and starts
 * reading as a paint. The closing has nothing to read, sits between the quit
 * keystroke and the shell prompt coming back, and is a collapse rather than an
 * arrival, so it takes about two thirds as long.
 */
export const CURTAIN = {
	open: 700,
	close: 500,
	/** ~22fps. Fast enough that the beam's edge reads as sliding, not stepping. */
	frameMs: 45,
} as const;

/**
 * Where the opening's phases hand over, as fractions of its duration.
 *
 * The last one matters as much as the first two: without a held frame at the
 * end, the last character of the last line is on screen for a single frame
 * before Pi paints over it, which is the same as not having written it.
 */
export const BOOT = {
	/** The wordmark has finished rising in. */
	logo: 0.24,
	/** The aura has finished widening under it. */
	aura: 0.32,
	/** The lines have finished typing; what is left is a held frame, caret live. */
	typed: 0.86,
} as const;

/**
 * Half-width of the aura at full extension: the wordmark's own half-width, so
 * the rule under it is the width of the thing it is underlining.
 */
const MAX_REACH = 27;

/**
 * Centre-out heat: red core, orange body, amber edge.
 *
 * Roles rather than raw escapes, so a light theme and NO_COLOR both come out
 * right. The wordmark's gradient is brand art and pays for its raw 256-colour
 * codes; a transient does not.
 */
function heat(distance: number, reach: number): Role {
	if (reach <= 0) return "error";
	const t = Math.min(1, distance / reach);
	if (t < 0.34) return "error";
	if (t < 0.67) return "accent";
	return "warn";
}

/**
 * The aura: the rule under the wordmark, opening and closing from the centre.
 *
 * Drawn as runs of one colour rather than a colour per column — a 55-column
 * rule with an escape pair around every character is kilobytes a frame, and a
 * terminal at the end of an ssh link notices.
 */
export function aura(paint: Painter, width: number, extent: number): string {
	const reach = Math.min(MAX_REACH, Math.floor((width - 1) / 2));
	const half = Math.max(0, Math.min(reach, Math.round(extent * reach)));
	if (half === 0) return "";

	let out = "";
	let run = "";
	let runRole: Role | null = null;
	for (let i = -half; i <= half; i++) {
		const role = heat(Math.abs(i), reach);
		if (role !== runRole) {
			if (runRole) out += fg(paint, runRole, run);
			run = "";
			runRole = role;
		}
		run += "─";
	}
	if (runRole) out += fg(paint, runRole, run);
	return out;
}

/** Centre a rendered, coloured row in `width` columns. */
function centre(text: string, width: number): string {
	// An empty row stays empty rather than becoming half a row of padding.
	if (text === "") return "";
	const shown = visibleWidth(text);
	if (shown >= width) return truncate(text, width);
	return " ".repeat(Math.floor((width - shown) / 2)) + text;
}

/** Centre a block of rows in `height` rows, padding with blanks. */
function centreBlock(rows: readonly string[], height: number): string[] {
	const out: string[] = [];
	for (let i = 0; i < Math.max(0, Math.floor((height - rows.length) / 2)); i++) out.push("");
	out.push(...rows);
	while (out.length < height) out.push("");
	return out.slice(0, height);
}

// ---- the text ----

/** One line of curtain text, and how it is dressed once revealed. */
export interface BootLine {
	text: string;
	style(shown: string): string;
}

/**
 * What the opening types.
 *
 * Three lines, and every one of them true. A boot splash is the easiest place
 * in an interface to start lying — "mounting index", "warming model" — and
 * none of that is happening yet. So the lines say what the thing *is* and what
 * to press, which is the one piece of information a first-time user needs and
 * the header repeats a second later anyway.
 */
export function bootScript(paint: Painter, version: string): BootLine[] {
	return [
		{ text: "$ kaioken", style: (shown) => bold(paint, fg(paint, "accent", shown)) },
		{ text: `KAIOKEN v${version} · the truth layer for pi`, style: (shown) => fg(paint, "text", shown) },
		{ text: "type to chat · press / for commands", style: (shown) => dim(paint, shown) },
	];
}

/**
 * The lines, revealed a character at a time.
 *
 * One budget spent across every line rather than a timeline per line, so the
 * typing runs at a constant speed through the whole script; a per-line
 * schedule makes a short line crawl and a long one race, which reads as a
 * progress bar rather than as typing.
 */
export function typedLines(
	paint: Painter,
	script: readonly BootLine[],
	progress: number,
	elapsedMs: number,
): string[] {
	// Nothing on screen, so there is no write head to mark. A caret alone in
	// the middle of an otherwise empty screen — which is what the first line
	// renders as while the wordmark is still rising — reads as a rendering
	// artefact rather than as a prompt waiting.
	if (progress <= 0) return script.map(() => "");

	const total = script.reduce((sum, line) => sum + line.text.length, 0);
	let budget = Math.min(total, Math.max(0, Math.floor(progress * total)));

	const out: string[] = [];
	let headPlaced = false;
	for (const line of script) {
		const take = Math.min(line.text.length, budget);
		budget -= take;
		const shown = line.text.slice(0, take);
		// The caret sits on the first unfinished line — the write head. A solid
		// block while it is moving: a caret that blinked mid-word would read as
		// the typing having stalled.
		const head = !headPlaced && take < line.text.length;
		if (head) headPlaced = true;
		if (!head && take === 0) {
			out.push("");
			continue;
		}
		out.push(line.style(shown) + (head ? fg(paint, "accent", "▌") : ""));
	}

	// Nothing left to type: the caret parks at the end of the last line and
	// blinks, which is what says the machine is waiting rather than finished.
	if (!headPlaced && out.length > 0) out[out.length - 1] += caret(paint, elapsedMs);
	return out;
}

// ---- the stage ----

/**
 * The layout both ends share: wordmark, aura, text, centred on the screen.
 *
 * One builder rather than two so the closing cannot drift out of alignment
 * with the opening — every row is in the same place at both ends, which is
 * what lets one read as the other reversed.
 *
 * Exactly `height` rows, always: the player paints over the whole screen, and
 * a frame that came up short would leave the previous one's tail behind.
 */
function stage(
	width: number,
	height: number,
	art: readonly string[],
	shownRows: number,
	auraExtent: number,
	lines: readonly string[],
	auraRow: string,
): string[] {
	const content: string[] = [];
	// The art is what goes first on a terminal with no room for all of it: the
	// typed lines carry the words, and a wordmark with its legs cut off is
	// worse than no wordmark.
	if (height >= art.length + lines.length + 4) {
		for (let i = 0; i < art.length; i++) content.push(i < shownRows ? centre(art[i] as string, width) : "");
		content.push("", centre(auraRow, width), "");
	}
	for (const line of lines) content.push(centre(line, width));
	return centreBlock(content, height);
}

// ---- the opening ----

/** How far the opening's aura has widened at `elapsedMs`. */
export function openAura(elapsedMs: number): number {
	const t = Math.min(1, Math.max(0, elapsedMs / CURTAIN.open));
	if (t <= BOOT.logo) return 0;
	return Math.min(1, (t - BOOT.logo) / (BOOT.aura - BOOT.logo));
}

/** One full-screen frame of the opening. */
export function bootFrame(
	paint: Painter,
	width: number,
	height: number,
	elapsedMs: number,
	version: string,
): string[] {
	const room = Math.max(8, width);
	const t = Math.min(1, Math.max(0, elapsedMs / CURTAIN.open));

	// The gradient's charge-up is written against `rise-in`, so the phase is
	// scaled onto that duration rather than reimplemented here.
	const rising = Math.min(1, t / BOOT.logo);
	const art = renderLogo(paint, room, rising * TIMING.riseIn);
	// The rows arrive linearly, though — *not* through `revealedRows`. That
	// helper's cubic ease is tuned for the header's half-second entrance and
	// has the block whole by the halfway point, which here left a dead quarter
	// second between the wordmark landing and the typing starting. One row per
	// equal slice reads like the terminal printing the banner, which is the
	// whole idea.
	const shownRows = Math.min(art.length, Math.ceil(rising * art.length));

	const typing = t <= BOOT.aura ? 0 : Math.min(1, (t - BOOT.aura) / (BOOT.typed - BOOT.aura));
	return stage(
		room,
		height,
		art,
		shownRows,
		openAura(elapsedMs),
		typedLines(paint, bootScript(paint, version), typing, elapsedMs),
		aura(paint, room, openAura(elapsedMs)),
	);
}

// ---- the closing: a CRT powering off ----

/**
 * Where the closing's phases hand over, as fractions of its duration.
 *
 * This is not the opening reversed, and deliberately so. An entrance that
 * builds and an exit that un-builds are the same idea twice; what actually
 * happens when a terminal goes away is that the picture collapses into a line
 * and the line collapses into a point. Everyone who has switched off a CRT
 * knows this animation without being told what it is, which is exactly what
 * you want from the last half-second of a session.
 */
export const POWEROFF = {
	/** The wordmark sits there, whole, before the power is cut. */
	hold: 0.16,
	/** The picture has finished collapsing into the beam. */
	collapsed: 0.58,
	/** The beam has finished shrinking to a point. */
	narrowed: 0.9,
} as const;

/** The beam at full width: the wordmark's own, so it collapses to its own size. */
const BEAM_WIDTH = 54;

/**
 * How much of the picture's height is left at `elapsedMs`, 1 down to 0.
 *
 * Linear. The squeeze is the one part of this the eye tracks frame to frame,
 * and an eased collapse reads as the rows being deleted rather than as the
 * picture being crushed.
 */
export function squeeze(elapsedMs: number): number {
	const t = Math.min(1, Math.max(0, elapsedMs / CURTAIN.close));
	if (t <= POWEROFF.hold) return 1;
	if (t >= POWEROFF.collapsed) return 0;
	return 1 - (t - POWEROFF.hold) / (POWEROFF.collapsed - POWEROFF.hold);
}

/**
 * How wide the beam is at `elapsedMs`, in columns. Zero before and after.
 *
 * It strikes as the power is cut, holds while the picture falls into it, then
 * goes — slowly at first and then all at once, because that acceleration into
 * the centre is the whole of what makes a CRT switching off recognisable.
 */
export function beamWidth(width: number, elapsedMs: number): number {
	const t = Math.min(1, Math.max(0, elapsedMs / CURTAIN.close));
	if (t <= POWEROFF.hold || t >= 1) return 0;
	const full = Math.max(1, Math.min(BEAM_WIDTH, width));

	if (t < POWEROFF.collapsed) {
		// Struck, not faded in: it reaches full width in the first moments of
		// the collapse, so the picture has something to fall into.
		const r = (t - POWEROFF.hold) / (POWEROFF.collapsed - POWEROFF.hold);
		return Math.max(1, Math.round(full * Math.min(1, r * 4)));
	}
	if (t < POWEROFF.narrowed) {
		const r = (t - POWEROFF.collapsed) / (POWEROFF.narrowed - POWEROFF.collapsed);
		return Math.max(1, Math.round(full * (1 - r) ** 2));
	}
	// The last tenth is the point itself, holding before it goes.
	return 1;
}

/**
 * One full-screen frame of the closing.
 *
 * The picture is the wordmark, squeezed vertically into fewer and fewer rows
 * until only the beam is left. Below a few rows there is nothing legible to
 * show, so the collapse hands over to the beam entirely rather than drawing a
 * smear.
 */
export function powerOffFrame(
	paint: Painter,
	width: number,
	height: number,
	elapsedMs: number,
	version: string,
): string[] {
	const room = Math.max(8, width);
	const art = renderLogo(paint, room, 0);
	const keep = Math.max(0, Math.round(art.length * squeeze(elapsedMs)));
	const beam = beamWidth(room, elapsedMs);

	const content: string[] = [];
	if (keep > 0) {
		for (let i = 0; i < keep; i++) {
			// Sample across the whole wordmark so the squeeze compresses it
			// rather than lopping off its bottom — the difference between a
			// picture being crushed and a picture being cropped.
			const source = art[Math.min(art.length - 1, Math.round((i * (art.length - 1)) / Math.max(1, keep - 1)))];
			content.push(centre(source ?? "", room));
		}
	}
	if (beam > 0) {
		const bar = "█".repeat(beam);
		content.push("", centre(fg(paint, "error", bar), room), "");
	}

	const goodbye = dim(paint, `KAIOKEN v${version} · session ended`);
	content.push(centre(goodbye, room));
	return centreBlock(content, height);
}

/**
 * The closing's final message, printed to the main screen after the curtain.
 *
 * A transient has no settled state, so with motion off the curtain does not
 * play — but the goodbye is a message rather than an effect, so it is printed
 * either way.
 */
export function goodbye(paint: Painter, version: string): string {
	return dim(paint, `kaioken v${version} · see you next session`);
}

/** Whether a curtain should play at all. */
export function curtainEnabled(): boolean {
	return motionEnabled();
}
