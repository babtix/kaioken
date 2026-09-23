import { describe, expect, it } from "vitest";
import type { Chunk, Doc } from "../src/corpus.ts";
import {
	classifyChunkCategory,
	extractMatchedTerms,
	formatLivePreviewCard,
	type LivePreviewSummary,
	PREVIEW_CATEGORIES,
} from "../src/preview.ts";

describe("classifyChunkCategory", () => {
	it("classifies based on tenant kind", () => {
		const wikiDoc: Doc = { path: "overview.md", kind: "wiki", section: "", title: "", hash: "" };
		const cardDoc: Doc = { path: "retrieval.json", kind: "card", section: "", title: "", hash: "" };
		const skillDoc: Doc = { path: "release.md", kind: "skill", section: "", title: "", hash: "" };
		const emptyChunk: Chunk = { doc: 0, heading: "", line: 1, text: "" };

		expect(classifyChunkCategory(wikiDoc, emptyChunk)).toBe("wiki");
		expect(classifyChunkCategory(cardDoc, emptyChunk)).toBe("card");
		expect(classifyChunkCategory(skillDoc, emptyChunk)).toBe("skill");
	});

	it("classifies API endpoint declarations and routes (UX-0701)", () => {
		const doc: Doc = { path: "src/api/routes.ts", kind: "symbol", section: "api", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "export function handlePostUser", line: 10, text: "@post('/users')" };
		expect(classifyChunkCategory(doc, chunk)).toBe("api");
	});

	it("classifies configuration options and environment variables (UX-0702)", () => {
		const doc: Doc = { path: "src/config/options.ts", kind: "symbol", section: "config", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "export const DATABASE_URL", line: 5, text: "process.env.DATABASE_URL" };
		expect(classifyChunkCategory(doc, chunk)).toBe("config");
	});

	it("classifies error codes and exception class definitions (UX-0703)", () => {
		const doc: Doc = { path: "src/errors/not-found.ts", kind: "symbol", section: "errors", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "class NotFoundException extends Error", line: 1, text: "code: 404" };
		expect(classifyChunkCategory(doc, chunk)).toBe("error");
	});

	it("classifies database schema tables and migrations (UX-0704)", () => {
		const doc: Doc = { path: "src/db/schema.ts", kind: "symbol", section: "db", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "create table users", line: 20, text: "id serial primary key" };
		expect(classifyChunkCategory(doc, chunk)).toBe("db");
	});

	it("classifies utility functions and helper algorithms (UX-0705)", () => {
		const doc: Doc = { path: "src/utils/math.ts", kind: "symbol", section: "utils", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "export function clamp", line: 2, text: "Math.max(min, Math.min(max, val))" };
		expect(classifyChunkCategory(doc, chunk)).toBe("util");
	});

	it("classifies test suites and assertion blocks (UX-0706)", () => {
		const doc: Doc = { path: "test/search.test.ts", kind: "symbol", section: "test", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "describe('search')", line: 10, text: "expect(hits.length).toBe(1)" };
		expect(classifyChunkCategory(doc, chunk)).toBe("test");
	});

	it("classifies git commit messages and metadata (UX-0710)", () => {
		const doc: Doc = { path: "commits/log.ts", kind: "symbol", section: "", title: "", hash: "" };
		const chunk: Chunk = { doc: 0, heading: "commit 555e496 feat: safe merges", line: 1, text: "Author: BABTIX" };
		expect(classifyChunkCategory(doc, chunk)).toBe("commit");
	});
});

describe("extractMatchedTerms", () => {
	it("extracts matching query terms from combined heading and snippet", () => {
		const matches = extractMatchedTerms("wiki search index", "handleWikiSearch inside search index");
		expect(matches).toContain("search");
		expect(matches).toContain("index");
	});

	it("ignores single character terms and empty queries", () => {
		expect(extractMatchedTerms("", "sample text")).toEqual([]);
		expect(extractMatchedTerms("a b c", "a b c text")).toEqual([]);
	});
});

describe("formatLivePreviewCard", () => {
	it("formats empty search summary gracefully", () => {
		const emptySummary: LivePreviewSummary = {
			query: "nonexistent",
			totalHits: 0,
			categoryCounts: {
				api: 0, config: 0, error: 0, db: 0, util: 0,
				test: 0, wiki: 0, card: 0, skill: 0, commit: 0, other: 0,
			},
			itemsByCategory: {
				api: [], config: [], error: [], db: [], util: [],
				test: [], wiki: [], card: [], skill: [], commit: [], other: [],
			},
			topItems: [],
			latencyMs: 4,
		};

		const formatted = formatLivePreviewCard(emptySummary);
		expect(formatted).toContain('Live Query Preview: "nonexistent"');
		expect(formatted).toContain("No immediate matches found");
	});

	it("formats rich preview cards with category pills and snippets", () => {
		const summary: LivePreviewSummary = {
			query: "handleWikiSearch",
			totalHits: 1,
			categoryCounts: {
				api: 1, config: 0, error: 0, db: 0, util: 0,
				test: 0, wiki: 0, card: 0, skill: 0, commit: 0, other: 0,
			},
			itemsByCategory: {
				api: [
					{
						category: "api",
						title: "src/wiki.ts",
						path: "src/wiki.ts",
						line: 14,
						heading: "export function handleWikiSearch",
						snippet: "Handles incoming search requests against corpus.",
						score: 8.5,
						matchedTerms: ["handleWikiSearch"],
					},
				],
				config: [], error: [], db: [], util: [],
				test: [], wiki: [], card: [], skill: [], commit: [], other: [],
			},
			topItems: [],
			latencyMs: 12,
		};

		const formatted = formatLivePreviewCard(summary);
		expect(formatted).toContain(PREVIEW_CATEGORIES.api.badge);
		expect(formatted).toContain("handleWikiSearch");
		expect(formatted).toContain("src/wiki.ts:14");
		expect(formatted).toContain("score: 8.50");
	});
});
