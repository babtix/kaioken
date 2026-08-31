/**
 * The curtain: the two animations that play when nothing else is on screen.
 *
 * Everything in `motion.ts` indicates a state — work in flight, a stream still
 * arriving, an armed destructive action. The curtain indicates a *boundary*:
 * the session starting, and the session ending. That is the whole of its job,
 * which is why there are exactly two of them. DESIGN.md's axiom still binds —
 * *if everything glows, nothing communicates* — and a shell that flourished on
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
 * pi-tui has just restored to the main screen is only hidden for a moment, and
 * comes back — with the goodbye under it — the instant the curtain lifts.
 *
 * The same two rules as `motion.ts` apply, for the same reasons:
 *
 * - Every frame is a **pure function of elapsed milliseconds**, so a test names
 *   the instant it wants and gets exactly that frame — no pty, no timers.
 * - Motion off means *no curtain at all*. A transient has no settled state to
 *   fall back to: the honest still version of a flourish is not showing it. The
 *   goodbye is a message rather than an effect, so it is printed either way.
 */
import type { Terminal } from "@earendil-works/pi-tui";
import { renderLogo } from "./logo.js";
import { caret, motionEnabled, TIMING } from "./motion.js";
import { truncate, visibleWidth } from "./screen.js";
import { bold, dim, fg, GUTTER, type Role } from "./theme.js";

/**
 * Durations.
 *
 * Not from DESIGN.md §2.5 — the keyframe matrix has no curtain in it, and
 * these are longer than anything in it on purpose. The first pass sat in the
 * `rise-in` family at half a second and was over before it registered: a
 * boundary marker nobody sees is not marking a boundary.
 *
 * The opening is paced by its text, because typing has a legible speed — under
 * about eight milliseconds a character it stops reading as typing and starts
 * reading as a paint. It is also the whole cost of launching the tool, and
 * everything else at boot (artifact reads, model seeding) runs underneath it,
 * so it is held to a beat, not a pause. The closing has nothing to read, sits
 * between the quit keystroke and the shell prompt coming back, and is a
 * collapse rather than an arrival, so it takes about two thirds as long.
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
 * before pi-tui paints over it, which is the same as not having written it.
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
 * Roles rather than raw escapes, so `/theme light` and NO_COLOR both come out
 * right. The wordmark's gradient is brand art and pays for its raw 256-colour
 * codes; a transient does not.
 */
function heat(distance: number, reach: number): Role {
	if (reach <= 0) return "diffDel";
	const t = Math.min(1, distance / reach);
	if (t < 0.34) return "diffDel";
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
export function aura(width: number, extent: number): string {
	const reach = Math.min(MAX_REACH, Math.floor((width - 1) / 2));
	const half = Math.max(0, Math.min(reach, Math.round(extent * reach)));
	if (half === 0) return "";

	let out = "";
	let run = "";
	let runRole: Role | null = null;
	for (let i = -half; i <= half; i++) {
		const role = heat(Math.abs(i), reach);
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
 * none of that is happening yet: the reads this shell actually does run after
 * the curtain, against a terminal it does not own during it. So the lines say
 * what the thing *is* and what to press, which is the one piece of information
 * a first-time user needs and the header repeats a second later anyway.
 */
export function bootScript(version: string): BootLine[] {
	return [
		{ text: "$ kaioken", style: (shown) => bold(fg("accent", shown)) },
		{ text: `KAIOKEN v${version} · the knowledge engine`, style: (shown) => fg("text", shown) },
		{ text: "type to chat · press / for commands", style: (shown) => dim(shown) },
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
export function typedLines(script: readonly BootLine[], progress: number, elapsedMs: number): string[] {
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
		out.push(line.style(shown) + (head ? fg("accent", "▌") : ""));
	}

	// Nothing left to type: the caret parks at the end of the last line and
	// blinks, which is what says the machine is waiting rather than finished.
	if (!headPlaced && out.length > 0) out[out.length - 1] += caret(elapsedMs);
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
): string[] {
	const content: string[] = [];
	// The art is what goes first on a terminal with no room for all of it: the
	// typed lines carry the words, and a wordmark with its legs cut off is
	// worse than no wordmark.
	if (height >= art.length + lines.length + 4) {
		for (let i = 0; i < art.length; i++) content.push(i < shownRows ? centre(art[i] as string, width) : "");
		content.push("", centre(aura(width, auraExtent), width), "");
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
export function bootFrame(width: number, height: number, elapsedMs: number, version: string): string[] {
	const room = Math.max(8, width);
	const t = Math.min(1, Math.max(0, elapsedMs / CURTAIN.open));

	// The gradient's charge-up is written against `rise-in`, so the phase is
	// scaled onto that duration rather than reimplemented here.
	const rising = Math.min(1, t / BOOT.logo);
	const art = renderLogo(room, rising * TIMING.riseIn);
	// The rows arrive linearly, though — *not* through `revealedRows`. That
	// helper's cubic ease is tuned for the header's half-second entrance and
	// has the block whole by the halfway point, which here left a dead quarter
	// second between the wordmark landing and the typing starting. One row per
	// equal slice reads like the terminal printing the banner, which is the
	// whole idea.
	const shownRows = Math.min(art.length, Math.ceil(rising * art.length));

	const typing = t <= BOOT.aura ? 0 : Math.min(1, (t - BOOT.aura) / (BOOT.typed - BOOT.aura));
	return stage(room, height, art, shownRows, openAura(elapsedMs), typedLines(bootScript(version), typing, elapsedMs));
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
	// The point it leaves behind, before the screen goes.
	return 1;
}

/**
 * One full-screen frame of the closing.
 *
 * Wordless on purpose. The opening talks — it has a version to announce and a
 * key to teach — and giving the exit its own script would have been the third
 * time in two seconds that the interface introduced itself. What is left to
 * say goes in the goodbye, on the main screen, where it survives.
 */
export function powerOffFrame(width: number, height: number, elapsedMs: number): string[] {
	const room = Math.max(8, width);
	// Already charged: the wordmark has been on screen all session, and making
	// it arrive again on the way out would read as a second startup.
	const art = renderLogo(room, TIMING.riseIn);

	// The picture is crushed toward its middle, so the rows that survive
	// longest are the ones nearest the beam.
	const kept: string[] = [];
	const keep = Math.round(squeeze(elapsedMs) * art.length);
	if (keep > 0 && height >= art.length + 2) {
		const first = Math.floor((art.length - keep) / 2);
		for (let i = 0; i < keep; i++) kept.push(centre(art[first + i] as string, room));
	}

	const beam = beamWidth(room, elapsedMs);
	if (beam === 0) return centreBlock(kept, height);

	// `text` rather than the brand accent: the beam is the tube's own light,
	// not the wordmark's, and `text` is the highest-contrast role in every
	// palette — which keeps it reading as bright on a light terminal too.
	const line = centre(bold(fg("text", "█".repeat(beam))), room);
	// Threaded through the middle of what is left, not stacked under it. The
	// picture has to close on the beam from both edges at once; with the beam
	// below the survivors it read as the wordmark sinking onto a shelf.
	const above = Math.ceil(kept.length / 2);
	return centreBlock([...kept.slice(0, above), line, ...kept.slice(above)], height);
}

// ---- what the player runs ----

/** A curtain: how long it lasts, and what the screen looks like at `t`. */
export interface Curtain {
	durationMs: number;
	frame(width: number, height: number, elapsedMs: number): string[];
}

/**
 * The opening, bound to the version it announces.
 *
 * A function rather than a constant because the version lives in `app.ts`,
 * which imports this module — reaching back for it would be a cycle, and
 * hard-coding a second copy of a version string is how the two drift. The
 * closing says nothing, so it needs nothing and stays a constant.
 */
export function opening(version: string): Curtain {
	return {
		durationMs: CURTAIN.open,
		frame: (width, height, elapsedMs) => bootFrame(width, height, elapsedMs, version),
	};
}

export const CLOSING: Curtain = {
	durationMs: CURTAIN.close,
	frame: powerOffFrame,
};

// ---- the goodbye ----

/**
 * What the shell says on the way out.
 *
 * The one place in the interface allowed to be a joke. It costs a single row,
 * it is the last thing on screen, and a tool that says nothing when you leave
 * reads as a tool that crashed.
 */
export const GOODBYES: readonly string[] = [
	"Goodbye! Come back soon to finish your project.",
	"Why did you leave? Come back right now!",
	"Project unfinished… returning is your destiny.",
	"Powering down. The repository will keep — it always does.",
	"Off already? Your codebase was just getting interesting.",
	"The wiki will not write itself. (It will. Come back anyway.)",
	"×0. Rest up — the multiplier resets in the morning.",
	"Closing the session, not the loop. See you shortly.",
	"KAIOKEN off. Power level back to normal.",
	"Go outside. The repository will still be here.",
	"Somewhere in your code, a question waits unanswered.",
	"Session over. The codebase remains undefeated.",
	"Leaving now? It was just about to make sense.",
	"See you next time. Bring questions.",
	"Back to the shell, then. It is quieter here.",
];

/** Pick one. `random` is injected so a test can pin the choice. */
export function goodbye(random: () => number = Math.random): string {
	const index = Math.min(GOODBYES.length - 1, Math.max(0, Math.floor(random() * GOODBYES.length)));
	return GOODBYES[index] as string;
}

/** The goodbye, styled like every other spoken line in the interface. */
export function goodbyeLine(text: string): string {
	return `${fg("accent", GUTTER)} ${bold(fg("accent", text))}`;
}

// ---- the player ----

const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";
const DISABLE_AUTOWRAP = "\x1b[?7l";
const ENABLE_AUTOWRAP = "\x1b[?7h";
const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";
const RESET_SGR = "\x1b[0m";
const HOME = "\x1b[H";
const CLEAR_SCREEN = "\x1b[2J";
/** Erase the whole row the cursor is on. */
const CLEAR_ROW = "\x1b[2K";

export interface CurtainDeps {
	now?: () => number;
	sleep?: (ms: number) => Promise<void>;
	frameMs?: number;
	/** Play at all. Defaults to the global motion switch. */
	motion?: boolean;
}

/**
 * The frame delay — and a ref'd timer, deliberately.
 *
 * `unref` here is fatal, and silently so. The opening plays before pi-tui has
 * taken stdin, and the closing after it has given it back; at both of those
 * moments this timer is the *only* thing referencing the event loop. Unref it
 * and node has nothing left to wait for, so it exits mid-curtain with status
 * 0 — the shell opens and closes again before it can paint a frame, and the
 * goodbye never prints.
 *
 * Holding the loop is the correct behaviour: the curtain is bounded by
 * `Curtain.durationMs`, so the longest it can ever delay an exit is the couple
 * of seconds it was asked for.
 */
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Play a curtain full screen, and give the terminal back exactly as it was
 * found.
 *
 * The alternate screen rather than a `clear`, at both ends and for the same
 * reason: whatever was on the main screen is still there afterwards, untouched
 * and unscrolled. On the way in that is the shell's scrollback; on the way out
 * it is the transcript pi-tui restored a moment earlier, which comes back with
 * the goodbye under it the instant this lifts.
 *
 * Every mode it changes is restored in a `finally`. A curtain that threw
 * mid-frame must not hand back a terminal with no cursor in it.
 */
export async function playCurtain(terminal: Terminal, curtain: Curtain, deps: CurtainDeps = {}): Promise<void> {
	if (!(deps.motion ?? motionEnabled())) return;

	const width = Math.max(8, terminal.columns);
	const height = Math.max(1, terminal.rows);
	const now = deps.now ?? Date.now;
	const sleep = deps.sleep ?? wait;
	const frameMs = deps.frameMs ?? CURTAIN.frameMs;

	terminal.write(`${ENTER_ALT_SCREEN}${DISABLE_AUTOWRAP}${HIDE_CURSOR}${CLEAR_SCREEN}${HOME}`);
	try {
		const startedAt = now();
		for (;;) {
			const elapsed = now() - startedAt;
			const done = elapsed >= curtain.durationMs;
			// The last frame is drawn at exactly the duration, so what settles
			// on screen is the end state rather than whichever frame the clock
			// happened to land on.
			terminal.write(paint(curtain.frame(width, height, done ? curtain.durationMs : elapsed), height, width));
			if (done) break;
			await sleep(frameMs);
		}
	} finally {
		terminal.write(`${RESET_SGR}${EXIT_ALT_SCREEN}${ENABLE_AUTOWRAP}${SHOW_CURSOR}`);
	}
}

/**
 * Repaint the whole screen.
 *
 * No trailing newline after the last row: on a full-height frame that would
 * scroll the screen by one and walk the drawing upward every frame.
 */
function paint(rows: readonly string[], height: number, width: number): string {
	let out = HOME;
	for (let i = 0; i < height; i++) {
		if (i > 0) out += "\r\n";
		out += `${CLEAR_ROW}${truncate(rows[i] ?? "", width)}`;
	}
	return out;
}
