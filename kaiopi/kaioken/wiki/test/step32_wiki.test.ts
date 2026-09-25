import { describe, expect, it } from "vitest";
import {
	ALL_WIKI_CHAPTER_KINDS,
	calculateChapterReadingMetrics,
	calculateWikiCoverageHeatmap,
	compareModelChapterGenerations,
	compileWikiIndex,
	formatDiagramBlock,
	formatModelGenerationComparison,
	inferWikiChapterKind,
	isWikiChapterKind,
	renderComplexityPill,
	renderDarkModeMarkdown,
	renderWikiCoverageHeatmap,
	renderWikiIndexMarkdown,
	WIKI_CHAPTER_METADATA,
	type Chapter,
	type ModelGenerationCandidate,
	type WikiChapterKind,
	type WikiDocument,
} from "../src/index.ts";

function createMockChapter(id: string, title: string, kind: WikiChapterKind, files: string[]): Chapter {
	return {
		id,
		title,
		goal: WIKI_CHAPTER_METADATA[kind].defaultGoal,
		files,
	};
}

function createMockDocument(chapter: Chapter, kind: WikiChapterKind, wordMultiplier = 1): WikiDocument {
	const codeSample = "```typescript\nexport function run() {\n  return 'ok';\n}\n```";
	const diagramSample = "```mermaid\ngraph TD\n  Client --> Gateway\n  Gateway --> Service\n```";

	const body = [
		`# ${chapter.title}`,
		"",
		`> ${chapter.goal}`,
		"",
		"## Overview & Mechanics",
		`This document details the ${kind} implementation and contract rules.`.repeat(10 * wordMultiplier),
		"",
		"## Implementation Code",
		codeSample,
		"",
		"## Architecture Flow",
		diagramSample,
		"",
		"## Declarations and Invariants",
		`Verified symbols: \`${chapter.id}Handler\`, \`${chapter.id}Config\`, \`${chapter.id}Manager\`.`,
	].join("\n");

	return {
		path: `${chapter.id}.md`,
		chapterId: chapter.id,
		title: chapter.title,
		body,
		provenance: {
			document: `${chapter.id}.md`,
			chapterId: chapter.id,
			generatedAt: "2026-09-25T12:00:00.000Z",
			sources: chapter.files.map((f) => ({ path: f, hash: `hash-${f}` })),
		},
		verification: {
			grounded: 3,
			defects: [],
			uncovered: [],
			coverage: 1,
		},
	};
}

describe("Step 32: Category 15 — Wiki Cascade, Chapter Generation & Documentation Web (UX-1451 to UX-1500)", () => {
	it("verifies all 10 canonical wiki chapter kinds are registered with valid metadata", () => {
		expect(ALL_WIKI_CHAPTER_KINDS).toHaveLength(10);
		for (const kind of ALL_WIKI_CHAPTER_KINDS) {
			expect(isWikiChapterKind(kind)).toBe(true);
			const meta = WIKI_CHAPTER_METADATA[kind];
			expect(meta).toBeDefined();
			expect(meta.defaultTitle.length).toBeGreaterThan(0);
			expect(meta.defaultGoal.length).toBeGreaterThan(0);
			expect(meta.readingOrder).toBeGreaterThan(0);
		}
	});

	// ========================================================================
	// Theme 1: Estimated reading time and complexity metric pill (UX-1451 to UX-1460)
	// ========================================================================
	describe("Theme 1: Estimated reading time and complexity metric pill (UX-1451 to UX-1460)", () => {
		it("[UX-1451] calculates reading time and complexity for getting started and onboarding chapter", () => {
			const content = "# Getting Started\nClone repo and run npm install.\n```bash\nnpm install\nnpm test\n```";
			const metrics = calculateChapterReadingMetrics(content, "getting-started");
			expect(metrics.chapterKind).toBe("getting-started");
			expect(metrics.readingTimeMinutes).toBeGreaterThanOrEqual(1);
			expect(metrics.complexity).toBe("Introductory");
			expect(metrics.complexityPill).toContain("min read");
		});

		it("[UX-1452] calculates reading time and complexity for system high-level architecture chapter", () => {
			const content = ("# High-Level Architecture\nSubsystem interactions and boundaries.\n" + "`symbol` ".repeat(150)).repeat(5);
			const metrics = calculateChapterReadingMetrics(content, "architecture");
			expect(metrics.readingTimeMinutes).toBeGreaterThanOrEqual(1);
			expect(["Intermediate", "Advanced"]).toContain(metrics.complexity);
		});

		it("[UX-1453] calculates reading time and complexity for data flow and pipeline lifecycle chapter", () => {
			const content = "# Data Flow\nPipeline stream transitions.\n```mermaid\nflowchart LR\n A --> B\n B --> C\n```";
			const metrics = calculateChapterReadingMetrics(content, "data-flow");
			expect(metrics.diagramCount).toBeGreaterThanOrEqual(1);
			expect(renderComplexityPill(metrics)).toContain("min read");
		});

		it("[UX-1454] calculates reading time and complexity for security, secrets, and auth chapter", () => {
			const content = "# Security & Auth\nToken cryptography and verification.\n" + "`token` ".repeat(80);
			const metrics = calculateChapterReadingMetrics(content, "security-auth");
			expect(metrics.complexityPill).toContain("min read");
		});

		it("[UX-1455] calculates reading time and complexity for database schema and persistence chapter", () => {
			const content = "# Database Schema\nTables and relational indexes.\n```sql\nCREATE TABLE users (id SERIAL PRIMARY KEY);\n```";
			const metrics = calculateChapterReadingMetrics(content, "db-persistence");
			expect(metrics.codeLineCount).toBeGreaterThan(0);
		});

		it("[UX-1456] calculates reading time and complexity for network protocols and API chapter", () => {
			const content = "# API Protocols\nHTTP endpoints and schema validation.\n" + "Word ".repeat(600);
			const metrics = calculateChapterReadingMetrics(content, "api-protocols");
			expect(metrics.readingTimeMinutes).toBeGreaterThanOrEqual(2);
		});

		it("[UX-1457] calculates reading time and complexity for background jobs and workers chapter", () => {
			const content = "# Background Workers\nQueue consumer pooling and scheduling.";
			const metrics = calculateChapterReadingMetrics(content, "background-jobs");
			expect(metrics.readingTimeMinutes).toBe(1);
		});

		it("[UX-1458] calculates reading time and complexity for deployment and CI/CD operations chapter", () => {
			const content = "# Deployment Pipeline\nContainer image build and test triggers.\n```yaml\njobs:\n  test:\n    runs-on: ubuntu-latest\n```";
			const metrics = calculateChapterReadingMetrics(content, "deployment-cicd");
			expect(metrics.codeLineCount).toBeGreaterThan(0);
		});

		it("[UX-1459] calculates reading time and complexity for error handling and observability chapter", () => {
			const content = "# Observability\nDistributed tracing and metrics exporter.\n" + "Metric ".repeat(1200);
			const metrics = calculateChapterReadingMetrics(content, "observability");
			expect(metrics.complexity).toBe("Advanced");
		});

		it("[UX-1460] calculates reading time and complexity for troubleshooting and diagnostic guide", () => {
			const content = "# Troubleshooting\nDiagnostic runbooks and emergency triage.";
			const metrics = calculateChapterReadingMetrics(content, "troubleshooting");
			expect(metrics.readingTimeMinutes).toBeGreaterThanOrEqual(1);
			expect(renderComplexityPill(metrics, { showWordCount: true })).toContain("words");
		});
	});

	// ========================================================================
	// Theme 2: Multi-model chapter generation comparison view (UX-1461 to UX-1470)
	// ========================================================================
	describe("Theme 2: Multi-model chapter generation comparison view (UX-1461 to UX-1470)", () => {
		function createCandidates(title: string): ModelGenerationCandidate[] {
			return [
				{
					modelId: "model-alpha-v1",
					chapterTitle: title,
					content: `# ${title}\n## Overview\nIntroduction.\n## Details\nDeep dive with \`symbol\` reference.\n## Code\n\`\`\`ts\nconst x = 1;\n\`\`\`\n## Summary\nEnd.`,
					groundingScore: 95,
				},
				{
					modelId: "model-beta-v2",
					chapterTitle: title,
					content: `# ${title}\nShort brief overview only.`,
					groundingScore: 70,
				},
			];
		}

		it("[UX-1461] compares model generations for getting started chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Getting Started"), "getting-started");
			expect(result.winningModelId).toBe("model-alpha-v1");
			expect(formatModelGenerationComparison(result)).toContain("model-alpha-v1");
		});

		it("[UX-1462] compares model generations for system high-level architecture chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("High-Level Architecture"), "architecture");
			expect(result.winningModelId).toBe("model-alpha-v1");
		});

		it("[UX-1463] compares model generations for data flow and pipeline lifecycle chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Data Flow Pipeline"), "data-flow");
			expect(result.candidates).toHaveLength(2);
		});

		it("[UX-1464] compares model generations for security, secrets, and auth chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Security & Secrets"), "security-auth");
			expect(result.chapterKind).toBe("security-auth");
		});

		it("[UX-1465] compares model generations for database schema and persistence chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Database Persistence"), "db-persistence");
			expect(result.winningModelId).toBe("model-alpha-v1");
		});

		it("[UX-1466] compares model generations for network protocols and API chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("API Protocols"), "api-protocols");
			expect(result.selectionReason).toContain("model-alpha-v1");
		});

		it("[UX-1467] compares model generations for background jobs and workers chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Background Workers"), "background-jobs");
			expect(result.winningModelId).toBe("model-alpha-v1");
		});

		it("[UX-1468] compares model generations for deployment and CI/CD operations chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("CI/CD Deployment"), "deployment-cicd");
			expect(result.candidates[0]?.overallScore).toBeGreaterThanOrEqual(result.candidates[1]?.overallScore ?? 0);
		});

		it("[UX-1469] compares model generations for error handling and observability chapter", () => {
			const result = compareModelChapterGenerations(createCandidates("Observability & Errors"), "observability");
			expect(result.winningModelId).toBe("model-alpha-v1");
		});

		it("[UX-1470] compares model generations for troubleshooting and diagnostic guide", () => {
			const result = compareModelChapterGenerations(createCandidates("Troubleshooting Guide"), "troubleshooting");
			const table = formatModelGenerationComparison(result, { unicode: false });
			expect(table).toContain("Troubleshooting Guide");
		});
	});

	// ========================================================================
	// Theme 3: Automated index.md summary generator compiling chapters (UX-1471 to UX-1480)
	// ========================================================================
	describe("Theme 3: Automated index.md summary generator compiling chapters (UX-1471 to UX-1480)", () => {
		const chapters: Chapter[] = ALL_WIKI_CHAPTER_KINDS.map((kind, idx) =>
			createMockChapter(`ch-${kind}`, `Chapter ${idx + 1}: ${WIKI_CHAPTER_METADATA[kind].defaultTitle}`, kind, [`src/${kind}.ts`]),
		);
		const documents: WikiDocument[] = chapters.map((ch, idx) =>
			createMockDocument(ch, ALL_WIKI_CHAPTER_KINDS[idx]!),
		);

		const wikiIndex = compileWikiIndex(chapters, documents, { repoTitle: "Test Monorepo Wiki" });

		it("[UX-1471] compiles index entry for getting started chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "getting-started");
			expect(entry).toBeDefined();
			expect(entry?.anchorLink).toContain("ch-getting-started");
		});

		it("[UX-1472] compiles index entry for system high-level architecture chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "architecture");
			expect(entry).toBeDefined();
		});

		it("[UX-1473] compiles index entry for data flow and pipeline lifecycle chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "data-flow");
			expect(entry).toBeDefined();
		});

		it("[UX-1474] compiles index entry for security, secrets, and auth chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "security-auth");
			expect(entry).toBeDefined();
		});

		it("[UX-1475] compiles index entry for database schema and persistence chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "db-persistence");
			expect(entry).toBeDefined();
		});

		it("[UX-1476] compiles index entry for network protocols and API chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "api-protocols");
			expect(entry).toBeDefined();
		});

		it("[UX-1477] compiles index entry for background jobs and workers chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "background-jobs");
			expect(entry).toBeDefined();
		});

		it("[UX-1478] compiles index entry for deployment and CI/CD operations chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "deployment-cicd");
			expect(entry).toBeDefined();
		});

		it("[UX-1479] compiles index entry for error handling and observability chapter", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "observability");
			expect(entry).toBeDefined();
		});

		it("[UX-1480] compiles index entry for troubleshooting guide and verifies index markdown", () => {
			const entry = wikiIndex.chapters.find((c) => c.kind === "troubleshooting");
			expect(entry).toBeDefined();
			expect(wikiIndex.readingPaths).toHaveLength(3);
			const md = renderWikiIndexMarkdown(wikiIndex);
			expect(md).toContain("# Test Monorepo Wiki");
			expect(md).toContain("Complete Table of Contents");
		});
	});

	// ========================================================================
	// Theme 4: Visual documentation coverage heatmap (UX-1481 to UX-1490)
	// ========================================================================
	describe("Theme 4: Visual documentation coverage heatmap (UX-1481 to UX-1490)", () => {
		const repoFiles = ALL_WIKI_CHAPTER_KINDS.map((k) => `src/${k}.ts`).concat(["src/uncovered_extra.ts"]);
		const chapters: Chapter[] = ALL_WIKI_CHAPTER_KINDS.map((kind, idx) =>
			createMockChapter(`ch-${kind}`, WIKI_CHAPTER_METADATA[kind].defaultTitle, kind, [`src/${kind}.ts`]),
		);
		const documents: WikiDocument[] = chapters.map((ch, idx) =>
			createMockDocument(ch, ALL_WIKI_CHAPTER_KINDS[idx]!),
		);

		const heatmap = calculateWikiCoverageHeatmap(chapters, documents, repoFiles);

		it("[UX-1481] calculates coverage for getting started chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "getting-started");
			expect(ch?.coveragePercentage).toBe(100);
		});

		it("[UX-1482] calculates coverage for system high-level architecture chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "architecture");
			expect(ch?.coverageRatio).toBe(1);
		});

		it("[UX-1483] calculates coverage for data flow and pipeline lifecycle chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "data-flow");
			expect(ch?.coveredFiles).toBe(1);
		});

		it("[UX-1484] calculates coverage for security, secrets, and auth chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "security-auth");
			expect(ch?.totalFiles).toBe(1);
		});

		it("[UX-1485] calculates coverage for database schema and persistence chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "db-persistence");
			expect(ch?.coveragePercentage).toBe(100);
		});

		it("[UX-1486] calculates coverage for network protocols and API chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "api-protocols");
			expect(ch?.coveredFiles).toBe(1);
		});

		it("[UX-1487] calculates coverage for background jobs and workers chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "background-jobs");
			expect(ch?.coveragePercentage).toBe(100);
		});

		it("[UX-1488] calculates coverage for deployment and CI/CD operations chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "deployment-cicd");
			expect(ch?.coveredFiles).toBe(1);
		});

		it("[UX-1489] calculates coverage for error handling and observability chapter", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "observability");
			expect(ch?.totalFiles).toBe(1);
		});

		it("[UX-1490] calculates coverage for troubleshooting guide and renders heatmap", () => {
			const ch = heatmap.chapters.find((c) => c.kind === "troubleshooting");
			expect(ch?.coveragePercentage).toBe(100);
			expect(heatmap.uncoveredFiles).toContain("src/uncovered_extra.ts");
			const table = renderWikiCoverageHeatmap(heatmap);
			expect(table).toContain("Coverage Heatmap");
			expect(table).toContain("Uncovered Files");
		});
	});

	// ========================================================================
	// Theme 5: Dark-mode optimized markdown renderer formatting diagrams (UX-1491 to UX-1500)
	// ========================================================================
	describe("Theme 5: Dark-mode optimized markdown renderer formatting diagrams (UX-1491 to UX-1500)", () => {
		it("[UX-1491] renders dark-mode markdown for getting started chapter", () => {
			const md = "# Getting Started\n> [!NOTE]\nWelcome!\n```bash\nnpm run dev\n```";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("GETTING STARTED");
			expect(rendered).toContain("[code: bash]");
		});

		it("[UX-1492] renders dark-mode diagram for system high-level architecture chapter", () => {
			const md = "```mermaid\ngraph TD\n  Client --> Gateway\n  Gateway --> Service\n```";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("[Diagram: Flow]");
			expect(rendered).toContain("Client");
			expect(rendered).toContain("Gateway");
		});

		it("[UX-1493] renders dark-mode diagram for data flow and pipeline lifecycle chapter", () => {
			const diagram = "Ingest --> Transform\nTransform --> Storage";
			const formatted = formatDiagramBlock(diagram, "pipeline");
			expect(formatted).toContain("Ingest");
			expect(formatted).toContain("Storage");
		});

		it("[UX-1494] renders dark-mode alert for security, secrets, and auth chapter", () => {
			const md = "> [!WARNING]\nNever commit production keys to git.";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("[WARNING]");
		});

		it("[UX-1495] renders dark-mode headers for database schema chapter", () => {
			const md = "## Database Relations\n### Indexes\nTable details.";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("Database Relations");
			expect(rendered).toContain("Indexes");
		});

		it("[UX-1496] renders dark-mode diagram for network protocols and API chapter", () => {
			const diagram = "HTTP_Client --> REST_API\nREST_API --> Cache";
			const formatted = formatDiagramBlock(diagram, "api");
			expect(formatted).toContain("HTTP_Client");
			expect(formatted).toContain("REST_API");
		});

		it("[UX-1497] renders dark-mode code frame for background jobs chapter", () => {
			const md = "```typescript\nconst job = new WorkerJob();\n```";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("[code: typescript]");
		});

		it("[UX-1498] renders dark-mode diagram for deployment and CI/CD operations chapter", () => {
			const diagram = "Commit --> Build\nBuild --> Test\nTest --> Deploy";
			const formatted = formatDiagramBlock(diagram, "cicd");
			expect(formatted).toContain("Commit");
			expect(formatted).toContain("Deploy");
		});

		it("[UX-1499] renders dark-mode alert for error handling and observability chapter", () => {
			const md = "> [!IMPORTANT]\nStructured JSON format is required for log ingestion.";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("[IMPORTANT]");
		});

		it("[UX-1500] renders dark-mode markdown for troubleshooting and diagnostic guide", () => {
			const md = "# Troubleshooting Guide\n---\nCheck error codes below.\n```text\nERROR_TIMEOUT: Restart daemon\n```";
			const rendered = renderDarkModeMarkdown(md);
			expect(rendered).toContain("TROUBLESHOOTING GUIDE");
			expect(rendered).toContain("[code: text]");
		});
	});
});
