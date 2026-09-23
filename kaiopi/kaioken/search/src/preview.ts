/**
 * Instant search-as-you-type live query preview across code, docs, and cards.
 * Features: #UX-0701 to #UX-0710
 */

import type { Chunk, Doc } from "./corpus.ts";
import type { SearchHit, SearchIndex } from "./index-store.ts";

export type PreviewCategory =
	| "api"
	| "config"
	| "error"
	| "db"
	| "util"
	| "test"
	| "wiki"
	| "card"
	| "skill"
	| "commit"
	| "other";

export interface CategoryMetadata {
	readonly id: PreviewCategory;
	readonly label: string;
	readonly badge: string;
	readonly description: string;
}

export const PREVIEW_CATEGORIES: Record<PreviewCategory, CategoryMetadata> = {
	api: {
		id: "api",
		label: "API & Routes",
		badge: "[API]",
		description: "Exported API endpoint declarations and handler routes",
	},
	config: {
		id: "config",
		label: "Configuration",
		badge: "[CFG]",
		description: "Configuration options, environment flags, and settings",
	},
	error: {
		id: "error",
		label: "Error Codes",
		badge: "[ERR]",
		description: "Error codes, exception class definitions, and diagnostics",
	},
	db: {
		id: "db",
		label: "Database & Schema",
		badge: "[DB]",
		description: "Database schema tables, models, and migration scripts",
	},
	util: {
		id: "util",
		label: "Utilities & Helpers",
		badge: "[UTL]",
		description: "Utility functions, helper algorithms, and transformers",
	},
	test: {
		id: "test",
		label: "Tests & Assertions",
		badge: "[TST]",
		description: "Test suite descriptions, test fixtures, and assertion blocks",
	},
	wiki: {
		id: "wiki",
		label: "Documentation Wiki",
		badge: "[DOC]",
		description: "Documentation wiki chapters, architecture notes, and guides",
	},
	card: {
		id: "card",
		label: "Knowledge Cards",
		badge: "[CRD]",
		description: "Structured atomic knowledge cards and module summaries",
	},
	skill: {
		id: "skill",
		label: "Agent Skills",
		badge: "[SKL]",
		description: "Agent procedure instructions, skill definitions, and steps",
	},
	commit: {
		id: "commit",
		label: "Git Commits",
		badge: "[GIT]",
		description: "Git commit messages, hashes, and change metadata",
	},
	other: {
		id: "other",
		label: "Other Symbols",
		badge: "[SYM]",
		description: "Other declarations and code constructs",
	},
};

/**
 * Classifies a document passage into one of the 10 distinct entity categories.
 */
export function classifyChunkCategory(doc: Doc, chunk: Chunk): PreviewCategory {
	const pathLower = doc.path.toLowerCase();
	const headingLower = chunk.heading.toLowerCase();
	const textLower = chunk.text.toLowerCase();

	if (doc.kind === "wiki") return "wiki";
	if (doc.kind === "card") return "card";
	if (doc.kind === "skill") return "skill";

	if (
		pathLower.includes("commit") ||
		headingLower.includes("commit") ||
		textLower.includes("git commit")
	) {
		return "commit";
	}

	if (
		pathLower.includes("test") ||
		pathLower.includes("spec") ||
		headingLower.includes("describe(") ||
		headingLower.includes("it(") ||
		headingLower.includes("test(")
	) {
		return "test";
	}

	if (
		pathLower.includes("error") ||
		pathLower.includes("exception") ||
		headingLower.includes("error") ||
		headingLower.includes("exception") ||
		textLower.includes("extends error") ||
		textLower.includes("custom error")
	) {
		return "error";
	}

	if (
		pathLower.includes("db") ||
		pathLower.includes("schema") ||
		pathLower.includes("migration") ||
		pathLower.includes("model") ||
		headingLower.includes("table") ||
		headingLower.includes("schema") ||
		textLower.includes("create table")
	) {
		return "db";
	}

	if (
		pathLower.includes("config") ||
		pathLower.includes("settings") ||
		pathLower.includes(".env") ||
		headingLower.includes("config") ||
		headingLower.includes("options") ||
		headingLower.includes("settings")
	) {
		return "config";
	}

	if (
		pathLower.includes("route") ||
		pathLower.includes("api") ||
		pathLower.includes("endpoint") ||
		pathLower.includes("controller") ||
		headingLower.includes("endpoint") ||
		headingLower.includes("route") ||
		headingLower.includes("api") ||
		textLower.includes("@post") ||
		textLower.includes("@get") ||
		textLower.includes("requestlistener")
	) {
		return "api";
	}

	if (
		pathLower.includes("util") ||
		pathLower.includes("helper") ||
		headingLower.includes("util") ||
		headingLower.includes("format") ||
		headingLower.includes("parse") ||
		headingLower.includes("validate")
	) {
		return "util";
	}

	return "other";
}

export interface LivePreviewItem {
	readonly category: PreviewCategory;
	readonly title: string;
	readonly path: string;
	readonly line: number;
	readonly heading: string;
	readonly snippet: string;
	readonly score: number;
	readonly matchedTerms: string[];
}

export interface LivePreviewSummary {
	readonly query: string;
	readonly totalHits: number;
	readonly categoryCounts: Record<PreviewCategory, number>;
	readonly itemsByCategory: Record<PreviewCategory, LivePreviewItem[]>;
	readonly topItems: LivePreviewItem[];
	readonly latencyMs: number;
}

export interface LivePreviewOptions {
	readonly limit?: number;
	readonly maxPerCategory?: number;
	readonly categories?: PreviewCategory[];
}

/**
 * Highlights occurrences of query terms in preview text.
 */
export function extractMatchedTerms(query: string, text: string): string[] {
	if (!query || !text) return [];
	const terms = query
		.toLowerCase()
		.split(/\s+/)
		.filter((t) => t.length > 1);

	const textLower = text.toLowerCase();
	const matches: string[] = [];

	for (const term of terms) {
		if (textLower.includes(term) && !matches.includes(term)) {
			matches.push(term);
		}
	}

	return matches;
}

/**
 * Generates an instant live preview summary across the 10 entity categories.
 */
export async function createLiveSearchPreview(
	searchIndex: SearchIndex,
	query: string,
	options: LivePreviewOptions = {},
): Promise<LivePreviewSummary> {
	const startTime = Date.now();
	const limit = options.limit ?? 15;
	const maxPerCategory = options.maxPerCategory ?? 4;
	const allowedCategories = options.categories ? new Set(options.categories) : null;

	const hits: SearchHit[] = await searchIndex.search({
		text: query,
		limit: limit * 2,
	});

	const categoryCounts: Record<PreviewCategory, number> = {
		api: 0,
		config: 0,
		error: 0,
		db: 0,
		util: 0,
		test: 0,
		wiki: 0,
		card: 0,
		skill: 0,
		commit: 0,
		other: 0,
	};

	const itemsByCategory: Record<PreviewCategory, LivePreviewItem[]> = {
		api: [],
		config: [],
		error: [],
		db: [],
		util: [],
		test: [],
		wiki: [],
		card: [],
		skill: [],
		commit: [],
		other: [],
	};

	const topItems: LivePreviewItem[] = [];

	for (const hit of hits) {
		// Reconstruct doc & chunk classification heuristics
		const doc: Doc = {
			path: hit.path,
			kind: hit.kind,
			section: hit.section,
			title: hit.title,
			hash: "",
		};
		const chunk: Chunk = {
			doc: 0,
			heading: hit.heading,
			line: hit.line,
			text: hit.snippet,
		};

		const cat = classifyChunkCategory(doc, chunk);
		if (allowedCategories && !allowedCategories.has(cat)) continue;

		categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;

		const matchedTerms = extractMatchedTerms(query, `${hit.heading} ${hit.snippet}`);
		const item: LivePreviewItem = {
			category: cat,
			title: hit.title,
			path: hit.path,
			line: hit.line,
			heading: hit.heading,
			snippet: hit.snippet,
			score: hit.score,
			matchedTerms,
		};

		if (itemsByCategory[cat].length < maxPerCategory) {
			itemsByCategory[cat].push(item);
		}

		if (topItems.length < limit) {
			topItems.push(item);
		}
	}

	const latencyMs = Date.now() - startTime;

	return {
		query,
		totalHits: hits.length,
		categoryCounts,
		itemsByCategory,
		topItems,
		latencyMs,
	};
}

/**
 * Format a rich terminal visual preview card displaying instant results.
 */
export function formatLivePreviewCard(
	summary: LivePreviewSummary,
	options: { maxPerCategory?: number; width?: number } = {},
): string {
	const maxPerCategory = options.maxPerCategory ?? 2;
	const lines: string[] = [];

	lines.push(`┌── Live Query Preview: "${summary.query}" (${summary.totalHits} hit(s), ${summary.latencyMs}ms) ──┐`);

	// Summary breakdown pill line
	const activePills: string[] = [];
	for (const [catKey, count] of Object.entries(summary.categoryCounts)) {
		if (count > 0) {
			const meta = PREVIEW_CATEGORIES[catKey as PreviewCategory];
			activePills.push(`${meta.badge} ${meta.label}: ${count}`);
		}
	}

	if (activePills.length > 0) {
		lines.push(`│ Categories: ${activePills.join(" | ")}`);
		lines.push("├─────────────────────────────────────────────────────────────────────────────┤");
	}

	if (summary.totalHits === 0) {
		lines.push(`│ No immediate matches found for "${summary.query}".`);
		lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
		return lines.join("\n");
	}

	// Render items by category
	for (const [catKey, items] of Object.entries(summary.itemsByCategory)) {
		if (items.length === 0) continue;
		const meta = PREVIEW_CATEGORIES[catKey as PreviewCategory];

		lines.push(`│ ${meta.badge} ${meta.label.toUpperCase()}`);
		const slice = items.slice(0, maxPerCategory);

		for (const item of slice) {
			const loc = `${item.path}:${item.line}`;
			lines.push(`│   • ${item.heading} (${loc}) [score: ${item.score.toFixed(2)}]`);
			const snippetOneLine = item.snippet.replace(/\n+/g, " ").slice(0, 90);
			lines.push(`│     "${snippetOneLine}..."`);
		}
	}

	lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
	return lines.join("\n");
}

/**
 * Interactive debounced session for live search-as-you-type.
 */
export class LivePreviewSession {
	private readonly searchIndex: SearchIndex;
	private currentQuery = "";
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private lastSummary: LivePreviewSummary | null = null;

	constructor(searchIndex: SearchIndex) {
		this.searchIndex = searchIndex;
	}

	async update(query: string, delayMs = 50): Promise<LivePreviewSummary> {
		this.currentQuery = query;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		if (delayMs > 0) {
			await new Promise<void>((resolve) => {
				this.debounceTimer = setTimeout(() => resolve(), delayMs);
			});
		}

		const summary = await createLiveSearchPreview(this.searchIndex, this.currentQuery);
		this.lastSummary = summary;
		return summary;
	}

	getLastSummary(): LivePreviewSummary | null {
		return this.lastSummary;
	}

	clear(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		this.currentQuery = "";
		this.lastSummary = null;
	}
}
