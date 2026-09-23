/**
 * Exact phrase quote matching and directory/file-path boosting.
 * Features: #UX-0721 to #UX-0730, #UX-0741 to #UX-0750
 */

export interface ParsedSearchQuery {
	readonly raw: string;
	readonly exactQuotes: string[];
	readonly unquotedTerms: string[];
	readonly pathFilters: string[];
	readonly cleanText: string;
}

export interface PhraseBonusResult {
	readonly bonus: number;
	readonly matchedQuotes: string[];
}

export interface PathBoostConfig {
	readonly coreDirectoryMultiplier?: number;
	readonly testDirectoryMultiplier?: number;
	readonly vendorDirectoryMultiplier?: number;
	readonly customBoosts?: Record<string, number>;
	readonly depthPenaltyPerLevel?: number;
}

export interface PathBoostResult {
	readonly originalScore: number;
	readonly boostedScore: number;
	readonly multiplier: number;
	readonly reason: string;
}

const DEFAULT_PATH_CONFIG: Required<PathBoostConfig> = {
	coreDirectoryMultiplier: 1.25,
	testDirectoryMultiplier: 0.75,
	vendorDirectoryMultiplier: 0.5,
	customBoosts: {},
	depthPenaltyPerLevel: 0.02,
};

/**
 * Parses user queries extracting quoted strings (`"exact phrase"`),
 * path filters (`path:src/`), and regular unquoted search terms.
 */
export function parseQueryQuotes(query: string): ParsedSearchQuery {
	const raw = query.trim();
	const exactQuotes: string[] = [];
	const unquotedTerms: string[] = [];
	const pathFilters: string[] = [];

	// Extract quoted phrases: "..." or '...'
	const quoteRegex = /["']([^"']+)["']/g;
	let lastIndex = 0;
	let match: RegExpExecArray | null;

	const unquotedSegments: string[] = [];

	while ((match = quoteRegex.exec(raw)) !== null) {
		const matchStart = match.index;
		const matchEnd = quoteRegex.lastIndex;

		if (matchStart > lastIndex) {
			unquotedSegments.push(raw.slice(lastIndex, matchStart));
		}

		const quotedText = (match[1] as string).trim();
		if (quotedText.length > 0) {
			exactQuotes.push(quotedText);
		}

		lastIndex = matchEnd;
	}

	if (lastIndex < raw.length) {
		unquotedSegments.push(raw.slice(lastIndex));
	}

	// Process unquoted segments for path filters and unquoted terms
	const unquotedCombined = unquotedSegments.join(" ").trim();
	const words = unquotedCombined.split(/\s+/).filter(Boolean);

	for (const word of words) {
		if (word.startsWith("path:") || word.startsWith("in:")) {
			const filter = word.slice(word.indexOf(":") + 1).trim();
			if (filter.length > 0) {
				pathFilters.push(filter);
			}
		} else {
			unquotedTerms.push(word);
		}
	}

	const cleanParts = [...exactQuotes, ...unquotedTerms];
	const cleanText = cleanParts.join(" ");

	return {
		raw,
		exactQuotes,
		unquotedTerms,
		pathFilters,
		cleanText,
	};
}

/**
 * Check if candidate passage contains any of the exact phrases extracted from quotes.
 * Applies a substantial bonus (+2.5 per match by default) to contiguous phrase occurrences.
 */
export function calculatePhraseQuoteBonus(
	quotes: readonly string[],
	haystack: string,
	bonusPerQuote = 2.5,
): PhraseBonusResult {
	if (quotes.length === 0 || !haystack) {
		return { bonus: 0, matchedQuotes: [] };
	}

	const lowerHaystack = haystack.toLowerCase();
	const matchedQuotes: string[] = [];
	let bonus = 0;

	for (const quote of quotes) {
		const needle = quote.trim().toLowerCase();
		if (needle.length < 2) continue;

		if (lowerHaystack.includes(needle)) {
			matchedQuotes.push(quote);
			// Longer exact phrases receive slightly higher confidence bonus
			const lengthFactor = Math.min(2.0, 1.0 + (needle.length - 4) * 0.05);
			bonus += bonusPerQuote * Math.max(1.0, lengthFactor);
		}
	}

	return { bonus, matchedQuotes };
}

/**
 * Directory and file-path booster.
 * Prioritizes primary implementation paths (e.g. `src/`, `lib/`, `packages/`)
 * while demoting tests and generated bundles, adjusted for directory depth.
 */
export function applyPathBoost(
	docPath: string,
	baseScore: number,
	config: PathBoostConfig = {},
): PathBoostResult {
	if (baseScore <= 0) {
		return {
			originalScore: baseScore,
			boostedScore: baseScore,
			multiplier: 1.0,
			reason: "Zero base score",
		};
	}

	const cfg: Required<PathBoostConfig> = {
		coreDirectoryMultiplier:
			config.coreDirectoryMultiplier ?? DEFAULT_PATH_CONFIG.coreDirectoryMultiplier,
		testDirectoryMultiplier:
			config.testDirectoryMultiplier ?? DEFAULT_PATH_CONFIG.testDirectoryMultiplier,
		vendorDirectoryMultiplier:
			config.vendorDirectoryMultiplier ?? DEFAULT_PATH_CONFIG.vendorDirectoryMultiplier,
		customBoosts: config.customBoosts ?? DEFAULT_PATH_CONFIG.customBoosts,
		depthPenaltyPerLevel:
			config.depthPenaltyPerLevel ?? DEFAULT_PATH_CONFIG.depthPenaltyPerLevel,
	};

	const normPath = docPath.replace(/\\/g, "/").toLowerCase();
	let multiplier = 1.0;
	let reason = "Default path score";

	// Check custom directory boosts first
	for (const [pattern, boost] of Object.entries(cfg.customBoosts)) {
		if (normPath.includes(pattern.toLowerCase())) {
			multiplier *= boost;
			reason = `Custom boost for matching "${pattern}" (×${boost.toFixed(2)})`;
			break;
		}
	}

	// Core source directory boost
	if (
		normPath.startsWith("src/") ||
		normPath.includes("/src/") ||
		normPath.startsWith("packages/") ||
		normPath.includes("/packages/") ||
		normPath.startsWith("lib/")
	) {
		multiplier *= cfg.coreDirectoryMultiplier;
		reason = `Core source file boost (×${cfg.coreDirectoryMultiplier.toFixed(2)})`;
	}

	// Test file demotion
	if (
		normPath.includes("test/") ||
		normPath.includes("__tests__/") ||
		normPath.endsWith(".test.ts") ||
		normPath.endsWith(".test.js") ||
		normPath.endsWith(".spec.ts") ||
		normPath.endsWith(".spec.js")
	) {
		multiplier *= cfg.testDirectoryMultiplier;
		reason = `Test file attenuation (×${cfg.testDirectoryMultiplier.toFixed(2)})`;
	}

	// Vendor / dist demotion
	if (
		normPath.includes("node_modules/") ||
		normPath.includes("dist/") ||
		normPath.includes(".kaioken/build/")
	) {
		multiplier *= cfg.vendorDirectoryMultiplier;
		reason = `Vendor/dist file demotion (×${cfg.vendorDirectoryMultiplier.toFixed(2)})`;
	}

	// Depth adjustment: penalize excessively deep directory nesting slightly
	const depth = normPath.split("/").length - 1;
	if (depth > 2) {
		const penalty = Math.max(0.7, 1.0 - (depth - 2) * cfg.depthPenaltyPerLevel);
		multiplier *= penalty;
	}

	const boostedScore = Math.max(0, baseScore * multiplier);

	return {
		originalScore: baseScore,
		boostedScore,
		multiplier,
		reason,
	};
}
