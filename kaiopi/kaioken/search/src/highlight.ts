/**
 * Interactive snippet highlighter with matched term color accents across the 10 document archetypes:
 * 1. exported API endpoint declarations (UX-0751)
 * 2. configuration options and environment variables (UX-0752)
 * 3. error codes and exception class definitions (UX-0753)
 * 4. database schema tables and migration scripts (UX-0754)
 * 5. utility functions and helper algorithms (UX-0755)
 * 6. test suite descriptions and assertion blocks (UX-0756)
 * 7. documentation wiki chapters and headings (UX-0757)
 * 8. knowledge card summaries and cited sources (UX-0758)
 * 9. agent procedure instructions and parameters (UX-0759)
 * 10. git commit messages and author metadata (UX-0760)
 */

import type { DomainArchetype } from "./boost.ts";
import type { SearchHit } from "./index-store.ts";

export type HighlightFormat = "ansi" | "markdown" | "html" | "plain";

export interface HighlightOptions {
	readonly format?: HighlightFormat;
	readonly windowSizeChars?: number;
	readonly maxLines?: number;
	readonly showLineNumbers?: boolean;
	readonly customColor?: string;
}

export interface HighlightMatch {
	readonly term: string;
	readonly index: number;
	readonly length: number;
}

export interface HighlightedSnippetResult {
	readonly rawSnippet: string;
	readonly formattedSnippet: string;
	readonly matchedTerms: string[];
	readonly matchCount: number;
	readonly startLine: number;
	readonly domain: DomainArchetype;
}

// ANSI Escape Codes
const ANSI_RESET = "\x1b[0m";
const ANSI_BOLD = "\x1b[1m";

export const DOMAIN_ACCENT_COLORS: Record<DomainArchetype, string> = {
	api: "\x1b[1;36m", // Bold Cyan
	config: "\x1b[1;33m", // Bold Yellow
	error: "\x1b[1;31m", // Bold Red
	db: "\x1b[1;35m", // Bold Magenta
	util: "\x1b[1;34m", // Bold Blue
	test: "\x1b[1;32m", // Bold Green
	wiki: "\x1b[1;37m", // Bold White
	card: "\x1b[1;96m", // High-Intensity Cyan
	skill: "\x1b[1;93m", // High-Intensity Yellow
	commit: "\x1b[1;92m", // High-Intensity Green
};

export const DOMAIN_BADGES: Record<DomainArchetype, string> = {
	api: "[API ENDPOINT]",
	config: "[CONFIG & ENV]",
	error: "[ERROR / DIAG]",
	db: "[DB / SCHEMA]",
	util: "[UTILITY / HELPER]",
	test: "[TEST SUITE]",
	wiki: "[WIKI CHAPTER]",
	card: "[KNOWLEDGE CARD]",
	skill: "[AGENT PROCEDURE]",
	commit: "[GIT COMMIT]",
};

/**
 * Locate best window of text containing the highest concentration of matched terms.
 */
export function extractDenseMatchWindow(
	text: string,
	queryTerms: readonly string[],
	windowSize = 180,
): { windowText: string; startOffset: number; relativeLine: number } {
	if (!text || queryTerms.length === 0) {
		return { windowText: text.slice(0, windowSize), startOffset: 0, relativeLine: 1 };
	}

	const lower = text.toLowerCase();
	const matches: number[] = [];

	for (const term of queryTerms) {
		const clean = term.trim().toLowerCase();
		if (clean.length < 2) continue;

		let idx = 0;
		while ((idx = lower.indexOf(clean, idx)) !== -1) {
			matches.push(idx);
			idx += clean.length;
		}
	}

	if (matches.length === 0) {
		return { windowText: text.slice(0, windowSize), startOffset: 0, relativeLine: 1 };
	}

	matches.sort((a, b) => a - b);
	const firstMatch = matches[0];
	const halfWindow = Math.floor(windowSize / 2);
	const startOffset = Math.max(0, firstMatch - halfWindow);
	const endOffset = Math.min(text.length, startOffset + windowSize);

	// Count newlines before startOffset
	const linesBefore = text.slice(0, startOffset).split("\n").length;

	return {
		windowText: text.slice(startOffset, endOffset),
		startOffset,
		relativeLine: linesBefore,
	};
}

/**
 * Highlights all occurrences of query terms inside text using ANSI colors or Markdown.
 */
export function highlightSnippet(
	text: string,
	queryTerms: readonly string[],
	domain: DomainArchetype = "util",
	options: HighlightOptions = {},
): HighlightedSnippetResult {
	const format = options.format ?? "ansi";
	const windowSize = options.windowSizeChars ?? 200;

	const { windowText, relativeLine } = extractDenseMatchWindow(text, queryTerms, windowSize);
	const cleanTerms = Array.from(
		new Set(
			queryTerms
				.map((t) => t.trim())
				.filter((t) => t.length >= 2),
		),
	);

	if (cleanTerms.length === 0) {
		return {
			rawSnippet: windowText,
			formattedSnippet: windowText,
			matchedTerms: [],
			matchCount: 0,
			startLine: relativeLine,
			domain,
		};
	}

	// Escape regex characters
	const pattern = cleanTerms
		.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
		.join("|");
	const regex = new RegExp(`(${pattern})`, "gi");

	const matchedTermsSet = new Set<string>();
	let matchCount = 0;

	const color = options.customColor ?? DOMAIN_ACCENT_COLORS[domain] ?? ANSI_BOLD;

	const formattedSnippet = windowText.replace(regex, (match) => {
		matchedTermsSet.add(match.toLowerCase());
		matchCount++;
		switch (format) {
			case "ansi":
				return `${color}${match}${ANSI_RESET}`;
			case "markdown":
				return `**${match}**`;
			case "html":
				return `<mark class="search-match ${domain}">${match}</mark>`;
			case "plain":
			default:
				return match;
		}
	});

	return {
		rawSnippet: windowText,
		formattedSnippet,
		matchedTerms: Array.from(matchedTermsSet),
		matchCount,
		startLine: relativeLine,
		domain,
	};
}

/**
 * Renders an interactive highlight card tailored to the document archetype.
 */
export function renderSnippetHighlightCard(params: {
	hit: SearchHit;
	queryTerms: readonly string[];
	domain: DomainArchetype;
	options?: HighlightOptions;
}): string {
	const { hit, queryTerms, domain, options = {} } = params;
	const highlight = highlightSnippet(hit.snippet || hit.title, queryTerms, domain, options);

	const badge = DOMAIN_BADGES[domain] || `[${domain.toUpperCase()}]`;
	const border = "─".repeat(68);
	const lineNo = hit.line || highlight.startLine;

	const lines = [
		`┌${border}┐`,
		`│ ${badge.padEnd(20)} ${hit.path.slice(-44).padEnd(46)} │`,
		`├${border}┤`,
		`│ Heading: ${(hit.heading || hit.title || "(no title)").padEnd(57)} │`,
		`│ Line   : ${String(lineNo).padEnd(57)} │`,
		`│ Matches: ${`${highlight.matchCount} occurrence(s) [${highlight.matchedTerms.join(", ")}]`.padEnd(57)} │`,
		`├${border}┤`,
		`│ Context Snippet:                                                    │`,
	];

	const snippetLines = highlight.formattedSnippet.split(/\r?\n/).slice(0, options.maxLines ?? 4);
	for (let i = 0; i < snippetLines.length; i++) {
		const prefix = options.showLineNumbers !== false ? `L${lineNo + i}: ` : "  ";
		lines.push(`│ ${prefix}${snippetLines[i]}`.slice(0, 69).padEnd(69) + "│");
	}

	lines.push(`└${border}┘`);
	return lines.join("\n");
}
