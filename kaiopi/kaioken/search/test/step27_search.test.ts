import { describe, expect, it } from "vitest";
import {
	applyDomainPathBoost,
	getArchetypeBoostDescription,
	DOMAIN_BOOST_PROFILES,
	type DomainArchetype,
	highlightSnippet,
	renderSnippetHighlightCard,
	DOMAIN_BADGES,
	DOMAIN_ACCENT_COLORS,
	parseQuerySyntax,
	evaluateQueryAst,
	formatQueryAst,
	SearchHistoryStore,
	renderSearchHistoryDropdown,
	ARCHETYPE_RRF_TITLES,
	getArchetypeRrfExplanationTitle,
	renderArchetypeRrfVisualizer,
	buildScoreExplanation,
	ZeroDiskSearchSession,
	type Chunk,
	type Doc,
	type Kind,
	type SearchHit,
} from "../src/index.ts";

const ALL_ARCHETYPES: DomainArchetype[] = [
	"api",
	"config",
	"error",
	"db",
	"util",
	"test",
	"wiki",
	"card",
	"skill",
	"commit",
];

describe("Step 27: Category 08 — Search, Lexical Indexing & BM25 Retrieval (UX-0741 to UX-0800)", () => {
	describe("Theme 1: File-Path & Directory Boosting Across 10 Archetypes (UX-0741 to UX-0750)", () => {
		it("boosts preferred paths and penalizes non-preferred paths across all 10 archetypes", () => {
			const archetypeSamplePaths: Record<DomainArchetype, { preferred: string; nonPreferred: string }> = {
				api: { preferred: "src/routes/api/users.ts", nonPreferred: "docs/architecture.md" },
				config: { preferred: "src/config/env.settings.ts", nonPreferred: "tests/suite.test.ts" },
				error: { preferred: "src/errors/exceptions.ts", nonPreferred: "src/models/user.ts" },
				db: { preferred: "src/db/schema/migrations.ts", nonPreferred: "src/views/template.html" },
				util: { preferred: "src/utils/helpers/math.ts", nonPreferred: "dist/bundle.js" },
				test: { preferred: "test/unit/auth.test.ts", nonPreferred: "docs/manual.md" },
				wiki: { preferred: "docs/wiki/chapters/intro.md", nonPreferred: "src/index.ts" },
				card: { preferred: "cards/knowledge/facts.ts", nonPreferred: "node_modules/dep/index.js" },
				skill: { preferred: "skills/agents/procedures.ts", nonPreferred: "dist/cli.js" },
				commit: { preferred: ".git/commits/history.log", nonPreferred: "src/routes/api.ts" },
			};

			for (const arch of ALL_ARCHETYPES) {
				const sample = archetypeSamplePaths[arch];
				const baseScore = 10.0;

				const preferredResult = applyDomainPathBoost(sample.preferred, baseScore, arch);
				const nonPreferredResult = applyDomainPathBoost(sample.nonPreferred, baseScore, arch);

				expect(preferredResult.boostedScore).toBeGreaterThan(baseScore);
				expect(preferredResult.multiplier).toBeGreaterThan(1.0);
				expect(preferredResult.reason).toContain(DOMAIN_BOOST_PROFILES[arch].label);

				expect(nonPreferredResult.multiplier).toBeLessThan(preferredResult.multiplier);

				const desc = getArchetypeBoostDescription(arch);
				expect(desc).toContain(DOMAIN_BOOST_PROFILES[arch].label);
				expect(desc.length).toBeGreaterThan(15);
			}
		});
	});

	describe("Theme 2: Interactive Snippet Highlighter with Matched Term Color Accents (UX-0751 to UX-0760)", () => {
		it("highlights matched terms with ANSI accents, markdown, and card formatting across all 10 archetypes", () => {
			const sampleCorpus: Record<DomainArchetype, string> = {
				api: "export async function handleUserApiRoute(req, res) { return res.json({ ok: true }); }",
				config: "export const CONFIG_SETTINGS = { tokenBudget: 4000, enableDebug: true };",
				error: "export class ApiValidationError extends Error { statusCode = 400; code = 'ERR_INVALID'; }",
				db: "CREATE TABLE users (id UUID PRIMARY KEY, email TEXT NOT NULL, created_at TIMESTAMP);",
				util: "export function sanitizeSlug(input: string): string { return input.toLowerCase().trim(); }",
				test: "describe('Authentication Suite', () => { it('verifies bearer token', () => { expect(true).toBe(true); }); });",
				wiki: "# Architecture Overview\nThis chapter documents the distributed execution model.",
				card: "Knowledge Card: BM25 Lexical Ranking is parameterized by k1=1.2 and b=0.75.",
				skill: "procedure: autonomous-refactor\nstep 1: identify broken symbols\nstep 2: verify tests",
				commit: "commit e39b4479: feat(index): implement ast indexing and symbol lookup",
			};

			for (const arch of ALL_ARCHETYPES) {
				const text = sampleCorpus[arch];
				const terms = text.split(/\s+/).slice(1, 3); // pick 2 words as terms

				// 1. ANSI Highlight
				const ansiResult = highlightSnippet(text, terms, arch, { format: "ansi" });
				expect(ansiResult.matchCount).toBeGreaterThanOrEqual(1);
				expect(ansiResult.matchedTerms.length).toBeGreaterThanOrEqual(1);
				expect(ansiResult.formattedSnippet).toContain(DOMAIN_ACCENT_COLORS[arch]);
				expect(ansiResult.domain).toBe(arch);

				// 2. Markdown Highlight
				const mdResult = highlightSnippet(text, terms, arch, { format: "markdown" });
				expect(mdResult.formattedSnippet).toContain("**");

				// 3. Card Rendering
				const fakeHit: SearchHit = {
					score: 4.5,
					kind: "symbol",
					path: `packages/${arch}/src/sample.ts`,
					section: "main",
					title: `Sample ${arch} title`,
					heading: `Sample ${arch} heading`,
					line: 42,
					snippet: text,
					via: ["lexical"],
				};

				const card = renderSnippetHighlightCard({
					hit: fakeHit,
					queryTerms: terms,
					domain: arch,
				});

				expect(card).toContain(DOMAIN_BADGES[arch]);
				expect(card).toContain("L42:");
				expect(card).toContain("Matches:");
			}
		});
	});

	describe("Theme 3: Query Syntax Parser Supporting Boolean AND/OR/NOT & Filter Operators (UX-0761 to UX-0770)", () => {
		it("parses and evaluates complex boolean ASTs with AND, OR, NOT, phrases and domain filters", () => {
			for (const arch of ALL_ARCHETYPES) {
				const queryStr = `(token OR "exact secret") AND NOT deprecated type:${arch}`;
				const parsed = parseQuerySyntax(queryStr);

				expect(parsed.rawQuery).toBe(queryStr);
				expect(parsed.root.type).toBe("and");
				expect(parsed.positiveTerms).toContain("token");
				expect(parsed.exactPhrases).toContain("exact secret");
				expect(parsed.excludedTerms).toContain("deprecated");
				expect(parsed.filters.type).toContain(arch);

				// Test matching candidate
				const matchingCandidate = {
					text: `This passage contains token configuration and details for ${arch}`,
					path: `src/${arch}/handler.ts`,
					domain: arch,
				};
				expect(evaluateQueryAst(parsed.root, matchingCandidate)).toBe(true);

				// Test candidate containing negated term 'deprecated'
				const nonMatchingCandidate = {
					text: `This passage contains token but also deprecated code`,
					path: `src/${arch}/handler.ts`,
					domain: arch,
				};
				expect(evaluateQueryAst(parsed.root, nonMatchingCandidate)).toBe(false);

				// Pretty format AST
				const formatted = formatQueryAst(parsed.root);
				expect(formatted).toContain("AND");
				expect(formatted).toContain("NOT");
			}
		});
	});

	describe("Theme 4: Search History Dropdown / History Store Across 10 Archetypes (UX-0771 to UX-0780)", () => {
		it("records, aggregates frequency, and formats interactive dropdown cards for all 10 archetypes", () => {
			const store = new SearchHistoryStore(100);

			for (const arch of ALL_ARCHETYPES) {
				// Record multiple searches for each archetype
				store.record(`query ${arch} primary`, { domain: arch, resultCount: 12 });
				store.record(`query ${arch} primary`, { domain: arch, resultCount: 15 }); // duplicate to bump frequency
				store.record(`query ${arch} secondary`, { domain: arch, resultCount: 3 });

				const frequent = store.getFrequent(5, arch);
				expect(frequent.length).toBe(2);
				expect(frequent[0].query).toBe(`query ${arch} primary`);
				expect(frequent[0].frequency).toBe(2);
				expect(frequent[0].domain).toBe(arch);

				const dropdown = renderSearchHistoryDropdown(frequent, { domain: arch });
				expect(dropdown).toContain(DOMAIN_BADGES[arch]);
				expect(dropdown).toContain(`query ${arch} primary`);
				expect(dropdown).toContain("×2");
				expect(dropdown).toContain("(15 hits)");
			}

			expect(store.size()).toBe(ALL_ARCHETYPES.length * 2);

			// Test JSON serialization & round-trip
			const json = store.exportJson();
			expect(json).toContain("query api primary");

			const store2 = new SearchHistoryStore(100);
			store2.importJson(json);
			expect(store2.size()).toBe(store.size());
		});
	});

	describe("Theme 5: Reciprocal Rank Fusion (RRF) Score Visualizer (UX-0781 to UX-0790)", () => {
		it("generates archetype-specific RRF visualizer cards with formula transparency for all 10 archetypes", () => {
			for (const arch of ALL_ARCHETYPES) {
				const title = getArchetypeRrfExplanationTitle(arch);
				expect(title).toBe(ARCHETYPE_RRF_TITLES[arch]);

				const fakeHit: SearchHit = {
					score: 0.032,
					kind: "symbol",
					path: `src/${arch}/component.ts`,
					section: "exports",
					title: `Component ${arch}`,
					heading: `Definition ${arch}`,
					line: 18,
					snippet: "code snippet",
					via: ["lexical", "semantic"],
				};

				const explanation = buildScoreExplanation({
					hit: fakeHit,
					rawBm25: 3.25,
					terms: [{ term: "symbol", tf: 2, idf: 1.5, norm: 0.8, contribution: 3.25 }],
					quoteBonus: 2.5,
					matchedQuotes: ["symbol"],
					pathMultiplier: 1.45,
					pathReason: `Matches ${arch} domain pattern`,
					lexicalRank: 0,
					semanticRank: 1,
					cosineSimilarity: 0.89,
				});

				const card = renderArchetypeRrfVisualizer(explanation, arch);
				expect(card).toContain("RRF RANK VISUALIZER");
				expect(card).toContain(title);
				expect(card).toContain("BM25 Lexical Rank  : #1");
				expect(card).toContain("Semantic Vector Rank: #2");
				expect(card).toContain("Total Fused Score");
				expect(card).toContain("Feature Weight Proportions");
			}
		});
	});

	describe("Theme 6: Zero-Disk-Read Cached Search Session Across 10 Archetypes (UX-0791 to UX-0800)", () => {
		it("executes repeated search queries entirely in RAM with zero disk reads across all 10 archetypes", () => {
			const session = new ZeroDiskSearchSession(64, 60_000);

			const testDocs: Doc[] = [];
			const testChunks: Chunk[] = [];

			for (let i = 0; i < ALL_ARCHETYPES.length; i++) {
				const arch = ALL_ARCHETYPES[i];
				const path = `src/${arch}/example.ts`;
				const text = `This is the core implementation for ${arch} declarations and parameters.`;
				const kind: Kind = arch === "wiki" ? "wiki" : arch === "card" ? "card" : arch === "skill" ? "skill" : "symbol";
				testDocs.push({ path, kind, section: "main", title: `${arch} Doc`, hash: `h-${i}` });
				testChunks.push({
					doc: i,
					line: 1,
					heading: `${arch} Interface`,
					text,
				});
			}

			// Preload in-memory
			session.preload(testDocs, testChunks);

			for (const arch of ALL_ARCHETYPES) {
				// Query 1: Cache Miss, zero disk reads
				const res1 = session.search(arch, { domain: arch });
				expect(res1.diskReads).toBe(0);
				expect(res1.fromCache).toBe(false);
				expect(res1.hits.length).toBeGreaterThanOrEqual(1);
				expect(res1.hits[0].path).toContain(arch);

				// Query 2: Cache Hit, zero disk reads
				const res2 = session.search(arch, { domain: arch });
				expect(res2.diskReads).toBe(0);
				expect(res2.fromCache).toBe(true);
				expect(res2.hits.length).toBe(res1.hits.length);
			}

			const metrics = session.getMetrics();
			expect(metrics.diskReads).toBe(0);
			expect(metrics.totalQueries).toBe(ALL_ARCHETYPES.length * 2);
			expect(metrics.cacheHits).toBe(ALL_ARCHETYPES.length);
			expect(metrics.cacheMisses).toBe(ALL_ARCHETYPES.length);
			expect(metrics.hitRate).toBe(0.5);
			expect(metrics.inMemoryChunks).toBe(ALL_ARCHETYPES.length);

			for (const arch of ALL_ARCHETYPES) {
				expect(metrics.domainQueries[arch]).toBe(2);
			}

			// Invalidation clears cache without disk read
			session.invalidate();
			const resAfterInvalidate = session.search("api", { domain: "api" });
			expect(resAfterInvalidate.fromCache).toBe(false);
			expect(resAfterInvalidate.diskReads).toBe(0);
		});
	});
});
