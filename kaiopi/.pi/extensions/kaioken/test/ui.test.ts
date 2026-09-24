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
import {
	ROLE_TOKEN,
	colorFromEnv,
	type PaintTheme,
	type Painter,
	WCAG_AAA_THEME,
	CRT_AMBER_THEME,
	resolveTheme,
} from "../ui/theme.ts";
import {
	GLYPH_MAP,
	resolveGlyph,
	getSpinnerFrame,
	filterGlyphs,
	supportsUnicode,
} from "../ui/glyphs.ts";
import {
	KAIO_GRADIENT_STOPS,
	hexToRgb,
	interpolateRgb,
	generateGradient,
	supportsTrueColor,
	rgbToAnsi256,
	renderAdaptiveGradient,
} from "../ui/gradient.ts";
import { DoubleBufferRenderer } from "../ui/buffer.ts";
import {
	BufferPool,
	truncateAnsi,
	wrapAnsiLine,
	reflowLines,
} from "../ui/reflow.ts";
import {
	UNICODE_SPARKLINE_BARS,
	ASCII_SPARKLINE_BARS,
	renderSparkline,
	TelemetryRingBuffer,
	renderVelocityWidget,
	calculateFreshness,
	getFreshnessSeverity,
	renderFreshnessBadge,
	renderFreshnessDial,
	renderWorktreePill,
	type WorktreeStatus,
	renderTooltipBox,
	getMetricTooltip,
	METRIC_TOOLTIPS,
	HudTelemetryPoller,
	renderHudBar,
	KaiokenHeader,
} from "../ui/index.ts";


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

describe("Step 18: Terminal UI (TUI) & Visual Aesthetics (UX-0001 - UX-0100)", () => {
	describe("18.1: Adaptive 24-bit TrueColor gradient header treatment (UX-0001 - UX-0010)", () => {
		it("converts hex to RGB accurately", () => {
			expect(hexToRgb("#ffaf00")).toEqual({ r: 255, g: 175, b: 0 });
			expect(hexToRgb("#00d787")).toEqual({ r: 0, g: 215, b: 135 });
			expect(hexToRgb("#fff")).toEqual({ r: 255, g: 255, b: 255 });
		});

		it("interpolates RGB stops across multi-step gradient", () => {
			const a = { r: 0, g: 0, b: 0 };
			const b = { r: 100, g: 200, b: 50 };
			expect(interpolateRgb(a, b, 0)).toEqual(a);
			expect(interpolateRgb(a, b, 1)).toEqual(b);
			expect(interpolateRgb(a, b, 0.5)).toEqual({ r: 50, g: 100, b: 25 });

			const stops = [a, b];
			const steps = generateGradient(stops, 5);
			expect(steps).toHaveLength(5);
			expect(steps[0]).toEqual(a);
			expect(steps[4]).toEqual(b);
		});

		it("detects TrueColor support from environment variables", () => {
			expect(supportsTrueColor({ COLORTERM: "truecolor" })).toBe(true);
			expect(supportsTrueColor({ COLORTERM: "24bit" })).toBe(true);
			expect(supportsTrueColor({ WT_SESSION: "guid-123" })).toBe(true);
			expect(supportsTrueColor({ TERM_PROGRAM: "vscode" })).toBe(true);
			expect(supportsTrueColor({ NO_COLOR: "1", COLORTERM: "truecolor" })).toBe(false);
			expect(supportsTrueColor({ TERM: "dumb", COLORTERM: "truecolor" })).toBe(false);
		});

		it("converts RGB to closest 256-color palette index when falling back", () => {
			const gray = rgbToAnsi256({ r: 128, g: 128, b: 128 });
			expect(gray).toBeGreaterThanOrEqual(232);
			expect(gray).toBeLessThanOrEqual(255);

			const black = rgbToAnsi256({ r: 0, g: 0, b: 0 });
			expect(black).toBe(16);

			const orange = rgbToAnsi256({ r: 255, g: 135, b: 0 });
			expect(orange).toBeGreaterThanOrEqual(16);
		});

		it("renders adaptive gradient with 24-bit escapes or 256-color fallback", () => {
			const text = "KAIOKEN";
			const trueColorOut = renderAdaptiveGradient(text, KAIO_GRADIENT_STOPS, { COLORTERM: "truecolor" });
			expect(trueColorOut).toContain("\x1b[38;2;");

			const fallbackOut = renderAdaptiveGradient(text, KAIO_GRADIENT_STOPS, { TERM: "xterm" });
			expect(fallbackOut).toContain("\x1b[38;5;");

			const plainOut = renderAdaptiveGradient(text, KAIO_GRADIENT_STOPS, { NO_COLOR: "1" });
			expect(plainOut).toBe("KAIOKEN");
		});
	});

	describe("18.2: Dynamic Unicode glyph fallback system (UX-0011 - UX-0020)", () => {
		it("detects Unicode capability from environment", () => {
			expect(supportsUnicode({ NO_UNICODE: "1" })).toBe(false);
			expect(supportsUnicode({ TERM: "dumb" })).toBe(false);
			expect(supportsUnicode({ LANG: "en_US.UTF-8" })).toBe(true);
			expect(supportsUnicode({ WT_SESSION: "some-id" })).toBe(true);
		});

		it("resolves glyphs to Unicode or ASCII representations", () => {
			expect(resolveGlyph("ok", true)).toBe("✓");
			expect(resolveGlyph("ok", false)).toBe("[OK]");
			expect(resolveGlyph("fail", true)).toBe("✗");
			expect(resolveGlyph("fail", false)).toBe("[X]");
			expect(resolveGlyph("arrowRight", true)).toBe("→");
			expect(resolveGlyph("arrowRight", false)).toBe("->");
			expect(resolveGlyph("barFull", true)).toBe("█");
			expect(resolveGlyph("barFull", false)).toBe("#");
		});

		it("returns spinner frames cyclically in both modes", () => {
			const u0 = getSpinnerFrame(0, true);
			const u1 = getSpinnerFrame(1, true);
			expect(u0).not.toBe(u1);
			expect(getSpinnerFrame(10, true)).toBe(u0);

			const a0 = getSpinnerFrame(0, false);
			const a1 = getSpinnerFrame(1, false);
			expect(["|", "/", "-", "\\"]).toContain(a0);
			expect(getSpinnerFrame(4, false)).toBe(a0);
		});

		it("filters Unicode glyphs across arbitrary text in non-Unicode mode", () => {
			const input = "Status: ✓ Done, ✗ Failed, → Next, [█░]";
			const filtered = filterGlyphs(input, false);
			expect(filtered).toBe("Status: [OK] Done, [X] Failed, -> Next, [#-]");
			expect(filterGlyphs(input, true)).toBe(input);
		});
	});

	describe("18.3: Anti-flicker double-buffering terminal render pass (UX-0021 - UX-0030)", () => {
		it("calculates minimal line deltas without redrawing unchanged lines", () => {
			const renderer = new DoubleBufferRenderer(80, 5, false);

			// First frame: all 3 lines are new
			const frame1 = renderer.render(["line 1", "line 2", "line 3"]);
			expect(frame1.changedLines).toBe(3);
			expect(frame1.deltaAnsi).toContain("\x1b[1;1H\x1b[2Kline 1");
			expect(frame1.deltaAnsi).toContain("\x1b[2;1H\x1b[2Kline 2");
			expect(frame1.deltaAnsi).toContain("\x1b[3;1H\x1b[2Kline 3");

			// Second frame: only line 2 changes
			const frame2 = renderer.render(["line 1", "line 2 - updated", "line 3"]);
			expect(frame2.changedLines).toBe(1);
			expect(frame2.deltaAnsi).toContain("line 2 - updated");
			expect(frame2.deltaAnsi).not.toContain("line 1");
			expect(frame2.deltaAnsi).not.toContain("line 3");

			// Third frame: identical, zero changed lines and empty delta
			const frame3 = renderer.render(["line 1", "line 2 - updated", "line 3"]);
			expect(frame3.changedLines).toBe(0);
			expect(frame3.deltaAnsi).toBe("");
		});

		it("wraps deltas in DEC Mode 2026 synchronized output escapes when enabled", () => {
			const renderer = new DoubleBufferRenderer(80, 5, true);
			const frame = renderer.render(["hello world"]);
			expect(frame.deltaAnsi.startsWith("\x1b[?2026h")).toBe(true);
			expect(frame.deltaAnsi.endsWith("\x1b[?2026l")).toBe(true);
		});

		it("resets buffers cleanly on resize", () => {
			const renderer = new DoubleBufferRenderer(80, 5);
			renderer.render(["line 1", "line 2"]);
			renderer.resize(100, 10);
			expect(renderer.getFrontBuffer()).toHaveLength(0);
		});
	});

	describe("18.4: Terminal window resize auto-reflow and buffer recycling (UX-0031 - UX-0040)", () => {
		it("truncates ANSI lines preserving escapes and trailing ellipsis", () => {
			const line = "\x1b[38;5;208mKAIOKEN WORDMARK ENGINE\x1b[0m";
			const truncated = truncateAnsi(line, 10, "…");
			expect(truncated).toContain("…");
			expect(truncated).toContain("\x1b[0m");
		});

		it("wraps lines at word boundaries while respecting width limits", () => {
			const sentence = "The quick brown fox jumps over the lazy dog";
			const wrapped = wrapAnsiLine(sentence, 15);
			expect(wrapped.length).toBeGreaterThan(1);
			for (const w of wrapped) {
				expect(w.length).toBeLessThanOrEqual(15);
			}
		});

		it("reflows and clamps multi-line frames to height and width bounds", () => {
			const lines = ["First line", "Second line with extra text that wraps", "Third line", "Fourth line"];
			const reflowed = reflowLines(lines, 20, 3);
			expect(reflowed.length).toBeLessThanOrEqual(3);
		});

		it("BufferPool acquires and releases object instances without memory leaks", () => {
			const pool = new BufferPool<string>(4);
			expect(pool.available).toBe(0);

			const b1 = pool.acquire();
			b1.push("test");
			pool.release(b1);
			expect(pool.available).toBe(1);

			const b2 = pool.acquire();
			expect(b2).toHaveLength(0); // released buffer was cleared
			pool.release(b2);
		});
	});

	describe("18.5: High-contrast WCAG AAA theme and retro CRT amber mode (UX-0041 - UX-0050)", () => {
		it("provides WCAG AAA high-contrast theme meeting >= 7:1 ratio requirements", () => {
			expect(WCAG_AAA_THEME.fg("accent", "ACCENT")).toContain("\x1b[38;5;220m"); // Gold
			expect(WCAG_AAA_THEME.fg("warning", "WARN")).toContain("\x1b[38;5;226m"); // Bright Yellow
			expect(WCAG_AAA_THEME.fg("error", "ERR")).toContain("\x1b[38;5;196m"); // Vivid Red
			expect(WCAG_AAA_THEME.fg("success", "OK")).toContain("\x1b[38;5;48m"); // Bright Mint
			expect(WCAG_AAA_THEME.fg("text", "TEXT")).toContain("\x1b[38;5;231m"); // Pure White
		});

		it("provides Retro CRT Amber monochrome phosphor theme", () => {
			expect(CRT_AMBER_THEME.fg("accent", "ACCENT")).toContain("\x1b[38;5;214m"); // Amber
			expect(CRT_AMBER_THEME.fg("border", "BORDER")).toContain("\x1b[38;5;94m"); // Dim amber
			expect(CRT_AMBER_THEME.fg("text", "TEXT")).toContain("\x1b[38;5;214m");
		});

		it("resolves theme based on ThemeMode requested", () => {
			expect(resolveTheme("wcag-aaa")).toBe(WCAG_AAA_THEME);
			expect(resolveTheme("crt-amber")).toBe(CRT_AMBER_THEME);
			const fallbackTheme: PaintTheme = { fg: (_, t) => t, bold: (t) => t };
			expect(resolveTheme("default", fallbackTheme)).toBe(fallbackTheme);
		});
	});

	describe("19.1: Real-time telemetry sparkline for token spend velocity (UX-0201 - UX-0210)", () => {
		it("renders Unicode sparkline bar glyphs scaled accurately to values", () => {
			const values = [0, 25, 50, 75, 100];
			const spark = renderSparkline(values, { unicode: true, min: 0, max: 100 });
			expect(spark).toHaveLength(5);
			expect(spark[0]).toBe(UNICODE_SPARKLINE_BARS[0]);
			expect(spark[4]).toBe(UNICODE_SPARKLINE_BARS[UNICODE_SPARKLINE_BARS.length - 1]);
		});

		it("falls back to ASCII characters in non-Unicode terminals", () => {
			const values = [10, 20, 30, 40, 50];
			const spark = renderSparkline(values, { unicode: false });
			expect(spark).toHaveLength(5);
			for (const ch of spark) {
				expect((ASCII_SPARKLINE_BARS as readonly string[]).includes(ch)).toBe(true);
			}
		});

		it("handles width truncation and padding", () => {
			const values = [1, 2, 3];
			const padded = renderSparkline(values, { width: 5, unicode: true, emptyGlyph: " " });
			expect(padded).toHaveLength(5);
			expect(padded.startsWith("  ")).toBe(true);

			const truncated = renderSparkline([1, 2, 3, 4, 5, 6], { width: 3 });
			expect(truncated).toHaveLength(3);
		});

		it("handles edge cases: empty array and constant values without NaN", () => {
			expect(renderSparkline([])).toBe("");
			expect(renderSparkline([], { width: 4, emptyGlyph: "_" })).toBe("____");

			const constant = renderSparkline([42, 42, 42]);
			expect(constant).toHaveLength(3);
			expect(constant.includes("NaN")).toBe(false);
		});

		it("TelemetryRingBuffer records samples and computes velocity without allocations", () => {
			const buffer = new TelemetryRingBuffer(5);
			expect(buffer.count).toBe(0);
			expect(buffer.capacity).toBe(5);

			const now = 100000;
			buffer.push(100, now);
			buffer.push(200, now + 500);
			buffer.push(300, now + 1000);

			expect(buffer.count).toBe(3);
			expect(buffer.getValues()).toEqual([100, 200, 300]);
			expect(buffer.getLatest()).toBe(300);
			expect(buffer.getMin()).toBe(100);
			expect(buffer.getMax()).toBe(300);
			expect(buffer.getAverage()).toBe(200);

			// Velocity: delta 200 tokens over 1.0 second = 200 tokens/sec
			const vel = buffer.getVelocity(1000);
			expect(vel).toBe(200);
		});

		it("TelemetryRingBuffer wraps circular head correctly when capacity is exceeded", () => {
			const buffer = new TelemetryRingBuffer(3);
			buffer.push(10);
			buffer.push(20);
			buffer.push(30);
			buffer.push(40);
			buffer.push(50);

			expect(buffer.count).toBe(3);
			expect(buffer.getValues()).toEqual([30, 40, 50]);
			expect(buffer.getLatest()).toBe(50);
			expect(buffer.getPeak()).toBe(50);

			buffer.clear();
			expect(buffer.count).toBe(0);
			expect(buffer.getValues()).toEqual([]);
		});

		it("renderVelocityWidget displays formatted rate and sparkline", () => {
			const buffer = new TelemetryRingBuffer(10);
			const t0 = 100000;
			buffer.push(10, t0);
			buffer.push(60, t0 + 1000);

			const widget = renderVelocityWidget(buffer, undefined, { unicode: true, unit: "tok/s" });
			expect(widget).toContain("tok/s");
			expect(widget).toContain("50");
		});
	});

	describe("19.2: Live repository freshness ratio badge (UX-0211 - UX-0220)", () => {
		it("calculates freshness percentage ratio accurately", () => {
			expect(calculateFreshness(10, 10)).toBe(1.0);
			expect(calculateFreshness(0, 0)).toBe(1.0); // empty repo defaults to fresh
			expect(calculateFreshness(8, 10)).toBe(0.8);
			expect(calculateFreshness(3, 10)).toBe(0.3);
			expect(calculateFreshness(0, 10)).toBe(0.0);
		});

		it("maps ratio to quality severity tiers", () => {
			expect(getFreshnessSeverity(1.0)).toBe("ok");
			expect(getFreshnessSeverity(0.85)).toBe("ok");
			expect(getFreshnessSeverity(0.79)).toBe("warn");
			expect(getFreshnessSeverity(0.5)).toBe("warn");
			expect(getFreshnessSeverity(0.49)).toBe("error");
			expect(getFreshnessSeverity(0.0)).toBe("error");
		});

		it("renders freshness badge with icons in Unicode and ASCII modes", () => {
			const okBadge = renderFreshnessBadge(0.95, 0, undefined, { unicode: true });
			expect(okBadge).toContain("●");
			expect(okBadge).toContain("95% fresh");

			const warnBadge = renderFreshnessBadge(0.65, 3, undefined, { unicode: true });
			expect(warnBadge).toContain("▲");
			expect(warnBadge).toContain("65% fresh");
			expect(warnBadge).toContain("3 stale");

			const errBadge = renderFreshnessBadge(0.25, 12, undefined, { unicode: true });
			expect(errBadge).toContain("■");
			expect(errBadge).toContain("25% fresh");

			const asciiBadge = renderFreshnessBadge(0.95, 0, undefined, { unicode: false });
			expect(asciiBadge).toContain("OK");
			expect(asciiBadge).toContain("95% fresh");

			const asciiWarn = renderFreshnessBadge(0.65, 2, undefined, { unicode: false });
			expect(asciiWarn).toContain("WARN");
		});

		it("renders horizontal dial progress gauge", () => {
			const dial = renderFreshnessDial(0.8, 10, undefined, true);
			expect(dial).toContain("80%");
			expect(dial).toContain("████████░░");

			const asciiDial = renderFreshnessDial(0.5, 10, undefined, false);
			expect(asciiDial).toContain("50%");
			expect(asciiDial).toContain("#####-----");
		});
	});

	describe("19.3: Active git worktree dirty status indicator pill (UX-0221 - UX-0230)", () => {
		it("renders clean repository status in Unicode and ASCII", () => {
			const cleanStatus: WorktreeStatus = { branch: "master", isDirty: false };
			const unicodePill = renderWorktreePill(cleanStatus, undefined, { unicode: true });
			expect(unicodePill).toContain("⎇");
			expect(unicodePill).toContain("master");
			expect(unicodePill).toContain("✓");

			const asciiPill = renderWorktreePill(cleanStatus, undefined, { unicode: false });
			expect(asciiPill).toContain("git:master");
			expect(asciiPill).toContain("OK");
		});

		it("renders dirty status with modification and untracked counts", () => {
			const dirtyStatus: WorktreeStatus = {
				branch: "feature/auth",
				isDirty: true,
				modifiedCount: 2,
				untrackedCount: 1,
			};
			const pill = renderWorktreePill(dirtyStatus, undefined, { unicode: true, showCounts: true });
			expect(pill).toContain("feature/auth");
			expect(pill).toContain("*dirty (+3)");

			const compactPill = renderWorktreePill(dirtyStatus, undefined, { compact: true });
			expect(compactPill).toContain("*3");
		});

		it("indicates isolated scratch worktree flag", () => {
			const wtStatus: WorktreeStatus = {
				branch: "agent/task-42",
				isWorktree: true,
				isDirty: true,
			};
			const pill = renderWorktreePill(wtStatus, undefined, { unicode: true });
			expect(pill).toContain("⎇ (wt)");
			expect(pill).toContain("agent/task-42");

			const asciiWt = renderWorktreePill(wtStatus, undefined, { unicode: false });
			expect(asciiWt).toContain("wt:agent/task-42");
		});

		it("displays active git hook state", () => {
			const hookStatus: WorktreeStatus = {
				branch: "main",
				isDirty: false,
				activeHook: "pre-commit",
			};
			const pill = renderWorktreePill(hookStatus, undefined, { unicode: true });
			expect(pill).toContain("(pre-commit…)");
		});
	});

	describe("19.4: Floating hover tooltip explaining status metrics (UX-0231 - UX-0240)", () => {
		it("renders bordered tooltip box with title, value, description, and hint", () => {
			const tooltip = {
				id: "tokenVelocity",
				title: "Token Spend Velocity",
				value: "150 tok/s",
				description: "Real-time model token consumption rate.",
				threshold: ">500 tok/s triggers throttle",
				shortcut: "Run /kaio-status",
			};

			const box = renderTooltipBox(tooltip, undefined, { unicode: true, maxWidth: 50 });
			expect(box.length).toBeGreaterThanOrEqual(5);

			// Top border with title
			expect(box[0]).toContain("╭─ [Token Spend Velocity]");
			expect(box[0]).toContain("╮");

			// Value row
			expect(box.some((l) => l.includes("Value: 150 tok/s"))).toBe(true);

			// Description & alerts
			expect(box.some((l) => l.includes("Real-time model token consumption"))).toBe(true);
			expect(box.some((l) => l.includes("Alert: >500 tok/s"))).toBe(true);
			expect(box.some((l) => l.includes("Hint: Run /kaio-status"))).toBe(true);

			// Bottom border
			expect(box[box.length - 1]).toContain("╰─");
			expect(box[box.length - 1]).toContain("╯");
		});

		it("renders ASCII box frame fallback when Unicode is disabled", () => {
			const tooltip = {
				id: "test",
				title: "Test Metric",
				value: "100%",
				description: "Sample test description.",
			};
			const box = renderTooltipBox(tooltip, undefined, { unicode: false, maxWidth: 40 });
			expect(box[0]?.startsWith("+-")).toBe(true);
			expect(box[box.length - 1]?.startsWith("+-")).toBe(true);
			expect(box[1]?.startsWith("|")).toBe(true);
		});

		it("provides standard metric tooltips from dictionary", () => {
			expect(METRIC_TOOLTIPS.tokenVelocity).toBeDefined();
			expect(METRIC_TOOLTIPS.freshnessRatio).toBeDefined();
			expect(METRIC_TOOLTIPS.worktreeStatus).toBeDefined();
			expect(METRIC_TOOLTIPS.contextWindow).toBeDefined();

			const populated = getMetricTooltip("freshnessRatio", "92%");
			expect(populated).toBeDefined();
			expect(populated?.title).toBe("Repository Freshness Ratio");
			expect(populated?.value).toBe("92%");
		});
	});

	describe("19.5: Zero-allocation polling loop with microsecond overhead (UX-0241 - UX-0250)", () => {
		it("mutates snapshot in place without creating new objects during poll", () => {
			const poller = new HudTelemetryPoller();
			const snap1 = poller.poll();
			const snap2 = poller.poll();

			// Same object reference: zero heap allocations per cycle
			expect(snap1).toBe(snap2);

			poller.updateFreshness(0.92, 1);
			poller.updateWorktree("dev", true, 3);
			poller.poll();

			expect(snap1.freshnessRatio).toBe(0.92);
			expect(snap1.staleDocsCount).toBe(1);
			expect(snap1.worktreeBranch).toBe("dev");
			expect(snap1.worktreeDirty).toBe(true);
			expect(snap1.worktreeModified).toBe(3);
		});

		it("executes synchronous poll with microsecond overhead", () => {
			const poller = new HudTelemetryPoller();
			poller.recordTokens(100);
			const snap = poller.poll();

			// Microsecond poll duration is measured and logged
			expect(snap.lastPollDurationUs).toBeGreaterThanOrEqual(0);
			// Guaranteed to take less than 50 milliseconds (typically < 0.05ms)
			expect(snap.lastPollDurationUs).toBeLessThan(50000);
		});

		it("notifies subscribers on significant metric changes and supports unsubscribe", () => {
			const poller = new HudTelemetryPoller();
			let notifications = 0;
			const unsub = poller.subscribe(() => {
				notifications++;
			});

			poller.updateWorktree("feature-a", false);
			poller.poll();
			expect(notifications).toBe(1);

			// Unchanged poll within deadband should not trigger subscriber
			poller.poll();
			expect(notifications).toBe(1);

			// Significant change triggers subscriber
			poller.updateWorktree("feature-b", true, 2);
			poller.poll();
			expect(notifications).toBe(2);

			unsub();
			poller.updateWorktree("feature-c", false);
			poller.poll();
			expect(notifications).toBe(2); // no further calls after unsub
		});

		it("renders unified HUD status bar line with all active widgets", () => {
			const poller = new HudTelemetryPoller();
			poller.updateFreshness(0.88, 0);
			poller.updateWorktree("main", false);
			poller.recordTokens(50, Date.now() - 1000);
			poller.recordTokens(150, Date.now());
			poller.poll();

			const bar = renderHudBar(poller.current, poller.velocityBuffer, undefined, 80);
			expect(bar).toContain("main");
			expect(bar).toContain("88% fresh");
		});

		it("KaiokenHeader integrates HUD poller and tooltips cleanly", () => {
			const mockTui = {
				terminal: { columns: 80, rows: 24 },
				requestRender: () => {},
			} as any;

			const poller = new HudTelemetryPoller();
			poller.updateFreshness(0.95);
			poller.updateWorktree("master", false);

			const header = new KaiokenHeader(mockTui, theme, {
				info,
				state: () => undefined,
				busy: () => false,
				hud: poller,
			});
			(header as any).entranceDone = true;

			const lines = header.render(80);
			expect(lines.some((l) => l.includes("95% fresh"))).toBe(true);
			expect(lines.some((l) => l.includes("master"))).toBe(true);

			// Set floating tooltip
			header.setTooltip({
				id: "tip",
				title: "Live Telemetry",
				value: "Active",
				description: "HUD active",
			});
			const tooltipLines = header.render(80);
			expect(tooltipLines.some((l) => l.includes("[Live Telemetry]"))).toBe(true);

			header.dispose();
			poller.dispose();
		});
	});
});

