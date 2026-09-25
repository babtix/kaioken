import { describe, expect, it } from "vitest";
import {
	ALL_RESEARCH_TOPIC_KINDS,
	RESEARCH_TOPIC_METADATA,
	type ResearchTopicKind,
	type SearchProvider,
	buildSourceInspectionModal,
	checkRobotsTxtAllowed,
	compileResearchBriefingDocument,
	executeTopicSearchWithFallback,
	handleTopicRateLimitAndRobots,
	parseRetryAfterHeader,
	renderResearchBriefingMarkdown,
	renderSourceInspectionModalHtml,
	scaleTopicResearchDepth,
} from "../src/index.ts";

describe("Step 35: Category 17 — Grounded Web Research & Intelligence Gatherer (UX-1651 – UX-1700)", () => {
	it("defines all 10 canonical research topic kinds", () => {
		expect(ALL_RESEARCH_TOPIC_KINDS).toHaveLength(10);
		for (const topic of ALL_RESEARCH_TOPIC_KINDS) {
			const meta = RESEARCH_TOPIC_METADATA[topic];
			expect(meta).toBeDefined();
			expect(meta.title.length).toBeGreaterThan(0);
			expect(meta.category.length).toBeGreaterThan(0);
			expect(meta.defaultQueries.length).toBeGreaterThanOrEqual(1);
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 1: Interactive Source Inspection Modal (UX-1651 – UX-1660)           */
	/* -------------------------------------------------------------------------- */
	describe("Theme 1: Interactive source inspection modal showing raw extracted text (UX-1651 – UX-1660)", () => {
		const testCases: Array<{ topic: ResearchTopicKind; uxId: string }> = [
			{ topic: "open-source-alternatives", uxId: "UX-1651" },
			{ topic: "security-cve-advisories", uxId: "UX-1652" },
			{ topic: "cloud-architecture-whitepapers", uxId: "UX-1653" },
			{ topic: "api-breaking-change-guides", uxId: "UX-1654" },
			{ topic: "runtime-performance-benchmarks", uxId: "UX-1655" },
			{ topic: "database-query-optimization", uxId: "UX-1656" },
			{ topic: "regulatory-compliance-standards", uxId: "UX-1657" },
			{ topic: "runtime-release-notes", uxId: "UX-1658" },
			{ topic: "distributed-consensus-protocols", uxId: "UX-1659" },
			{ topic: "frontend-rendering-patterns", uxId: "UX-1660" },
		];

		for (const { topic, uxId } of testCases) {
			it(`[${uxId}] generates and renders source inspection modal for ${topic}`, () => {
				const modal = buildSourceInspectionModal(topic, {
					sourceNumber: 1,
					url: `https://example.com/research/${topic}/source-1`,
					rawText: `Raw unformatted extracted text for ${topic} containing detailed facts and evidence.`,
					citedClaims: [`Verified discovery claim 1 for ${topic}`],
					credibilityTier: "official",
					domainAuthority: 92,
				});

				expect(modal.topic).toBe(topic);
				expect(modal.modalId).toContain(`modal-inspect-${topic}-1`);
				expect(modal.byteLength).toBeGreaterThan(0);
				expect(modal.contentHash).toBeDefined();
				expect(modal.citedClaims).toHaveLength(1);

				const html = renderSourceInspectionModalHtml(modal);
				expect(html).toContain(modal.modalId);
				expect(html).toContain(modal.url);
				expect(html).toContain("Raw Extracted Content");
				expect(html).toContain("Verified discovery claim 1");
				expect(html).toContain("Copy Raw Text");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 2: Configurable Depth Dial (×1 to ×10) (UX-1661 – UX-1670)           */
	/* -------------------------------------------------------------------------- */
	describe("Theme 2: Configurable depth dial (×1 to ×10) scaling source breadth (UX-1661 – UX-1670)", () => {
		const testCases: Array<{ topic: ResearchTopicKind; uxId: string }> = [
			{ topic: "open-source-alternatives", uxId: "UX-1661" },
			{ topic: "security-cve-advisories", uxId: "UX-1662" },
			{ topic: "cloud-architecture-whitepapers", uxId: "UX-1663" },
			{ topic: "api-breaking-change-guides", uxId: "UX-1664" },
			{ topic: "runtime-performance-benchmarks", uxId: "UX-1665" },
			{ topic: "database-query-optimization", uxId: "UX-1666" },
			{ topic: "regulatory-compliance-standards", uxId: "UX-1667" },
			{ topic: "runtime-release-notes", uxId: "UX-1668" },
			{ topic: "distributed-consensus-protocols", uxId: "UX-1669" },
			{ topic: "frontend-rendering-patterns", uxId: "UX-1670" },
		];

		for (const { topic, uxId } of testCases) {
			it(`[${uxId}] scales source breadth accurately across dial 1x to 10x for ${topic}`, () => {
				const depth1 = scaleTopicResearchDepth(topic, 1);
				const depth5 = scaleTopicResearchDepth(topic, 5);
				const depth10 = scaleTopicResearchDepth(topic, 10);

				expect(depth1.multiplier).toBe(1);
				expect(depth5.multiplier).toBe(5);
				expect(depth10.multiplier).toBe(10);

				// Higher multiplier scales sources, queries, token budget, and timeout
				expect(depth5.targetSources).toBeGreaterThanOrEqual(depth1.targetSources);
				expect(depth10.targetSources).toBeGreaterThanOrEqual(depth5.targetSources);
				expect(depth10.targetQueries).toBeGreaterThanOrEqual(depth1.targetQueries);
				expect(depth10.breadthBudget).toBeGreaterThan(depth1.breadthBudget);
				expect(depth10.timeoutMs).toBeGreaterThan(depth1.timeoutMs);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 3: Search Engine Provider Fallback Switcher (UX-1671 – UX-1680)       */
	/* -------------------------------------------------------------------------- */
	describe("Theme 3: Search engine provider fallback switcher retrieving queries (UX-1671 – UX-1680)", () => {
		const testCases: Array<{ topic: ResearchTopicKind; uxId: string }> = [
			{ topic: "open-source-alternatives", uxId: "UX-1671" },
			{ topic: "security-cve-advisories", uxId: "UX-1672" },
			{ topic: "cloud-architecture-whitepapers", uxId: "UX-1673" },
			{ topic: "api-breaking-change-guides", uxId: "UX-1674" },
			{ topic: "runtime-performance-benchmarks", uxId: "UX-1675" },
			{ topic: "database-query-optimization", uxId: "UX-1676" },
			{ topic: "regulatory-compliance-standards", uxId: "UX-1677" },
			{ topic: "runtime-release-notes", uxId: "UX-1678" },
			{ topic: "distributed-consensus-protocols", uxId: "UX-1679" },
			{ topic: "frontend-rendering-patterns", uxId: "UX-1680" },
		];

		for (const { topic, uxId } of testCases) {
			it(`[${uxId}] switches gracefully between primary and fallback search providers for ${topic}`, async () => {
				const primaryProvider: SearchProvider = {
					id: "primary-searx",
					name: "SearXNG Primary",
					priority: 1,
					search: async () => {
						throw new Error("HTTP 503 Service Unavailable");
					},
				};

				const fallbackProvider: SearchProvider = {
					id: "fallback-brave",
					name: "Brave Fallback",
					priority: 2,
					search: async (q: string) => [
						{ title: `Result for ${q}`, url: `https://brave.com/search?q=${q}` },
					],
				};

				const result = await executeTopicSearchWithFallback(topic, `sample query for ${topic}`, [
					primaryProvider,
					fallbackProvider,
				]);

				expect(result.topic).toBe(topic);
				expect(result.fallbackTriggered).toBe(true);
				expect(result.providerUsed).toBe("fallback-brave");
				expect(result.attemptCount).toBe(2);
				expect(result.results).toHaveLength(1);
				expect(result.errorLog).toHaveLength(1);
				expect(result.errorLog[0]?.provider).toBe("primary-searx");
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 4: Rate-Limit Backoff & Robots.txt Handler (UX-1681 – UX-1690)        */
	/* -------------------------------------------------------------------------- */
	describe("Theme 4: Rate-limit backoff handler respecting Robots.txt and 429s (UX-1681 – UX-1690)", () => {
		const testCases: Array<{ topic: ResearchTopicKind; uxId: string }> = [
			{ topic: "open-source-alternatives", uxId: "UX-1681" },
			{ topic: "security-cve-advisories", uxId: "UX-1682" },
			{ topic: "cloud-architecture-whitepapers", uxId: "UX-1683" },
			{ topic: "api-breaking-change-guides", uxId: "UX-1684" },
			{ topic: "runtime-performance-benchmarks", uxId: "UX-1685" },
			{ topic: "database-query-optimization", uxId: "UX-1686" },
			{ topic: "regulatory-compliance-standards", uxId: "UX-1687" },
			{ topic: "runtime-release-notes", uxId: "UX-1688" },
			{ topic: "distributed-consensus-protocols", uxId: "UX-1689" },
			{ topic: "frontend-rendering-patterns", uxId: "UX-1690" },
		];

		it("parses retry after header values accurately", () => {
			expect(parseRetryAfterHeader(undefined)).toBe(0);
			expect(parseRetryAfterHeader("5")).toBe(5000);
			expect(parseRetryAfterHeader(10)).toBe(10000);
		});

		it("checks robots.txt disallow rules correctly", () => {
			const robots = `
User-agent: *
Disallow: /private/
Disallow: /admin/
Crawl-delay: 2
`;
			expect(checkRobotsTxtAllowed("https://example.com/public/doc", robots).allowed).toBe(true);
			expect(checkRobotsTxtAllowed("https://example.com/private/secret", robots).allowed).toBe(false);
			expect(checkRobotsTxtAllowed("https://example.com/public/doc", robots).crawlDelayMs).toBe(2000);
		});

		for (const { topic, uxId } of testCases) {
			it(`[${uxId}] enforces robots.txt and handles 429 exponential backoff for ${topic}`, () => {
				// 1. Robots check rejection
				const robotsBlocked = handleTopicRateLimitAndRobots(
					topic,
					"https://example.com/admin/settings",
					{
						robotsTxt: "User-agent: *\nDisallow: /admin/",
					},
				);
				expect(robotsBlocked.allowed).toBe(false);
				expect(robotsBlocked.disallowedByRobots).toBe(true);

				// 2. HTTP 429 rate limit backoff
				const rateLimited = handleTopicRateLimitAndRobots(
					topic,
					"https://example.com/api/advisory",
					{
						statusCode: 429,
						retryAfterHeader: "3",
						attempt: 2,
					},
				);
				expect(rateLimited.allowed).toBe(false);
				expect(rateLimited.disallowedByRobots).toBe(false);
				expect(rateLimited.backoffDelayMs).toBeGreaterThanOrEqual(3000);

				// 3. Normal fetch allowed
				const allowed = handleTopicRateLimitAndRobots(topic, "https://example.com/articles/guide", {
					statusCode: 200,
				});
				expect(allowed.allowed).toBe(true);
			});
		}
	});

	/* -------------------------------------------------------------------------- */
	/* Theme 5: Exportable Research Briefing Document (UX-1691 – UX-1700)          */
	/* -------------------------------------------------------------------------- */
	describe("Theme 5: Exportable research briefing document compiling discoveries (UX-1691 – UX-1700)", () => {
		const testCases: Array<{ topic: ResearchTopicKind; uxId: string }> = [
			{ topic: "open-source-alternatives", uxId: "UX-1691" },
			{ topic: "security-cve-advisories", uxId: "UX-1692" },
			{ topic: "cloud-architecture-whitepapers", uxId: "UX-1693" },
			{ topic: "api-breaking-change-guides", uxId: "UX-1694" },
			{ topic: "runtime-performance-benchmarks", uxId: "UX-1695" },
			{ topic: "database-query-optimization", uxId: "UX-1696" },
			{ topic: "regulatory-compliance-standards", uxId: "UX-1697" },
			{ topic: "runtime-release-notes", uxId: "UX-1698" },
			{ topic: "distributed-consensus-protocols", uxId: "UX-1699" },
			{ topic: "frontend-rendering-patterns", uxId: "UX-1700" },
		];

		for (const { topic, uxId } of testCases) {
			it(`[${uxId}] compiles and renders exportable research briefing document for ${topic}`, () => {
				const briefing = compileResearchBriefingDocument(topic, {
					executiveSummary: `Consolidated intelligence brief on ${topic} highlighting key discoveries and benchmark metrics.`,
					verifiedDiscoveries: [
						{
							claim: `Discovered critical implementation pattern for ${topic}`,
							citations: [1, 2],
							confidence: "high",
						},
					],
					sources: [
						{
							sourceNumber: 1,
							title: `Official Advisory for ${topic}`,
							url: `https://example.com/advisory/${topic}`,
							domainAuthority: 95,
							credibilityTier: "canonical",
						},
						{
							sourceNumber: 2,
							title: `Benchmark Analysis for ${topic}`,
							url: `https://example.com/benchmark/${topic}`,
							domainAuthority: 88,
							credibilityTier: "verified",
						},
					],
				});

				expect(briefing.topic).toBe(topic);
				expect(briefing.title).toContain("Research Briefing:");
				expect(briefing.provenanceHash).toBeDefined();
				expect(briefing.verifiedDiscoveries).toHaveLength(1);
				expect(briefing.sources).toHaveLength(2);

				const markdown = renderResearchBriefingMarkdown(briefing);
				expect(markdown).toContain(`# ${briefing.title}`);
				expect(markdown).toContain("Executive Summary");
				expect(markdown).toContain("Verified Discoveries & Grounded Claims");
				expect(markdown).toContain("Risk Assessment & Recommended Action Items");
				expect(markdown).toContain("Sources & Citation Bibliography");
				expect(markdown).toContain("[1] [Official Advisory");
			});
		}
	});
});
