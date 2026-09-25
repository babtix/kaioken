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

/**
 * 10 Core Document and Knowledge Archetypes for Domain-Specific Search (UX-0741 to UX-0800).
 */
export type DomainArchetype =
	| "api"
	| "config"
	| "error"
	| "db"
	| "util"
	| "test"
	| "wiki"
	| "card"
	| "skill"
	| "commit";

export interface DomainBoostProfile {
	readonly domain: DomainArchetype;
	readonly label: string;
	readonly description: string;
	readonly preferredPathPatterns: string[];
	readonly preferredMultiplier: number;
	readonly nonPreferredMultiplier: number;
}

export const DOMAIN_BOOST_PROFILES: Record<DomainArchetype, DomainBoostProfile> = {
	api: {
		domain: "api",
		label: "Exported API Endpoints (UX-0741)",
		description: "Exported API endpoint declarations, route definitions, and request controllers",
		preferredPathPatterns: ["routes/", "api/", "controllers/", "endpoints/", "handlers/", "router/"],
		preferredMultiplier: 1.45,
		nonPreferredMultiplier: 0.95,
	},
	config: {
		domain: "config",
		label: "Configuration & Environment (UX-0742)",
		description: "Configuration options, environment variables, feature flags, and settings schemas",
		preferredPathPatterns: ["config/", "settings/", "options/", "env", "flags/", ".config"],
		preferredMultiplier: 1.4,
		nonPreferredMultiplier: 0.95,
	},
	error: {
		domain: "error",
		label: "Error Codes & Exceptions (UX-0743)",
		description: "Error codes, exception class definitions, failure diagnostics, and status codes",
		preferredPathPatterns: ["errors/", "exceptions/", "diagnostics/", "faults/", "codes/"],
		preferredMultiplier: 1.4,
		nonPreferredMultiplier: 0.95,
	},
	db: {
		domain: "db",
		label: "Database Schema & Migrations (UX-0744)",
		description: "Database schema tables, models, entities, and migration scripts",
		preferredPathPatterns: ["db/", "schema/", "migrations/", "models/", "entities/", "tables/"],
		preferredMultiplier: 1.4,
		nonPreferredMultiplier: 0.95,
	},
	util: {
		domain: "util",
		label: "Utility Functions & Helpers (UX-0745)",
		description: "Utility functions, helper algorithms, math routines, and shared transformers",
		preferredPathPatterns: ["utils/", "helpers/", "tools/", "algorithms/", "lib/utils", "common/"],
		preferredMultiplier: 1.35,
		nonPreferredMultiplier: 0.95,
	},
	test: {
		domain: "test",
		label: "Test Suites & Assertions (UX-0746)",
		description: "Test suite descriptions, test fixtures, mocks, and assertion blocks",
		preferredPathPatterns: ["test/", "tests/", "spec/", "__tests__/", "fixtures/", "suites/"],
		preferredMultiplier: 1.5,
		nonPreferredMultiplier: 0.85,
	},
	wiki: {
		domain: "wiki",
		label: "Documentation Wiki & Headings (UX-0747)",
		description: "Documentation wiki chapters, architecture overviews, guides, and headings",
		preferredPathPatterns: ["docs/", "wiki/", "chapters/", "guides/", "manual/", "architecture/"],
		preferredMultiplier: 1.4,
		nonPreferredMultiplier: 0.95,
	},
	card: {
		domain: "card",
		label: "Knowledge Cards & Facts (UX-0748)",
		description: "Knowledge card summaries, atomic fact cards, and cited sources",
		preferredPathPatterns: ["cards/", "knowledge/", "facts/", "notes/", "cards.ts"],
		preferredMultiplier: 1.45,
		nonPreferredMultiplier: 0.95,
	},
	skill: {
		domain: "skill",
		label: "Agent Skills & Procedures (UX-0749)",
		description: "Agent procedure instructions, skill definitions, parameters, and actions",
		preferredPathPatterns: ["skills/", "procedures/", "agents/", "tasks/", "skillgen/"],
		preferredMultiplier: 1.45,
		nonPreferredMultiplier: 0.95,
	},
	commit: {
		domain: "commit",
		label: "Git Commits & Metadata (UX-0750)",
		description: "Git commit messages, author metadata, changelog entries, and release history",
		preferredPathPatterns: [".git/", "commits/", "history/", "changelog", "releases/"],
		preferredMultiplier: 1.5,
		nonPreferredMultiplier: 0.9,
	},
};

/**
 * Domain-specific directory and path booster for the 10 core archetypes (UX-0741 to UX-0750).
 */
export function applyDomainPathBoost(
	docPath: string,
	baseScore: number,
	domain: DomainArchetype,
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

	const baseBoostResult = applyPathBoost(docPath, baseScore, config);
	const profile = DOMAIN_BOOST_PROFILES[domain];
	if (!profile) {
		return baseBoostResult;
	}

	const normPath = docPath.replace(/\\/g, "/").toLowerCase();
	let domainMultiplier = 1.0;
	let domainReason = "";

	const matchesPreferred = profile.preferredPathPatterns.some((pattern) =>
		normPath.includes(pattern.toLowerCase()),
	);

	if (matchesPreferred) {
		domainMultiplier = profile.preferredMultiplier;
		domainReason = `Matches ${profile.label} domain pattern (×${domainMultiplier.toFixed(2)})`;
	} else {
		domainMultiplier = profile.nonPreferredMultiplier;
		domainReason = `Outside ${profile.domain} preferred paths (×${domainMultiplier.toFixed(2)})`;
	}

	const totalMultiplier = baseBoostResult.multiplier * domainMultiplier;
	const boostedScore = Math.max(0, baseScore * totalMultiplier);

	return {
		originalScore: baseScore,
		boostedScore,
		multiplier: totalMultiplier,
		reason: `${baseBoostResult.reason} | ${domainReason}`,
	};
}

/**
 * Human-readable description of domain archetype path priorities.
 */
export function getArchetypeBoostDescription(domain: DomainArchetype): string {
	const profile = DOMAIN_BOOST_PROFILES[domain];
	if (!profile) return "General code and document search";
	return `${profile.label}: ${profile.description} (Preferred: ${profile.preferredPathPatterns.join(", ")})`;
}
