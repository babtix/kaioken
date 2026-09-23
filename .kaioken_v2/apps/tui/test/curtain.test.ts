import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
	BOOT,
	CLOSING,
	CURTAIN,
	GOODBYES,
	POWEROFF,
	beamWidth,
	bootFrame,
	bootScript,
	goodbye,
	goodbyeLine,
	openAura,
	opening,
	playCurtain,
	powerOffFrame,
	squeeze,
	typedLines,
} from "../src/curtain.js";
import { setMotion } from "../src/motion.js";
import { ScriptedTerminal } from "../src/scriptedTerminal.js";
import { stripAnsi } from "../src/theme.js";
import { visibleWidth } from "../src/screen.js";

/**
 * The curtain, tested without a clock and without a pty.
 *
 * Every frame is a pure function of elapsed milliseconds, so a test names the
 * instant it wants; the player takes its clock and its sleep as arguments, so
 * a whole animation runs to completion in no time at all. Nothing here waits.
 */
afterEach(() => {
	setMotion(true);
});

const VERSION = "2.0.0";
/** The boot frame's typed rows, in order, with the escapes taken off. */
function typed(elapsedMs: number, width = 80, height = 24): string[] {
	return bootFrame(width, height, elapsedMs, VERSION)
		.map(stripAnsi)
		.map((row) => row.trim())
		.filter((row) => row !== "" && !/^[═█╗╔╝╚║╠═]+$/.test(row.replace(/\s/g, "")));
}

describe("the opening, frame by frame", () => {
	it("fills exactly the screen it was given, at any size", () => {
		for (const height of [6, 12, 24, 50]) {
			for (const width of [30, 80, 200]) {
				expect(bootFrame(width, height, 900, VERSION)).toHaveLength(height);
			}
		}
	});

	it("never runs past the last column", () => {
		for (const width of [20, 40, 80, 200]) {
			for (const ms of [0, 300, 900, 1600, CURTAIN.open]) {
				for (const row of bootFrame(width, 24, ms, VERSION)) {
					expect(visibleWidth(row)).toBeLessThanOrEqual(Math.max(8, width));
				}
			}
		}
	});

	it("raises the wordmark a row at a time", () => {
		// The block font's last row is all `╚═╝` shadow, with no `█` in it, so
		// counting solid blocks alone would never see the sixth row land.
		const rows = (ms: number) => bootFrame(80, 24, ms, VERSION).filter((row) => /[█╚]/.test(row)).length;
		expect(rows(0)).toBe(0);
		expect(rows(CURTAIN.open * BOOT.logo * 0.4)).toBeGreaterThan(0);
		expect(rows(CURTAIN.open * BOOT.logo * 0.4)).toBeLessThan(rows(CURTAIN.open * BOOT.logo));
		// Whole from the end of its phase onward, and never taken away again.
		expect(rows(CURTAIN.open * BOOT.logo)).toBe(6);
		expect(rows(CURTAIN.open)).toBe(6);
	});

	it("widens the aura out of the centre, once the wordmark is whole", () => {
		// A row that is nothing *but* rule: the art's own bottom row carries
		// long `══` runs inside its shadow, so a substring test matches it too.
		const ruleWidth = (ms: number) => {
			const row = bootFrame(80, 24, ms, VERSION).find((line) => /^─+$/.test(stripAnsi(line).trim()));
			return row === undefined ? 0 : stripAnsi(row).trim().length;
		};
		// Nothing under a wordmark that has not finished arriving.
		expect(openAura(0)).toBe(0);
		expect(ruleWidth(CURTAIN.open * BOOT.logo * 0.5)).toBe(0);
		expect(ruleWidth(CURTAIN.open * BOOT.logo)).toBe(0);
		// Then it opens, and is whole for the rest of the curtain.
		const mid = CURTAIN.open * (BOOT.logo + (BOOT.aura - BOOT.logo) / 2);
		expect(ruleWidth(mid)).toBeGreaterThan(0);
		expect(ruleWidth(mid)).toBeLessThan(ruleWidth(CURTAIN.open * BOOT.aura));
		expect(openAura(CURTAIN.open * BOOT.aura)).toBe(1);
		expect(openAura(CURTAIN.open)).toBe(1);
	});

	it("holds the block in place while the wordmark arrives, so nothing jumps", () => {
		// Every frame is the same height and the art occupies the same rows;
		// only their contents change. A block that grew would slide the typed
		// lines down the screen under the caret.
		const first = bootFrame(80, 24, 0, VERSION);
		const later = bootFrame(80, 24, CURTAIN.open, VERSION);
		expect(first).toHaveLength(later.length);
		const artRow = later.findIndex((row) => row.includes("█"));
		expect(stripAnsi(first[artRow] as string).trim()).toBe("");
	});

	it("types nothing at all while the wordmark is still rising", () => {
		// Not even a caret: a lone block in the middle of an empty screen reads
		// as a rendering fault, not as a prompt.
		expect(typed(0)).toEqual([]);
		expect(typed(CURTAIN.open * BOOT.logo * 0.5)).toEqual([]);
	});

	it("types the script one character at a time, in order", () => {
		const script = bootScript(VERSION);
		const wanted = script.map((line) => line.text);
		let previous = "";
		for (let p = 0; p <= 1.0001; p += 0.05) {
			const shown = typedLines(script, p, 0)
				.map((row) => stripAnsi(row).replace("▌", ""))
				.join("");
			// Monotone: what was on screen stays on screen, and only grows.
			expect(shown.startsWith(previous)).toBe(true);
			// And it is always a prefix of the script, never invented text.
			expect(wanted.join("").startsWith(shown)).toBe(true);
			previous = shown;
		}
		expect(previous).toBe(wanted.join(""));
	});

	it("keeps the caret at the write head while typing", () => {
		const script = bootScript(VERSION);
		// A third of the way in, the caret is on the line being typed and on no
		// other — the finished line above it must not keep one.
		const rows = typedLines(script, 0.34, 0).map((row) => stripAnsi(row));
		expect(rows.filter((row) => row.includes("▌"))).toHaveLength(1);
		const head = rows.findIndex((row) => row.includes("▌"));
		expect(rows[head]?.endsWith("▌")).toBe(true);
		// Nothing below the write head has been written yet.
		for (const row of rows.slice(head + 1)) expect(row).toBe("");
	});

	it("parks the caret on the last line once everything is typed", () => {
		const rows = typedLines(bootScript(VERSION), 1, 0).map((row) => stripAnsi(row));
		expect(rows.at(-1)?.trimEnd().endsWith("▌")).toBe(true);
		for (const row of rows.slice(0, -1)) expect(row).not.toContain("▌");
	});

	it("finishes typing before the end, and holds the finished screen", () => {
		const script = bootScript(VERSION);
		const whole = script.map((line) => line.text);
		for (const ms of [CURTAIN.open * BOOT.typed, CURTAIN.open]) {
			const shown = typed(ms);
			for (const line of whole) expect(shown.join("\n")).toContain(line);
		}
	});

	it("says which version it is, from the caller rather than a second copy", () => {
		expect(bootFrame(80, 24, CURTAIN.open, "9.9.9").map(stripAnsi).join("\n")).toContain("v9.9.9");
	});

	it("gives up the wordmark, not the words, on a terminal with no room", () => {
		const short = bootFrame(80, 8, CURTAIN.open, VERSION);
		expect(short.some((row) => row.includes("█"))).toBe(false);
		expect(stripAnsi(short.join("\n"))).toContain("press / for commands");
	});
});

/** How many rows of the block wordmark survive at `elapsedMs`. */
function artRows(elapsedMs: number, width = 80, height = 24): number {
	return powerOffFrame(width, height, elapsedMs).filter((row) => /[█╚]/.test(stripAnsi(row))).length;
}

/** The beam row, if it is on screen: a run of solid block and nothing else. */
function beamRow(elapsedMs: number, width = 80, height = 24): string | undefined {
	return powerOffFrame(width, height, elapsedMs)
		.map((row) => stripAnsi(row).trim())
		.find((row) => row !== "" && /^█+$/.test(row));
}

describe("the closing, frame by frame", () => {
	it("fills exactly the screen it was given, at any size", () => {
		for (const height of [6, 12, 24, 50]) {
			for (const width of [30, 80, 200]) {
				expect(powerOffFrame(width, height, 400)).toHaveLength(height);
			}
		}
	});

	it("never runs past the last column", () => {
		for (const width of [20, 40, 80, 200]) {
			for (const ms of [0, 200, 500, 800, 1000, CURTAIN.close]) {
				for (const row of powerOffFrame(width, 24, ms)) {
					expect(visibleWidth(row)).toBeLessThanOrEqual(Math.max(8, width));
				}
			}
		}
	});

	it("opens on the wordmark whole, with the power still on", () => {
		// The session has had it on screen the whole time; making it arrive
		// again on the way out would read as a second startup.
		expect(artRows(0)).toBe(6);
		expect(squeeze(0)).toBe(1);
		expect(beamRow(0)).toBeUndefined();
		expect(beamRow(CURTAIN.close * POWEROFF.hold * 0.9)).toBeUndefined();
	});

	it("crushes the picture into the beam, from both edges at once", () => {
		const collapsing = CURTAIN.close * (POWEROFF.hold + (POWEROFF.collapsed - POWEROFF.hold) / 2);
		expect(artRows(collapsing)).toBeGreaterThan(0);
		expect(artRows(collapsing)).toBeLessThan(6);
		// Symmetric: the rows that survive are the middle ones, and the beam is
		// threaded between them rather than stacked underneath.
		const frame = powerOffFrame(80, 24, collapsing).map((row) => stripAnsi(row));
		const art = frame.map((row, i) => (/[█╚]/.test(row) && !/^\s*█+\s*$/.test(row) ? i : -1)).filter((i) => i >= 0);
		const beam = frame.findIndex((row) => /^\s*█+\s*$/.test(row) && row.trim() !== "");
		expect(art.filter((i) => i < beam).length).toBeGreaterThan(0);
		expect(art.filter((i) => i > beam).length).toBeGreaterThan(0);
	});

	it("leaves nothing but the beam once the picture is gone", () => {
		const flat = CURTAIN.close * POWEROFF.collapsed;
		expect(squeeze(flat)).toBe(0);
		expect(artRows(flat)).toBe(1);
		expect(beamRow(flat)).toMatch(/^█+$/);
	});

	it("strikes the beam at full width, then closes it to a point", () => {
		expect(beamWidth(80, 0)).toBe(0);
		// Struck early in the collapse, so the picture has something to fall into.
		const struck = CURTAIN.close * (POWEROFF.hold + (POWEROFF.collapsed - POWEROFF.hold) * 0.3);
		expect(beamWidth(80, struck)).toBe(54);
		expect(beamWidth(80, CURTAIN.close * POWEROFF.collapsed)).toBe(54);
		// Then it gives ground slowly and goes all at once.
		const half = CURTAIN.close * (POWEROFF.collapsed + (POWEROFF.narrowed - POWEROFF.collapsed) / 2);
		expect(beamWidth(80, half)).toBeGreaterThan(1);
		expect(beamWidth(80, half)).toBeLessThan(54 / 2);
		expect(beamWidth(80, CURTAIN.close * POWEROFF.narrowed)).toBe(1);
	});

	it("shrinks the beam monotonically once it has struck", () => {
		let previous = Number.POSITIVE_INFINITY;
		for (let t = POWEROFF.collapsed; t <= 1.0001; t += 0.02) {
			const now = beamWidth(80, CURTAIN.close * t);
			expect(now).toBeLessThanOrEqual(previous);
			previous = now;
		}
	});

	it("never lets the beam outgrow a narrow terminal", () => {
		for (const width of [20, 40, 54, 200]) {
			for (const ms of [300, 600, 900]) {
				expect(beamWidth(width, ms)).toBeLessThanOrEqual(Math.max(1, Math.min(54, width)));
			}
		}
	});

	it("ends on an empty screen, so the transcript comes back to nothing", () => {
		expect(beamWidth(80, CURTAIN.close)).toBe(0);
		expect(powerOffFrame(80, 24, CURTAIN.close).every((row) => stripAnsi(row).trim() === "")).toBe(true);
	});

	it("says nothing at all — the goodbye is the only word on the way out", () => {
		for (const ms of [0, 300, 600, 900, CURTAIN.close]) {
			const shown = stripAnsi(powerOffFrame(80, 24, ms).join("")).replace(/[\s█╗╔╝╚║═]/g, "");
			expect(shown).toBe("");
		}
	});

	it("drops the wordmark on a terminal with no room, and still powers off", () => {
		expect(powerOffFrame(80, 6, 0).some((row) => /╚/.test(row))).toBe(false);
		expect(beamRow(CURTAIN.close * POWEROFF.collapsed, 80, 6)).toMatch(/^█+$/);
	});
});

describe("the goodbye", () => {
	it("offers the friendly ones, verbatim", () => {
		expect(GOODBYES).toContain("Goodbye! Come back soon to finish your project.");
		expect(GOODBYES).toContain("Why did you leave? Come back right now!");
		expect(GOODBYES).toContain("Project unfinished… returning is your destiny.");
	});

	it("picks one, and stays inside the list for every value a random can take", () => {
		for (const value of [0, 0.5, 0.999_999, 1]) {
			expect(GOODBYES).toContain(goodbye(() => value));
		}
	});

	it("keeps every one of them to a single row", () => {
		// The goodbye is written straight to the main screen, under a transcript
		// pi-tui has already laid out. A line that wrapped would land as two
		// rows with the gutter on only the first, which reads as a broken paint
		// rather than as a sign-off. The gutter and its space cost two columns.
		for (const text of GOODBYES) {
			expect(text).not.toContain("\n");
			expect(visibleWidth(goodbyeLine(text))).toBeLessThanOrEqual(78);
		}
	});

	it("has no duplicates, so the list is as long as it looks", () => {
		expect(new Set(GOODBYES).size).toBe(GOODBYES.length);
	});

	it("renders as one line, in the interface's own voice", () => {
		const line = goodbyeLine("Why did you leave? Come back right now!");
		expect(line).not.toContain("\n");
		expect(stripAnsi(line)).toBe("▎ Why did you leave? Come back right now!");
	});
});

describe("the player", () => {
	/** A clock the test advances by hand: no timers, no waiting, no flake. */
	function fakeClock(step: number) {
		let clock = 0;
		return {
			now: () => clock,
			sleep: async (ms: number) => {
				clock += ms || step;
			},
		};
	}

	const OPENING = opening(VERSION);
	const both: Array<[string, ReturnType<typeof opening>]> = [
		["opening", OPENING],
		["closing", CLOSING],
	];

	it("paints the boot and settles on the finished screen", async () => {
		const terminal = new ScriptedTerminal(80, 24);
		await playCurtain(terminal, OPENING, { motion: true, ...fakeClock(CURTAIN.frameMs) });
		const painted = terminal.frames();
		expect(painted).toContain("$ kaioken");
		expect(painted).toContain(`KAIOKEN v${VERSION} · the knowledge engine`);
		expect(painted).toContain("type to chat · press / for commands");
	});

	it("paints the power-off and settles on an empty screen", async () => {
		const terminal = new ScriptedTerminal(80, 24);
		await playCurtain(terminal, CLOSING, { motion: true, ...fakeClock(CURTAIN.frameMs) });
		const painted = terminal.frames();
		// The wordmark it started from, and the beam it collapsed into.
		expect(painted).toContain("╚═╝");
		expect(painted).toContain("█".repeat(54));
	});

	for (const [name, curtain] of both) {
		it(`${name}: borrows the alternate screen and gives it straight back`, async () => {
			const terminal = new ScriptedTerminal(80, 24);
			await playCurtain(terminal, curtain, { motion: true, ...fakeClock(CURTAIN.frameMs) });
			const output = terminal.output();
			// Whatever was on the main screen is still there afterwards: the
			// shell's scrollback going in, the restored transcript coming out.
			expect(output.startsWith("\x1b[?1049h")).toBe(true);
			expect(output.endsWith("\x1b[?1049l\x1b[?7h\x1b[?25h")).toBe(true);
			expect(output).toContain("\x1b[?25l");
		});

		it(`${name}: repaints from home rather than scrolling the screen`, async () => {
			const terminal = new ScriptedTerminal(80, 24);
			await playCurtain(terminal, curtain, { motion: true, ...fakeClock(CURTAIN.frameMs) });
			const output = terminal.output();
			// Every frame starts at the top-left, and the last row of a
			// full-height frame carries no newline, so the drawing cannot walk
			// upward as it repaints.
			expect(output.split("\x1b[H").length - 1).toBeGreaterThan(2);
			expect(output).not.toContain("\x1b[2K\r\n\x1b[?1049l");
		});

		it(`${name}: plays on a terminal too short for the whole layout`, async () => {
			const terminal = new ScriptedTerminal(80, 4);
			await playCurtain(terminal, curtain, { motion: true, ...fakeClock(CURTAIN.frameMs) });
			expect(terminal.output()).not.toBe("");
		});

		it(`${name}: terminates rather than spinning, at any frame rate`, async () => {
			for (const frameMs of [1, 45, 1000]) {
				const terminal = new ScriptedTerminal(80, 24);
				await playCurtain(terminal, curtain, { motion: true, frameMs, ...fakeClock(frameMs) });
				expect(terminal.output()).not.toBe("");
			}
		});

		it(`${name}: writes nothing at all when motion is off`, async () => {
			const terminal = new ScriptedTerminal(80, 24);
			await playCurtain(terminal, curtain, { motion: false });
			expect(terminal.output()).toBe("");
		});
	}

	it("follows the global motion switch when not told otherwise", async () => {
		setMotion(false);
		const terminal = new ScriptedTerminal(80, 24);
		await playCurtain(terminal, CLOSING);
		expect(terminal.output()).toBe("");
	});
});

/**
 * The curtain has to hold the event loop open while it plays.
 *
 * This is the one property no in-process test can see, and getting it wrong is
 * silent. The player's frame delay was originally an `unref`'d timer, on the
 * reasoning that an animation should never be what keeps a process alive. But
 * the opening plays *before* pi-tui has taken stdin and the closing *after* it
 * has given it back, and at both of those moments the frame delay is the only
 * thing referencing the loop. With it unref'd node had nothing left to wait
 * for, exited mid-curtain with status 0, and the shell opened and closed again
 * before it could paint — no error, no stack, nothing to search for.
 *
 * Under vitest the runner's own handles hold the loop open, so every test
 * above passes either way. Only a bare process can tell the difference, which
 * is why this one spawns one.
 */
describe("the event loop", () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const dist = join(here, "..", "dist");

	it("stays alive until the curtain has finished playing", async () => {
		// Built output, not source: the point is a plain node process with
		// nothing else running in it, and that cannot go through the test
		// runner's transform. `npm test` builds before it runs vitest.
		const curtain = join(dist, "curtain.js");
		expect(existsSync(curtain), `${curtain} is missing — run \`npm run build\` first`).toBe(true);

		const probe = [
			`import { playCurtain, CLOSING } from ${JSON.stringify(pathToFileURL(curtain).href)};`,
			`import { ScriptedTerminal } from ${JSON.stringify(pathToFileURL(join(dist, "scriptedTerminal.js")).href)};`,
			// The real clock and the real sleep. Injecting either would hand the
			// loop something to hold, which is the thing being tested.
			"await playCurtain(new ScriptedTerminal(80, 24), CLOSING, { motion: true });",
			"process.stdout.write('FINISHED');",
		].join("\n");

		const { stdout } = await promisify(execFile)(process.execPath, ["--input-type=module", "-e", probe]);
		// An early exit is a clean one — status 0, no output. The sentinel is
		// the only evidence that the curtain ran to the end.
		expect(stdout).toBe("FINISHED");
	}, 15_000);
});
