/**
 * Step 37: Category 02 — Chat Transcript & Interactive Output Stream (UX-0151 – UX-0200).
 *
 * Implements:
 * 1. One-click copy-to-clipboard code snippet button with OSC 52 terminal copy (UX-0151 – UX-0160).
 * 2. Syntax-highlighted inline unified diff view (UX-0161 – UX-0180).
 * 3. Interactive breadcrumb trail indicating active phase (UX-0181 – UX-0200).
 */

import { copySnippetAction, stripAnsi } from "./clipboard.ts";
import { parseUnifiedDiff } from "./diff.ts";
import { type Milestone, type MilestoneStatus, formatBreadcrumbsText } from "./breadcrumbs.ts";

/**
 * 20 Canonical Transcript Output Targets defined in Step 37 (UX-0151 – UX-0200).
 */
export type TranscriptTargetKind =
	| "repo-scan-risks"
	| "dependency-graph-outlines"
	| "spend-confirmation-breakdowns"
	| "error-diagnostic-backtraces"
	| "background-hook-logs"
	| "token-budgeting-summaries"
	| "multi-language-parse-warnings"
	| "cross-chapter-link-audits"
	| "file-secret-detection-summaries"
	| "interactive-prompt-dialogue"
	| "module-planning-output"
	| "knowledge-card-logs"
	| "wiki-chapter-streaming"
	| "search-hit-listings"
	| "git-worktree-merges"
	| "verification-test-outputs"
	| "web-research-citations"
	| "skill-compilation-logs"
	| "staleness-drift-audits"
	| "ast-symbol-query-hits";

export const ALL_TRANSCRIPT_TARGET_KINDS: readonly TranscriptTargetKind[] = [
	"repo-scan-risks",
	"dependency-graph-outlines",
	"spend-confirmation-breakdowns",
	"error-diagnostic-backtraces",
	"background-hook-logs",
	"token-budgeting-summaries",
	"multi-language-parse-warnings",
	"cross-chapter-link-audits",
	"file-secret-detection-summaries",
	"interactive-prompt-dialogue",
	"module-planning-output",
	"knowledge-card-logs",
	"wiki-chapter-streaming",
	"search-hit-listings",
	"git-worktree-merges",
	"verification-test-outputs",
	"web-research-citations",
	"skill-compilation-logs",
	"staleness-drift-audits",
	"ast-symbol-query-hits",
] as const;

export interface TranscriptTargetMetadata {
	kind: TranscriptTargetKind;
	title: string;
	defaultLanguage: string;
	defaultPhases: readonly string[];
	description: string;
}

export const TRANSCRIPT_TARGET_METADATA: Record<TranscriptTargetKind, TranscriptTargetMetadata> = {
	"repo-scan-risks": {
		kind: "repo-scan-risks",
		title: "Repo Scan Risk Reports",
		defaultLanguage: "markdown",
		defaultPhases: ["Discover", "Filter", "Analyze", "Report"],
		description: "Risk assessment and security rule scan outputs.",
	},
	"dependency-graph-outlines": {
		kind: "dependency-graph-outlines",
		title: "Dependency Graph Text Outlines",
		defaultLanguage: "text",
		defaultPhases: ["Collect", "Resolve", "Toposort", "Render"],
		description: "Textual outlines of package and symbol dependency trees.",
	},
	"spend-confirmation-breakdowns": {
		kind: "spend-confirmation-breakdowns",
		title: "Spend Confirmation Breakdowns",
		defaultLanguage: "json",
		defaultPhases: ["Estimate", "Budget", "Prompt", "Confirm"],
		description: "Cost calculation breakdowns and model token budgeting prompts.",
	},
	"error-diagnostic-backtraces": {
		kind: "error-diagnostic-backtraces",
		title: "Error Diagnostic Backtraces",
		defaultLanguage: "typescript",
		defaultPhases: ["Capture", "Symbolicate", "Contextualize", "Display"],
		description: "Symbolicated error stack traces and failure diagnostics.",
	},
	"background-hook-logs": {
		kind: "background-hook-logs",
		title: "Background Hook Logs",
		defaultLanguage: "shell",
		defaultPhases: ["Spawn", "Stream", "Filter", "Exit"],
		description: "Real-time log capture from background tasks and hooks.",
	},
	"token-budgeting-summaries": {
		kind: "token-budgeting-summaries",
		title: "Token Budgeting Summaries",
		defaultLanguage: "yaml",
		defaultPhases: ["Measure", "Partition", "Enforce", "Audit"],
		description: "Prompt token metrics, context window headroom, and cache statistics.",
	},
	"multi-language-parse-warnings": {
		kind: "multi-language-parse-warnings",
		title: "Multi-Language Parse Warnings",
		defaultLanguage: "text",
		defaultPhases: ["Scan", "Parse", "Validate", "Warn"],
		description: "Syntax and AST parser warnings across Python, Go, Rust, and TS.",
	},
	"cross-chapter-link-audits": {
		kind: "cross-chapter-link-audits",
		title: "Cross-Chapter Link Audits",
		defaultLanguage: "markdown",
		defaultPhases: ["Crawl", "Index", "Verify", "Report"],
		description: "Documentation link health, broken citations, and orphan audits.",
	},
	"file-secret-detection-summaries": {
		kind: "file-secret-detection-summaries",
		title: "File Secret Detection Summaries",
		defaultLanguage: "text",
		defaultPhases: ["Entropy", "Regex", "Redact", "Notify"],
		description: "Detected secrets, tokens, private keys, and redaction notices.",
	},
	"interactive-prompt-dialogue": {
		kind: "interactive-prompt-dialogue",
		title: "Interactive Prompt Dialogue",
		defaultLanguage: "text",
		defaultPhases: ["Prompt", "Listen", "Validate", "Dispatch"],
		description: "User input prompts, interactive menus, and multi-turn dialogue.",
	},
	"module-planning-output": {
		kind: "module-planning-output",
		title: "Module Planning Output",
		defaultLanguage: "markdown",
		defaultPhases: ["Decompose", "Plan", "Review", "Generate"],
		description: "Architecture breakdown, module plans, and implementation steps.",
	},
	"knowledge-card-logs": {
		kind: "knowledge-card-logs",
		title: "Knowledge Card Generation Logs",
		defaultLanguage: "markdown",
		defaultPhases: ["Extract", "Ground", "Synthesize", "Commit"],
		description: "Atomic fact card synthesis and citation grounding logs.",
	},
	"wiki-chapter-streaming": {
		kind: "wiki-chapter-streaming",
		title: "Wiki Chapter Streaming Text",
		defaultLanguage: "markdown",
		defaultPhases: ["Outline", "Stream", "Ground", "Finalize"],
		description: "Real-time streaming text of synthesized wiki chapters.",
	},
	"search-hit-listings": {
		kind: "search-hit-listings",
		title: "Search Hit Listings",
		defaultLanguage: "text",
		defaultPhases: ["Query", "BM25", "Rank", "Preview"],
		description: "Ranked search results, snippet previews, and BM25 scores.",
	},
	"git-worktree-merges": {
		kind: "git-worktree-merges",
		title: "Git Worktree Merge Reports",
		defaultLanguage: "diff",
		defaultPhases: ["Branch", "Worktree", "Verify", "Merge"],
		description: "Git worktree merge outputs, fast-forward checks, and diffs.",
	},
	"verification-test-outputs": {
		kind: "verification-test-outputs",
		title: "Native Verification Test Outputs",
		defaultLanguage: "text",
		defaultPhases: ["Configure", "Execute", "Evaluate", "Gate"],
		description: "Native test execution stdout, pass/fail counts, and coverage.",
	},
	"web-research-citations": {
		kind: "web-research-citations",
		title: "Web Research Source Citations",
		defaultLanguage: "markdown",
		defaultPhases: ["Search", "Fetch", "Sanitize", "Cite"],
		description: "Grounded web citations, evidence excerpts, and credibility scores.",
	},
	"skill-compilation-logs": {
		kind: "skill-compilation-logs",
		title: "Agent Skill Compilation Logs",
		defaultLanguage: "yaml",
		defaultPhases: ["Parse", "Typecheck", "Package", "Deploy"],
		description: "Agent autonomous procedure recipes and parameter schemas.",
	},
	"staleness-drift-audits": {
		kind: "staleness-drift-audits",
		title: "Staleness Drift Audits",
		defaultLanguage: "text",
		defaultPhases: ["Snapshot", "Compare", "Classify", "Alert"],
		description: "Document hash comparisons, truth drift, and staleness badges.",
	},
	"ast-symbol-query-hits": {
		kind: "ast-symbol-query-hits",
		title: "AST Symbol Query Hits",
		defaultLanguage: "typescript",
		defaultPhases: ["Index", "Match", "Rank", "Inspect"],
		description: "AST symbol lookups, type signatures, and declaration locations.",
	},
};

/* -------------------------------------------------------------------------- */
/* Theme 1: One-Click Copy-to-Clipboard Code Snippet Button (UX-0151 – UX-0160) */
/* -------------------------------------------------------------------------- */

export interface CopySnippetButtonModel {
	target: TranscriptTargetKind;
	cleanCode: string;
	osc52Sequence: string;
	buttonLabel: string;
	displayText: string;
	language: string;
	lineCount: number;
}

export function buildCopySnippetButtonModel(
	target: TranscriptTargetKind,
	code: string,
	options: { language?: string; label?: string } = {},
): CopySnippetButtonModel {
	const meta = TRANSCRIPT_TARGET_METADATA[target];
	const language = options.language || meta.defaultLanguage;
	const { clean, osc52 } = copySnippetAction(code);
	const lineCount = clean.split(/\r?\n/).length;
	const buttonLabel = options.label || `[📋 Copy ${meta.title}]`;

	const displayText = [
		`┌── [${language}] ${buttonLabel} (${lineCount} lines) ───`,
		clean,
		`└────────────────────────────────────────────────────────`,
	].join("\n");

	return {
		target,
		cleanCode: clean,
		osc52Sequence: osc52,
		buttonLabel,
		displayText,
		language,
		lineCount,
	};
}

export function formatCopySnippetButton(
	target: TranscriptTargetKind,
	code: string,
	options?: { language?: string; label?: string },
): string {
	const model = buildCopySnippetButtonModel(target, code, options);
	return `${model.displayText}\n${model.osc52Sequence}`;
}

/* -------------------------------------------------------------------------- */
/* Theme 2: Syntax-Highlighted Inline Unified Diff View (UX-0161 – UX-0180)    */
/* -------------------------------------------------------------------------- */

export interface InlineUnifiedDiffModel {
	target: TranscriptTargetKind;
	parsedDiff: ReturnType<typeof parseUnifiedDiff>;
	formattedView: string;
	summary: {
		filesChanged: number;
		additions: number;
		deletions: number;
	};
}

export function renderInlineUnifiedDiffView(
	target: TranscriptTargetKind,
	diffText: string,
	options: { title?: string; maxLines?: number } = {},
): InlineUnifiedDiffModel {
	const meta = TRANSCRIPT_TARGET_METADATA[target];
	const parsed = parseUnifiedDiff(diffText);
	const title = options.title || `${meta.title} Diff`;

	const rawLines = diffText.split(/\r?\n/);
	const totalLines = rawLines.length;
	const maxLines = options.maxLines ?? 200;
	const displayLines = rawLines.slice(0, maxLines);

	const formattedLines: string[] = [
		`╭── ${title} (+${parsed.totalAdded} -${parsed.totalDeleted}) ───────────`,
	];

	for (const line of displayLines) {
		if (line.startsWith("+") && !line.startsWith("+++")) {
			formattedLines.push(`│ + \x1b[32m${stripAnsi(line.slice(1))}\x1b[0m`);
		} else if (line.startsWith("-") && !line.startsWith("---")) {
			formattedLines.push(`│ - \x1b[31m${stripAnsi(line.slice(1))}\x1b[0m`);
		} else if (line.startsWith("@@")) {
			formattedLines.push(`│ \x1b[36m${stripAnsi(line)}\x1b[0m`);
		} else {
			formattedLines.push(`│   ${stripAnsi(line)}`);
		}
	}

	if (totalLines > maxLines) {
		formattedLines.push(`│ ... [truncated ${totalLines - maxLines} lines]`);
	}

	formattedLines.push(`╰─────────────────────────────────────────────────────`);

	return {
		target,
		parsedDiff: parsed,
		formattedView: formattedLines.join("\n"),
		summary: {
			filesChanged: parsed.files.length,
			additions: parsed.totalAdded,
			deletions: parsed.totalDeleted,
		},
	};
}

/* -------------------------------------------------------------------------- */
/* Theme 3: Interactive Breadcrumb Trail Indicating Phase (UX-0181 – UX-0200) */
/* -------------------------------------------------------------------------- */

export interface PhaseBreadcrumbModel {
	target: TranscriptTargetKind;
	activePhase: string;
	milestones: Milestone[];
	renderedTrail: string;
}

export function renderPhaseBreadcrumbTrail(
	target: TranscriptTargetKind,
	activePhaseName: string,
	options: { status?: MilestoneStatus; unicode?: boolean } = {},
): PhaseBreadcrumbModel {
	const meta = TRANSCRIPT_TARGET_METADATA[target];
	const phases = meta.defaultPhases;
	const activeIndex = Math.max(
		0,
		phases.findIndex((p) => p.toLowerCase() === activePhaseName.toLowerCase()),
	);

	const milestones: Milestone[] = phases.map((phase, idx) => {
		let status: MilestoneStatus;
		if (idx < activeIndex) {
			status = "completed";
		} else if (idx === activeIndex) {
			status = options.status ?? "active";
		} else {
			status = "pending";
		}

		return {
			id: phase.toLowerCase(),
			label: phase,
			status,
		};
	});

	const renderedTrail = formatBreadcrumbsText(milestones, {
		unicode: options.unicode ?? true,
	});

	return {
		target,
		activePhase: activePhaseName,
		milestones,
		renderedTrail: `[${meta.title}] ${renderedTrail}`,
	};
}
