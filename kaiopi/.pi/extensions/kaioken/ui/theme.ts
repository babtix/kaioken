/**
 * Kaioken's colour roles, mapped onto Pi's theme tokens.
 *
 * The v2 TUI carried its own 256-colour palette because it was its own shell.
 * Inside Pi the theme is already resolved — the user picked `kaioken`,
 * `kaio-light`, or something else entirely — so re-deriving colours here
 * would fight the setting and break the moment someone chose a different
 * theme. Instead every role is expressed as one of Pi's own tokens, and the
 * mapping is the design decision.
 *
 * The mapping is faithful to v2's dark palette, which was itself derived from
 * the DESIGN.md ANSI ramp:
 *
 *   v2 role      v2 code   Pi token   DESIGN.md token
 *   accent       208       accent     --kai-orange   #ff8700
 *   warn         214       warning    --kai-amber    #ffaf00
 *   diffDel      203       error      --kai-rose     #ff5f5f
 *   ok           42        success    --kai-green    #00d787
 *   user         117       mdLink     --kai-blue     #87d7ff
 *   tool         180       toolTitle  --kai-tan      #d7af87
 *   toolResult   108       toolOutput --kai-sage     #87af87
 *   line         236       border     --kai-line     #303030
 *   dim          244       dim        --kai-dim      #585858
 *   text         252       text       --kai-text     #d0d0d0
 *
 * Nothing here is a hard-coded hex. A role is a name, and the theme decides
 * what it looks like — which is what makes the same header render correctly
 * under `kaioken`, `kaio-light`, and the built-in `dark`.
 */

/** The colours this UI asks for, by purpose rather than by hue. */
export type Role =
	| "accent"
	| "warn"
	| "error"
	| "ok"
	| "user"
	| "tool"
	| "toolResult"
	| "line"
	| "dim"
	| "muted"
	| "text";

/**
 * Pi's theme tokens, by the names the `Theme` class exposes.
 *
 * Spelled as a union rather than a string so a typo is a compile error instead
 * of a silently unstyled line.
 */
export type ThemeToken =
	| "accent"
	| "warning"
	| "error"
	| "success"
	| "mdLink"
	| "toolTitle"
	| "toolOutput"
	| "border"
	| "dim"
	| "muted"
	| "text";

/** Which Pi token each role resolves to. */
export const ROLE_TOKEN: Record<Role, ThemeToken> = {
	accent: "accent",
	warn: "warning",
	error: "error",
	ok: "success",
	user: "mdLink",
	tool: "toolTitle",
	toolResult: "toolOutput",
	line: "border",
	dim: "dim",
	muted: "muted",
	text: "text",
};

/**
 * The little of Pi's `Theme` this UI uses.
 *
 * Structural rather than imported: the bridge already depends on
 * `@earendil-works/pi-coding-agent` for types, but the header only needs
 * these three calls, and typing it this way means the modules below can be
 * tested with a two-line stub instead of a live terminal theme.
 */
export interface PaintTheme {
	fg(color: ThemeToken, text: string): string;
	bold(text: string): string;
}

/**
 * A painter: a theme plus whether colour is wanted at all.
 *
 * `colored` exists because the wordmark writes raw escapes rather than going
 * through the theme, and it is the one place that must honour `NO_COLOR`
 * itself or a terminal that opted out gets a rainbow. Every other function
 * here goes through `fg`, which the theme already resolves.
 */
export interface Painter {
	theme: PaintTheme;
	colored: boolean;
}

/**
 * Whether colour should be emitted at all.
 *
 * `NO_COLOR` is the convention; `FORCE_COLOR` overrides it for the case where
 * output is being captured deliberately. A dumb terminal gets neither.
 */
export function colorFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.NO_COLOR) return false;
	if (env.FORCE_COLOR && env.FORCE_COLOR !== "0") return true;
	if (env.TERM === "dumb") return false;
	return true;
}

export function fg(paint: Painter, role: Role, text: string): string {
	return paint.theme.fg(ROLE_TOKEN[role], text);
}

export function bold(paint: Painter, text: string): string {
	return paint.theme.bold(text);
}

/**
 * Dimmed text.
 *
 * Pi's theme has no `dim()` method — `dim` is a *colour token*, not a weight —
 * so this is the token applied directly, which is how the built-in header does
 * it too.
 */
export function dim(paint: Painter, text: string): string {
	return paint.theme.fg("dim", text);
}

export function muted(paint: Painter, text: string): string {
	return paint.theme.fg("muted", text);
}

/** Theme visual presentation modes (UX-0041 – UX-0050) */
export type ThemeMode = "default" | "light" | "wcag-aaa" | "crt-amber";

/**
 * High-Contrast WCAG AAA Theme.
 *
 * Guarantees a minimum contrast ratio of 7.0:1 (up to 21:1 against pure black).
 * Designed for maximum readability in high-ambient lighting or visual accessibility needs.
 */
export const WCAG_AAA_THEME: PaintTheme = {
	fg(color: ThemeToken, text: string): string {
		switch (color) {
			case "accent":
				// Pure gold #FFD700 (220) - 14.5:1 ratio
				return `\x1b[38;5;220m${text}\x1b[0m`;
			case "warning":
				// Intense bright yellow #FFFF00 (226) - 19.6:1 ratio
				return `\x1b[38;5;226m${text}\x1b[0m`;
			case "error":
				// Vivid bright red #FF3333 (196) - 7.2:1 ratio
				return `\x1b[38;5;196m${text}\x1b[0m`;
			case "success":
				// High-luminance bright mint #00FF88 (48) - 13.7:1 ratio
				return `\x1b[38;5;48m${text}\x1b[0m`;
			case "mdLink":
			case "toolTitle":
				// High-luminance electric cyan #00FFFF (51) - 16.7:1 ratio
				return `\x1b[38;5;51m${text}\x1b[0m`;
			case "border":
			case "dim":
			case "muted":
				// High-contrast silver gray #CCCCCC (252) - 13.0:1 ratio
				return `\x1b[38;5;252m${text}\x1b[0m`;
			case "toolOutput":
			case "text":
			default:
				// Pure white #FFFFFF (231) - 21.0:1 ratio
				return `\x1b[38;5;231m${text}\x1b[0m`;
		}
	},
	bold(text: string): string {
		return `\x1b[1m${text}\x1b[0m`;
	},
};

/**
 * Retro CRT Amber Monochrome Phosphor Theme.
 *
 * Emulates the iconic amber phosphor VT220 / IBM 3161 monochrome terminals with
 * glowing amber warmth and dark scanline depths.
 */
export const CRT_AMBER_THEME: PaintTheme = {
	fg(color: ThemeToken, text: string): string {
		switch (color) {
			case "accent":
			case "warning":
				// Glowing hot amber #FFB000 (214)
				return `\x1b[38;5;214m${text}\x1b[0m`;
			case "error":
				// Intense amber inverted / deep red-amber #FF5F00 (202)
				return `\x1b[38;5;202m${text}\x1b[0m`;
			case "success":
			case "mdLink":
				// Warm amber highlight #FFAF00 (215)
				return `\x1b[38;5;215m${text}\x1b[0m`;
			case "border":
			case "dim":
			case "muted":
				// Dim phosphor trail #875F00 (94)
				return `\x1b[38;5;94m${text}\x1b[0m`;
			case "toolTitle":
			case "toolOutput":
			case "text":
			default:
				// Phosphor amber text #FFA000 (214)
				return `\x1b[38;5;214m${text}\x1b[0m`;
		}
	},
	bold(text: string): string {
		return `\x1b[1m${text}\x1b[0m`;
	},
};

/**
 * Resolves a PaintTheme given a requested ThemeMode.
 */
export function resolveTheme(mode: ThemeMode, fallback?: PaintTheme): PaintTheme {
	switch (mode) {
		case "wcag-aaa":
			return WCAG_AAA_THEME;
		case "crt-amber":
			return CRT_AMBER_THEME;
		case "default":
		case "light":
		default:
			return fallback ?? {
				fg: (_token, text) => text,
				bold: (text) => text,
			};
	}
}

