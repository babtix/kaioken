/**
 * Render the Kaioken header exactly as Pi would, to a real terminal size.
 *
 * The UI tests assert structure; this prints the actual thing, so the banner
 * can be looked at rather than inferred. Run it after changing any of the UI
 * modules — it is the fastest way to see whether a layout change reads well.
 */
import { bootFrame, CURTAIN } from "../ui/curtain.ts";
import { stickyHeader, type HeaderInfo } from "../ui/logo.ts";
import { powerMeter, TIMING } from "../ui/motion.ts";
import type { PaintTheme } from "../ui/theme.ts";

/** The kaioken theme's tokens, as ANSI, so this runs with no terminal session. */
const TOKENS: Record<string, string> = {
	accent: "\x1b[38;5;208m",
	warning: "\x1b[38;5;214m",
	error: "\x1b[38;5;203m",
	success: "\x1b[38;5;42m",
	mdLink: "\x1b[38;5;117m",
	toolTitle: "\x1b[38;5;180m",
	toolOutput: "\x1b[38;5;108m",
	border: "\x1b[38;5;236m",
	dim: "\x1b[38;5;244m",
	muted: "\x1b[38;5;244m",
	text: "\x1b[38;5;252m",
};

const theme: PaintTheme = {
	fg: (token, text) => `${TOKENS[token] ?? ""}${text}\x1b[0m`,
	bold: (text) => `\x1b[1m${text}\x1b[0m`,
};
const paint = { theme, colored: true };

const info: HeaderInfo = {
	version: "0.1.0",
	repo: "D:\\project\\ai_now_know\\kaioken_kaiopi",
	model: "z-ai/glm-5.3-flash",
	provider: "openrouter",
	hasKey: true,
	knowledge: { files: 352, documents: 12, cards: 6, branch: "main", freshness: 0.83, stale: 2 },
};

const width = 132;
const height = 40;

const arg = process.argv[2] ?? "header";

if (arg === "boot") {
	// Three frames of the opening, so the rise, the aura and the typing are
	// all visible at once.
	for (const fraction of [0.15, 0.45, 0.9]) {
		const ms = CURTAIN.open * fraction;
		console.log(`\n--- boot @ ${Math.round(ms)}ms (${Math.round(fraction * 100)}%) ---`);
		console.log(bootFrame(paint, width, 18, ms, info.version).join("\n"));
	}
} else if (arg === "power") {
	console.log(powerMeter(paint, 3));
	console.log(powerMeter(paint, 5));
	console.log(powerMeter(paint, 9, 0));
} else {
	console.log("--- settled header ---");
	console.log(stickyHeader(paint, info, width, height).join("\n"));
	console.log("\n--- entrance @ 40% ---");
	console.log(stickyHeader(paint, info, width, height, TIMING.riseIn * 0.4).join("\n"));
	console.log("\n--- compact (short terminal) ---");
	console.log(stickyHeader(paint, info, width, 8).join("\n"));
}
