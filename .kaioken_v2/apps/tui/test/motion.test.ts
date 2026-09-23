import { afterEach, describe, expect, it } from "vitest";
import {
	FLASH_MS,
	HIGH_POWER,
	TIMING,
	caret,
	chargeOffset,
	easeOut,
	fillBar,
	flashAlive,
	isRevealing,
	motionEnabled,
	motionFromEnv,
	phase,
	powerBand,
	powerMeter,
	pulseText,
	renderFlash,
	revealedRows,
	setMotion,
	shimmerBar,
	spinner,
	sweepRule,
} from "../src/motion.js";
import { renderProgress, renderSeam, renderStatusLine } from "../src/statusLine.js";
import { renderLogo, stickyHeader, type HeaderInfo } from "../src/logo.js";
import { multiplierOf, dispatch, type Session } from "../src/dispatch.js";
import { stripAnsi } from "../src/theme.js";
import { visibleWidth } from "../src/screen.js";

/**
 * Motion, tested without a clock.
 *
 * Every effect is a pure function of elapsed milliseconds, so a test names the
 * instant it wants and gets exactly that frame — no timers, no sleeping, no
 * flake. It also means the durations asserted here are the ones DESIGN.md §2.5
 * specifies, not whatever the shell's tick rate happens to be.
 */
afterEach(() => {
	setMotion(true);
});

describe("timing", () => {
	it("uses the durations from the DESIGN.md keyframe matrix", () => {
		expect(TIMING.caretBlink).toBe(1050);
		expect(TIMING.riseIn).toBe(550);
		expect(TIMING.ruleSweep).toBe(6000);
		expect(TIMING.shimmer).toBe(2400);
	});

	it("wraps the phase into 0..1 and never leaves it", () => {
		expect(phase(0, 1000)).toBe(0);
		expect(phase(500, 1000)).toBe(0.5);
		expect(phase(1500, 1000)).toBe(0.5);
		expect(phase(0, 0)).toBe(1);
		for (const ms of [0, 1, 999, 1_000_000]) {
			expect(phase(ms, 333)).toBeGreaterThanOrEqual(0);
			expect(phase(ms, 333)).toBeLessThan(1);
		}
	});

	it("eases out: fast away, long settle", () => {
		expect(easeOut(0)).toBe(0);
		expect(easeOut(1)).toBe(1);
		expect(easeOut(0.5)).toBeGreaterThan(0.5);
		expect(easeOut(-5)).toBe(0);
		expect(easeOut(5)).toBe(1);
	});
});

describe("switching motion off", () => {
	it("is read from the environment, not guessed", () => {
		expect(motionFromEnv({})).toBe(true);
		expect(motionFromEnv({ KAIOKEN_NO_MOTION: "1" })).toBe(false);
		expect(motionFromEnv({ NO_MOTION: "1" })).toBe(false);
		// A terminal that opted out of colour opted out of every effect here.
		expect(motionFromEnv({ NO_COLOR: "1" })).toBe(false);
		expect(motionFromEnv({ TERM: "dumb" })).toBe(false);
	});

	it("settles every effect rather than freezing a frame", () => {
		setMotion(false);
		expect(motionEnabled()).toBe(false);
		// The caret stays lit, the entrance is over, the sweep is a plain rule,
		// and the spinner is a mark rather than an arbitrary braille frame.
		expect(stripAnsi(caret(0))).toBe("▌");
		expect(stripAnsi(caret(9999))).toBe("▌");
		expect(revealedRows(6, 0)).toBe(6);
		expect(isRevealing(6, 0)).toBe(false);
		expect(chargeOffset(0)).toBe(0);
		expect(spinner(0)).toBe("•");
		expect(new Set(stripAnsi(sweepRule(20, 1234)))).toEqual(new Set("─"));
	});
});

describe("the spinner and the caret", () => {
	it("advances the spinner on its own cadence", () => {
		expect(spinner(0)).toBe("⠋");
		expect(spinner(TIMING.spinner)).toBe("⠙");
		// One full turn returns to the start.
		expect(spinner(TIMING.spinner * 10)).toBe("⠋");
	});

	it("blinks the caret step-end: on for half the cycle, off for half", () => {
		expect(stripAnsi(caret(0))).toBe("▌");
		expect(stripAnsi(caret(TIMING.caretBlink * 0.25))).toBe("▌");
		expect(stripAnsi(caret(TIMING.caretBlink * 0.75))).toBe(" ");
		expect(stripAnsi(caret(TIMING.caretBlink))).toBe("▌");
	});
});

describe("the sweep", () => {
	it("keeps the rule exactly the requested width at every phase", () => {
		for (const ms of [0, 500, 2999, 5999, 12_345]) {
			expect(visibleWidth(stripAnsi(sweepRule(60, ms))), `at ${ms}ms`).toBe(60);
		}
	});

	it("is a plain rule when nothing is running", () => {
		const idle = sweepRule(40, 1000, false);
		expect(stripAnsi(idle)).toBe("─".repeat(40));
		// Only one colour: no highlight travelling along it.
		expect(idle.match(/38;5;/g)).toHaveLength(1);
	});

	it("moves the highlight along as time passes", () => {
		const a = sweepRule(60, 0);
		const b = sweepRule(60, TIMING.ruleSweep * 0.5);
		expect(a).not.toBe(b);
	});
});

describe("indeterminate progress", () => {
	it("holds its width at every phase", () => {
		for (const ms of [0, 600, 1200, 2399, 7000]) {
			expect(visibleWidth(stripAnsi(shimmerBar(24, ms))), `at ${ms}ms`).toBe(24);
		}
	});

	it("never claims a percentage it cannot know", () => {
		const bar = stripAnsi(shimmerBar(24, 800));
		expect(bar).not.toMatch(/\d+%/);
	});

	it("appends a label without stretching the bar", () => {
		expect(stripAnsi(shimmerBar(10, 0, "generating"))).toContain("generating");
	});
});

describe("the determinate fill", () => {
	it("fills left to right over the duration and stops full", () => {
		expect(stripAnsi(fillBar(10, 0, 1000))).toBe("░".repeat(10));
		expect(stripAnsi(fillBar(10, 500, 1000))).toBe(`${"█".repeat(5)}${"░".repeat(5)}`);
		expect(stripAnsi(fillBar(10, 5000, 1000))).toBe("█".repeat(10));
	});
});

describe("the power dial", () => {
	it("bands the multiplier the way DESIGN.md §6.3 does", () => {
		expect(powerBand(1).note).toContain("single fast pass");
		expect(powerBand(3).note).toContain("standard");
		expect(powerBand(5).note).toContain("critique-and-revise");
		expect(powerBand(HIGH_POWER).note).toContain("15–30×");
		expect(powerBand(10).note).toContain("15–30×");
	});

	it("shows the level, a meter and what it costs", () => {
		const meter = stripAnsi(powerMeter(3));
		expect(meter).toContain("POWER ×3");
		expect(meter).toContain("███");
		expect(meter).toContain("standard thorough coverage");
	});

	it("clamps out-of-range dials rather than drawing nonsense", () => {
		expect(stripAnsi(powerMeter(0))).toContain("POWER ×1");
		expect(stripAnsi(powerMeter(99))).toContain("POWER ×10");
	});

	it("pulses only above the high-power threshold", () => {
		const calmA = powerMeter(3, 0);
		const calmB = powerMeter(3, TIMING.pulse * 0.75);
		expect(calmA).toBe(calmB);

		const hotA = powerMeter(9, 0);
		const hotB = powerMeter(9, TIMING.pulse * 0.75);
		expect(hotA).not.toBe(hotB);
	});
});

describe("the entrance", () => {
	it("reveals the rows top-down and finishes on time", () => {
		expect(revealedRows(10, 0)).toBe(0);
		expect(revealedRows(10, TIMING.riseIn / 2)).toBeGreaterThan(0);
		expect(revealedRows(10, TIMING.riseIn)).toBe(10);
		expect(isRevealing(10, TIMING.riseIn)).toBe(false);
	});

	it("charges the wordmark's gradient, then settles to the fixed diagonal", () => {
		const charging = renderLogo(120, 0);
		const settled = renderLogo(120, TIMING.riseIn);
		expect(charging).not.toEqual(settled);
		// Once the entrance is over it matches the static render exactly.
		expect(settled).toEqual(renderLogo(120));
		expect(chargeOffset(TIMING.riseIn)).toBe(0);
	});

	it("keeps the header's full height while the rows arrive", () => {
		const info: HeaderInfo = {
			version: "2.0.0",
			repo: "/repo",
			model: "m",
			provider: "p",
			hasKey: true,
		};
		const settled = stickyHeader(info, 140, 40);
		// The block never changes height, so the transcript below cannot jump
		// as each row lands.
		for (const ms of [0, 100, 300, TIMING.riseIn]) {
			expect(stickyHeader(info, 140, 40, ms), `at ${ms}ms`).toHaveLength(settled.length);
		}
		expect(stickyHeader(info, 140, 40, TIMING.riseIn)).toEqual(settled);
	});
});

describe("the flash", () => {
	it("lives for its lifetime and not a millisecond longer", () => {
		expect(flashAlive(0)).toBe(true);
		expect(flashAlive(FLASH_MS - 1)).toBe(true);
		expect(flashAlive(FLASH_MS)).toBe(false);
		expect(renderFlash("saved", FLASH_MS)).toBe("");
	});

	it("dims as it leaves rather than vanishing", () => {
		expect(renderFlash("saved", 0)).not.toBe(renderFlash("saved", FLASH_MS * 0.9));
		expect(stripAnsi(renderFlash("saved", 0))).toContain("saved");
	});

	it("takes the status row from the hints while it lives", () => {
		const idle = stripAnsi(renderStatusLine({}, 80));
		expect(idle).toContain("/ commands");
		const flashed = stripAnsi(renderStatusLine({ flash: { text: "theme → light", elapsedMs: 0 } }, 80));
		expect(flashed).toContain("theme → light");
		expect(flashed).not.toContain("/ commands");
		// And gives it back once expired.
		const expired = stripAnsi(renderStatusLine({ flash: { text: "x", elapsedMs: FLASH_MS + 1 } }, 80));
		expect(expired).toContain("/ commands");
	});
});

describe("the armed pulse", () => {
	it("alternates while armed, and settles hot when motion is off", () => {
		expect(pulseText("apply edit", 0)).not.toBe(pulseText("apply edit", TIMING.pulse * 0.75));
		setMotion(false);
		expect(pulseText("apply edit", 0)).toBe(pulseText("apply edit", TIMING.pulse * 0.75));
	});
});

describe("the status row's motion", () => {
	it("renders the seam as a static rule without animating while a task runs", () => {
		const idle = renderSeam(50, undefined);
		const busy = renderSeam(50, { text: "generating", elapsedMs: 1500 });
		expect(stripAnsi(idle)).toBe("─".repeat(50));
		expect(busy).toBe(idle);
		expect(visibleWidth(stripAnsi(busy))).toBe(50);
	});

	it("does not show a progress row while a task runs to keep a single loading animation", () => {
		expect(renderProgress(80, undefined)).toEqual([]);
		expect(renderProgress(80, { text: "generating the wiki", elapsedMs: 4000 })).toEqual([]);
	});
});

describe("the high-power gate", () => {
	function session(): Session {
		return {
			root: "/repo",
			version: "2.0.0",
			model: "m",
			provider: "p",
			hasKey: true,
			autoApprove: false,
			mode: "build",
			thinking: "off",
			notes: [],
			queued: [],
			serveUrl: null,
		};
	}

	it("reads the leading xN dial, and only a real one", () => {
		expect(multiplierOf(["x3"])).toBe(3);
		expect(multiplierOf(["force", "x10"])).toBe(10);
		expect(multiplierOf(["force"])).toBeNull();
		// Out of range is not a dial; it must not be silently clamped into one.
		expect(multiplierOf(["x0"])).toBeNull();
		expect(multiplierOf(["x99"])).toBeNull();
	});

	it("puts the meter on screen before the run starts", () => {
		const result = dispatch("/wiki x3", session());
		expect(stripAnsi(result.lines.join("\n"))).toContain("POWER ×3");
		expect(result.run?.command).toBe("wiki");
		// Below the threshold it just runs.
		expect(result.confirm).toBeUndefined();
	});

	it("holds a high-power run behind an explicit yes", () => {
		const result = dispatch("/wiki x9", session());
		expect(stripAnsi(result.lines.join("\n"))).toContain("POWER ×9");
		expect(result.confirm).toContain("15–30×");
		// The run is described but not started; the shell gates it.
		expect(result.run?.command).toBe("wiki");
	});

	it("leaves a dial-free command alone", () => {
		const result = dispatch("/status", session());
		expect(result.lines).toEqual([]);
		expect(result.confirm).toBeUndefined();
	});
});
