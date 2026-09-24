import { describe, expect, it } from "vitest";
import { calculateCardSimilarity, deduplicateCards, detectDuplicateCards, mergeDuplicateCards } from "../src/dedupe.ts";
import type { Card } from "../src/types.ts";

function createMockCard(
	id: string,
	name: string,
	files: string[],
	symbols: string[],
	summary: string,
	keyPoints: string[] = ["Primary architecture component", "Grounded implementation"],
): Card {
	return {
		moduleId: id,
		name,
		generatedAt: new Date().toISOString(),
		summary,
		keyPoints,
		entryPoints: symbols.map((s, idx) => ({
			name: s,
			file: files[0] ?? "src/index.ts",
			note: `Entry point ${s}`,
			line: idx + 1,
			kind: "function",
			exported: true,
		})),
		sources: files.map((f) => ({ path: f, hash: `hash-${f}` })),
		verification: {
			grounded: symbols.length,
			ungrounded: [],
			unknownFiles: [],
			uncovered: [],
			score: 100,
			status: "grounded",
		},
	};
}

describe("dedupe: card similarity and clustering", () => {
	it("returns 1.0 similarity for identical modules", () => {
		const cardA = createMockCard("auth", "Auth", ["src/auth.ts"], ["login", "logout"], "Handles authentication.");
		const sim = calculateCardSimilarity(cardA, cardA);
		expect(sim.combinedScore).toBe(1.0);
		expect(sim.fileOverlap).toBe(1.0);
		expect(sim.symbolOverlap).toBe(1.0);
	});

	it("detects high similarity between duplicate/overlapping cards", () => {
		const cardA = createMockCard(
			"auth-service",
			"Auth Service",
			["src/auth.ts", "src/token.ts"],
			["login", "logout", "verifyToken"],
			"Handles authentication and session token verification.",
		);
		const cardB = createMockCard(
			"authentication",
			"Authentication Module",
			["src/auth.ts", "src/token.ts"],
			["login", "logout", "refreshToken"],
			"Handles authentication workflows and user token security.",
		);

		const sim = calculateCardSimilarity(cardA, cardB);
		expect(sim.fileOverlap).toBe(1.0); // exact same files
		expect(sim.symbolOverlap).toBeGreaterThan(0.4); // 2 out of 4 symbols shared
		expect(sim.combinedScore).toBeGreaterThan(0.65);
	});

	it("returns low similarity for disjoint cards", () => {
		const cardA = createMockCard("auth", "Auth", ["src/auth.ts"], ["login"], "Authentication.");
		const cardB = createMockCard("billing", "Billing", ["src/billing.ts"], ["charge"], "Stripe payments.");

		const sim = calculateCardSimilarity(cardA, cardB);
		expect(sim.fileOverlap).toBe(0.0);
		expect(sim.symbolOverlap).toBe(0.0);
		expect(sim.combinedScore).toBeLessThan(0.3);
	});

	it("groups overlapping cards into duplicate clusters", () => {
		const cardA = createMockCard("storage", "Storage", ["src/store.ts"], ["save", "load"], "Persistence layer.");
		const cardB = createMockCard("store-dup", "Store Duplicate", ["src/store.ts"], ["save", "load"], "Persistence layer for data.");
		const cardC = createMockCard("network", "Network", ["src/net.ts"], ["fetchUrl"], "HTTP client.");

		const clusters = detectDuplicateCards([cardA, cardB, cardC], 0.65);
		expect(clusters.length).toBe(1);
		expect(clusters[0]?.canonicalModuleId).toBe("storage");
		expect(clusters[0]?.duplicateModuleIds).toContain("store-dup");
	});
});

describe("dedupe: merging and deduplication", () => {
	it("merges two overlapping cards, unioning entry points and sources", () => {
		const cardA = createMockCard(
			"cache",
			"Cache Manager",
			["src/cache.ts"],
			["get", "set"],
			"In-memory caching layer.",
			["Fast key-value access"],
		);
		const cardB = createMockCard(
			"caching-util",
			"Caching Utility",
			["src/cache.ts", "src/eviction.ts"],
			["get", "evict"],
			"Provides LRU caching with memory eviction.",
			["LRU eviction policy", "Fast key-value access"],
		);

		const merged = mergeDuplicateCards(cardA, cardB);
		expect(merged.moduleId).toBe("cache");
		// Entry points union: get, set, evict
		const epNames = merged.entryPoints.map((e) => e.name);
		expect(epNames).toContain("get");
		expect(epNames).toContain("set");
		expect(epNames).toContain("evict");

		// Sources union
		const sourcePaths = merged.sources.map((s) => s.path);
		expect(sourcePaths).toContain("src/cache.ts");
		expect(sourcePaths).toContain("src/eviction.ts");

		// Key points union without duplicates
		expect(merged.keyPoints.length).toBe(2);
		expect(merged.keyPoints).toContain("Fast key-value access");
		expect(merged.keyPoints).toContain("LRU eviction policy");
	});

	it("deduplicates an entire card collection and reports merged count", () => {
		const cardA = createMockCard("logger", "Logger", ["src/log.ts"], ["info", "error"], "Structured logging.");
		const cardB = createMockCard("logging-sub", "Logging Sub", ["src/log.ts"], ["info", "warn"], "Structured logging output.");
		const cardC = createMockCard("router", "Router", ["src/router.ts"], ["route"], "HTTP router.");

		const result = deduplicateCards([cardA, cardB, cardC], { threshold: 0.65 });
		expect(result.mergedCount).toBe(1);
		expect(result.cards.length).toBe(2);
		const moduleIds = result.cards.map((c) => c.moduleId);
		expect(moduleIds).toContain("logger");
		expect(moduleIds).toContain("router");
		expect(moduleIds).not.toContain("logging-sub");
	});
});
