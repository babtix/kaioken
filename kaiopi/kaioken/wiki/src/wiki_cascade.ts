import type { Chapter, WikiDocument } from "./types.ts";

/**
 * 10 Canonical Wiki Chapter Kinds (Category 15: Step 32, UX-1451 to UX-1500).
 */
export type WikiChapterKind =
	| "getting-started"
	| "architecture"
	| "data-flow"
	| "security-auth"
	| "db-persistence"
	| "api-protocols"
	| "background-jobs"
	| "deployment-cicd"
	| "observability"
	| "troubleshooting";

export const ALL_WIKI_CHAPTER_KINDS: readonly WikiChapterKind[] = [
	"getting-started",
	"architecture",
	"data-flow",
	"security-auth",
	"db-persistence",
	"api-protocols",
	"background-jobs",
	"deployment-cicd",
	"observability",
	"troubleshooting",
] as const;

export function isWikiChapterKind(val: unknown): val is WikiChapterKind {
	return typeof val === "string" && (ALL_WIKI_CHAPTER_KINDS as readonly string[]).includes(val);
}

export interface WikiChapterMeta {
	kind: WikiChapterKind;
	defaultTitle: string;
	defaultGoal: string;
	readingOrder: number;
	typicalFilePatterns: string[];
	defaultAudience: "All" | "Developers" | "Operators" | "Architects";
}

export const WIKI_CHAPTER_METADATA: Record<WikiChapterKind, WikiChapterMeta> = {
	"getting-started": {
		kind: "getting-started",
		defaultTitle: "Getting Started & Onboarding",
		defaultGoal: "Provide a friction-free onboarding path from repository clone to verified local run.",
		readingOrder: 1,
		typicalFilePatterns: ["README.md", "package.json", "scripts/", "docs/quickstart.md"],
		defaultAudience: "All",
	},
	"architecture": {
		kind: "architecture",
		defaultTitle: "System High-Level Architecture",
		defaultGoal: "Map high-level module boundaries, architectural layers, and subsystem interactions.",
		readingOrder: 2,
		typicalFilePatterns: ["src/index.ts", "packages/", "architecture.md"],
		defaultAudience: "Architects",
	},
	"data-flow": {
		kind: "data-flow",
		defaultTitle: "Data Flow & Pipeline Lifecycle",
		defaultGoal: "Trace data ingestion, transformation stages, state transitions, and sink persistence.",
		readingOrder: 3,
		typicalFilePatterns: ["pipeline/", "etl/", "stream/", "flow/"],
		defaultAudience: "Developers",
	},
	"security-auth": {
		kind: "security-auth",
		defaultTitle: "Security, Secrets & Auth",
		defaultGoal: "Document identity tokens, secret boundary handling, cryptographic verification, and RBAC.",
		readingOrder: 4,
		typicalFilePatterns: ["auth/", "security/", "crypto/", "middleware/auth.ts"],
		defaultAudience: "Architects",
	},
	"db-persistence": {
		kind: "db-persistence",
		defaultTitle: "Database Schema & Persistence",
		defaultGoal: "Detail table schemas, ORM models, relations, indices, and migration policies.",
		readingOrder: 5,
		typicalFilePatterns: ["db/", "models/", "migrations/", "schema.prisma", "schema.sql"],
		defaultAudience: "Developers",
	},
	"api-protocols": {
		kind: "api-protocols",
		defaultTitle: "Network Protocols & API",
		defaultGoal: "Specify HTTP, WebSocket, RPC endpoints, wire formats, and status contract guarantees.",
		readingOrder: 6,
		typicalFilePatterns: ["routes/", "api/", "controllers/", "proto/", "openapi.json"],
		defaultAudience: "Developers",
	},
	"background-jobs": {
		kind: "background-jobs",
		defaultTitle: "Background Jobs & Workers",
		defaultGoal: "Detail asynchronous task queues, scheduling crons, worker pools, and idempotency.",
		readingOrder: 7,
		typicalFilePatterns: ["jobs/", "workers/", "queues/", "scheduler/"],
		defaultAudience: "Operators",
	},
	"deployment-cicd": {
		kind: "deployment-cicd",
		defaultTitle: "Deployment & CI/CD Operations",
		defaultGoal: "Guide container builds, pipeline stages, deployment manifests, and release automation.",
		readingOrder: 8,
		typicalFilePatterns: [".github/workflows/", "Dockerfile", "k8s/", "deploy/"],
		defaultAudience: "Operators",
	},
	"observability": {
		kind: "observability",
		defaultTitle: "Error Handling & Observability",
		defaultGoal: "Document structured logging formats, distributed traces, metrics, and alert triggers.",
		readingOrder: 9,
		typicalFilePatterns: ["logger/", "metrics/", "telemetry/", "observability/"],
		defaultAudience: "Operators",
	},
	"troubleshooting": {
		kind: "troubleshooting",
		defaultTitle: "Troubleshooting & Diagnostic Guide",
		defaultGoal: "Catalog known failure modes, error codes, recovery runbooks, and diagnostic commands.",
		readingOrder: 10,
		typicalFilePatterns: ["diagnostics/", "troubleshooting.md", "runbooks/"],
		defaultAudience: "All",
	},
};

/**
 * Infer wiki chapter kind from id, title, or content.
 */
export function inferWikiChapterKind(
	idOrTitle: string,
	content?: string,
): WikiChapterKind {
	const text = `${idOrTitle} ${content ?? ""}`.toLowerCase();

	if (text.includes("onboard") || text.includes("getting-started") || text.includes("getting started") || text.includes("quickstart")) {
		return "getting-started";
	}
	if (text.includes("architecture") || text.includes("high-level") || text.includes("system overview")) {
		return "architecture";
	}
	if (text.includes("data flow") || text.includes("data-flow") || text.includes("pipeline") || text.includes("etl") || text.includes("stream")) {
		return "data-flow";
	}
	if (text.includes("security") || text.includes("secret") || text.includes("auth") || text.includes("crypto") || text.includes("token")) {
		return "security-auth";
	}
	if (text.includes("database") || text.includes("schema") || text.includes("persistence") || text.includes("orm") || text.includes("migration")) {
		return "db-persistence";
	}
	if (text.includes("protocol") || text.includes("api") || text.includes("route") || text.includes("endpoint") || text.includes("network")) {
		return "api-protocols";
	}
	if (text.includes("worker") || text.includes("job") || text.includes("background") || text.includes("queue") || text.includes("cron")) {
		return "background-jobs";
	}
	if (text.includes("deploy") || text.includes("ci/cd") || text.includes("cicd") || text.includes("docker") || text.includes("k8s")) {
		return "deployment-cicd";
	}
	if (text.includes("observability") || text.includes("metric") || text.includes("telemetry") || text.includes("tracing") || text.includes("logging")) {
		return "observability";
	}
	if (text.includes("troubleshoot") || text.includes("diagnostic") || text.includes("runbook") || text.includes("faq")) {
		return "troubleshooting";
	}

	return "architecture";
}

// ============================================================================
// THEME 1: Estimated Reading Time and Complexity Metric Pill (UX-1451 to UX-1460)
// ============================================================================

export type ComplexityLevel = "Introductory" | "Intermediate" | "Advanced";

export interface ChapterReadingMetrics {
	chapterKind: WikiChapterKind;
	wordCount: number;
	codeLineCount: number;
	diagramCount: number;
	readingTimeMinutes: number;
	complexity: ComplexityLevel;
	complexityPill: string;
	jargonDensityRatio: number;
}

export interface PillRenderOptions {
	unicode?: boolean;
	showWordCount?: boolean;
	showComplexityIcon?: boolean;
}

/**
 * Calculate estimated reading time and technical complexity metrics.
 */
export function calculateChapterReadingMetrics(
	content: string,
	chapterKind?: WikiChapterKind,
): ChapterReadingMetrics {
	const resolvedKind = chapterKind ?? inferWikiChapterKind(content.slice(0, 100), content);

	const words = content.split(/\s+/).filter(Boolean);
	const wordCount = words.length;

	// Count code lines within ``` blocks
	let codeLineCount = 0;
	let diagramCount = 0;
	const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
	let match: RegExpExecArray | null;
	while ((match = codeBlockRegex.exec(content)) !== null) {
		const lang = (match[1] ?? "").toLowerCase();
		const blockContent = match[2] ?? "";
		const lines = blockContent.split("\n").length;
		codeLineCount += lines;

		if (lang === "mermaid" || lang === "graph" || lang === "flowchart" || blockContent.includes("-->") || blockContent.includes("->")) {
			diagramCount++;
		}
	}

	// Prose reading time: 200 words/min; Code inspection: 80-100 lines/min
	const proseMinutes = wordCount / 200;
	const codeMinutes = codeLineCount / 80;
	const readingTimeMinutes = Math.max(1, Math.ceil(proseMinutes + codeMinutes));

	// Strip code blocks before checking inline backtick citations
	const strippedOfCode = content.replace(/```[\s\S]*?```/g, "");
	const backtickedMatches = strippedOfCode.match(/`([^`\n]+)`/g);
	const backtickedCount = backtickedMatches ? backtickedMatches.length : 0;
	const proseWords = strippedOfCode.split(/\s+/).filter(Boolean).length;
	const jargonDensityRatio = proseWords > 0 ? Math.min(1, backtickedCount / (proseWords / 4)) : 0;

	let complexity: ComplexityLevel = "Introductory";
	if (wordCount > 1000 || codeLineCount > 50 || jargonDensityRatio > 0.35 || diagramCount > 1) {
		complexity = "Advanced";
	} else if (wordCount > 400 || codeLineCount > 12 || jargonDensityRatio > 0.15) {
		complexity = "Intermediate";
	}

	const pill = renderComplexityPill({
		chapterKind: resolvedKind,
		wordCount,
		codeLineCount,
		diagramCount,
		readingTimeMinutes,
		complexity,
		jargonDensityRatio,
	});

	return {
		chapterKind: resolvedKind,
		wordCount,
		codeLineCount,
		diagramCount,
		readingTimeMinutes,
		complexity,
		complexityPill: pill,
		jargonDensityRatio,
	};
}

/**
 * Render visual estimated reading time and complexity metric pill.
 */
export function renderComplexityPill(
	metrics: Omit<ChapterReadingMetrics, "complexityPill">,
	options: PillRenderOptions = {},
): string {
	const u = options.unicode ?? true;
	const showWords = options.showWordCount ?? false;
	const showIcon = options.showComplexityIcon ?? true;

	const timeIcon = u ? "⏱ " : "";
	let compIcon = "";
	if (showIcon && u) {
		if (metrics.complexity === "Introductory") compIcon = "🟢 ";
		else if (metrics.complexity === "Intermediate") compIcon = "🟡 ";
		else compIcon = "🔴 ";
	}

	const wordsSegment = showWords ? ` | ${metrics.wordCount} words` : "";
	return `[${timeIcon}${metrics.readingTimeMinutes} min read | ${compIcon}${metrics.complexity}${wordsSegment}]`;
}

// ============================================================================
// THEME 2: Multi-Model Chapter Generation Comparison View (UX-1461 to UX-1470)
// ============================================================================

export interface ModelGenerationCandidate {
	modelId: string;
	chapterTitle: string;
	content: string;
	tokensUsed?: number;
	latencyMs?: number;
	groundingScore?: number; // 0 - 100
}

export interface CandidateEvaluation {
	modelId: string;
	wordCount: number;
	headingsCount: number;
	codeBlocksCount: number;
	citationsCount: number;
	readingTimeMinutes: number;
	groundingScore: number;
	structuralScore: number; // 0 - 100
	overallScore: number; // 0 - 100
	pros: string[];
	cons: string[];
}

export interface ModelComparisonResult {
	chapterKind: WikiChapterKind;
	chapterTitle?: string;
	candidates: CandidateEvaluation[];
	winningModelId: string;
	selectionReason: string;
}

/**
 * Compare multiple model candidate outputs for a wiki chapter.
 */
export function compareModelChapterGenerations(
	candidates: ModelGenerationCandidate[],
	chapterKind?: WikiChapterKind,
): ModelComparisonResult {
	if (candidates.length === 0) {
		throw new Error("Cannot compare empty candidates list.");
	}

	const resolvedKind = chapterKind ?? inferWikiChapterKind(candidates[0]?.chapterTitle ?? "Chapter", candidates[0]?.content);

	const evaluations: CandidateEvaluation[] = candidates.map((cand) => {
		const words = cand.content.split(/\s+/).filter(Boolean);
		const wordCount = words.length;
		const headingsCount = (cand.content.match(/^#{1,4}\s+.+$/gm) || []).length;
		const codeBlocksCount = (cand.content.match(/```[a-zA-Z0-9_-]*\n/g) || []).length;
		const citationsCount = (cand.content.match(/`[^`]+`/g) || []).length;
		const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

		// Structural score based on headings, code examples, length
		let structuralScore = 50;
		if (headingsCount >= 3) structuralScore += 20;
		if (codeBlocksCount >= 1) structuralScore += 15;
		if (wordCount >= 400 && wordCount <= 2500) structuralScore += 15;
		structuralScore = Math.min(100, structuralScore);

		const groundingScore = cand.groundingScore ?? 85;
		const overallScore = Math.round(groundingScore * 0.6 + structuralScore * 0.4);

		const pros: string[] = [];
		const cons: string[] = [];

		if (groundingScore >= 90) pros.push("High citation grounding and factual accuracy");
		else if (groundingScore < 70) cons.push("Multiple ungrounded assertions detected");

		if (headingsCount >= 4) pros.push("Well-structured thematic section headings");
		else cons.push("Minimal section heading hierarchy");

		if (codeBlocksCount >= 2) pros.push("Concrete code/diagram snippets provided");
		else cons.push("Lacks practical code examples");

		return {
			modelId: cand.modelId,
			wordCount,
			headingsCount,
			codeBlocksCount,
			citationsCount,
			readingTimeMinutes,
			groundingScore,
			structuralScore,
			overallScore,
			pros,
			cons,
		};
	});

	// Select highest overall score candidate
	evaluations.sort((a, b) => b.overallScore - a.overallScore);
	const winner = evaluations[0]!;
	const chapterTitle = candidates[0]?.chapterTitle ?? WIKI_CHAPTER_METADATA[resolvedKind].defaultTitle;

	return {
		chapterKind: resolvedKind,
		chapterTitle,
		candidates: evaluations,
		winningModelId: winner.modelId,
		selectionReason: `Selected ${winner.modelId} with overall score ${winner.overallScore}% (Grounding: ${winner.groundingScore}%, Structural: ${winner.structuralScore}%).`,
	};
}

/**
 * Format multi-model generation comparison view for terminal review.
 */
export function formatModelGenerationComparison(
	result: ModelComparisonResult,
	options: { unicode?: boolean } = {},
): string {
	const u = options.unicode ?? true;
	const lines: string[] = [];
	const border = u ? "═".repeat(78) : "=".repeat(78);

	lines.push(border);
	const titleSuffix = result.chapterTitle ? ` — ${result.chapterTitle}` : "";
	lines.push(`Multi-Model Chapter Generation Comparison [${result.chapterKind.toUpperCase()}]${titleSuffix}`);
	lines.push(`Evaluation Winner: 🏆 ${result.winningModelId} | ${result.selectionReason}`);
	lines.push("─".repeat(78));

	lines.push(
		"Model ID".padEnd(20, " ") +
		"Score".padEnd(10, " ") +
		"Grounding".padEnd(12, " ") +
		"Structure".padEnd(12, " ") +
		"Words".padEnd(10, " ") +
		"Code Blks".padEnd(12, " "),
	);
	lines.push("─".repeat(78));

	for (const cand of result.candidates) {
		const isWin = cand.modelId === result.winningModelId ? (u ? "★ " : "* ") : "  ";
		const row =
			`${isWin}${cand.modelId}`.padEnd(20, " ") +
			`${cand.overallScore}%`.padEnd(10, " ") +
			`${cand.groundingScore}%`.padEnd(12, " ") +
			`${cand.structuralScore}%`.padEnd(12, " ") +
			`${cand.wordCount}`.padEnd(10, " ") +
			`${cand.codeBlocksCount}`.padEnd(12, " ");
		lines.push(row);
	}

	lines.push("─".repeat(78));
	lines.push("Top Candidate Highlights:");
	const top = result.candidates[0]!;
	for (const p of top.pros) lines.push(`  + ${p}`);
	for (const c of top.cons) lines.push(`  - ${c}`);
	lines.push(border);

	return lines.join("\n");
}

// ============================================================================
// THEME 3: Automated index.md Summary Generator Compiling Chapters (UX-1471 to UX-1480)
// ============================================================================

export interface ChapterDigest {
	id: string;
	title: string;
	kind: WikiChapterKind;
	goal: string;
	readingTimeMinutes: number;
	complexityPill: string;
	fileCount: number;
	anchorLink: string;
}

export interface WikiReadingPath {
	name: string;
	description: string;
	chapterIds: string[];
}

export interface WikiIndexResult {
	repoTitle: string;
	generatedAt: string;
	totalChapters: number;
	totalEstimatedMinutes: number;
	chapters: ChapterDigest[];
	readingPaths: WikiReadingPath[];
	indexMarkdown: string;
}

export interface IndexCompileOptions {
	repoTitle?: string;
	baseUrl?: string;
}

/**
 * Compile wiki index summarizing all chapters into structured index.md.
 */
export function compileWikiIndex(
	chapters: readonly Chapter[],
	documents: readonly WikiDocument[] = [],
	options: IndexCompileOptions = {},
): WikiIndexResult {
	const repoTitle = options.repoTitle ?? "Repository Knowledge Base";
	const docsById = new Map<string, WikiDocument>(documents.map((d) => [d.chapterId, d]));

	let totalEstimatedMinutes = 0;
	const chapterDigests: ChapterDigest[] = chapters.map((ch, idx) => {
		const kind = inferWikiChapterKind(ch.id, ch.title);
		const doc = docsById.get(ch.id);
		const content = doc ? doc.body : `${ch.title}\n\n${ch.goal}`;
		const metrics = calculateChapterReadingMetrics(content, kind);

		totalEstimatedMinutes += metrics.readingTimeMinutes;
		const anchorLink = `./${ch.id}.md`;

		return {
			id: ch.id,
			title: ch.title || `Chapter ${idx + 1}`,
			kind,
			goal: ch.goal || WIKI_CHAPTER_METADATA[kind].defaultGoal,
			readingTimeMinutes: metrics.readingTimeMinutes,
			complexityPill: metrics.complexityPill,
			fileCount: ch.files.length,
			anchorLink,
		};
	});

	const readingPaths: WikiReadingPath[] = [
		{
			name: "🚀 Fast Onboarding Track",
			description: "Essential orientation for contributors and new engineers.",
			chapterIds: chapterDigests
				.filter((c) => c.kind === "getting-started" || c.kind === "architecture" || c.kind === "troubleshooting")
				.map((c) => c.id),
		},
		{
			name: "🏗 Core Architecture Deep Dive",
			description: "Comprehensive systems design, data pipelines, schema contracts, and APIs.",
			chapterIds: chapterDigests
				.filter((c) => ["architecture", "data-flow", "db-persistence", "api-protocols", "security-auth"].includes(c.kind))
				.map((c) => c.id),
		},
		{
			name: "🛡 Operations & Diagnostics Track",
			description: "Production operations, background queues, observability, and failure recovery.",
			chapterIds: chapterDigests
				.filter((c) => ["deployment-cicd", "background-jobs", "observability", "troubleshooting"].includes(c.kind))
				.map((c) => c.id),
		},
	];

	const md = renderWikiIndexMarkdown({
		repoTitle,
		generatedAt: new Date().toISOString(),
		totalChapters: chapters.length,
		totalEstimatedMinutes,
		chapters: chapterDigests,
		readingPaths,
	});

	return {
		repoTitle,
		generatedAt: new Date().toISOString(),
		totalChapters: chapters.length,
		totalEstimatedMinutes,
		chapters: chapterDigests,
		readingPaths,
		indexMarkdown: md,
	};
}

/**
 * Render Markdown content for index.md.
 */
export function renderWikiIndexMarkdown(result: Omit<WikiIndexResult, "indexMarkdown">): string {
	const lines: string[] = [
		`# ${result.repoTitle}`,
		"",
		`> Generated living repository wiki across **${result.totalChapters} chapters** (~${result.totalEstimatedMinutes} min total reading time).`,
		"",
		"## 🧭 Curated Reading Tracks",
		"",
	];

	for (const track of result.readingPaths) {
		lines.push(`### ${track.name}`);
		lines.push(track.description);
		lines.push("");
		const trackLinks = track.chapterIds
			.map((id) => {
				const ch = result.chapters.find((c) => c.id === id);
				return ch ? `[${ch.title}](${ch.anchorLink})` : id;
			})
			.join(" → ");
		lines.push(`**Flow**: ${trackLinks}`);
		lines.push("");
	}

	lines.push("## 📚 Complete Table of Contents");
	lines.push("");

	for (let i = 0; i < result.chapters.length; i++) {
		const ch = result.chapters[i]!;
		lines.push(`### ${i + 1}. [${ch.title}](${ch.anchorLink}) ${ch.complexityPill}`);
		lines.push(`- **Scope**: ${ch.goal}`);
		lines.push(`- **Sources**: ${ch.fileCount} source file(s) analyzed.`);
		lines.push("");
	}

	lines.push("---");
	lines.push(`*Wiki generated at: ${result.generatedAt.slice(0, 19).replace("T", " ")}*`);

	return lines.join("\n");
}

// ============================================================================
// THEME 4: Visual Documentation Coverage Heatmap (UX-1481 to UX-1490)
// ============================================================================

export interface ChapterCoverageStat {
	chapterId: string;
	title: string;
	kind: WikiChapterKind;
	totalFiles: number;
	coveredFiles: number;
	coverageRatio: number;
	coveragePercentage: number;
	readingTimeMinutes: number;
	complexityPill: string;
}

export interface WikiCoverageHeatmapResult {
	totalRepoFiles: number;
	coveredFilesCount: number;
	overallCoveragePercentage: number;
	chapters: ChapterCoverageStat[];
	uncoveredFiles: string[];
}

export interface CoverageHeatmapOptions {
	unicode?: boolean;
	barWidth?: number;
}

/**
 * Calculate documentation coverage across wiki chapters.
 */
export function calculateWikiCoverageHeatmap(
	chapters: readonly Chapter[],
	documents: readonly WikiDocument[],
	repoFiles: string[],
): WikiCoverageHeatmapResult {
	const coveredSet = new Set<string>();

	for (const doc of documents) {
		for (const src of doc.provenance.sources) {
			coveredSet.add(src.path);
		}
	}

	// Also collect from chapter assigned files
	for (const ch of chapters) {
		for (const f of ch.files) {
			if (repoFiles.includes(f)) coveredSet.add(f);
		}
	}

	const coveredFilesCount = repoFiles.filter((f) => coveredSet.has(f)).length;
	const totalRepoFiles = Math.max(1, repoFiles.length);
	const overallCoveragePercentage = Math.round((coveredFilesCount / totalRepoFiles) * 100);

	const chapterStats: ChapterCoverageStat[] = chapters.map((ch) => {
		const kind = inferWikiChapterKind(ch.id, ch.title);
		const totalFiles = ch.files.length;
		const covered = ch.files.filter((f) => coveredSet.has(f)).length;
		const ratio = totalFiles > 0 ? covered / totalFiles : 1.0;
		const pct = Math.round(ratio * 100);

		const doc = documents.find((d) => d.chapterId === ch.id);
		const content = doc ? doc.body : `${ch.title}\n\n${ch.goal}`;
		const metrics = calculateChapterReadingMetrics(content, kind);

		return {
			chapterId: ch.id,
			title: ch.title,
			kind,
			totalFiles,
			coveredFiles: covered,
			coverageRatio: ratio,
			coveragePercentage: pct,
			readingTimeMinutes: metrics.readingTimeMinutes,
			complexityPill: metrics.complexityPill,
		};
	});

	const uncoveredFiles = repoFiles.filter((f) => !coveredSet.has(f));

	return {
		totalRepoFiles: repoFiles.length,
		coveredFilesCount,
		overallCoveragePercentage,
		chapters: chapterStats,
		uncoveredFiles,
	};
}

/**
 * Render visual documentation coverage heatmap table.
 */
export function renderWikiCoverageHeatmap(
	heatmap: WikiCoverageHeatmapResult,
	options: CoverageHeatmapOptions = {},
): string {
	const u = options.unicode ?? true;
	const barWidth = options.barWidth ?? 10;
	const lines: string[] = [];

	lines.push(
		`Repository Wiki Coverage Heatmap — Overall: ${heatmap.overallCoveragePercentage}% (${heatmap.coveredFilesCount}/${heatmap.totalRepoFiles} files)`,
	);
	lines.push("─".repeat(78));

	for (const ch of heatmap.chapters) {
		const filled = Math.round(ch.coverageRatio * barWidth);
		const empty = barWidth - filled;
		const fillChar = u ? "█" : "#";
		const emptyChar = u ? "░" : "-";
		const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
		const pctStr = `${ch.coveragePercentage}%`.padStart(4, " ");

		const idTag = `[${ch.chapterId}]`.padEnd(16, " ");
		const titleTrunc = ch.title.length > 20 ? `${ch.title.slice(0, 17)}...` : ch.title.padEnd(20, " ");
		const filesStat = `${ch.coveredFiles}/${ch.totalFiles} files`.padStart(11, " ");

		lines.push(`${idTag} ${titleTrunc} [${bar}] ${pctStr} ${filesStat}  ${ch.complexityPill}`);
	}

	lines.push("─".repeat(78));
	if (heatmap.uncoveredFiles.length > 0) {
		lines.push(
			`Uncovered Files (${heatmap.uncoveredFiles.length}): ${heatmap.uncoveredFiles.slice(0, 3).join(", ")}${heatmap.uncoveredFiles.length > 3 ? ` ... and ${heatmap.uncoveredFiles.length - 3} more` : ""}`,
		);
	} else {
		lines.push("✔ 100% of repository files are documented across wiki chapters.");
	}

	return lines.join("\n");
}

// ============================================================================
// THEME 5: Dark-Mode Optimized Markdown Renderer Formatting Diagrams (UX-1491 to UX-1500)
// ============================================================================

export interface DarkModeRenderOptions {
	unicode?: boolean;
	colorize?: boolean;
	maxWidth?: number;
}

/**
 * Specialized dark-mode terminal markdown renderer with diagram formatting.
 */
export function renderDarkModeMarkdown(
	markdown: string,
	options: DarkModeRenderOptions = {},
): string {
	const u = options.unicode ?? true;
	const lines = markdown.split("\n");
	const output: string[] = [];

	let inCodeBlock = false;
	let codeBlockLang = "";
	let codeBlockLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] ?? "";

		// Code block toggle
		if (line.trim().startsWith("```")) {
			if (!inCodeBlock) {
				inCodeBlock = true;
				codeBlockLang = line.trim().slice(3).trim();
				codeBlockLines = [];
			} else {
				inCodeBlock = false;
				const blockText = codeBlockLines.join("\n");
				if (
					codeBlockLang === "mermaid" ||
					codeBlockLang === "graph" ||
					codeBlockLang === "flowchart" ||
					blockText.includes("-->") ||
					blockText.includes("->")
				) {
					output.push(formatDiagramBlock(blockText, codeBlockLang, { unicode: u }));
				} else {
					// Formatted dark-mode code frame
					const topBorder = u ? `┌─ [code: ${codeBlockLang || "text"}] ` : `+- [code: ${codeBlockLang || "text"}] `;
					output.push(`${topBorder}${(u ? "─" : "-").repeat(Math.max(4, 50 - topBorder.length))}`);
					for (const cl of codeBlockLines) {
						output.push(`│  ${cl}`);
					}
					output.push(u ? `└${"─".repeat(50)}` : `+${"-".repeat(50)}`);
				}
			}
			continue;
		}

		if (inCodeBlock) {
			codeBlockLines.push(line);
			continue;
		}

		// Alerts / Callouts
		if (line.startsWith("> [!NOTE]") || line.startsWith("> [!TIP]") || line.startsWith("> [!IMPORTANT]") || line.startsWith("> [!WARNING]")) {
			const alertKind = line.match(/> \[!([A-Z]+)\]/)?.[1] ?? "NOTE";
			const border = u ? "┃" : "|";
			output.push(`${border} [${alertKind}]`);
			continue;
		}

		// Headers
		if (line.startsWith("# ")) {
			const text = line.slice(2).trim();
			output.push("");
			output.push(u ? `█▀▀ ${text.toUpperCase()}` : `*** ${text.toUpperCase()} ***`);
			output.push(u ? "▀".repeat(Math.max(10, text.length + 4)) : "-".repeat(Math.max(10, text.length + 8)));
			continue;
		}
		if (line.startsWith("## ")) {
			const text = line.slice(3).trim();
			output.push("");
			output.push(u ? `▌ ${text}` : `## ${text}`);
			output.push(u ? "─".repeat(Math.max(8, text.length + 2)) : "-".repeat(Math.max(8, text.length + 2)));
			continue;
		}
		if (line.startsWith("### ")) {
			const text = line.slice(4).trim();
			output.push(u ? `▶ ${text}` : `### ${text}`);
			continue;
		}

		// Horizontal rule
		if (line.trim() === "---" || line.trim() === "***") {
			output.push(u ? "─".repeat(60) : "-".repeat(60));
			continue;
		}

		output.push(line);
	}

	return output.join("\n");
}

/**
 * Format flowchart / sequence diagram into a styled dark-mode box diagram.
 */
export function formatDiagramBlock(
	diagramText: string,
	diagramType = "flowchart",
	options: { unicode?: boolean } = {},
): string {
	const u = options.unicode ?? true;
	const lines: string[] = [];

	const cTopLeft = u ? "┌" : "+";
	const cTopRight = u ? "┐" : "+";
	const cBottomLeft = u ? "└" : "+";
	const cBottomRight = u ? "┘" : "+";
	const cHoriz = u ? "─" : "-";
	const cVert = u ? "│" : "|";
	const arrow = u ? " ▼ " : " | ";

	const typeLabel = (diagramType === "mermaid" || !diagramType) ? "Flow" : diagramType;
	lines.push(`${cTopLeft}${cHoriz.repeat(2)} [Diagram: ${typeLabel}] ${cHoriz.repeat(30)}${cTopRight}`);

	// Parse simple A --> B connections
	const connections: Array<{ from: string; to: string; label?: string }> = [];
	const rawLines = diagramText.split("\n");

	for (const raw of rawLines) {
		const trimmed = raw.trim();
		if (!trimmed || trimmed.startsWith("graph") || trimmed.startsWith("flowchart")) continue;

		const arrowMatch = trimmed.match(/^([^-\->]+)(?:-->|->)(?:\|([^|]+)\|)?\s*(.+)$/);
		if (arrowMatch) {
			connections.push({
				from: arrowMatch[1]?.trim() ?? "",
				to: arrowMatch[3]?.trim() ?? "",
				label: arrowMatch[2]?.trim(),
			});
		} else {
			lines.push(`${cVert}  ${trimmed}`);
		}
	}

	if (connections.length > 0) {
		for (let i = 0; i < connections.length; i++) {
			const conn = connections[i]!;
			const boxFrom = `[ ${conn.from} ]`;
			const boxTo = `[ ${conn.to} ]`;
			const labelPart = conn.label ? ` --(${conn.label})--` : "";

			lines.push(`${cVert}   ${boxFrom}${labelPart}`);
			lines.push(`${cVert}        ${arrow}`);
			if (i === connections.length - 1) {
				lines.push(`${cVert}   ${boxTo}`);
			}
		}
	}

	lines.push(`${cBottomLeft}${cHoriz.repeat(50)}${cBottomRight}`);
	return lines.join("\n");
}
