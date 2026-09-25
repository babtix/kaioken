import { describe, expect, it } from "vitest";
import {
	ALL_KNOWLEDGE_TOPICS,
	calculateCardCitationDensity,
	createCardBookmarkRegistry,
	createCardTagIndex,
	diffKnowledgeCards,
	evaluateCardVerificationStatus,
	formatCardQuickDiff,
	formatTagIndexSummary,
	getPinnedCards,
	isCardPinned,
	isKnowledgeTopic,
	KNOWLEDGE_TOPIC_METADATA,
	pinCard,
	queryCardTagIndex,
	renderBookmarkSelector,
	renderCardVerificationBadge,
	renderCitationDensityGauge,
	unpinCard,
	type Card,
	type KnowledgeTopic,
} from "../src/index.ts";

function createMockCard(id: string, name: string, topic: KnowledgeTopic, options: {
	grounded?: number;
	ungrounded?: string[];
	unknownFiles?: string[];
	keyPoints?: string[];
	summary?: string;
} = {}): Card & { topic: KnowledgeTopic } {
	const grounded = options.grounded ?? 3;
	const ungrounded = options.ungrounded ?? [];
	const unknownFiles = options.unknownFiles ?? [];
	const total = grounded + ungrounded.length;
	const score = total > 0 ? Math.round((grounded / total) * 100) : 100;

	return {
		moduleId: id,
		name,
		topic,
		generatedAt: "2026-09-25T12:00:00.000Z",
		summary: options.summary ?? `Core architecture for ${name} covering ${topic}.`,
		keyPoints: options.keyPoints ?? [
			`Defines primary execution patterns for ${name}`,
			`Ensures invariants and fault isolation for ${topic}`,
			`Coordinates lifecycle management`,
		],
		entryPoints: [
			{ name: `${id.replace(/-/g, "")}PrimaryHandler`, file: `src/${id}/handler.ts`, line: 12, kind: "function", exported: true, note: "Main handler" },
			{ name: `${id.replace(/-/g, "")}ConfigSchema`, file: `src/${id}/config.ts`, line: 45, kind: "interface", exported: true, note: "Configuration schema" },
			{ name: `${id.replace(/-/g, "")}Manager`, file: `src/${id}/manager.ts`, line: 88, kind: "class", exported: true, note: "Lifecycle manager" },
		],
		sources: [
			{ path: `src/${id}/handler.ts`, hash: "hash-handler-123" },
			{ path: `src/${id}/config.ts`, hash: "hash-config-456" },
			{ path: `src/${id}/manager.ts`, hash: "hash-manager-789" },
		],
		verification: {
			grounded,
			ungrounded,
			unknownFiles,
			uncovered: [],
			score,
			status: ungrounded.length === 0 && unknownFiles.length === 0 ? "grounded" : grounded > 0 ? "partial" : "defects",
		},
	};
}

describe("Step 31: Category 14 — Knowledge Cards & Atomic Fact Base (UX-1351 to UX-1400)", () => {
	it("verifies all 10 knowledge topics are registered with valid metadata", () => {
		expect(ALL_KNOWLEDGE_TOPICS).toHaveLength(10);
		for (const topic of ALL_KNOWLEDGE_TOPICS) {
			expect(isKnowledgeTopic(topic)).toBe(true);
			const meta = KNOWLEDGE_TOPIC_METADATA[topic];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.defaultTags.length).toBeGreaterThan(0);
		}
	});

	// ========================================================================
	// Theme 1: Card citation density gauge measuring evidence ratio (UX-1351 to UX-1360)
	// ========================================================================
	describe("Theme 1: Card citation density gauge measuring evidence ratio (UX-1351 to UX-1360)", () => {
		it("[UX-1351] measures citation density for subsystem overview cards", () => {
			const card = createMockCard("subsystem-core", "Core Subsystem", "subsystem-overview", { grounded: 4, ungrounded: [] });
			const density = calculateCardCitationDensity(card, "subsystem-overview");
			expect(density.evidenceRatio).toBe(1);
			expect(density.densityLevel).toBe("exemplary");
			expect(density.gaugeBar).toContain("100%");
			expect(renderCitationDensityGauge(card, { unicode: true })).toContain("100%");
		});

		it("[UX-1352] measures citation density for data pipeline architecture cards", () => {
			const card = createMockCard("pipeline-stream", "Stream Ingestion Pipeline", "data-pipeline", { grounded: 3, ungrounded: ["MissingBuffer"] });
			const density = calculateCardCitationDensity(card, "data-pipeline");
			expect(density.evidenceRatio).toBe(0.75);
			expect(density.densityLevel).toBe("dense");
			expect(density.gaugeBar).toContain("75%");
		});

		it("[UX-1353] measures citation density for cryptographic security model cards", () => {
			const card = createMockCard("crypto-auth", "Auth & Token Verifier", "crypto-security", { grounded: 5, ungrounded: [] });
			const density = calculateCardCitationDensity(card, "crypto-security");
			expect(density.evidenceRatio).toBe(1);
			expect(density.densityLevel).toBe("exemplary");
		});

		it("[UX-1354] measures citation density for API error handling contract cards", () => {
			const card = createMockCard("api-error", "API Fault Contract", "api-error-contract", { grounded: 2, ungrounded: ["FaultDecoder"] });
			const density = calculateCardCitationDensity(card, "api-error-contract");
			expect(density.evidenceRatio).toBeCloseTo(0.67, 1);
			expect(density.densityLevel).toBe("moderate");
		});

		it("[UX-1355] measures citation density for database schema relationship cards", () => {
			const card = createMockCard("db-schema", "ORM Relations", "db-schema-rel", { grounded: 6, ungrounded: [] });
			const density = calculateCardCitationDensity(card, "db-schema-rel");
			expect(density.evidenceRatio).toBe(1);
			expect(density.densityLevel).toBe("exemplary");
		});

		it("[UX-1356] measures citation density for concurrency and locking strategy cards", () => {
			const card = createMockCard("concurrency-lock", "Distributed Mutex", "concurrency-locking", { grounded: 1, ungrounded: ["MutexLease", "LockRenewal"] });
			const density = calculateCardCitationDensity(card, "concurrency-locking");
			expect(density.evidenceRatio).toBeCloseTo(0.33, 1);
			expect(density.densityLevel).toBe("sparse");
		});

		it("[UX-1357] measures citation density for caching and performance optimization cards", () => {
			const card = createMockCard("caching-lru", "Tiered Cache Policy", "caching-perf", { grounded: 4, ungrounded: [] });
			const density = calculateCardCitationDensity(card, "caching-perf");
			expect(density.evidenceRatio).toBe(1);
			expect(density.densityLevel).toBe("exemplary");
		});

		it("[UX-1358] measures citation density for event-driven messaging topology cards", () => {
			const card = createMockCard("event-bus", "Event Bus Dispatcher", "event-messaging", { grounded: 3, ungrounded: ["TopicRouter"] });
			const density = calculateCardCitationDensity(card, "event-messaging");
			expect(density.evidenceRatio).toBe(0.75);
			expect(density.densityLevel).toBe("dense");
		});

		it("[UX-1359] measures citation density for third-party service dependency cards", () => {
			const card = createMockCard("third-party-sdk", "Vendor Payment Client", "third-party-dep", { grounded: 2, ungrounded: ["StripeClient", "PaypalSDK"] });
			const density = calculateCardCitationDensity(card, "third-party-dep");
			expect(density.evidenceRatio).toBe(0.5);
			expect(density.densityLevel).toBe("moderate");
		});

		it("[UX-1360] measures citation density for developer local setup and debug cards", () => {
			const card = createMockCard("local-debug", "Local Dev Environment", "local-setup-debug", { grounded: 4, ungrounded: [] });
			const density = calculateCardCitationDensity(card, "local-setup-debug");
			expect(density.evidenceRatio).toBe(1);
			expect(density.densityLevel).toBe("exemplary");
		});
	});

	// ========================================================================
	// Theme 2: Searchable tag and category index organizing knowledge cards (UX-1361 to UX-1370)
	// ========================================================================
	describe("Theme 2: Searchable tag and category index organizing knowledge cards (UX-1361 to UX-1370)", () => {
		const cards = ALL_KNOWLEDGE_TOPICS.map((topic, i) =>
			createMockCard(`mod-${topic}`, `Module for ${topic}`, topic, {
				grounded: 3 + (i % 3),
				ungrounded: i % 4 === 0 ? [] : [`Ghost${i}`],
			}),
		);
		const index = createCardTagIndex(cards);

		it("[UX-1361] indexes and queries subsystem overview cards", () => {
			const result = queryCardTagIndex(index, { topic: "subsystem-overview" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.topic).toBe("subsystem-overview");
		});

		it("[UX-1362] indexes and queries data pipeline architecture cards", () => {
			const result = queryCardTagIndex(index, { topic: "data-pipeline" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.tags).toContain("data-pipeline");
		});

		it("[UX-1363] indexes and queries cryptographic security model cards", () => {
			const result = queryCardTagIndex(index, { topic: "crypto-security" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.category).toBe("security");
		});

		it("[UX-1364] indexes and queries API error handling contract cards", () => {
			const result = queryCardTagIndex(index, { topic: "api-error-contract" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.category).toBe("api");
		});

		it("[UX-1365] indexes and queries database schema relationship cards", () => {
			const result = queryCardTagIndex(index, { topic: "db-schema-rel" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.tags).toContain("database");
		});

		it("[UX-1366] indexes and queries concurrency and locking strategy cards", () => {
			const result = queryCardTagIndex(index, { topic: "concurrency-locking" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.category).toBe("concurrency");
		});

		it("[UX-1367] indexes and queries caching and performance optimization cards", () => {
			const result = queryCardTagIndex(index, { topic: "caching-perf" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.tags).toContain("caching");
		});

		it("[UX-1368] indexes and queries event-driven messaging topology cards", () => {
			const result = queryCardTagIndex(index, { topic: "event-messaging" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.category).toBe("messaging");
		});

		it("[UX-1369] indexes and queries third-party service dependency cards", () => {
			const result = queryCardTagIndex(index, { topic: "third-party-dep" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.tags).toContain("third-party");
		});

		it("[UX-1370] indexes and queries developer local setup and debug cards", () => {
			const result = queryCardTagIndex(index, { topic: "local-setup-debug" });
			expect(result.totalMatched).toBeGreaterThanOrEqual(1);
			expect(result.items[0]?.category).toBe("developer");
			expect(formatTagIndexSummary(index)).toContain("Knowledge Card Index");
		});
	});

	// ========================================================================
	// Theme 3: Visual card verification status badge (Grounded / Defects) (UX-1371 to UX-1380)
	// ========================================================================
	describe("Theme 3: Visual card verification status badge (Grounded / Defects) (UX-1371 to UX-1380)", () => {
		it("[UX-1371] formats verification badge for subsystem overview cards", () => {
			const card = createMockCard("sub-clean", "Clean Subsystem", "subsystem-overview", { grounded: 5, ungrounded: [] });
			const status = evaluateCardVerificationStatus(card, "subsystem-overview");
			expect(status.status).toBe("grounded");
			expect(renderCardVerificationBadge(status)).toContain("GROUNDED 100%");
		});

		it("[UX-1372] formats verification badge for data pipeline architecture cards", () => {
			const card = createMockCard("pipe-defect", "Defective Pipeline", "data-pipeline", { grounded: 1, ungrounded: ["FakeIngestor"], unknownFiles: ["src/missing.ts"] });
			const status = evaluateCardVerificationStatus(card, "data-pipeline");
			expect(status.status).toBe("partial");
			expect(renderCardVerificationBadge(status)).toContain("PARTIAL");
		});

		it("[UX-1373] formats verification badge for cryptographic security model cards", () => {
			const card = createMockCard("crypto-fail", "Unverified Security", "crypto-security", { grounded: 0, ungrounded: ["GhostKey", "FakeSign"] });
			const status = evaluateCardVerificationStatus(card, "crypto-security");
			expect(status.status).toBe("defects");
			expect(renderCardVerificationBadge(status)).toContain("DEFECTS: 2 ungrounded");
		});

		it("[UX-1374] formats verification badge for API error handling contract cards", () => {
			const card = createMockCard("api-contract", "API Error Rules", "api-error-contract", { grounded: 4, ungrounded: [] });
			const status = evaluateCardVerificationStatus(card, "api-error-contract");
			expect(status.status).toBe("grounded");
			expect(renderCardVerificationBadge(status, { showTopic: true })).toContain("API-ERROR-CONTRACT");
		});

		it("[UX-1375] formats verification badge for database schema relationship cards", () => {
			const card = createMockCard("db-rel", "Foreign Key Map", "db-schema-rel", { grounded: 3, ungrounded: ["BadCol"] });
			const status = evaluateCardVerificationStatus(card, "db-schema-rel");
			expect(status.status).toBe("partial");
			expect(renderCardVerificationBadge(status)).toContain("PARTIAL 75%");
		});

		it("[UX-1376] formats verification badge for concurrency and locking strategy cards", () => {
			const card = createMockCard("lock-safe", "Mutex Lock Engine", "concurrency-locking", { grounded: 4, ungrounded: [] });
			const status = evaluateCardVerificationStatus(card, "concurrency-locking");
			expect(status.status).toBe("grounded");
		});

		it("[UX-1377] formats verification badge for caching and performance optimization cards", () => {
			const card = createMockCard("cache-tier", "Memory Cache Tier", "caching-perf", { grounded: 0, ungrounded: ["BadCache"] });
			const status = evaluateCardVerificationStatus(card, "caching-perf");
			expect(status.status).toBe("defects");
		});

		it("[UX-1378] formats verification badge for event-driven messaging topology cards", () => {
			const card = createMockCard("msg-queue", "Topic Queue Bus", "event-messaging", { grounded: 6, ungrounded: [] });
			const status = evaluateCardVerificationStatus(card, "event-messaging");
			expect(status.status).toBe("grounded");
		});

		it("[UX-1379] formats verification badge for third-party service dependency cards", () => {
			const card = createMockCard("ext-client", "External Gateway", "third-party-dep", { grounded: 2, ungrounded: ["OldSDK"] });
			const status = evaluateCardVerificationStatus(card, "third-party-dep");
			expect(status.status).toBe("partial");
		});

		it("[UX-1380] formats verification badge for developer local setup and debug cards", () => {
			const card = createMockCard("dev-flow", "Local Run Loop", "local-setup-debug", { grounded: 4, ungrounded: [] });
			const status = evaluateCardVerificationStatus(card, "local-setup-debug");
			expect(status.status).toBe("grounded");
			expect(renderCardVerificationBadge(status, { unicode: false })).toContain("GROUNDED");
		});
	});

	// ========================================================================
	// Theme 4: Quick-diff comparison view showing evolutionary changes (UX-1381 to UX-1390)
	// ========================================================================
	describe("Theme 4: Quick-diff comparison view showing evolutionary changes (UX-1381 to UX-1390)", () => {
		it("[UX-1381] renders quick-diff for subsystem overview cards", () => {
			const base = createMockCard("sub-diff", "Subsystem Base", "subsystem-overview", { summary: "V1 summary", grounded: 2, ungrounded: ["Ghost"] });
			const revised = createMockCard("sub-diff", "Subsystem Revised", "subsystem-overview", { summary: "V2 improved summary", grounded: 4, ungrounded: [] });
			revised.keyPoints.push("Newly discovered public contract");
			const diff = diffKnowledgeCards(base, revised, "subsystem-overview");
			expect(diff.hasChanges).toBe(true);
			expect(diff.summaryChange.changed).toBe(true);
			expect(diff.scoreDelta).toBeGreaterThan(0);
			const formatted = formatCardQuickDiff(diff);
			expect(formatted).toContain("Summary Evolution");
			expect(formatted).toContain("Key Points Delta");
		});

		it("[UX-1382] renders quick-diff for data pipeline architecture cards", () => {
			const base = createMockCard("pipeline-diff", "Pipeline Base", "data-pipeline");
			const revised = { ...base, entryPoints: [...base.entryPoints, { name: "SinkBatchWriter", file: "src/sink.ts", note: "New sink", line: 40 }] };
			const diff = diffKnowledgeCards(base, revised, "data-pipeline");
			expect(diff.addedEntryPoints).toHaveLength(1);
			expect(formatCardQuickDiff(diff)).toContain("SinkBatchWriter in src/sink.ts:40");
		});

		it("[UX-1383] renders quick-diff for cryptographic security model cards", () => {
			const base = createMockCard("crypto-diff", "Crypto Base", "crypto-security");
			const revised = { ...base, sources: [...base.sources, { path: "src/security/kms.ts", hash: "kms-1" }] };
			const diff = diffKnowledgeCards(base, revised, "crypto-security");
			expect(diff.addedSources).toContain("src/security/kms.ts");
		});

		it("[UX-1384] renders quick-diff for API error handling contract cards", () => {
			const base = createMockCard("api-diff", "API Base", "api-error-contract", { grounded: 2, ungrounded: ["OldError"] });
			const revised = createMockCard("api-diff", "API Revised", "api-error-contract", { grounded: 4, ungrounded: [] });
			const diff = diffKnowledgeCards(base, revised, "api-error-contract");
			expect(diff.scoreDelta).toBeGreaterThan(0);
		});

		it("[UX-1385] renders quick-diff for database schema relationship cards", () => {
			const base = createMockCard("db-diff", "Schema Base", "db-schema-rel");
			const revised = { ...base, keyPoints: ["Updated migration flow"] };
			const diff = diffKnowledgeCards(base, revised, "db-schema-rel");
			expect(diff.removedKeyPoints.length).toBeGreaterThan(0);
			expect(diff.addedKeyPoints).toContain("Updated migration flow");
		});

		it("[UX-1386] renders quick-diff for concurrency and locking strategy cards", () => {
			const base = createMockCard("concurrency-diff", "Lock Base", "concurrency-locking");
			const diff = diffKnowledgeCards(base, base, "concurrency-locking");
			expect(diff.hasChanges).toBe(false);
			expect(formatCardQuickDiff(diff)).toContain("No evolutionary changes");
		});

		it("[UX-1387] renders quick-diff for caching and performance optimization cards", () => {
			const base = createMockCard("cache-diff", "Cache Base", "caching-perf");
			const revised = { ...base, summary: "Tiered multi-region cache" };
			const diff = diffKnowledgeCards(base, revised, "caching-perf");
			expect(diff.summaryChange.changed).toBe(true);
		});

		it("[UX-1388] renders quick-diff for event-driven messaging topology cards", () => {
			const base = createMockCard("event-diff", "Event Base", "event-messaging");
			const revised = { ...base, sources: base.sources.slice(0, 1) };
			const diff = diffKnowledgeCards(base, revised, "event-messaging");
			expect(diff.removedSources.length).toBeGreaterThan(0);
		});

		it("[UX-1389] renders quick-diff for third-party service dependency cards", () => {
			const base = createMockCard("third-diff", "Third Base", "third-party-dep");
			const revised = { ...base, entryPoints: [] };
			const diff = diffKnowledgeCards(base, revised, "third-party-dep");
			expect(diff.removedEntryPoints.length).toBeGreaterThan(0);
		});

		it("[UX-1390] renders quick-diff for developer local setup and debug cards", () => {
			const base = createMockCard("dev-diff", "Dev Base", "local-setup-debug");
			const revised = { ...base, keyPoints: [...base.keyPoints, "Run with --inspect=9229"] };
			const diff = diffKnowledgeCards(base, revised, "local-setup-debug");
			expect(diff.addedKeyPoints).toContain("Run with --inspect=9229");
		});
	});

	// ========================================================================
	// Theme 5: Card bookmarking and favorite selector pinning key reference cards (UX-1391 to UX-1400)
	// ========================================================================
	describe("Theme 5: Card bookmarking and favorite selector pinning key reference cards (UX-1391 to UX-1400)", () => {
		const cards = ALL_KNOWLEDGE_TOPICS.map((topic) =>
			createMockCard(`card-${topic}`, `Card for ${topic}`, topic),
		);
		let registry = createCardBookmarkRegistry();

		it("[UX-1391] bookmarks and pins subsystem overview cards", () => {
			registry = pinCard(registry, "card-subsystem-overview", { topic: "subsystem-overview", priority: 1, note: "Key entry card" });
			expect(isCardPinned(registry, "card-subsystem-overview")).toBe(true);
		});

		it("[UX-1392] bookmarks and pins data pipeline architecture cards", () => {
			registry = pinCard(registry, "card-data-pipeline", { topic: "data-pipeline", priority: 2, note: "Pipeline flow" });
			expect(isCardPinned(registry, "card-data-pipeline")).toBe(true);
		});

		it("[UX-1393] bookmarks and pins cryptographic security model cards", () => {
			registry = pinCard(registry, "card-crypto-security", { topic: "crypto-security", priority: 1, note: "Security critical" });
			expect(isCardPinned(registry, "card-crypto-security")).toBe(true);
		});

		it("[UX-1394] bookmarks and pins API error handling contract cards", () => {
			registry = pinCard(registry, "card-api-error-contract", { topic: "api-error-contract", priority: 3 });
			expect(isCardPinned(registry, "card-api-error-contract")).toBe(true);
		});

		it("[UX-1395] bookmarks and pins database schema relationship cards", () => {
			registry = pinCard(registry, "card-db-schema-rel", { topic: "db-schema-rel", priority: 2 });
			expect(isCardPinned(registry, "card-db-schema-rel")).toBe(true);
		});

		it("[UX-1396] bookmarks and pins concurrency and locking strategy cards", () => {
			registry = pinCard(registry, "card-concurrency-locking", { topic: "concurrency-locking", priority: 1 });
			expect(isCardPinned(registry, "card-concurrency-locking")).toBe(true);
		});

		it("[UX-1397] bookmarks and pins caching and performance optimization cards", () => {
			registry = pinCard(registry, "card-caching-perf", { topic: "caching-perf", priority: 4 });
			expect(isCardPinned(registry, "card-caching-perf")).toBe(true);
		});

		it("[UX-1398] bookmarks and pins event-driven messaging topology cards", () => {
			registry = pinCard(registry, "card-event-messaging", { topic: "event-messaging", priority: 3 });
			expect(isCardPinned(registry, "card-event-messaging")).toBe(true);
		});

		it("[UX-1399] bookmarks and pins third-party service dependency cards", () => {
			registry = pinCard(registry, "card-third-party-dep", { topic: "third-party-dep", priority: 5 });
			expect(isCardPinned(registry, "card-third-party-dep")).toBe(true);
		});

		it("[UX-1400] bookmarks and pins developer local setup and debug cards, and renders selector", () => {
			registry = pinCard(registry, "card-local-setup-debug", { topic: "local-setup-debug", priority: 1, note: "Onboarding must-read" });
			expect(isCardPinned(registry, "card-local-setup-debug")).toBe(true);

			const pinned = getPinnedCards(registry, cards);
			expect(pinned).toHaveLength(10);
			// Sorted by priority: P1 cards come first
			expect(pinned[0]?.bookmark.priority).toBe(1);

			const rendered = renderBookmarkSelector(registry, cards, { selectedId: "card-local-setup-debug" });
			expect(rendered).toContain("Pinned Knowledge Cards");
			expect(rendered).toContain("card-local-setup-debug");

			// Unpin test
			const unpinned = unpinCard(registry, "card-local-setup-debug");
			expect(isCardPinned(unpinned, "card-local-setup-debug")).toBe(false);
		});
	});
});
