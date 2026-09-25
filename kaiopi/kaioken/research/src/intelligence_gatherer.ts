import { createHash } from "node:crypto";
import {
	BREADTH_THRESHOLD,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	parseMultiplier,
} from "./types.ts";

export function escapeHtml(s: string): string {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

export function escapeAttr(s: string): string {
	return escapeHtml(s);
}

/**
 * 10 Canonical Research Topics defined in Step 35 (UX-1651 – UX-1700).
 */
export type ResearchTopicKind =
	| "open-source-alternatives"
	| "security-cve-advisories"
	| "cloud-architecture-whitepapers"
	| "api-breaking-change-guides"
	| "runtime-performance-benchmarks"
	| "database-query-optimization"
	| "regulatory-compliance-standards"
	| "runtime-release-notes"
	| "distributed-consensus-protocols"
	| "frontend-rendering-patterns";

export const ALL_RESEARCH_TOPIC_KINDS: readonly ResearchTopicKind[] = [
	"open-source-alternatives",
	"security-cve-advisories",
	"cloud-architecture-whitepapers",
	"api-breaking-change-guides",
	"runtime-performance-benchmarks",
	"database-query-optimization",
	"regulatory-compliance-standards",
	"runtime-release-notes",
	"distributed-consensus-protocols",
	"frontend-rendering-patterns",
] as const;

export interface ResearchTopicMetadata {
	kind: ResearchTopicKind;
	title: string;
	category: string;
	defaultQueries: string[];
	recommendedMultiplier: number;
	riskLevel: "low" | "medium" | "high" | "critical";
	complianceSensitive: boolean;
}

export const RESEARCH_TOPIC_METADATA: Record<ResearchTopicKind, ResearchTopicMetadata> = {
	"open-source-alternatives": {
		kind: "open-source-alternatives",
		title: "Emerging Open-Source Library Alternatives",
		category: "Ecosystem & Dependencies",
		defaultQueries: ["best open source alternatives", "github trending repositories", "library comparisons benchmark"],
		recommendedMultiplier: 3,
		riskLevel: "low",
		complianceSensitive: false,
	},
	"security-cve-advisories": {
		kind: "security-cve-advisories",
		title: "Security Vulnerability CVE Advisories",
		category: "Security & Vulnerability",
		defaultQueries: ["cve database security advisory", "vulnerability disclosure report", "patch release security notes"],
		recommendedMultiplier: 7,
		riskLevel: "critical",
		complianceSensitive: true,
	},
	"cloud-architecture-whitepapers": {
		kind: "cloud-architecture-whitepapers",
		title: "Cloud Architecture Best Practice Whitepapers",
		category: "Infrastructure & Scalability",
		defaultQueries: ["well architected framework", "high availability cloud architecture", "disaster recovery whitepaper"],
		recommendedMultiplier: 5,
		riskLevel: "medium",
		complianceSensitive: false,
	},
	"api-breaking-change-guides": {
		kind: "api-breaking-change-guides",
		title: "API Breaking Change Migration Guides",
		category: "API & Compatibility",
		defaultQueries: ["breaking changes migration guide", "deprecated API replacement", "version upgrade changelog"],
		recommendedMultiplier: 4,
		riskLevel: "high",
		complianceSensitive: false,
	},
	"runtime-performance-benchmarks": {
		kind: "runtime-performance-benchmarks",
		title: "Performance Tuning Benchmarks Across Runtimes",
		category: "Performance & Profiling",
		defaultQueries: ["runtime performance benchmark throughput", "memory allocation latency comparison", "cpu profiling benchmark"],
		recommendedMultiplier: 5,
		riskLevel: "medium",
		complianceSensitive: false,
	},
	"database-query-optimization": {
		kind: "database-query-optimization",
		title: "Database Indexing and Query Optimization Tips",
		category: "Data & Storage",
		defaultQueries: ["query execution plan optimization", "b-tree vs gin index tuning", "composite index cardinality optimization"],
		recommendedMultiplier: 4,
		riskLevel: "medium",
		complianceSensitive: false,
	},
	"regulatory-compliance-standards": {
		kind: "regulatory-compliance-standards",
		title: "Regulatory Compliance Standards (SOC2, GDPR)",
		category: "Governance & Compliance",
		defaultQueries: ["soc2 trust services criteria compliance", "gdpr data privacy audit requirements", "hipaa encryption standards"],
		recommendedMultiplier: 8,
		riskLevel: "critical",
		complianceSensitive: true,
	},
	"runtime-release-notes": {
		kind: "runtime-release-notes",
		title: "Compiler and Runtime Release Notes",
		category: "Platform & Toolchain",
		defaultQueries: ["compiler release notes new features", "v8 engine release optimizations", "runtime changelog breaking changes"],
		recommendedMultiplier: 3,
		riskLevel: "low",
		complianceSensitive: false,
	},
	"distributed-consensus-protocols": {
		kind: "distributed-consensus-protocols",
		title: "Distributed Systems Consensus Protocols",
		category: "Distributed Systems",
		defaultQueries: ["raft consensus leader election", "paxos fault tolerance partition", "byzantine fault tolerance protocols"],
		recommendedMultiplier: 6,
		riskLevel: "high",
		complianceSensitive: false,
	},
	"frontend-rendering-patterns": {
		kind: "frontend-rendering-patterns",
		title: "Modern Frontend Rendering Architecture Patterns",
		category: "Frontend & Architecture",
		defaultQueries: ["server components streaming ssr", "island architecture hydration", "static site generation incremental prerendering"],
		recommendedMultiplier: 3,
		riskLevel: "low",
		complianceSensitive: false,
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: Interactive Source Inspection Modal (UX-1651 – UX-1660)           */
/* -------------------------------------------------------------------------- */

export interface SourceInspectionModalData {
	topic: ResearchTopicKind;
	modalId: string;
	title: string;
	sourceNumber: number;
	url: string;
	extractedAt: string;
	rawText: string;
	byteLength: number;
	contentHash: string;
	sanitized: boolean;
	sanitizationFlags: string[];
	credibilityTier?: string;
	domainAuthority?: number;
	citedClaims: string[];
}

export function buildSourceInspectionModal(
	topic: ResearchTopicKind,
	source: {
		sourceNumber: number;
		url: string;
		title?: string;
		rawText: string;
		extractedAt?: string;
		sanitized?: boolean;
		sanitizationFlags?: string[];
		credibilityTier?: string;
		domainAuthority?: number;
		citedClaims?: string[];
	},
): SourceInspectionModalData {
	const meta = RESEARCH_TOPIC_METADATA[topic];
	const rawText = source.rawText || "";
	const byteLength = Buffer.byteLength(rawText, "utf8");
	const contentHash = createHash("sha256").update(rawText).digest("hex").slice(0, 16);

	return {
		topic,
		modalId: `modal-inspect-${topic}-${source.sourceNumber}`,
		title: source.title || `Source [${source.sourceNumber}] for ${meta.title}`,
		sourceNumber: source.sourceNumber,
		url: source.url,
		extractedAt: source.extractedAt || new Date().toISOString(),
		rawText,
		byteLength,
		contentHash,
		sanitized: source.sanitized ?? true,
		sanitizationFlags: source.sanitizationFlags || ["html_stripped", "scripts_removed"],
		credibilityTier: source.credibilityTier || "verified",
		domainAuthority: source.domainAuthority ?? 85,
		citedClaims: source.citedClaims || [],
	};
}

export function renderSourceInspectionModalHtml(modal: SourceInspectionModalData): string {
	const claimsList =
		modal.citedClaims.length > 0
			? `<ul class="modal-claims">${modal.citedClaims.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>`
			: `<p class="modal-none">No active citations recorded for this source.</p>`;

	const flagsBadges = modal.sanitizationFlags
		.map((f) => `<span class="badge badge-flag">${escapeHtml(f)}</span>`)
		.join(" ");

	return `
<div id="${escapeAttr(modal.modalId)}" class="research-modal" role="dialog" aria-modal="true" aria-labelledby="${escapeAttr(modal.modalId)}-title">
  <div class="research-modal-backdrop" onclick="document.getElementById('${escapeAttr(modal.modalId)}').classList.remove('is-open')"></div>
  <div class="research-modal-dialog">
    <header class="modal-hdr">
      <div class="modal-badge-group">
        <span class="badge badge-topic">${escapeHtml(modal.topic)}</span>
        <span class="badge badge-num">Source [${modal.sourceNumber}]</span>
        ${flagsBadges}
      </div>
      <h3 id="${escapeAttr(modal.modalId)}-title" class="modal-title">${escapeHtml(modal.title)}</h3>
      <button class="modal-close" type="button" aria-label="Close modal" onclick="document.getElementById('${escapeAttr(modal.modalId)}').classList.remove('is-open')">&times;</button>
    </header>
    <div class="modal-meta-grid">
      <div class="meta-item"><span class="k">URL:</span> <a href="${escapeAttr(modal.url)}" target="_blank" rel="noopener noreferrer" class="v mono">${escapeHtml(modal.url)}</a></div>
      <div class="meta-item"><span class="k">Extracted At:</span> <span class="v mono">${escapeHtml(modal.extractedAt)}</span></div>
      <div class="meta-item"><span class="k">Payload Size:</span> <span class="v mono">${modal.byteLength} bytes</span></div>
      <div class="meta-item"><span class="k">SHA-256 Hash:</span> <span class="v mono">${escapeHtml(modal.contentHash)}</span></div>
      <div class="meta-item"><span class="k">Credibility:</span> <span class="v badge badge-${escapeAttr(modal.credibilityTier || "default")}">${escapeHtml(modal.credibilityTier || "unknown")} (DA ${modal.domainAuthority ?? 0})</span></div>
    </div>
    <div class="modal-section">
      <h4>Associated Cited Claims</h4>
      ${claimsList}
    </div>
    <div class="modal-section modal-text-section">
      <div class="section-hdr">
        <h4>Raw Extracted Content</h4>
        <button class="btn btn-copy" type="button" onclick="navigator.clipboard.writeText(document.getElementById('${escapeAttr(modal.modalId)}-raw').innerText)">Copy Raw Text</button>
      </div>
      <pre class="raw-extracted-text"><code id="${escapeAttr(modal.modalId)}-raw">${escapeHtml(modal.rawText)}</code></pre>
    </div>
  </div>
</div>`.trim();
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Configurable Depth Dial (×1 to ×10) (UX-1661 – UX-1670)           */
/* -------------------------------------------------------------------------- */

export interface TopicResearchDepth {
	topic: ResearchTopicKind;
	multiplier: number;
	targetSources: number;
	targetQueries: number;
	excerptChars: number;
	maxOutputTokens: number;
	refinementPasses: number;
	breadthBudget: number;
	timeoutMs: number;
}

export function scaleTopicResearchDepth(
	topic: ResearchTopicKind,
	rawMultiplier: number | string | undefined,
): TopicResearchDepth {
	const parsed = parseMultiplier(rawMultiplier) ?? 1;
	const multiplier = Math.min(Math.max(parsed, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const meta = RESEARCH_TOPIC_METADATA[topic];

	// Domain-specific scaling weights
	const riskBoost = meta.riskLevel === "critical" ? 2 : meta.riskLevel === "high" ? 1 : 0;
	const complianceFactor = meta.complianceSensitive ? 1.5 : 1.0;

	const breadth = Math.min(multiplier, BREADTH_THRESHOLD);
	const targetSources = Math.round((3 + breadth * 2 + riskBoost) * complianceFactor);
	const targetQueries = Math.round((meta.defaultQueries.length + Math.floor(breadth / 2)) * (meta.complianceSensitive ? 1.3 : 1.0));
	const excerptChars = Math.round((6_000 + breadth * 2_500) * (riskBoost > 0 ? 1.2 : 1.0));
	const maxOutputTokens = 1_500 + breadth * 900 + riskBoost * 400;
	const refinementPasses = 1 + Math.max(0, multiplier - BREADTH_THRESHOLD) + riskBoost;
	const breadthBudget = targetSources * excerptChars;
	const timeoutMs = 5_000 + multiplier * 2_500;

	return {
		topic,
		multiplier,
		targetSources,
		targetQueries,
		excerptChars,
		maxOutputTokens,
		refinementPasses,
		breadthBudget,
		timeoutMs,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Search Engine Provider Fallback Switcher (UX-1671 – UX-1680)       */
/* -------------------------------------------------------------------------- */

export interface SearchProvider {
	id: string;
	name: string;
	priority: number;
	search: (query: string) => Promise<Array<{ title: string; url: string; snippet?: string }>>;
}

export interface ProviderFallbackResult {
	topic: ResearchTopicKind;
	query: string;
	providerUsed: string;
	attemptCount: number;
	fallbackTriggered: boolean;
	results: Array<{ title: string; url: string; snippet?: string }>;
	errorLog: Array<{ provider: string; error: string; timestamp: string }>;
}

export async function executeTopicSearchWithFallback(
	topic: ResearchTopicKind,
	query: string,
	providers: SearchProvider[],
): Promise<ProviderFallbackResult> {
	if (!providers || providers.length === 0) {
		throw new Error(`No search providers configured for research topic '${topic}'`);
	}

	const sortedProviders = [...providers].sort((a, b) => a.priority - b.priority);
	const errorLog: Array<{ provider: string; error: string; timestamp: string }> = [];
	let attemptCount = 0;

	for (let i = 0; i < sortedProviders.length; i++) {
		const provider = sortedProviders[i] as SearchProvider;
		attemptCount++;
		try {
			const results = await provider.search(query);
			return {
				topic,
				query,
				providerUsed: provider.id,
				attemptCount,
				fallbackTriggered: i > 0,
				results,
				errorLog,
			};
		} catch (err: unknown) {
			const errorMsg = err instanceof Error ? err.message : String(err);
			errorLog.push({
				provider: provider.id,
				error: errorMsg,
				timestamp: new Date().toISOString(),
			});
		}
	}

	// If all providers failed, return a structured fallback failure result rather than throwing
	return {
		topic,
		query,
		providerUsed: "none",
		attemptCount,
		fallbackTriggered: true,
		results: [],
		errorLog,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 4: Rate-Limit Backoff & Robots.txt Handler (UX-1681 – UX-1690)        */
/* -------------------------------------------------------------------------- */

export interface RateLimitStatus {
	allowed: boolean;
	backoffDelayMs: number;
	retryAfterHeader?: string | number;
	disallowedByRobots: boolean;
	attemptNumber: number;
	reason?: string;
}

export function parseRetryAfterHeader(headerValue: string | number | undefined): number {
	if (headerValue === undefined || headerValue === null || headerValue === "") {
		return 0;
	}
	if (typeof headerValue === "number") {
		return Math.max(0, headerValue * 1000);
	}
	const asNum = Number.parseInt(String(headerValue).trim(), 10);
	if (!Number.isNaN(asNum)) {
		return Math.max(0, asNum * 1000);
	}
	// Try parsing as HTTP date
	const asDate = new Date(String(headerValue)).getTime();
	if (!Number.isNaN(asDate)) {
		const diff = asDate - Date.now();
		return Math.max(0, diff);
	}
	return 0;
}

export function checkRobotsTxtAllowed(
	urlStr: string,
	robotsTxtContent?: string,
	userAgent = "KaiokenBot",
): { allowed: boolean; crawlDelayMs?: number } {
	if (!robotsTxtContent) {
		return { allowed: true };
	}

	try {
		const parsedUrl = new URL(urlStr);
		const pathname = parsedUrl.pathname;
		const lines = robotsTxtContent.split("\n").map((l) => l.trim());

		let activeAgentMatches = false;
		let crawlDelayMs: number | undefined;

		for (const line of lines) {
			if (line.startsWith("#") || !line) continue;
			const [directive, ...rest] = line.split(":");
			if (!directive || rest.length === 0) continue;
			const key = directive.trim().toLowerCase();
			const val = rest.join(":").trim();

			if (key === "user-agent") {
				activeAgentMatches = val === "*" || val.toLowerCase() === userAgent.toLowerCase();
			} else if (activeAgentMatches) {
				if (key === "crawl-delay") {
					const sec = Number.parseFloat(val);
					if (!Number.isNaN(sec)) crawlDelayMs = sec * 1000;
				} else if (key === "disallow") {
					if (val === "" || val === "/") {
						if (val === "/") return { allowed: false, crawlDelayMs };
					} else if (pathname.startsWith(val)) {
						return { allowed: false, crawlDelayMs };
					}
				}
			}
		}

		return { allowed: true, crawlDelayMs };
	} catch {
		return { allowed: true };
	}
}

export function handleTopicRateLimitAndRobots(
	topic: ResearchTopicKind,
	url: string,
	options: {
		statusCode?: number;
		retryAfterHeader?: string | number;
		robotsTxt?: string;
		attempt?: number;
		baseDelayMs?: number;
		maxDelayMs?: number;
	} = {},
): RateLimitStatus {
	const attempt = options.attempt ?? 1;
	const baseDelay = options.baseDelayMs ?? 1_000;
	const maxDelay = options.maxDelayMs ?? 30_000;

	// Check Robots.txt compliance
	const robotsCheck = checkRobotsTxtAllowed(url, options.robotsTxt);
	if (!robotsCheck.allowed) {
		return {
			allowed: false,
			backoffDelayMs: 0,
			disallowedByRobots: true,
			attemptNumber: attempt,
			reason: `Robots.txt forbids crawling path on ${url} for topic ${topic}`,
		};
	}

	// Handle HTTP 429 Too Many Requests
	if (options.statusCode === 429) {
		const retryAfterMs = parseRetryAfterHeader(options.retryAfterHeader);
		const expDelay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
		// Apply jitter
		const jitter = Math.floor(Math.random() * 200);
		const backoffDelayMs = Math.max(retryAfterMs, expDelay) + jitter;

		return {
			allowed: false,
			backoffDelayMs,
			retryAfterHeader: options.retryAfterHeader,
			disallowedByRobots: false,
			attemptNumber: attempt,
			reason: `HTTP 429 Rate Limit encountered. Backoff ${backoffDelayMs}ms`,
		};
	}

	// Normal crawl delay if specified in robots
	const crawlDelay = robotsCheck.crawlDelayMs ?? 0;
	return {
		allowed: true,
		backoffDelayMs: crawlDelay,
		disallowedByRobots: false,
		attemptNumber: attempt,
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 5: Exportable Research Briefing Document (UX-1691 – UX-1700)          */
/* -------------------------------------------------------------------------- */

export interface ResearchBriefingDocument {
	topic: ResearchTopicKind;
	title: string;
	generatedAt: string;
	executiveSummary: string;
	verifiedDiscoveries: Array<{
		claim: string;
		citations: number[];
		confidence: "high" | "medium" | "low";
	}>;
	sources: Array<{
		sourceNumber: number;
		title: string;
		url: string;
		domainAuthority?: number;
		credibilityTier?: string;
		hash: string;
	}>;
	riskAssessment: {
		level: "low" | "medium" | "high" | "critical";
		summary: string;
		actionItems: string[];
	};
	provenanceHash: string;
}

export function compileResearchBriefingDocument(
	topic: ResearchTopicKind,
	input: {
		title?: string;
		executiveSummary: string;
		verifiedDiscoveries: Array<{
			claim: string;
			citations: number[];
			confidence?: "high" | "medium" | "low";
		}>;
		sources: Array<{
			sourceNumber: number;
			title: string;
			url: string;
			domainAuthority?: number;
			credibilityTier?: string;
			hash?: string;
		}>;
		riskAssessment?: {
			level?: "low" | "medium" | "high" | "critical";
			summary?: string;
			actionItems?: string[];
		};
	},
): ResearchBriefingDocument {
	const meta = RESEARCH_TOPIC_METADATA[topic];
	const title = input.title || `Research Briefing: ${meta.title}`;
	const generatedAt = new Date().toISOString();

	const sourcesWithHash = input.sources.map((s) => ({
		...s,
		hash: s.hash || createHash("sha256").update(s.url).digest("hex").slice(0, 16),
	}));

	const verifiedDiscoveries = input.verifiedDiscoveries.map((d) => ({
		claim: d.claim,
		citations: d.citations,
		confidence: d.confidence || "high",
	}));

	const riskAssessment = {
		level: input.riskAssessment?.level || meta.riskLevel,
		summary: input.riskAssessment?.summary || `Evaluated baseline risks for ${meta.title} topic.`,
		actionItems: input.riskAssessment?.actionItems || [
			"Review verified citations before updating dependencies or infrastructure.",
			"Confirm cryptographic signatures and checksums.",
		],
	};

	const provenanceData = JSON.stringify({
		topic,
		title,
		sources: sourcesWithHash,
		discoveries: verifiedDiscoveries,
	});
	const provenanceHash = createHash("sha256").update(provenanceData).digest("hex").slice(0, 16);

	return {
		topic,
		title,
		generatedAt,
		executiveSummary: input.executiveSummary,
		verifiedDiscoveries,
		sources: sourcesWithHash,
		riskAssessment,
		provenanceHash,
	};
}

export function renderResearchBriefingMarkdown(doc: ResearchBriefingDocument): string {
	const meta = RESEARCH_TOPIC_METADATA[doc.topic];

	const discoveriesMd = doc.verifiedDiscoveries
		.map((d) => {
			const cites = d.citations.map((c) => `[${c}]`).join(" ");
			return `- **[Confidence: ${d.confidence.toUpperCase()}]** ${d.claim} ${cites}`;
		})
		.join("\n");

	const sourcesMd = doc.sources
		.map((s) => {
			const tier = s.credibilityTier ? ` (${s.credibilityTier}, DA: ${s.domainAuthority ?? "N/A"})` : "";
			return `[${s.sourceNumber}] [${s.title}](${s.url})${tier} — \`hash:${s.hash}\``;
		})
		.join("\n");

	const actionItemsMd = doc.riskAssessment.actionItems.map((a) => `1. ${a}`).join("\n");

	return `# ${doc.title}

> **Category**: ${meta.category} | **Topic**: \`${doc.topic}\`  
> **Generated**: ${doc.generatedAt} | **Provenance**: \`${doc.provenanceHash}\`  
> **Risk Level**: ${doc.riskAssessment.level.toUpperCase()}

---

## Executive Summary

${doc.executiveSummary}

---

## Verified Discoveries & Grounded Claims

${discoveriesMd || "_No grounded claims recorded._"}

---

## Risk Assessment & Recommended Action Items

**Summary**: ${doc.riskAssessment.summary}

${actionItemsMd}

---

## Sources & Citation Bibliography

${sourcesMd || "_No external sources recorded._"}
`;
}
