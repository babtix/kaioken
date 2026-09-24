/**
 * Adaptive 24-bit TrueColor gradient styling and color interpolation engine.
 *
 * Implements Features #UX-0001 – #UX-0010.
 *
 * Provides smooth RGB color gradients with automatic capability detection:
 * - 24-bit TrueColor (direct ANSI 38;2;R;G;Bm escapes)
 * - 256-color ANSI downsampling fallback
 * - Clean plain-text fallback on monochrome or non-TTY outputs
 */

export interface RGB {
	r: number;
	g: number;
	b: number;
}

export const KAIO_GRADIENT_STOPS: RGB[] = [
	{ r: 255, g: 175, b: 0 }, // Amber #ffaf00
	{ r: 255, g: 135, b: 0 }, // Orange #ff8700
	{ r: 255, g: 46, b: 85 }, // Crimson #ff2e55
];

export const MODEL_BADGE_STOPS: RGB[] = [
	{ r: 0, g: 215, b: 215 }, // Cyan
	{ r: 0, g: 135, b: 255 }, // Azure
];

export const STATUS_PILL_STOPS: RGB[] = [
	{ r: 0, g: 215, b: 135 }, // Mint
	{ r: 0, g: 175, b: 215 }, // Ocean
];

export function hexToRgb(hex: string): RGB {
	const clean = hex.replace("#", "");
	const num = parseInt(clean, 16);
	if (clean.length === 3) {
		const r = (num >> 8) & 0xf;
		const g = (num >> 4) & 0xf;
		const b = num & 0xf;
		return { r: (r << 4) | r, g: (g << 4) | g, b: (b << 4) | b };
	}
	return {
		r: (num >> 16) & 0xff,
		g: (num >> 8) & 0xff,
		b: num & 0xff,
	};
}

export function interpolateRgb(a: RGB, b: RGB, t: number): RGB {
	const clamped = Math.max(0, Math.min(1, t));
	return {
		r: Math.round(a.r + (b.r - a.r) * clamped),
		g: Math.round(a.g + (b.g - a.g) * clamped),
		b: Math.round(a.b + (b.b - a.b) * clamped),
	};
}

export function generateGradient(stops: RGB[], steps: number): RGB[] {
	if (steps <= 0) return [];
	if (steps === 1) return [stops[0] ?? { r: 255, g: 255, b: 255 }];
	if (stops.length === 0) return [];
	if (stops.length === 1) return new Array(steps).fill(stops[0]);

	const result: RGB[] = [];
	const segments = stops.length - 1;

	for (let i = 0; i < steps; i++) {
		const globalT = i / (steps - 1);
		const segmentIdx = Math.min(Math.floor(globalT * segments), segments - 1);
		const segmentT = (globalT * segments) - segmentIdx;
		const start = stops[segmentIdx] as RGB;
		const end = stops[segmentIdx + 1] as RGB;
		result.push(interpolateRgb(start, end, segmentT));
	}
	return result;
}

export function supportsTrueColor(env: NodeJS.ProcessEnv = process.env): boolean {
	if (env.NO_COLOR) return false;
	if (env.TERM === "dumb") return false;

	if (env.COLORTERM === "truecolor" || env.COLORTERM === "24bit") return true;
	if (env.WT_SESSION || env.TERM_PROGRAM === "vscode" || env.TERM_PROGRAM === "iTerm.app") return true;

	return false;
}

/**
 * Converts 24-bit RGB to closest standard 256-color palette index (fallback).
 */
export function rgbToAnsi256(rgb: RGB): number {
	// Standard grayscale ramp
	if (rgb.r === rgb.g && rgb.g === rgb.b) {
		if (rgb.r < 8) return 16;
		if (rgb.r > 248) return 231;
		return Math.round(((rgb.r - 8) / 247) * 23) + 232;
	}
	// 6x6x6 color cube: 16 + 36*r + 6*g + b
	const r = Math.round((rgb.r / 255) * 5);
	const g = Math.round((rgb.g / 255) * 5);
	const b = Math.round((rgb.b / 255) * 5);
	return 16 + 36 * r + 6 * g + b;
}

export function rgbFg(rgb: RGB, text: string): string {
	return `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m${text}\x1b[0m`;
}

export function ansi256Fg(code: number, text: string): string {
	return `\x1b[38;5;${code}m${text}\x1b[0m`;
}

/**
 * Renders text with a 24-bit TrueColor gradient, gracefully falling back
 * to 256-color ANSI or unstyled plain text depending on terminal capability.
 */
export function renderAdaptiveGradient(
	text: string,
	stops: RGB[] = KAIO_GRADIENT_STOPS,
	env: NodeJS.ProcessEnv = process.env,
): string {
	if (!text) return "";
	if (env.NO_COLOR || env.TERM === "dumb") return text;

	const hasTrueColor = supportsTrueColor(env);
	const chars = [...text];
	const colors = generateGradient(stops, chars.length);

	let out = "";
	for (let i = 0; i < chars.length; i++) {
		const char = chars[i] as string;
		const color = colors[i] as RGB;
		if (hasTrueColor) {
			out += `\x1b[38;2;${color.r};${color.g};${color.b}m${char}\x1b[0m`;
		} else {
			const code = rgbToAnsi256(color);
			out += `\x1b[38;5;${code}m${char}\x1b[0m`;
		}
	}
	return out;
}
