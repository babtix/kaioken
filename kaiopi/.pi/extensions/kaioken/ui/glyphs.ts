/**
 * Dynamic Unicode glyph fallback system for basic terminals.
 *
 * Implements Features #UX-0011 – #UX-0020.
 *
 * Provides a unified glyph dictionary for status indicators, box drawings,
 * progress bars, and spinners. When running in basic, legacy, or dumb terminals
 * (or when explicit NO_UNICODE is set), automatically substitutes ASCII fallbacks
 * without breaking visual layout alignment.
 */

export interface GlyphEntry {
	unicode: string;
	ascii: string;
}

export const GLYPH_MAP = {
	ok: { unicode: "✓", ascii: "[OK]" },
	fail: { unicode: "✗", ascii: "[X]" },
	dot: { unicode: "•", ascii: "*" },
	bullet: { unicode: "●", ascii: "o" },
	circle: { unicode: "○", ascii: "." },
	diamond: { unicode: "◆", ascii: "*" },
	arrowRight: { unicode: "→", ascii: "->" },
	arrowForward: { unicode: "➜", ascii: "->" },
	ellipsis: { unicode: "…", ascii: "..." },
	triangleRight: { unicode: "▶", ascii: ">" },
	triangleDown: { unicode: "▼", ascii: "v" },
	triangleUp: { unicode: "▲", ascii: "^" },
	spark: { unicode: "·", ascii: "." },
	barFull: { unicode: "█", ascii: "#" },
	barEmpty: { unicode: "░", ascii: "-" },
	barMedium: { unicode: "▒", ascii: "=" },
	boxH: { unicode: "─", ascii: "-" },
	boxV: { unicode: "│", ascii: "|" },
	boxTL: { unicode: "╭", ascii: "+" },
	boxTR: { unicode: "╮", ascii: "+" },
	boxBL: { unicode: "╰", ascii: "+" },
	boxBR: { unicode: "╯", ascii: "+" },
	boxCross: { unicode: "┼", ascii: "+" },
	boxDoubleH: { unicode: "═", ascii: "=" },
	boxDoubleV: { unicode: "║", ascii: "|" },
} as const;

export type GlyphKey = keyof typeof GLYPH_MAP;

export const UNICODE_SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;
export const ASCII_SPINNER = ["|", "/", "-", "\\"] as const;

/**
 * Detects whether the current environment reliably supports UTF-8 / Unicode glyphs.
 */
export function supportsUnicode(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.NO_UNICODE === "1" || env.NO_UNICODE === "true") return false;
	if (env.TERM === "dumb") return false;

	// Modern Windows Terminals
	if (env.WT_SESSION || env.TERM_PROGRAM === "vscode" || env.ConEmuPID) return true;

	const lang = `${env.LC_ALL || ""}_${env.LC_CTYPE || ""}_${env.LANG || ""}`.toLowerCase();
	if (lang.includes("utf-8") || lang.includes("utf8")) return true;

	// Windows fallback: if running on win32 without dumb term, default to true unless NO_UNICODE
	if (process.platform === "win32") return true;

	return false;
}

/**
 * Resolves a specific glyph name to either its Unicode glyph or ASCII fallback.
 */
export function resolveGlyph(key: GlyphKey, unicode?: boolean): string {
	const useUnicode = unicode ?? supportsUnicode();
	const entry = GLYPH_MAP[key];
	if (!entry) return "";
	return useUnicode ? entry.unicode : entry.ascii;
}

/**
 * Returns a spinner frame for the specified frame index.
 */
export function getSpinnerFrame(index: number, unicode?: boolean): string {
	const useUnicode = unicode ?? supportsUnicode();
	if (useUnicode) {
		const idx = Math.abs(index) % UNICODE_SPINNER.length;
		return UNICODE_SPINNER[idx] as string;
	}
	const idx = Math.abs(index) % ASCII_SPINNER.length;
	return ASCII_SPINNER[idx] as string;
}

/**
 * Replaces known Unicode symbols in text with their ASCII fallback representations.
 */
export function filterGlyphs(text: string, unicode?: boolean): string {
	const useUnicode = unicode ?? supportsUnicode();
	if (useUnicode) return text;

	let result = text;
	for (const entry of Object.values(GLYPH_MAP)) {
		if (result.includes(entry.unicode)) {
			result = result.split(entry.unicode).join(entry.ascii);
		}
	}
	for (const s of UNICODE_SPINNER) {
		if (result.includes(s)) {
			result = result.split(s).join("*");
		}
	}
	return result;
}
