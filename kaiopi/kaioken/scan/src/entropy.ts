/**
 * Shannon Entropy calculation and high-entropy secret detection.
 * Identifies high-randomness literals (API keys, cryptographic tokens, passwords)
 * while filtering out ordinary code identifiers and dictionary prose.
 */

export interface HighEntropyFinding {
	/** Suspicious candidate string literal or token. */
	token: string;
	/** Masked preview for safe terminal display. */
	masked: string;
	/** Shannon entropy in bits per character. */
	entropy: number;
	/** Normalized entropy score from 0.0 to 1.0. */
	metricEntropy: number;
	/** 1-indexed line number in source if available. */
	line: number;
	/** 0-indexed column offset in source line. */
	column: number;
	/** Severity assessment based on entropy threshold and character set. */
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface EntropyOptions {
	/** Minimum Shannon entropy to flag as suspicious. Defaults to 4.3 bits/char. */
	minEntropy?: number;
	/** Minimum token length to analyze. Defaults to 20. */
	minLength?: number;
	/** Maximum token length to analyze. Defaults to 256. */
	maxLength?: number;
	/** Custom whitelist regular expressions to ignore. */
	whitelist?: RegExp[];
}

const DEFAULT_MIN_ENTROPY = 4.3;
const DEFAULT_MIN_LENGTH = 20;
const DEFAULT_MAX_LENGTH = 256;

const DEFAULT_WHITELIST: RegExp[] = [
	// UUIDs
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
	// Full SHA-256 or SHA-1 hashes (e.g., git commit hashes or file integrity checks)
	/^[0-9a-f]{40}$/i,
	/^[0-9a-f]{64}$/i,
	// Common benign URL / data formats
	/^data:image\/[a-z+]+;base64,/i,
	// Common package identifiers / semver strings
	/^[a-z0-9-_]+@[0-9]+\.[0-9]+\.[0-9]+/,
];

const PLACEHOLDER_TERMS = [
	"example",
	"sample",
	"placeholder",
	"dummy",
	"fake",
	"test",
	"changeme",
	"change_me",
	"your",
	"redacted",
	"notreal",
];

/**
 * Calculates the standard Shannon entropy of a string:
 * H(X) = -sum(P(x_i) * log2(P(x_i)))
 * Returns value in bits per character (0.0 to ~8.0 for byte/ASCII range).
 */
export function calculateShannonEntropy(text: string): number {
	if (!text || text.length === 0) return 0;

	const freq = new Map<string, number>();
	for (const char of text) {
		freq.set(char, (freq.get(char) ?? 0) + 1);
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
 * Normalizes Shannon entropy against the theoretical maximum for the given string length
 * or character alphabet.
 */
export function calculateMetricEntropy(text: string): number {
	if (!text || text.length <= 1) return 0;
	const entropy = calculateShannonEntropy(text);
	// Maximum entropy for text of this length is log2(len)
	const maxTheoretical = Math.log2(text.length);
	return maxTheoretical > 0 ? Number((entropy / maxTheoretical).toFixed(4)) : 0;
}

/**
 * Scan source text for candidate high-entropy tokens (string literals, bearer tokens, API keys).
 */
export function detectHighEntropyStrings(
	text: string,
	options: EntropyOptions = {},
): HighEntropyFinding[] {
	if (!text) return [];

	const minEntropy = options.minEntropy ?? DEFAULT_MIN_ENTROPY;
	const minLength = options.minLength ?? DEFAULT_MIN_LENGTH;
	const maxLength = options.maxLength ?? DEFAULT_MAX_LENGTH;
	const whitelist = [...DEFAULT_WHITELIST, ...(options.whitelist ?? [])];

	const findings: HighEntropyFinding[] = [];
	const lines = text.split(/\r?\n/);

	// Extract candidate string literals and raw high-entropy tokens
	const tokenPattern = /["'`]([^"'`\r\n\s]{16,})["`]|(?:\b|=)([A-Za-z0-9_+/=-]{20,})/g;

	for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
		const lineContent = lines[lineIdx]!;
		if (lineContent.trim().startsWith("//") || lineContent.trim().startsWith("#")) {
			// Skip single-line comments that merely talk about secrets
			const lowered = lineContent.toLowerCase();
			if (PLACEHOLDER_TERMS.some((term) => lowered.includes(term))) {
				continue;
			}
		}

		tokenPattern.lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = tokenPattern.exec(lineContent)) !== null) {
			const candidate = match[1] ?? match[2];
			if (!candidate) continue;

			if (candidate.length < minLength || candidate.length > maxLength) {
				continue;
			}

			// Check placeholders
			const lowerCandidate = candidate.toLowerCase();
			if (PLACEHOLDER_TERMS.some((term) => lowerCandidate.includes(term))) {
				continue;
			}

			// Check repeats: "aaaa..." or "010101..."
			if (/^(.)\1+$/.test(candidate) || /^(.{2})\1+$/.test(candidate)) {
				continue;
			}

			// Check whitelist
			if (whitelist.some((re) => re.test(candidate))) {
				continue;
			}

			// Check character class diversity
			const hasLower = /[a-z]/.test(candidate);
			const hasUpper = /[A-Z]/.test(candidate);
			const hasDigit = /\d/.test(candidate);
			const hasSpecial = /[^A-Za-z0-9]/.test(candidate);
			const classCount = Number(hasLower) + Number(hasUpper) + Number(hasDigit) + Number(hasSpecial);
			if (classCount < 2) {
				continue;
			}

			const entropy = calculateShannonEntropy(candidate);
			if (entropy < minEntropy) {
				continue;
			}

			const metricEntropy = calculateMetricEntropy(candidate);
			const severity =
				entropy >= 4.8 ? "CRITICAL" : entropy >= 4.4 ? "HIGH" : entropy >= 3.8 ? "MEDIUM" : "LOW";

			const column = match.index;
			findings.push({
				token: candidate,
				masked: maskToken(candidate),
				entropy,
				metricEntropy,
				line: lineIdx + 1,
				column,
				severity,
			});
		}
	}

	return findings;
}

/**
 * Safely masks a secret token for terminal output or reports.
 * Preserves first 4 and last 4 characters if long enough.
 */
export function maskToken(token: string): string {
	if (token.length <= 8) {
		return "*".repeat(token.length);
	}
	const prefix = token.slice(0, 4);
	const suffix = token.slice(-4);
	const maskedMiddle = "*".repeat(Math.min(8, token.length - 8));
	return `${prefix}${maskedMiddle}${suffix}`;
}

/**
 * Formats a terminal ASCII / Unicode progress bar representing Shannon entropy.
 * Green < 3.5, Yellow 3.5 - 4.4, Red >= 4.5.
 */
export function formatEntropyBar(entropy: number, maxEntropy = 6.0, width = 10): string {
	const clamped = Math.max(0, Math.min(entropy, maxEntropy));
	const filled = Math.round((clamped / maxEntropy) * width);
	const empty = width - filled;

	const bar = "█".repeat(filled) + "░".repeat(empty);
	const label = `${entropy.toFixed(2)} b/c`;

	return `[${bar}] ${label}`;
}

/**
 * Formats an overview terminal summary card of high-entropy findings.
 */
export function visualizeEntropyProfile(findings: HighEntropyFinding[]): string {
	if (findings.length === 0) {
		return "✓ Shannon Entropy Shield: Zero anomalous high-entropy strings detected.";
	}

	const lines: string[] = [
		`⚠ High-Entropy Detection Alert: ${findings.length} suspicious literal(s) found`,
		"―".repeat(60),
	];

	for (const f of findings) {
		const bar = formatEntropyBar(f.entropy);
		lines.push(
			` Line ${String(f.line).padStart(4)}: ${f.masked.padEnd(20)} ${bar} [${f.severity}]`,
		);
	}

	lines.push("―".repeat(60));
	return lines.join("\n");
}
