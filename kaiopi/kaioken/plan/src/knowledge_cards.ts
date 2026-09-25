import type { ProvenanceSource } from "@kaioken/provenance";
import type { Card, CardEntryPoint, CardVerification } from "./types.ts";

/**
 * Knowledge card topic domains (Category 14: Step 31, UX-1351 to UX-1400).
 */
export type KnowledgeTopic =
	| "subsystem-overview"
	| "data-pipeline"
	| "crypto-security"
	| "api-error-contract"
	| "db-schema-rel"
	| "concurrency-locking"
	| "caching-perf"
	| "event-messaging"
	| "third-party-dep"
	| "local-setup-debug";

export const ALL_KNOWLEDGE_TOPICS: readonly KnowledgeTopic[] = [
	"subsystem-overview",
	"data-pipeline",
	"crypto-security",
	"api-error-contract",
	"db-schema-rel",
	"concurrency-locking",
	"caching-perf",
	"event-messaging",
	"third-party-dep",
	"local-setup-debug",
] as const;

export function isKnowledgeTopic(val: unknown): val is KnowledgeTopic {
	return typeof val === "string" && (ALL_KNOWLEDGE_TOPICS as readonly string[]).includes(val);
}

export interface KnowledgeTopicMeta {
	topic: KnowledgeTopic;
	title: string;
	defaultCategory: string;
	defaultTags: string[];
	description: string;
}

export const KNOWLEDGE_TOPIC_METADATA: Record<KnowledgeTopic, KnowledgeTopicMeta> = {
	"subsystem-overview": {
		topic: "subsystem-overview",
		title: "Subsystem Overview",
		defaultCategory: "architecture",
		defaultTags: ["overview", "subsystem", "module-boundary", "architecture"],
		description: "High-level module purpose, ownership boundaries, and core exported capabilities.",
	},
	"data-pipeline": {
		topic: "data-pipeline",
		title: "Data Pipeline Architecture",
		defaultCategory: "pipeline",
		defaultTags: ["data-pipeline", "etl", "transform", "streaming", "batch"],
		description: "Data ingestion, transformation, pipeline stage flows, and throughput mechanics.",
	},
	"crypto-security": {
		topic: "crypto-security",
		title: "Cryptographic Security Model",
		defaultCategory: "security",
		defaultTags: ["crypto", "security", "auth", "tokens", "encryption", "hashing"],
		description: "Cryptographic handshakes, signature verification, token validation, and secret protection.",
	},
	"api-error-contract": {
		topic: "api-error-contract",
		title: "API Error Handling Contract",
		defaultCategory: "api",
		defaultTags: ["api", "error-handling", "contract", "http-status", "fault-tolerance"],
		description: "Deterministic error codes, payload contracts, validation schemas, and failure recovery.",
	},
	"db-schema-rel": {
		topic: "db-schema-rel",
		title: "Database Schema Relationships",
		defaultCategory: "database",
		defaultTags: ["database", "schema", "orm", "relations", "migrations", "foreign-keys"],
		description: "Table relationships, entity mappings, index layouts, and migration integrity.",
	},
	"concurrency-locking": {
		topic: "concurrency-locking",
		title: "Concurrency & Locking Strategy",
		defaultCategory: "concurrency",
		defaultTags: ["concurrency", "locking", "mutex", "threading", "race-conditions", "async"],
		description: "Race-condition prevention, distributed mutexes, lease renewals, and async safety.",
	},
	"caching-perf": {
		topic: "caching-perf",
		title: "Caching & Performance Optimization",
		defaultCategory: "performance",
		defaultTags: ["caching", "performance", "lru", "latency", "memory", "invalidation"],
		description: "Cache tiering, TTL invalidation policies, memoization, and latency optimizations.",
	},
	"event-messaging": {
		topic: "event-messaging",
		title: "Event-Driven Messaging Topology",
		defaultCategory: "messaging",
		defaultTags: ["event-driven", "messaging", "pubsub", "bus", "topics", "queues"],
		description: "Pub/Sub topologies, topic partitioning, dead-letter queues, and event dispatchers.",
	},
	"third-party-dep": {
		topic: "third-party-dep",
		title: "Third-Party Service Dependencies",
		defaultCategory: "integration",
		defaultTags: ["third-party", "integration", "sdk", "external-api", "rate-limits"],
		description: "External vendor dependencies, fallback circuit breakers, and client wrappers.",
	},
	"local-setup-debug": {
		topic: "local-setup-debug",
		title: "Developer Local Setup & Debug",
		defaultCategory: "developer",
		defaultTags: ["dev-setup", "debug", "local-env", "tooling", "quickstart"],
		description: "Developer onboarding prerequisites, debugging flags, mock fixtures, and local run loops.",
	},
};

/**
 * Infer knowledge topic from card metadata or module id.
 */
export function inferKnowledgeTopic(
	card: Card & { topic?: KnowledgeTopic },
	explicitTopic?: KnowledgeTopic,
): KnowledgeTopic {
	if (explicitTopic && isKnowledgeTopic(explicitTopic)) return explicitTopic;
	if (card.topic && isKnowledgeTopic(card.topic)) return card.topic;

	for (const t of ALL_KNOWLEDGE_TOPICS) {
		if (card.moduleId.includes(t) || card.name.toLowerCase().includes(t)) {
			return t;
		}
	}

	const text = `${card.moduleId} ${card.name} ${card.summary} ${card.keyPoints.join(" ")}`.toLowerCase();

	if (text.includes("crypto") || text.includes("security") || text.includes("secret") || text.includes("token")) {
		return "crypto-security";
	}
	if (text.includes("pipeline") || text.includes("etl") || text.includes("ingest") || text.includes("stream")) {
		return "data-pipeline";
	}
	if (text.includes("schema") || text.includes("database") || text.includes("orm") || text.includes("table")) {
		return "db-schema-rel";
	}
	if (text.includes("lock") || text.includes("mutex") || text.includes("concurrency") || text.includes("race")) {
		return "concurrency-locking";
	}
	if (text.includes("caching") || text.includes("cache") || text.includes("lru") || text.includes("perf")) {
		return "caching-perf";
	}
	if (text.includes("messaging") || text.includes("pubsub") || text.includes("queue") || text.includes("event")) {
		return "event-messaging";
	}
	if (text.includes("third-party") || text.includes("vendor") || text.includes("external")) {
		return "third-party-dep";
	}
	if (text.includes("debug") || text.includes("setup") || text.includes("local") || text.includes("onboard")) {
		return "local-setup-debug";
	}
	if (text.includes("error") || text.includes("contract") || text.includes("fault") || text.includes("exception")) {
		return "api-error-contract";
	}

	return "subsystem-overview";
}

// ============================================================================
// THEME 1: Card Citation Density Gauge Measuring Evidence Ratio (UX-1351 to UX-1360)
// ============================================================================

export type CitationDensityLevel = "sparse" | "moderate" | "dense" | "exemplary";

export interface CardCitationDensityResult {
	cardId: string;
	topic: KnowledgeTopic;
	groundedCitations: number;
	totalCitations: number;
	evidenceRatio: number;
	percentage: number;
	densityLevel: CitationDensityLevel;
	gaugeBar: string;
	summary: string;
}

export interface CitationGaugeOptions {
	width?: number;
	unicode?: boolean;
	showPill?: boolean;
	topic?: KnowledgeTopic;
}

/**
 * Calculate citation density and evidence ratio for a knowledge card.
 */
export function calculateCardCitationDensity(
	card: Card,
	topic?: KnowledgeTopic,
): CardCitationDensityResult {
	const resolvedTopic = inferKnowledgeTopic(card, topic);
	const grounded = card.verification?.grounded ?? 0;
	const ungrounded = card.verification?.ungrounded.length ?? 0;
	const declaredTotal = grounded + ungrounded;
	const totalCitations = declaredTotal > 0 ? declaredTotal : Math.max(1, card.entryPoints.length);
	const evidenceRatio = Math.min(1, Math.max(0, grounded / totalCitations));
	const percentage = Math.round(evidenceRatio * 100);

	let densityLevel: CitationDensityLevel = "sparse";
	if (evidenceRatio >= 0.9) densityLevel = "exemplary";
	else if (evidenceRatio >= 0.7) densityLevel = "dense";
	else if (evidenceRatio >= 0.4) densityLevel = "moderate";

	const gaugeBar = renderCitationDensityGauge(card, { topic: resolvedTopic });

	return {
		cardId: card.moduleId,
		topic: resolvedTopic,
		groundedCitations: grounded,
		totalCitations,
		evidenceRatio,
		percentage,
		densityLevel,
		gaugeBar,
		summary: `${percentage}% evidence ratio (${grounded}/${totalCitations} citations grounded) [${densityLevel.toUpperCase()}]`,
	};
}

/**
 * Render visual citation density gauge measuring evidence ratio.
 */
export function renderCitationDensityGauge(
	card: Card,
	options: CitationGaugeOptions = {},
): string {
	const width = options.width ?? 12;
	const useUnicode = options.unicode ?? true;
	const showPill = options.showPill ?? true;
	const grounded = card.verification?.grounded ?? 0;
	const ungrounded = card.verification?.ungrounded.length ?? 0;
	const declaredTotal = grounded + ungrounded;
	const total = declaredTotal > 0 ? declaredTotal : Math.max(1, card.entryPoints.length);
	const ratio = Math.min(1, Math.max(0, grounded / total));

	const filled = Math.round(ratio * width);
	const empty = Math.max(0, width - filled);

	const fillChar = useUnicode ? "█" : "#";
	const emptyChar = useUnicode ? "░" : "-";
	const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
	const pct = Math.round(ratio * 100);

	let pill = "";
	if (showPill) {
		let level = "SPARSE";
		if (ratio >= 0.9) level = "EXEMPLARY";
		else if (ratio >= 0.7) level = "DENSE";
		else if (ratio >= 0.4) level = "MODERATE";
		pill = ` [${level}]`;
	}

	return `[${bar}] ${pct}% (${grounded}/${total} verified)${pill}`;
}

// ============================================================================
// THEME 2: Searchable Tag and Category Index Organizing Knowledge Cards (UX-1361 to UX-1370)
// ============================================================================

export interface CardTagIndexItem {
	card: Card;
	topic: KnowledgeTopic;
	category: string;
	tags: string[];
}

export interface CardTagIndex {
	cardsById: Map<string, CardTagIndexItem>;
	byTag: Map<string, string[]>;
	byCategory: Map<string, string[]>;
	byTopic: Map<KnowledgeTopic, string[]>;
	allTags: string[];
	allCategories: string[];
}

export interface CardTagQuery {
	topic?: KnowledgeTopic;
	category?: string;
	tags?: string[];
	matchAllTags?: boolean;
	text?: string;
	minEvidenceRatio?: number;
}

export interface CardQueryResult {
	items: CardTagIndexItem[];
	totalMatched: number;
	query: CardTagQuery;
}

/**
 * Build searchable tag and category index across knowledge cards.
 */
export function createCardTagIndex(
	cards: readonly Card[],
	overrides?: Map<string, { topic?: KnowledgeTopic; category?: string; tags?: string[] }>,
): CardTagIndex {
	const cardsById = new Map<string, CardTagIndexItem>();
	const byTag = new Map<string, string[]>();
	const byCategory = new Map<string, string[]>();
	const byTopic = new Map<KnowledgeTopic, string[]>();

	for (const card of cards) {
		const override = overrides?.get(card.moduleId);
		const topic = inferKnowledgeTopic(card, override?.topic);
		const meta = KNOWLEDGE_TOPIC_METADATA[topic];
		const category = override?.category ?? meta.defaultCategory;
		const customTags = override?.tags ?? [];
		const mergedTags = [...new Set([...meta.defaultTags, ...customTags, card.moduleId])];

		const item: CardTagIndexItem = {
			card,
			topic,
			category,
			tags: mergedTags,
		};
		cardsById.set(card.moduleId, item);

		// Category index
		const catList = byCategory.get(category) ?? [];
		catList.push(card.moduleId);
		byCategory.set(category, catList);

		// Topic index
		const topicList = byTopic.get(topic) ?? [];
		topicList.push(card.moduleId);
		byTopic.set(topic, topicList);

		// Tag index
		for (const tag of mergedTags) {
			const tagList = byTag.get(tag) ?? [];
			tagList.push(card.moduleId);
			byTag.set(tag, tagList);
		}
	}

	return {
		cardsById,
		byTag,
		byCategory,
		byTopic,
		allTags: [...byTag.keys()].sort(),
		allCategories: [...byCategory.keys()].sort(),
	};
}

/**
 * Query searchable card tag and category index.
 */
export function queryCardTagIndex(
	index: CardTagIndex,
	query: CardTagQuery,
): CardQueryResult {
	let candidates = [...index.cardsById.values()];

	if (query.topic) {
		candidates = candidates.filter((item) => item.topic === query.topic);
	}

	if (query.category) {
		candidates = candidates.filter(
			(item) => item.category.toLowerCase() === query.category?.toLowerCase(),
		);
	}

	if (query.tags && query.tags.length > 0) {
		const targetTags = query.tags.map((t) => t.toLowerCase());
		if (query.matchAllTags) {
			candidates = candidates.filter((item) =>
				targetTags.every((tt) => item.tags.some((tag) => tag.toLowerCase() === tt)),
			);
		} else {
			candidates = candidates.filter((item) =>
				targetTags.some((tt) => item.tags.some((tag) => tag.toLowerCase() === tt)),
			);
		}
	}

	if (query.text) {
		const q = query.text.toLowerCase();
		candidates = candidates.filter((item) => {
			const c = item.card;
			return (
				c.name.toLowerCase().includes(q) ||
				c.summary.toLowerCase().includes(q) ||
				c.moduleId.toLowerCase().includes(q) ||
				c.keyPoints.some((kp) => kp.toLowerCase().includes(q)) ||
				item.tags.some((t) => t.toLowerCase().includes(q))
			);
		});
	}

	if (query.minEvidenceRatio !== undefined) {
		candidates = candidates.filter((item) => {
			const density = calculateCardCitationDensity(item.card, item.topic);
			return density.evidenceRatio >= (query.minEvidenceRatio ?? 0);
		});
	}

	return {
		items: candidates,
		totalMatched: candidates.length,
		query,
	};
}

/**
 * Format tag and category index summary for display.
 */
export function formatTagIndexSummary(index: CardTagIndex): string {
	const lines: string[] = [
		`Knowledge Card Index: ${index.cardsById.size} card(s) indexed`,
		`Categories (${index.allCategories.length}): ${index.allCategories.join(", ")}`,
		`Tags (${index.allTags.length}): ${index.allTags.slice(0, 15).join(", ")}${index.allTags.length > 15 ? ` ... +${index.allTags.length - 15} more` : ""}`,
		"─".repeat(70),
	];

	for (const topic of ALL_KNOWLEDGE_TOPICS) {
		const topicCards = index.byTopic.get(topic) ?? [];
		if (topicCards.length > 0) {
			const meta = KNOWLEDGE_TOPIC_METADATA[topic];
			lines.push(`• [${meta.title}] (${topicCards.length} cards): ${topicCards.join(", ")}`);
		}
	}

	return lines.join("\n");
}

// ============================================================================
// THEME 3: Visual Card Verification Status Badge (Grounded / Defects) (UX-1371 to UX-1380)
// ============================================================================

export type VerificationBadgeStatus = "grounded" | "defects" | "partial";

export interface CardVerificationStatusResult {
	cardId: string;
	topic: KnowledgeTopic;
	status: VerificationBadgeStatus;
	grounded: number;
	ungrounded: string[];
	unknownFiles: string[];
	score: number;
	badge: string;
	defectDetails: string[];
}

export interface VerificationBadgeOptions {
	unicode?: boolean;
	showScore?: boolean;
	showTopic?: boolean;
}

/**
 * Evaluate card verification status and detect defects.
 */
export function evaluateCardVerificationStatus(
	card: Card,
	topic?: KnowledgeTopic,
): CardVerificationStatusResult {
	const resolvedTopic = inferKnowledgeTopic(card, topic);
	const ver = card.verification;
	const grounded = ver?.grounded ?? 0;
	const ungrounded = ver?.ungrounded ?? [];
	const unknownFiles = ver?.unknownFiles ?? [];

	const total = grounded + ungrounded.length;
	const score = ver?.score ?? (total > 0 ? Math.round((grounded / total) * 100) : 100);

	let status: VerificationBadgeStatus = "defects";
	if (ungrounded.length === 0 && unknownFiles.length === 0) {
		status = "grounded";
	} else if (grounded > 0) {
		status = "partial";
	}

	const defectDetails: string[] = [];
	if (ungrounded.length > 0) {
		defectDetails.push(`Ungrounded symbols (${ungrounded.length}): ${ungrounded.join(", ")}`);
	}
	if (unknownFiles.length > 0) {
		defectDetails.push(`Unknown files (${unknownFiles.length}): ${unknownFiles.join(", ")}`);
	}

	const result: CardVerificationStatusResult = {
		cardId: card.moduleId,
		topic: resolvedTopic,
		status,
		grounded,
		ungrounded,
		unknownFiles,
		score,
		badge: "",
		defectDetails,
	};

	result.badge = renderCardVerificationBadge(result);
	return result;
}

/**
 * Render visual card verification status badge (Grounded / Defects).
 */
export function renderCardVerificationBadge(
	statusResult: CardVerificationStatusResult,
	options: VerificationBadgeOptions = {},
): string {
	const useUnicode = options.unicode ?? true;
	const showScore = options.showScore ?? true;
	const showTopic = options.showTopic ?? false;

	const topicPrefix = showTopic ? `[${statusResult.topic.toUpperCase()}] ` : "";

	if (statusResult.status === "grounded") {
		const icon = useUnicode ? "✔ " : "";
		const scoreSuffix = showScore ? ` ${statusResult.score}%` : "";
		return `${topicPrefix}[${icon}GROUNDED${scoreSuffix}]`;
	}

	if (statusResult.status === "partial") {
		const icon = useUnicode ? "⚠ " : "";
		const scoreSuffix = showScore ? ` ${statusResult.score}%` : "";
		return `${topicPrefix}[${icon}PARTIAL${scoreSuffix}]`;
	}

	// defects
	const icon = useUnicode ? "✖ " : "";
	const defectCount = statusResult.ungrounded.length + statusResult.unknownFiles.length;
	return `${topicPrefix}[${icon}DEFECTS: ${defectCount} ungrounded]`;
}

// ============================================================================
// THEME 4: Quick-Diff Comparison View Showing Evolutionary Changes (UX-1381 to UX-1390)
// ============================================================================

export interface CardDiffSummaryChange {
	changed: boolean;
	base: string;
	revised: string;
}

export interface CardDiffResult {
	cardId: string;
	topic: KnowledgeTopic;
	hasChanges: boolean;
	summaryChange: CardDiffSummaryChange;
	addedKeyPoints: string[];
	removedKeyPoints: string[];
	retainedKeyPoints: string[];
	addedEntryPoints: CardEntryPoint[];
	removedEntryPoints: CardEntryPoint[];
	addedSources: string[];
	removedSources: string[];
	scoreDelta: number;
	baseScore: number;
	revisedScore: number;
}

export interface CardDiffRenderOptions {
	unicode?: boolean;
	color?: boolean;
	terminalWidth?: number;
}

/**
 * Compute quick-diff comparison between two versions of a knowledge card.
 */
export function diffKnowledgeCards(
	baseCard: Card,
	revisedCard: Card,
	topic?: KnowledgeTopic,
): CardDiffResult {
	const resolvedTopic = inferKnowledgeTopic(revisedCard, topic);

	const summaryChanged = baseCard.summary.trim() !== revisedCard.summary.trim();

	// Key points diff
	const baseKpSet = new Set(baseCard.keyPoints);
	const revKpSet = new Set(revisedCard.keyPoints);
	const addedKeyPoints = revisedCard.keyPoints.filter((kp) => !baseKpSet.has(kp));
	const removedKeyPoints = baseCard.keyPoints.filter((kp) => !revKpSet.has(kp));
	const retainedKeyPoints = revisedCard.keyPoints.filter((kp) => baseKpSet.has(kp));

	// Entry points diff
	const baseEpMap = new Map(baseCard.entryPoints.map((ep) => [`${ep.name}:${ep.file}`, ep]));
	const revEpMap = new Map(revisedCard.entryPoints.map((ep) => [`${ep.name}:${ep.file}`, ep]));
	const addedEntryPoints = revisedCard.entryPoints.filter(
		(ep) => !baseEpMap.has(`${ep.name}:${ep.file}`),
	);
	const removedEntryPoints = baseCard.entryPoints.filter(
		(ep) => !revEpMap.has(`${ep.name}:${ep.file}`),
	);

	// Sources diff
	const baseSrcSet = new Set(baseCard.sources.map((s) => s.path));
	const revSrcSet = new Set(revisedCard.sources.map((s) => s.path));
	const addedSources = revisedCard.sources
		.map((s) => s.path)
		.filter((p) => !baseSrcSet.has(p));
	const removedSources = baseCard.sources
		.map((s) => s.path)
		.filter((p) => !revSrcSet.has(p));

	const baseScore = baseCard.verification?.score ?? 100;
	const revisedScore = revisedCard.verification?.score ?? 100;
	const scoreDelta = revisedScore - baseScore;

	const hasChanges =
		summaryChanged ||
		addedKeyPoints.length > 0 ||
		removedKeyPoints.length > 0 ||
		addedEntryPoints.length > 0 ||
		removedEntryPoints.length > 0 ||
		addedSources.length > 0 ||
		removedSources.length > 0 ||
		scoreDelta !== 0;

	return {
		cardId: revisedCard.moduleId,
		topic: resolvedTopic,
		hasChanges,
		summaryChange: {
			changed: summaryChanged,
			base: baseCard.summary,
			revised: revisedCard.summary,
		},
		addedKeyPoints,
		removedKeyPoints,
		retainedKeyPoints,
		addedEntryPoints,
		removedEntryPoints,
		addedSources,
		removedSources,
		scoreDelta,
		baseScore,
		revisedScore,
	};
}

/**
 * Format quick-diff comparison view showing evolutionary changes.
 */
export function formatCardQuickDiff(
	diff: CardDiffResult,
	options: CardDiffRenderOptions = {},
): string {
	const u = options.unicode ?? true;
	const lines: string[] = [];

	const deltaSign = diff.scoreDelta > 0 ? `+${diff.scoreDelta}%` : `${diff.scoreDelta}%`;
	const headerBorder = u ? "═".repeat(68) : "=".repeat(68);

	lines.push(headerBorder);
	lines.push(
		`Card Evolutionary Quick-Diff: [${diff.cardId}] (${diff.topic.toUpperCase()})`,
	);
	lines.push(
		`Verification Score: ${diff.baseScore}% -> ${diff.revisedScore}% (${deltaSign}) | Changes: ${diff.hasChanges ? "DETECTED" : "NONE"}`,
	);
	lines.push("─".repeat(68));

	if (!diff.hasChanges) {
		lines.push("  ✔ No evolutionary changes between card versions.");
		lines.push(headerBorder);
		return lines.join("\n");
	}

	if (diff.summaryChange.changed) {
		lines.push("Summary Evolution:");
		lines.push(`  - ${diff.summaryChange.base}`);
		lines.push(`  + ${diff.summaryChange.revised}`);
	}

	if (diff.addedKeyPoints.length > 0 || diff.removedKeyPoints.length > 0) {
		lines.push("Key Points Delta:");
		for (const rem of diff.removedKeyPoints) {
			lines.push(`  - ${rem}`);
		}
		for (const add of diff.addedKeyPoints) {
			lines.push(`  + ${add}`);
		}
	}

	if (diff.addedEntryPoints.length > 0 || diff.removedEntryPoints.length > 0) {
		lines.push("Entry Points Delta:");
		for (const rem of diff.removedEntryPoints) {
			lines.push(`  - ${rem.name} in ${rem.file}`);
		}
		for (const add of diff.addedEntryPoints) {
			lines.push(`  + ${add.name} in ${add.file}${add.line ? `:${add.line}` : ""}`);
		}
	}

	if (diff.addedSources.length > 0 || diff.removedSources.length > 0) {
		lines.push("Sources Delta:");
		for (const rem of diff.removedSources) {
			lines.push(`  - [SRC] ${rem}`);
		}
		for (const add of diff.addedSources) {
			lines.push(`  + [SRC] ${add}`);
		}
	}

	lines.push(headerBorder);
	return lines.join("\n");
}

// ============================================================================
// THEME 5: Card Bookmarking and Favorite Selector Pinning Key Reference Cards (UX-1391 to UX-1400)
// ============================================================================

export interface CardBookmark {
	cardId: string;
	topic: KnowledgeTopic;
	pinnedAt: string;
	priority: number; // 1 = highest
	note?: string;
	tags?: string[];
}

export interface CardBookmarkRegistry {
	bookmarks: Map<string, CardBookmark>;
}

export interface PinCardOptions {
	topic?: KnowledgeTopic;
	priority?: number;
	note?: string;
	tags?: string[];
}

/**
 * Initialize card bookmark and favorite registry.
 */
export function createCardBookmarkRegistry(
	initialBookmarks?: CardBookmark[],
): CardBookmarkRegistry {
	const bookmarks = new Map<string, CardBookmark>();
	if (initialBookmarks) {
		for (const bm of initialBookmarks) {
			bookmarks.set(bm.cardId, bm);
		}
	}
	return { bookmarks };
}

/**
 * Pin / bookmark a card into favorite selector.
 */
export function pinCard(
	registry: CardBookmarkRegistry,
	cardId: string,
	options: PinCardOptions = {},
): CardBookmarkRegistry {
	const topic = options.topic ?? "subsystem-overview";
	const priority = options.priority ?? 1;

	const bookmark: CardBookmark = {
		cardId,
		topic,
		pinnedAt: new Date().toISOString(),
		priority,
		note: options.note,
		tags: options.tags ?? [],
	};

	const updated = new Map(registry.bookmarks);
	updated.set(cardId, bookmark);
	return { bookmarks: updated };
}

/**
 * Unpin / remove a card from bookmarks.
 */
export function unpinCard(
	registry: CardBookmarkRegistry,
	cardId: string,
): CardBookmarkRegistry {
	const updated = new Map(registry.bookmarks);
	updated.delete(cardId);
	return { bookmarks: updated };
}

/**
 * Check if a card is pinned in bookmarks.
 */
export function isCardPinned(
	registry: CardBookmarkRegistry,
	cardId: string,
): boolean {
	return registry.bookmarks.has(cardId);
}

/**
 * Get all pinned cards from registry, sorted by priority.
 */
export function getPinnedCards(
	registry: CardBookmarkRegistry,
	cards: readonly Card[],
): Array<{ card: Card; bookmark: CardBookmark }> {
	const list: Array<{ card: Card; bookmark: CardBookmark }> = [];

	for (const card of cards) {
		const bm = registry.bookmarks.get(card.moduleId);
		if (bm) {
			list.push({ card, bookmark: bm });
		}
	}

	return list.sort((a, b) => {
		if (a.bookmark.priority !== b.bookmark.priority) {
			return a.bookmark.priority - b.bookmark.priority;
		}
		return a.bookmark.pinnedAt.localeCompare(b.bookmark.pinnedAt);
	});
}

/**
 * Render visual bookmark and favorite selector card view.
 */
export function renderBookmarkSelector(
	registry: CardBookmarkRegistry,
	cards: readonly Card[],
	options: { unicode?: boolean; selectedId?: string } = {},
): string {
	const u = options.unicode ?? true;
	const pinnedItems = getPinnedCards(registry, cards);

	const star = u ? "★" : "*";
	const check = u ? "✔" : "+";
	const lines: string[] = [
		`${star} Pinned Knowledge Cards (${pinnedItems.length}/${cards.length} pinned) ${star}`,
		"─".repeat(72),
	];

	if (pinnedItems.length === 0) {
		lines.push("  No cards pinned. Use pinCard() to bookmark key reference cards.");
		lines.push("─".repeat(72));
		return lines.join("\n");
	}

	for (let i = 0; i < pinnedItems.length; i++) {
		const item = pinnedItems[i];
		if (!item) continue;
		const { card, bookmark } = item;
		const isSelected = options.selectedId === card.moduleId;
		const cursor = isSelected ? (u ? "▶ " : "> ") : "  ";
		const priorityTag = `[P${bookmark.priority}]`;
		const topicTag = `[${bookmark.topic}]`.padEnd(24, " ");
		const noteSuffix = bookmark.note ? ` | Note: ${bookmark.note}` : "";

		lines.push(
			`${cursor}${star} ${priorityTag} ${topicTag} ${card.moduleId}: ${card.name}${noteSuffix}`,
		);
		const density = calculateCardCitationDensity(card, bookmark.topic);
		lines.push(`     Evidence: ${density.gaugeBar}`);
	}

	lines.push("─".repeat(72));
	return lines.join("\n");
}
