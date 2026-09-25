import { describe, expect, it } from "vitest";
import {
	buildHistoricalStalenessGraph,
	detectOrphanedDocumentation,
	exportDriftComplianceReport,
	formatOrphanReportMarkdown,
	getOrphanRecommendation,
	instantZeroTokenStalenessCheck,
	isDriftWithinTolerance,
	stripComments,
	stripWhitespace,
} from "../src/index.ts";
import type { DocCategory, Provenance, StalenessReport } from "../src/types.ts";

const ALL_10_CATEGORIES: DocCategory[] = [
	"architecture",
	"cards",
	"subsystems",
	"procedures",
	"api",
	"data_models",
	"security",
	"runbooks",
	"benchmarks",
	"tutorials",
];

const SAMPLE_DOCS_BY_CATEGORY: Record<DocCategory, { doc: string; source: string }> = {
	architecture: { doc: "docs/arch/system_design.md", source: "src/core/kernel.ts" },
	cards: { doc: "cards/auth_module.md", source: "packages/auth/index.ts" },
	subsystems: { doc: "docs/subsystems/graph_edges.md", source: "src/subsystems/edges.ts" },
	procedures: { doc: "skills/release_procedure.md", source: "scripts/release_task.ts" },
	api: { doc: "api/routes/v1.md", source: "src/api/routes.ts" },
	data_models: { doc: "docs/data_models/schema.md", source: "src/models/user.ts" },
	security: { doc: "security/auth_shield.md", source: "src/security/token.ts" },
	runbooks: { doc: "runbooks/deploy_cluster.md", source: "deploy/helm_deploy.ts" },
	benchmarks: { doc: "benchmarks/perf_tuning.md", source: "src/perf/benchmarks.ts" },
	tutorials: { doc: "tutorials/onboarding_guide.md", source: "examples/quickstart.ts" },
	other: { doc: "misc/notes.md", source: "notes/todo.txt" },
};

describe("Step 22: Category 09 — Provenance, Staleness & Truth Drift Detection", () => {
	// =========================================================================
	// Block 1: Orphaned Documentation Detector (UX-0851 - UX-0860)
	// =========================================================================
	describe("Orphaned Documentation Detector (UX-0851 - UX-0860)", () => {
		for (const cat of ALL_10_CATEGORIES) {
			const info = SAMPLE_DOCS_BY_CATEGORY[cat];
			it(`[${cat}] detects orphaned document when source is deleted`, () => {
				const doc: Provenance = {
					document: info.doc,
					generatedAt: "2026-09-01T00:00:00Z",
					sources: [{ path: info.source, hash: "hash-initial" }],
				};

				// Code file was deleted (not present in currentFiles map)
				const currentFiles = new Map<string, string>([
					["other/active/file.ts", "hash-active"],
				]);

				const report = detectOrphanedDocumentation([doc], currentFiles);

				expect(report.totalOrphans).toBe(1);
				expect(report.orphans[0].document).toBe(info.doc);
				expect(report.orphans[0].category).toBe(cat);
				expect(report.orphans[0].missingSources).toContain(info.source);
				expect(report.byCategory[cat]).toHaveLength(1);
			});
		}

		it("suggests repointing when knownRenames are provided", () => {
			const renames = new Map<string, string>([
				["src/core/kernel.ts", "src/engine/kernel.ts"],
			]);
			const rec = getOrphanRecommendation(["src/core/kernel.ts"], renames);
			expect(rec.recommendation).toBe("repoint");
			expect(rec.explanation).toContain("src/core/kernel.ts -> src/engine/kernel.ts");
		});

		it("suggests archiving for legacy or deprecated paths", () => {
			const rec = getOrphanRecommendation(["legacy/v1/old_auth.ts"]);
			expect(rec.recommendation).toBe("archive");
		});

		it("formats a readable markdown report with table and category breakdown", () => {
			const docs: Provenance[] = [
				{
					document: "docs/arch/overview.md",
					generatedAt: "2026-09-01T00:00:00Z",
					sources: [{ path: "src/arch/old.ts", hash: "h1" }],
				},
				{
					document: "security/auth_card.md",
					generatedAt: "2026-09-01T00:00:00Z",
					sources: [{ path: "src/sec/removed.ts", hash: "h2" }],
				},
			];
			const report = detectOrphanedDocumentation(docs, new Map());
			const md = formatOrphanReportMarkdown(report);
			expect(md).toContain("# Orphaned Documentation Audit Report");
			expect(md).toContain("docs/arch/overview.md");
			expect(md).toContain("security/auth_card.md");
			expect(md).toContain("Breakdown by Category");
		});
	});

	// =========================================================================
	// Block 2: Historical Staleness Graph (UX-0861 - UX-0870)
	// =========================================================================
	describe("Historical Staleness Graph (UX-0861 - UX-0870)", () => {
		const testDocuments: Provenance[] = ALL_10_CATEGORIES.map((cat) => ({
			document: SAMPLE_DOCS_BY_CATEGORY[cat].doc,
			generatedAt: "2026-09-01T00:00:00Z",
			sources: [{ path: SAMPLE_DOCS_BY_CATEGORY[cat].source, hash: `hash-${cat}` }],
		}));

		it("tracks decay over snapshots for all 10 artifact types", () => {
			// Snapshot 1: All files present and match hash (100% fresh)
			const s1Hashes = new Map<string, string>(
				ALL_10_CATEGORIES.map((cat) => [SAMPLE_DOCS_BY_CATEGORY[cat].source, `hash-${cat}`]),
			);

			// Snapshot 2: Half the categories drift
			const s2Hashes = new Map<string, string>(
				ALL_10_CATEGORIES.map((cat, idx) => [
					SAMPLE_DOCS_BY_CATEGORY[cat].source,
					idx % 2 === 0 ? `hash-${cat}` : `hash-${cat}-modified`,
				]),
			);

			// Snapshot 3: Most categories drift
			const s3Hashes = new Map<string, string>(
				ALL_10_CATEGORIES.map((cat, idx) => [
					SAMPLE_DOCS_BY_CATEGORY[cat].source,
					idx === 0 ? `hash-${cat}` : `hash-${cat}-modified`,
				]),
			);

			const graph = buildHistoricalStalenessGraph([
				{ timestamp: "2026-09-01", label: "v1.0", documents: testDocuments, currentHashes: s1Hashes },
				{ timestamp: "2026-09-08", label: "v1.1", documents: testDocuments, currentHashes: s2Hashes },
				{ timestamp: "2026-09-15", label: "v1.2", documents: testDocuments, currentHashes: s3Hashes },
			]);

			expect(graph.points).toHaveLength(3);
			expect(graph.points[0].overallFreshness).toBe(100);
			expect(graph.points[2].overallFreshness).toBeLessThan(50);
			expect(graph.overallDecayVelocity).toBeGreaterThan(0);

			for (const cat of ALL_10_CATEGORIES) {
				const metric = graph.categoryDecay[cat];
				expect(metric).toBeDefined();
				expect(metric.category).toBe(cat);
				expect(metric.initialFreshness).toBe(100);
			}

			// Ascii sparkline rendering
			const sparkline = graph.renderAsciiSparkline();
			expect(sparkline).toContain("Overall: [100% ->");

			// Category specific sparkline
			const archSparkline = graph.renderAsciiSparkline("architecture");
			expect(archSparkline).toContain("architecture:");

			// Mermaid chart
			const mermaid = graph.renderMermaid();
			expect(mermaid).toContain("xychart-beta");
			expect(mermaid).toContain('"v1.0", "v1.1", "v1.2"');

			// Markdown summary
			const summary = graph.renderMarkdownSummary();
			expect(summary).toContain("Historical Documentation Staleness Decay Analysis");
			for (const cat of ALL_10_CATEGORIES) {
				expect(summary).toContain(`**${cat}**`);
			}
		});
	});

	// =========================================================================
	// Block 3: Configurable Tolerance Threshold (UX-0871 - UX-0880)
	// =========================================================================
	describe("Configurable Tolerance Threshold (UX-0871 - UX-0880)", () => {
		const baseCode = `
export function computeMetrics(input: number): number {
    return input * 2;
}
`;

		const commentEditedCode = `
// Updated calculation notes
/* Multi-line explanation */
export function computeMetrics(input: number): number {
    // Inline comment
    return input * 2;
}
`;

		const whitespaceEditedCode = `
export function computeMetrics(  input: number  ): number {


    return input * 2;
}
`;

		const semanticEditedCode = `
export function computeMetrics(input: number): number {
    return input * 3; // Changed logic from 2 to 3!
}
`;

		it("strips comments across styles correctly", () => {
			const stripped = stripComments("// line\n/* block */code # python\n-- lua");
			expect(stripped).not.toContain("line");
			expect(stripped).not.toContain("block");
			expect(stripped).not.toContain("python");
			expect(stripped).not.toContain("lua");
			expect(stripped).toContain("code");
		});

		it("strips whitespace cleanly", () => {
			const stripped = stripWhitespace("  a   b  \n\n  c  ");
			expect(stripped).toBe("a b c");
		});


		for (const cat of ALL_10_CATEGORIES) {
			it(`[${cat}] tolerates comment-only edits without false alarms`, () => {
				const evalResult = isDriftWithinTolerance(baseCode, commentEditedCode, cat);
				expect(evalResult.isTolerated).toBe(true);
				expect(evalResult.category).toBe(cat);
				expect(evalResult.detectedDriftKind).toBe("comment_only");
			});

			it(`[${cat}] tolerates whitespace-only edits without false alarms`, () => {
				const evalResult = isDriftWithinTolerance(baseCode, whitespaceEditedCode, cat);
				expect(evalResult.isTolerated).toBe(true);
				expect(evalResult.category).toBe(cat);
			});

			it(`[${cat}] detects and rejects real semantic code drift`, () => {
				const evalResult = isDriftWithinTolerance(baseCode, semanticEditedCode, cat);
				expect(evalResult.isTolerated).toBe(false);
				expect(evalResult.category).toBe(cat);
				expect(evalResult.detectedDriftKind).toBe("body_modified");
			});
		}
	});

	// =========================================================================
	// Block 4: Audit Log Export & Markdown Compliance Reports (UX-0881 - UX-0890)
	// =========================================================================
	describe("Drift Compliance Audit Log Export (UX-0881 - UX-0890)", () => {
		it("generates markdown drift compliance report for all 10 artifact types", () => {
			const mockReport: StalenessReport = {
				stale: [
					{
						document: "security/auth_shield.md",
						freshness: "stale",
						changed: ["src/security/token.ts"],
						deleted: [],
						unchanged: [],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "api/routes/v1.md",
						freshness: "stale",
						changed: ["src/api/routes.ts"],
						deleted: [],
						unchanged: [],
						generatedAt: "2026-09-01T00:00:00Z",
					},
				],
				current: [
					{
						document: "docs/arch/system_design.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["src/core/kernel.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "cards/auth_module.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["packages/auth/index.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "docs/subsystems/graph_edges.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["src/subsystems/edges.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "skills/release_procedure.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["scripts/release_task.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "docs/data_models/schema.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["src/models/user.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "runbooks/deploy_cluster.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["deploy/helm_deploy.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "benchmarks/perf_tuning.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["src/perf/benchmarks.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
					{
						document: "tutorials/onboarding_guide.md",
						freshness: "current",
						changed: [],
						deleted: [],
						unchanged: ["examples/quickstart.ts"],
						generatedAt: "2026-09-01T00:00:00Z",
					},
				],
				orphaned: [],
				documents: [],
				changedFiles: ["src/security/token.ts", "src/api/routes.ts"],
				deletedFiles: [],
				undocumentedFiles: [],
				freshness: 0.8,
				ok: false,
			};

			// Populate all documents
			mockReport.documents = [...mockReport.current, ...mockReport.stale];

			const compliance = exportDriftComplianceReport(mockReport, {
				targetFreshness: 80,
				title: "Enterprise Documentation Drift Audit",
			});

			expect(compliance.overallFreshness).toBe(80);
			expect(compliance.markdown).toContain("# Enterprise Documentation Drift Audit");
			expect(compliance.markdown).toContain("Documentation Category SLA Compliance Matrix");
			expect(compliance.markdown).toContain("Remediation Priority Queue");

			// Check all 10 categories are tracked in categories map
			for (const cat of ALL_10_CATEGORIES) {
				expect(compliance.categories[cat]).toBeDefined();
				expect(compliance.categories[cat].category).toBe(cat);
			}

			// Priorities should flag security as P0
			const p0Items = compliance.remediationPriorities.filter((p) => p.priority === "P0");
			expect(p0Items.some((p) => p.category === "security")).toBe(true);

			// API should be P1
			const p1Items = compliance.remediationPriorities.filter((p) => p.priority === "P1");
			expect(p1Items.some((p) => p.category === "api")).toBe(true);
		});
	});

	// =========================================================================
	// Block 5: Instant Zero-Token Staleness Check Under 50ms (UX-0891 - UX-0900)
	// =========================================================================
	describe("Instant Zero-Token Staleness Check Under 50ms (UX-0891 - UX-0900)", () => {
		const testDocuments: Provenance[] = ALL_10_CATEGORIES.map((cat) => ({
			document: SAMPLE_DOCS_BY_CATEGORY[cat].doc,
			generatedAt: "2026-09-01T00:00:00Z",
			sources: [{ path: SAMPLE_DOCS_BY_CATEGORY[cat].source, hash: `hash-${cat}` }],
		}));

		const currentHashes = new Map<string, string>(
			ALL_10_CATEGORIES.map((cat) => [SAMPLE_DOCS_BY_CATEGORY[cat].source, `hash-${cat}`]),
		);

		it("runs in under 50ms with 0 tokens for all 10 categories combined", () => {
			const result = instantZeroTokenStalenessCheck(testDocuments, currentHashes);

			expect(result.executionDurationMs).toBeLessThan(50);
			expect(result.ok).toBe(true);
			expect(result.overallFreshnessPercentage).toBe(100);
			expect(result.totalDocuments).toBe(10);

			for (const cat of ALL_10_CATEGORIES) {
				const catHealth = result.categories[cat];
				expect(catHealth).toBeDefined();
				expect(catHealth.freshnessPercentage).toBe(100);
				expect(catHealth.healthy).toBe(true);
			}
		});

		for (const cat of ALL_10_CATEGORIES) {
			it(`[${cat}] executes under 50ms specifically for category ${cat}`, () => {
				const result = instantZeroTokenStalenessCheck(testDocuments, currentHashes, cat);
				expect(result.executionDurationMs).toBeLessThan(50);
				expect(result.totalDocuments).toBe(1);
				expect(result.categories[cat].total).toBe(1);
				expect(result.categories[cat].healthy).toBe(true);
			});
		}

		it("detects stale and orphaned documents in instant check", () => {
			const driftedHashes = new Map<string, string>([
				// architecture modified
				[SAMPLE_DOCS_BY_CATEGORY.architecture.source, "modified-arch-hash"],
				// security deleted (missing)
			]);

			const result = instantZeroTokenStalenessCheck(testDocuments, driftedHashes);
			expect(result.executionDurationMs).toBeLessThan(50);
			expect(result.ok).toBe(false);
			expect(result.staleDocuments).toContain(SAMPLE_DOCS_BY_CATEGORY.architecture.doc);
			expect(result.orphanedDocuments).toContain(SAMPLE_DOCS_BY_CATEGORY.security.doc);
		});
	});
});
