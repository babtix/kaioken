import { ARCHETYPE_METADATA, type RiskArchetype } from "./archetypes.ts";
import { maskToken } from "./entropy.ts";

export interface CharClassDistribution {
	hasLower: boolean;
	hasUpper: boolean;
	hasDigits: boolean;
	hasSymbols: boolean;
	totalClasses: number;
	isHexOnly: boolean;
	isBase64Candidate: boolean;
}

export interface ArchetypeEntropyReport {
	archetype: RiskArchetype;
	token: string;
	masked: string;
	shannonEntropy: number;
	metricEntropy: number;
	threshold: number;
	exceedsThreshold: boolean;
	distribution: CharClassDistribution;
	visualBar: string;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
	summary: string;
}

/**
 * Calculates standard Shannon entropy in bits per character.
 * H(X) = -sum(p_i * log2(p_i))
 */
export function calculateShannonEntropy(text: string): number {
	if (!text || text.length === 0) return 0;
	const freq = new Map<string, number>();
	for (const ch of text) {
		freq.set(ch, (freq.get(ch) ?? 0) + 1);
	}
	let entropy = 0;
	const len = text.length;
	for (const count of freq.values()) {
		const p = count / len;
		entropy -= p * Math.log2(p);
	}
	return Number(entropy.toFixed(4));
}

/**
 * Normalizes Shannon entropy against theoretical maximum for the string length: log2(len).
 */
export function calculateMetricEntropy(text: string): number {
	if (!text || text.length <= 1) return 0;
	const h = calculateShannonEntropy(text);
	const maxTheoretical = Math.log2(text.length);
	return maxTheoretical > 0 ? Number((h / maxTheoretical).toFixed(4)) : 0;
}

/**
 * Analyzes the character class distribution of a token.
 */
export function analyzeCharClasses(token: string): CharClassDistribution {
	const hasLower = /[a-z]/.test(token);
	const hasUpper = /[A-Z]/.test(token);
	const hasDigits = /[0-9]/.test(token);
	const hasSymbols = /[^A-Za-z0-9]/.test(token);
	const totalClasses = Number(hasLower) + Number(hasUpper) + Number(hasDigits) + Number(hasSymbols);
	const isHexOnly = /^[0-9a-fA-F]+$/.test(token);
	const isBase64Candidate = /^[A-Za-z0-9+/=_-]+$/.test(token) && totalClasses >= 2;

	return {
		hasLower,
		hasUpper,
		hasDigits,
		hasSymbols,
		totalClasses,
		isHexOnly,
		isBase64Candidate,
	};
}

/**
 * Formats a Shannon entropy score as a visual terminal gauge / bar.
 * e.g., `[████████░░] 4.82 bits/char`
 */
export function formatEntropyGauge(entropy: number, maxExpected = 6.0, barWidth = 10): string {
	const clamped = Math.max(0, Math.min(entropy, maxExpected));
	const filled = Math.round((clamped / maxExpected) * barWidth);
	const unfilled = barWidth - filled;
	const bar = "█".repeat(filled) + "░".repeat(unfilled);
	return `[${bar}] ${entropy.toFixed(2)} bits/char`;
}

/**
 * Evaluates a string against a specific risk archetype's entropy baseline and produces
 * a full visualization report (UX-0571 to UX-0580).
 */
export function evaluateArchetypeEntropy(
	token: string,
	archetype: RiskArchetype,
): ArchetypeEntropyReport {
	const meta = ARCHETYPE_METADATA[archetype];
	const entropy = calculateShannonEntropy(token);
	const metricEntropy = calculateMetricEntropy(token);
	const threshold = meta.minShannonEntropy;
	const exceedsThreshold = entropy >= threshold;
	const distribution = analyzeCharClasses(token);
	const visualBar = formatEntropyGauge(entropy, archetype === "binaries" ? 8.0 : 6.0);

	let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" = "LOW";
	if (exceedsThreshold) {
		severity = meta.defaultSeverity;
	} else if (entropy >= threshold - 0.5) {
		severity = "MEDIUM";
	}

	const summary = exceedsThreshold
		? `High randomness token flagged: ${visualBar} meets or exceeds ${meta.label} threshold (${threshold.toFixed(1)}).`
		: `Normal entropy: ${visualBar} below risk threshold (${threshold.toFixed(1)}).`;

	return {
		archetype,
		token,
		masked: maskToken(token),
		shannonEntropy: entropy,
		metricEntropy,
		threshold,
		exceedsThreshold,
		distribution,
		visualBar,
		severity,
		summary,
	};
}

/**
 * Renders an ASCII visualization card for terminal streaming display.
 */
export function renderEntropyCard(report: ArchetypeEntropyReport): string {
	const meta = ARCHETYPE_METADATA[report.archetype];
	const statusBadge = report.exceedsThreshold ? `[${report.severity}]` : "[SAFE]";
	const lines = [
		`┌── Kaioken Shannon Entropy Visualizer: ${meta.label} ──┐`,
		`│ Token:     ${report.masked.padEnd(46)} │`,
		`│ Visual:    ${report.visualBar.padEnd(46)} │`,
		`│ Status:    ${(statusBadge + " " + (report.exceedsThreshold ? "THRESHOLD EXCEEDED" : "PASS")).padEnd(46)} │`,
		`│ Entropy:   ${(report.shannonEntropy.toFixed(2) + " b/c (Metric: " + (report.metricEntropy * 100).toFixed(1) + "%)").padEnd(46)} │`,
		`│ Char-set:  ${("Classes: " + report.distribution.totalClasses + " | Base64: " + report.distribution.isBase64Candidate).padEnd(46)} │`,
		`└──────────────────────────────────────────────────────────┘`,
	];
	return lines.join("\n");
}
