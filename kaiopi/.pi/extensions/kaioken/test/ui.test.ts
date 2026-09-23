import { describe, expect, it } from "vitest";
import { CURTAIN, POWEROFF, beamWidth, bootFrame, openAura, powerOffFrame, squeeze, typedLines } from "../ui/curtain.ts";
import {
	blockWidth,
	compactHeader,
	displayModel,
	joinHorizontal,
	knowledgeSummary,
	logoPlain,
	renderLogo,
	repoLabel,
	shortPath,
	statusPanel,
	stickyHeader,
	truncate,
	visibleWidth,
} from "../ui/logo.ts";
import { TIMING, chargeOffset, easeOut, phase, powerMeter, revealedRows, sweepRule } from "../ui/motion.ts";
import { ROLE_TOKEN, colorFromEnv, type PaintTheme, type Painter } from "../ui/theme.ts";

/**
 * A theme that returns its input unchanged.
 *
 * Every assertion below is about structure — which rows, how many, how wide,
 * in what order — and none of them is about colour. Stripping the styling
 * keeps the expectations readable and means a theme change cannot break a test
 * that was never about colour in the first place.
 */
const theme: PaintTheme = {
	fg: (_token, text) => text,
	bold: (text) => text,
};

const paint: Painter = { theme, colored: true };

/**
 * A painter that keeps the escapes.
 *
 * Several effects here are *only* colour — a sweeping highlight, a pulsing
 * meter — so a stripping theme cannot observe them at all. Those assertions
 * use this one; the structural ones use the plain painter above.
 */
function tinted(): Painter {
	return {
		theme: {
			fg: (token, text) => `\x1b[38;5;${token.length}m${text}\x1b[0m`,
			bold: (text) => `\x1b[1m${text}\x1b[0m`,
		},
		colored: true,
	};
}

/** A painter that records which tokens were asked for, to test the mapping. */
function recording(): { paint: Painter; seen: string[] } {
	const seen: string[] = [];
	return {
		paint: {
			theme: { fg: (token, text) => (seen.push(token), text), bold: (text) => text },
			colored: true,
		},
		seen,
	};
}

const info = {
	version: "0.1.0",
	repo: "/home/dev/projects/thing",
	model: "openrouter/z-ai/glm-5.3-flash",
	provider: "openrouter",
	hasKey: true,
};

describe("kaioken ui: the wordmark", () => {
	it("renders the six-row block art", () => {
		expect(logoPlain()).toHaveLength(6);
		// The full wordmark is 54 columns wide; a missing letter would show here.
		expect(visibleWidth(logoPlain()[0] ?? "")).toBeGreaterThan(40);
	});

	it("falls back to a one-liner rather than mangling the art", () => {
		// Block glyphs cannot be shrunk honestly, so a narrow terminal gets a
		// bold word instead of a banner with its legs cut off.
		const narrow = renderLogo(paint, 20);
		expect(narrow).toEqual(["KAIOKEN"]);
	});

	it("colours the art when colour is wanted, and not when it is not", () => {
		const plain: Painter = { theme, colored: false };
		expect(renderLogo(plain, 80)[0]).not.toContain("\x1b[");
		// The wordmark writes raw escapes rather than going through the theme,
		// so it is the one place that has to honour the colour switch itself.
		expect(renderLogo(paint, 80)[0]).toContain("\x1b[38;5;");
	});

	it("is a pure function of elapsed time, so a frame can be named", () => {
		const early = renderLogo(paint, 80, 0);
		const settled = renderLogo(paint, 80, TIMING.riseIn);
		// The gradient charges up during the entrance and settles to a fixed
		// diagonal, which is the whole of the "powering on" effect.
		expect(early).not.toEqual(settled);
		expect(renderLogo(paint, 80, 10_000)).toEqual(settled);
	});
});

describe("kaioken ui: the info panel", () => {
	it("reports the repo, model, provider and key", () => {
		const rows = statusPanel(paint, info).join("\n");
		expect(rows).toContain("kaioken@thing");
		expect(rows).toContain("Version:");
		expect(rows).toContain("Model:");
		expect(rows).toContain("Provider:");
		expect(rows).toContain("API Key:");
		expect(rows).toContain("saved ✓");
	});

	it("strips the provider prefix the row beside it already says", () => {
		expect(displayModel("openrouter/z-ai/glm-5.3-flash", "openrouter")).toBe("z-ai/glm-5.3-flash");
		// A model from a different provider keeps its prefix, because there the
		// prefix is information rather than a repeat.
		expect(displayModel("anthropic/claude", "openrouter")).toBe("anthropic/claude");
	});

	it("says a key is missing rather than showing a blank", () => {
		const rows = statusPanel(paint, { ...info, hasKey: false }).join("\n");
		expect(rows).toContain("not set");
	});

	it("adds the branch row only when there is a branch", () => {
		expect(statusPanel(paint, info).join("\n")).not.toContain("Branch:");
		expect(statusPanel(paint, { ...info, knowledge: { branch: "main" } }).join("\n")).toContain("main");
	});

	it("names the way out when nothing has been generated", () => {
		// "nothing yet" is the answer that most needs acting on, so the row
		// carries the command rather than just reporting emptiness.
		expect(knowledgeSummary(paint, {})).toContain("/kaio-wiki");
	});

	it("reports scale and freshness together when there is something", () => {
		const summary = knowledgeSummary(paint, { files: 352, documents: 12, freshness: 1, stale: 0 });
		expect(summary).toContain("352 files");
		expect(summary).toContain("12");
		expect(summary).toContain("100% fresh");
	});

	it("calls out drift when the documents no longer match the code", () => {
		const summary = knowledgeSummary(paint, { documents: 10, freshness: 0.4, stale: 6 });
		expect(summary).toContain("40% fresh");
		expect(summary).toContain("6 stale");
	});

	it("shortens a deep path but keeps the last two segments", () => {
		expect(shortPath("/home/dev/projects/thing")).toBe("…/projects/thing");
		expect(shortPath("/thing")).toBe("/thing");
	});

	it("takes the repository's own name, not the whole path", () => {
		expect(repoLabel("/home/dev/thing")).toBe("thing");
		expect(repoLabel("D:\\project\\ai_now_know\\kaioken_kaiopi")).toBe("kaioken_kaiopi");
	});
});

describe("kaioken ui: layout", () => {
	it("puts the wordmark and the panel side by side when there is room", () => {
		const lines = stickyHeader(paint, info, 140, 40);
		expect(lines.length).toBeGreaterThan(4);
		expect(lines[0]).toContain("kaioken@thing");
	});

	it("stacks rather than squeezing when the terminal is narrow", () => {
		const lines = stickyHeader(paint, info, 60, 40);
		// Stacked: the panel starts on its own row rather than beside the art.
		expect(lines.some((line) => line.startsWith("kaioken@thing"))).toBe(true);
	});

	it("trades the art for a compact strip on a short terminal", () => {
		const lines = stickyHeader(paint, info, 140, 8);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("KAIOKEN");
		expect(lines[1]).toContain("Model:");
	});

	it("reveals the banner a row at a time during the entrance", () => {
		// The settled header is the reference; the entrance is a prefix of it
		// with the not-yet-arrived rows blanked.
		const settled = stickyHeader(paint, info, 140, 40);
		const firstFrame = stickyHeader(paint, info, 140, 40, 0);
		expect(firstFrame.filter((line) => line !== "").length).toBeLessThan(settled.length);

		const lastFrame = stickyHeader(paint, info, 140, 40, TIMING.riseIn * 2);
		expect(lastFrame).toEqual(settled);
	});

	it("joins two blocks without letting the right one drift", () => {
		const lines = joinHorizontal(["a", "longer line"], ["x", "y"], "  ");
		expect(lines).toEqual(["a            x", "longer line  y"]);
	});

	it("trims the trailing pad when there is no right column", () => {
		expect(joinHorizontal(["a"], [], "  ")).toEqual(["a"]);
	});

	it("pads and measures text without counting escape codes", () => {
		// Counting the escapes would make every column twice as wide as it looks.
		expect(visibleWidth("\x1b[38;5;208mhello\x1b[0m")).toBe(5);
		expect(blockWidth(["\x1b[1mab\x1b[0m", "abcd"])).toBe(4);
	});

	it("truncates without cutting mid-escape", () => {
		const cut = truncate("\x1b[38;5;208mabcdef\x1b[0m", 3);
		expect(visibleWidth(cut)).toBeLessThanOrEqual(3);
		// The sequence is closed rather than left open, or the rest of the line
		// inherits a colour nobody asked for.
		expect(cut.endsWith("\x1b[0m")).toBe(true);
	});

	it("returns nothing rather than something for a zero-width terminal", () => {
		expect(truncate("hello", 0)).toBe("");
		expect(compactHeader(paint, info, 0)[0]).toBe("");
	});
});

describe("kaioken ui: motion", () => {
	it("is a pure function of elapsed milliseconds", () => {
		// The phase comes from the clock, not a frame counter, which is what
		// makes every frame reachable from a test with no terminal and no timers.
		expect(phase(0, 1000)).toBe(0);
		expect(phase(500, 1000)).toBe(0.5);
		expect(phase(1500, 1000)).toBe(0.5);
		expect(phase(0, 0)).toBe(1);
	});

	it("eases out of the gate and settles slowly", () => {
		expect(easeOut(0)).toBe(0);
		expect(easeOut(1)).toBe(1);
		expect(easeOut(0.5)).toBeGreaterThan(0.5);
		// Out of range is clamped rather than extrapolated.
		expect(easeOut(-1)).toBe(0);
		expect(easeOut(2)).toBe(1);
	});

	it("charges the gradient up and then leaves it alone", () => {
		expect(chargeOffset(0)).toBeGreaterThan(0);
		expect(chargeOffset(TIMING.riseIn)).toBe(0);
		expect(chargeOffset(50_000)).toBe(0);
	});

	it("reveals rows monotonically and lands on all of them", () => {
		expect(revealedRows(10, 0)).toBe(0);
		expect(revealedRows(10, TIMING.riseIn)).toBe(10);
		expect(revealedRows(10, 100_000)).toBe(10);
		let previous = -1;
		for (let ms = 0; ms <= TIMING.riseIn; ms += 25) {
			const shown = revealedRows(10, ms);
			expect(shown).toBeGreaterThanOrEqual(previous);
			previous = shown;
		}
	});

	it("draws a quiet rule with one moving highlight", () => {
		// The sweep is a *colour* effect — one band of the rule lit differently —
		// so it is invisible through the stripping theme above. Observing it
		// needs a painter that keeps the escapes.
		const lit = tinted();
		const rule = sweepRule(lit, 40, 0, true);
		expect(visibleWidth(rule)).toBe(40);
		// The highlight is a short band, so most of the rule stays quiet and the
		// band has moved by mid-cycle.
		expect(rule).not.toEqual(sweepRule(lit, 40, TIMING.ruleSweep / 2, true));
	});

	it("does not animate when it has been switched off", () => {
		const still = sweepRule(paint, 40, 0, false);
		expect(still).toBe("─".repeat(40));
	});
});

describe("kaioken ui: the power dial", () => {
	it("keeps the bar in the same column at every level", () => {
		// `×10` is a column wider than `×1`, which would shift the meter under it.
		const one = powerMeter(paint, 1);
		const ten = powerMeter(paint, 10);
		expect(one.indexOf("█")).toBe(ten.indexOf("█"));
	});

	it("names the cost rather than only showing a number", () => {
		expect(powerMeter(paint, 10)).toContain("15–30×");
		expect(powerMeter(paint, 5)).toContain("critique-and-revise");
		expect(powerMeter(paint, 1)).toContain("single fast pass");
	});

	it("pulses above the threshold, where the number is a decision", () => {
		// Above ×7 the meter breathes, so a deep run cannot be started from
		// muscle memory without the screen having said something about it.
		// The breath is a colour change, so it needs the tinting painter.
		const lit = tinted();
		const hot = powerMeter(lit, 9, 0);
		const cool = powerMeter(lit, 9, TIMING.pulse / 2);
		expect(hot).not.toEqual(cool);

		// Below the threshold it is steady: no pulse at ×3.
		expect(powerMeter(lit, 3, 0)).toEqual(powerMeter(lit, 3, TIMING.pulse / 2));
	});
});

describe("kaioken ui: the curtain", () => {
	it("fills exactly the screen height, so no frame leaves a tail", () => {
		// The curtain paints over the whole viewport; a frame that came up short
		// would leave the previous one's rows behind.
		for (const ms of [0, 100, 300, 500, 690]) {
			expect(bootFrame(paint, 100, 24, ms, "0.1.0")).toHaveLength(24);
		}
	});

	it("rises the wordmark in, then types, then holds", () => {
		// Frame zero is legitimately blank: nothing has risen yet and no
		// character has been typed, which is the state before the animation
		// starts rather than a frame of it.
		expect(bootFrame(paint, 100, 24, 0, "0.1.0").join("")).toBe("");

		const rising = bootFrame(paint, 100, 24, CURTAIN.open * 0.15, "0.1.0");
		const typed = bootFrame(paint, 100, 24, CURTAIN.open * 0.6, "0.1.0");
		const held = bootFrame(paint, 100, 24, CURTAIN.open, "0.1.0");

		// Something is on screen at the end of every phase, and the frames
		// differ — the animation is actually moving.
		expect(rising.join("")).not.toBe("");
		expect(typed.join("")).not.toBe(rising.join(""));
		expect(held.join("")).not.toBe(typed.join(""));
	});

	it("says only things that are true", () => {
		// A boot splash is the easiest place in an interface to start lying:
		// "mounting index" would be a claim about work that has not happened.
		const frame = bootFrame(paint, 100, 24, CURTAIN.open, "0.1.0").join("\n");
		expect(frame).toContain("KAIOKEN v0.1.0");
		expect(frame).not.toMatch(/mounting|warming|loading/i);
	});

	it("widens the aura from the centre and closes it again", () => {
		expect(openAura(0)).toBe(0);
		expect(openAura(CURTAIN.open * 0.5)).toBeGreaterThan(0);
		expect(openAura(CURTAIN.open)).toBe(1);
	});

	it("types one budget across every line, not a schedule per line", () => {
		const script = [
			{ text: "abc", style: (s: string) => s },
			{ text: "de", style: (s: string) => s },
		];
		// Nothing on screen means there is no write head to mark.
		expect(typedLines(paint, script, 0, 0)).toEqual(["", ""]);
		// Half the characters of the whole script, not half of each line.
		const half = typedLines(paint, script, 0.5, 0);
		expect(half[0]).toContain("ab");
		expect(half[1]).toBe("");
	});

	it("collapses the picture into a beam and the beam into a point", () => {
		// A CRT power-off, not the entrance reversed: un-building is the same
		// idea twice and makes leaving feel like a startup backwards.
		expect(squeeze(0)).toBe(1);
		expect(squeeze(CURTAIN.close * POWEROFF.collapsed)).toBe(0);
		expect(beamWidth(80, 0)).toBe(0);
		expect(beamWidth(80, CURTAIN.close * 0.4)).toBeGreaterThan(0);
		expect(beamWidth(80, CURTAIN.close)).toBe(0);
	});

	it("never draws a beam wider than the terminal", () => {
		for (const ms of [0, 100, 200, 300, 400, 499]) {
			expect(beamWidth(20, ms)).toBeLessThanOrEqual(20);
		}
	});

	it("fills exactly the screen height on the way out too", () => {
		for (const ms of [0, 150, 300, 450, 499]) {
			expect(powerOffFrame(paint, 100, 24, ms, "0.1.0")).toHaveLength(24);
		}
	});
});

describe("kaioken ui: colour", () => {
	it("maps every role onto a Pi theme token", () => {
		// The mapping is the design decision: a role is a name and the theme
		// decides what it looks like, which is what makes the same header
		// render correctly under kaioken, kaioken-light and the built-in dark.
		expect(ROLE_TOKEN.accent).toBe("accent");
		expect(ROLE_TOKEN.warn).toBe("warning");
		expect(ROLE_TOKEN.error).toBe("error");
		expect(ROLE_TOKEN.ok).toBe("success");
		expect(ROLE_TOKEN.line).toBe("border");
	});

	it("asks the theme for tokens rather than hard-coding colours", () => {
		const { paint: recorder, seen } = recording();
		statusPanel(recorder, info);
		expect(seen).toContain("accent");
		expect(seen).toContain("dim");
		// No raw escape codes anywhere in the panel.
		expect(statusPanel(recorder, info).join("")).not.toContain("\x1b[38;5;");
	});

	it("honours NO_COLOR and FORCE_COLOR", () => {
		expect(colorFromEnv({ NO_COLOR: "1" })).toBe(false);
		expect(colorFromEnv({ FORCE_COLOR: "1" })).toBe(true);
		expect(colorFromEnv({ TERM: "dumb" })).toBe(false);
		expect(colorFromEnv({})).toBe(true);
	});
});
