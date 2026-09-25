/**
 * Step 38: Category 01 — Terminal UI (TUI) & Visual Aesthetics (UX-0051 – UX-0100).
 *
 * Implements:
 * 1. Dynamic glyph fallback system when terminal lacks Unicode across elements 11–20 (UX-0051 – UX-0060).
 * 2. Smooth micro-animation frame interpolator across all 20 elements (UX-0061 – UX-0080).
 * 3. Configurable color saturation dial (0.0 to 2.0) across all 20 elements (UX-0081 – UX-0100).
 */

import { supportsUnicode } from "./glyphs.ts";
import { easeOut, phase } from "./motion.ts";

/**
 * 20 Canonical TUI UI Elements defined in Step 38 (UX-0051 – UX-0100).
 */
export type TuiElementKind =
	| "kaioken-banner-masthead"
	| "logo-sparkline"
	| "active-model-badge"
	| "power-off-shutdown-animation"
	| "status-bar-pills"
	| "split-pane-containers"
	| "dialog-modal-frames"
	| "spend-estimate-cards"
	| "wiki-toc-tree"
	| "knowledge-card-previews"
	| "ast-symbol-tree"
	| "git-branch-indicators"
	| "staleness-warning-badges"
	| "citation-grounding-chips"
	| "search-hit-counters"
	| "blast-radius-heatmaps"
	| "test-progress-rings"
	| "interactive-diff-blocks"
	| "syntax-highlight-frames"
	| "task-queue-spinners";

export const ALL_TUI_ELEMENT_KINDS: readonly TuiElementKind[] = [
	"kaioken-banner-masthead",
	"logo-sparkline",
	"active-model-badge",
	"power-off-shutdown-animation",
	"status-bar-pills",
	"split-pane-containers",
	"dialog-modal-frames",
	"spend-estimate-cards",
	"wiki-toc-tree",
	"knowledge-card-previews",
	"ast-symbol-tree",
	"git-branch-indicators",
	"staleness-warning-badges",
	"citation-grounding-chips",
	"search-hit-counters",
	"blast-radius-heatmaps",
	"test-progress-rings",
	"interactive-diff-blocks",
	"syntax-highlight-frames",
	"task-queue-spinners",
] as const;

export interface TuiElementMetadata {
	kind: TuiElementKind;
	title: string;
	defaultDurationMs: number;
	baseColor: string; // hex
	glyphSet: {
		unicode: string;
		ascii: string;
		description: string;
	};
}

export const TUI_ELEMENT_METADATA: Record<TuiElementKind, TuiElementMetadata> = {
	"kaioken-banner-masthead": {
		kind: "kaioken-banner-masthead",
		title: "Kaioken Banner Masthead",
		defaultDurationMs: 550,
		baseColor: "#ff3b1f",
		glyphSet: { unicode: "⚡", ascii: "[!]", description: "Hero power lightning bolt" },
	},
	"logo-sparkline": {
		kind: "logo-sparkline",
		title: "Logo Sparkline",
		defaultDurationMs: 2400,
		baseColor: "#ff9500",
		glyphSet: { unicode: " ▂▃▄▅▆▇█", ascii: "_.-~*#", description: "Activity sparkline ramp" },
	},
	"active-model-badge": {
		kind: "active-model-badge",
		title: "Active Model Badge",
		defaultDurationMs: 1200,
		baseColor: "#87d7ff",
		glyphSet: { unicode: "◆", ascii: "*", description: "Model status diamond" },
	},
	"power-off-shutdown-animation": {
		kind: "power-off-shutdown-animation",
		title: "Power-off Shutdown Animation",
		defaultDurationMs: 800,
		baseColor: "#33333a",
		glyphSet: { unicode: "⏻", ascii: "[OFF]", description: "Shutdown power indicator" },
	},
	"status-bar-pills": {
		kind: "status-bar-pills",
		title: "Status Bar Pills",
		defaultDurationMs: 1400,
		baseColor: "#10b981",
		glyphSet: { unicode: "●", ascii: "o", description: "Status live pill dot" },
	},
	"split-pane-containers": {
		kind: "split-pane-containers",
		title: "Split-pane Containers",
		defaultDurationMs: 400,
		baseColor: "#70707a",
		glyphSet: { unicode: "│", ascii: "|", description: "Vertical divider rule" },
	},
	"dialog-modal-frames": {
		kind: "dialog-modal-frames",
		title: "Dialog Modal Frames",
		defaultDurationMs: 300,
		baseColor: "#e6e6e9",
		glyphSet: { unicode: "╭╮╰╯─│", ascii: "+-+--|", description: "Rounded modal border box" },
	},
	"spend-estimate-cards": {
		kind: "spend-estimate-cards",
		title: "Spend Estimate Cards",
		defaultDurationMs: 900,
		baseColor: "#ffaf00",
		glyphSet: { unicode: "◈", ascii: "$", description: "Token spend currency symbol" },
	},
	"wiki-toc-tree": {
		kind: "wiki-toc-tree",
		title: "Wiki Table of Contents Tree",
		defaultDurationMs: 500,
		baseColor: "#d7af87",
		glyphSet: { unicode: "├─└─", ascii: "+---+--", description: "Tree branch hierarchy connectors" },
	},
	"knowledge-card-previews": {
		kind: "knowledge-card-previews",
		title: "Knowledge Card Previews",
		defaultDurationMs: 600,
		baseColor: "#87af87",
		glyphSet: { unicode: "□", ascii: "[]", description: "Card container boundary" },
	},
	"ast-symbol-tree": {
		kind: "ast-symbol-tree",
		title: "AST Symbol Declaration Tree",
		defaultDurationMs: 500,
		baseColor: "#87d7ff",
		glyphSet: { unicode: "├─ └─ λ", ascii: "+-- \\-- fn", description: "AST node syntax tree" },
	},
	"git-branch-indicators": {
		kind: "git-branch-indicators",
		title: "Git Branch Indicators",
		defaultDurationMs: 700,
		baseColor: "#ff9500",
		glyphSet: { unicode: "⎇", ascii: "git:", description: "Git branch symbol" },
	},
	"staleness-warning-badges": {
		kind: "staleness-warning-badges",
		title: "Staleness Warning Badges",
		defaultDurationMs: 1400,
		baseColor: "#e07f00",
		glyphSet: { unicode: "▲", ascii: "[!]", description: "Stale warning hazard triangle" },
	},
	"citation-grounding-chips": {
		kind: "citation-grounding-chips",
		title: "Citation Grounding Chips",
		defaultDurationMs: 600,
		baseColor: "#00d787",
		glyphSet: { unicode: "⚓", ascii: "[^]", description: "Grounded anchor citation badge" },
	},
	"search-hit-counters": {
		kind: "search-hit-counters",
		title: "Search Result Hit Counters",
		defaultDurationMs: 400,
		baseColor: "#ffffff",
		glyphSet: { unicode: "№", ascii: "#", description: "Hit number counter badge" },
	},
	"blast-radius-heatmaps": {
		kind: "blast-radius-heatmaps",
		title: "Blast Radius Heatmaps",
		defaultDurationMs: 1100,
		baseColor: "#ff1e00",
		glyphSet: { unicode: "░▒▓█", ascii: ".-*#", description: "Density impact gradient ramp" },
	},
	"test-progress-rings": {
		kind: "test-progress-rings",
		title: "Test Execution Progress Rings",
		defaultDurationMs: 800,
		baseColor: "#10b981",
		glyphSet: { unicode: "◔◑◕●", ascii: "[=]", description: "Circular quadrant progress pie" },
	},
	"interactive-diff-blocks": {
		kind: "interactive-diff-blocks",
		title: "Interactive Diff Blocks",
		defaultDurationMs: 450,
		baseColor: "#00d787",
		glyphSet: { unicode: "±", ascii: "+/-", description: "Unified diff delta indicator" },
	},
	"syntax-highlight-frames": {
		kind: "syntax-highlight-frames",
		title: "Code Syntax Highlight Frames",
		defaultDurationMs: 350,
		baseColor: "#a8a8b0",
		glyphSet: { unicode: "⟦ ⟧", ascii: "[[ ]]", description: "Syntax scope delimiter brackets" },
	},
	"task-queue-spinners": {
		kind: "task-queue-spinners",
		title: "Task Queue Spinners",
		defaultDurationMs: 80,
		baseColor: "#ff3b1f",
		glyphSet: { unicode: "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏", ascii: "|/-\\", description: "Braille loader spinner" },
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: Dynamic Glyph Fallback System (UX-0051 – UX-0060)                  */
/* -------------------------------------------------------------------------- */

export interface ElementGlyphSet {
	element: TuiElementKind;
	unicode: string;
	ascii: string;
	description: string;
	activeGlyph: string;
}

export function resolveElementGlyphs(element: TuiElementKind, unicode?: boolean): ElementGlyphSet {
	const meta = TUI_ELEMENT_METADATA[element];
	const isUnicodeSupported = unicode ?? supportsUnicode();
	return {
		element,
		unicode: meta.glyphSet.unicode,
		ascii: meta.glyphSet.ascii,
		description: meta.glyphSet.description,
		activeGlyph: isUnicodeSupported ? meta.glyphSet.unicode : meta.glyphSet.ascii,
	};
}

export function formatElementWithGlyphFallback(
	element: TuiElementKind,
	label: string,
	unicode?: boolean,
): string {
	const glyphs = resolveElementGlyphs(element, unicode);
	return `${glyphs.activeGlyph} ${label}`;
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Smooth Micro-Animation Frame Interpolator (UX-0061 – UX-0080)     */
/* -------------------------------------------------------------------------- */

export interface MicroAnimationFrame {
	element: TuiElementKind;
	elapsedMs: number;
	normalizedProgress: number; // 0..1
	easedProgress: number; // 0..1
	frameIndex: number;
	visualToken: string;
	active: boolean;
}

export function interpolateMicroAnimation(
	element: TuiElementKind,
	elapsedMs: number,
	options: { active?: boolean; durationMs?: number } = {},
): MicroAnimationFrame {
	const meta = TUI_ELEMENT_METADATA[element];
	const active = options.active ?? true;
	const duration = options.durationMs ?? meta.defaultDurationMs;

	if (!active || duration <= 0) {
		return {
			element,
			elapsedMs,
			normalizedProgress: 1.0,
			easedProgress: 1.0,
			frameIndex: 0,
			visualToken: meta.glyphSet.unicode[0] || "*",
			active: false,
		};
	}

	const normalized = phase(elapsedMs, duration);
	const eased = easeOut(normalized);

	// Select animated visual token if multiple characters are present in the glyph set
	const glyphString = meta.glyphSet.unicode;
	const totalTokens = Math.max(1, glyphString.length);
	const frameIndex = Math.floor(normalized * totalTokens) % totalTokens;
	const visualToken = glyphString[frameIndex] || glyphString[0] || "*";

	return {
		element,
		elapsedMs,
		normalizedProgress: normalized,
		easedProgress: eased,
		frameIndex,
		visualToken,
		active: true,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Configurable Color Saturation Dial (UX-0081 – UX-0100)            */
/* -------------------------------------------------------------------------- */

export interface SaturatedColorResult {
	element: TuiElementKind;
	originalHex: string;
	saturatedHex: string;
	multiplier: number;
	rgb: [number, number, number];
	ansi256Code: number;
}

/**
 * Converts a hex string (#rrggbb) to RGB tuple.
 */
function hexToRgb(hex: string): [number, number, number] {
	const clean = hex.replace("#", "");
	const num = Number.parseInt(clean, 16);
	const r = (num >> 16) & 255;
	const g = (num >> 8) & 255;
	const b = num & 255;
	return [r, g, b];
}

/**
 * Converts RGB tuple to hex string.
 */
function rgbToHex(r: number, g: number, b: number): string {
	const toHex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Converts RGB to HSL.
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
	const rNorm = r / 255;
	const gNorm = g / 255;
	const bNorm = b / 255;
	const max = Math.max(rNorm, gNorm, bNorm);
	const min = Math.min(rNorm, gNorm, bNorm);
	let h = 0;
	let s = 0;
	const l = (max + min) / 2;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		switch (max) {
			case rNorm:
				h = (gNorm - bNorm) / d + (gNorm < bNorm ? 6 : 0);
				break;
			case gNorm:
				h = (bNorm - rNorm) / d + 2;
				break;
			case bNorm:
				h = (rNorm - gNorm) / d + 4;
				break;
		}
		h /= 6;
	}

	return [h, s, l];
}

/**
 * Converts HSL to RGB.
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
	let r: number;
	let g: number;
	let b: number;

	if (s === 0) {
		r = g = b = l; // achromatic
	} else {
		const hue2rgb = (p: number, q: number, t: number) => {
			let tVal = t;
			if (tVal < 0) tVal += 1;
			if (tVal > 1) tVal -= 1;
			if (tVal < 1 / 6) return p + (q - p) * 6 * tVal;
			if (tVal < 1 / 2) return q;
			if (tVal < 2 / 3) return p + (q - p) * (2 / 3 - tVal) * 6;
			return p;
		};

		const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
		const p = 2 * l - q;
		r = hue2rgb(p, q, h + 1 / 3);
		g = hue2rgb(p, q, h);
		b = hue2rgb(p, q, h - 1 / 3);
	}

	return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/**
 * Approximates an RGB color into xterm 256-color palette index.
 */
function rgbToAnsi256(r: number, g: number, b: number): number {
	if (r === g && g === b) {
		if (r < 8) return 16;
		if (r > 248) return 231;
		return Math.round(((r - 8) / 247) * 23) + 232;
	}
	const rIdx = Math.round((r / 255) * 5);
	const gIdx = Math.round((g / 255) * 5);
	const bIdx = Math.round((b / 255) * 5);
	return 16 + 36 * rIdx + 6 * gIdx + bIdx;
}

export function applyColorSaturation(
	element: TuiElementKind,
	hexOrColorName: string,
	multiplier: number,
): SaturatedColorResult {
	const meta = TUI_ELEMENT_METADATA[element];
	const baseHex = hexOrColorName.startsWith("#") ? hexOrColorName : meta.baseColor;
	const satMultiplier = Math.max(0.0, Math.min(2.0, multiplier));

	const [r, g, b] = hexToRgb(baseHex);
	const [h, s, l] = rgbToHsl(r, g, b);

	// Scale saturation by multiplier
	const adjustedS = Math.max(0.0, Math.min(1.0, s * satMultiplier));
	const [newR, newG, newB] = hslToRgb(h, adjustedS, l);
	const saturatedHex = rgbToHex(newR, newG, newB);
	const ansiCode = rgbToAnsi256(newR, newG, newB);

	return {
		element,
		originalHex: baseHex,
		saturatedHex,
		multiplier: satMultiplier,
		rgb: [newR, newG, newB],
		ansi256Code: ansiCode,
	};
}
