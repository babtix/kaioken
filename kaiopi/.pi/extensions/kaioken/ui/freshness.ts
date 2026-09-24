/**
 * Live repository freshness ratio badge and drift gauge.
 *
 * Implements Step 19.2 (Features #UX-0211 - #UX-0220, #UX-0291 - #UX-0300).
 * Displays visual badges, color-shifting status pills, and freshness dials.
 */
import { fg, type Painter } from "./theme.ts";

export type FreshnessSeverity = "ok" | "warn" | "error";

/**
 * Calculate document freshness ratio from fresh document count and total document count.
 * Returns 1.0 (100% fresh) when total count is 0.
 */
export function calculateFreshness(freshCount: number, totalCount: number): number {
	if (totalCount <= 0) return 1.0;
	if (freshCount <= 0) return 0.0;
	return Math.min(1.0, Math.max(0.0, freshCount / totalCount));
}

/**
 * Classify freshness ratio into standard severity tiers.
 */
export function getFreshnessSeverity(ratio: number): FreshnessSeverity {
	if (ratio >= 0.8) return "ok";
	if (ratio >= 0.5) return "warn";
	return "error";
}

export interface FreshnessBadgeOptions {
	unicode?: boolean;
	compact?: boolean;
	showPercentage?: boolean;
}

/**
 * Render a formatted freshness badge pill with severity indicator.
 */
export function renderFreshnessBadge(
	ratio: number,
	staleCount = 0,
	paint?: Painter,
	options: FreshnessBadgeOptions = {},
): string {
	const unicode = options.unicode ?? true;
	const compact = options.compact ?? false;
	const severity = getFreshnessSeverity(ratio);
	const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);

	let icon: string;
	if (unicode) {
		icon = severity === "ok" ? "●" : severity === "warn" ? "▲" : "■";
	} else {
		icon = severity === "ok" ? "OK" : severity === "warn" ? "WARN" : "ERR";
	}

	let label = `${pct}% fresh`;
	if (staleCount > 0 && !compact) {
		label += ` · ${staleCount} stale`;
	} else if (staleCount > 0 && compact) {
		label = `${pct}% (${staleCount} stale)`;
	}

	const pillText = unicode ? `[${icon} ${label}]` : `[${icon}: ${label}]`;

	if (!paint) return pillText;
	return fg(paint, severity, pillText);
}

/**
 * Render a horizontal dial progress bar for repository freshness.
 */
export function renderFreshnessDial(
	ratio: number,
	width = 10,
	paint?: Painter,
	unicode = true,
): string {
	const clamped = Math.min(1, Math.max(0, ratio));
	const filled = Math.round(clamped * width);
	const empty = width - filled;

	const fillChar = unicode ? "█" : "#";
	const emptyChar = unicode ? "░" : "-";
	const bar = `${fillChar.repeat(filled)}${emptyChar.repeat(empty)}`;
	const pct = `${Math.round(clamped * 100)}%`;
	const severity = getFreshnessSeverity(clamped);

	if (!paint) return `[${bar}] ${pct}`;
	return `[${fg(paint, severity, bar)}] ${fg(paint, "accent", pct)}`;
}
