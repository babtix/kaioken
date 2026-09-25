/**
 * Provenance is machinery, not metadata.
 *
 * A record that only described where a document came from would be decoration.
 * A record a program can act on is what makes three other things possible at
 * all: incremental update, an honest answer to "how stale is this?", and — in a
 * later phase — predicting which documents a proposed change would obsolete.
 *
 * These types live in their own package precisely because every knowledge
 * tenant needs them. A wiki chapter and a knowledge card age the same way.
 */

import type { FileRecord } from "@kaioken/scan";

/** One source a derived artifact was written from, pinned to its content. */
export interface ProvenanceSource {
	path: string;
	/**
	 * Content hash at generation time. Comparing this against the current scan
	 * is the whole invalidation mechanism — no git required, and no scanning of
	 * prose for file paths and hoping the model wrote a tidy list.
	 */
	hash: string;
	/**
	 * Optional symbol this documentation binds to within `path`. Present only
	 * for symbol-aware bindings; absence means whole-file binding.
	 */
	symbol?: string;
	/** Optional 1-based line range within `path` for line-range bindings. */
	startLine?: number;
	/** Optional 1-based inclusive end line for line-range bindings. */
	endLine?: number;
	/**
	 * Content hash of the bound symbol or line range at generation time.
	 * When present alongside `symbol` or `startLine`/`endLine`, staleness can
	 * compare just that range (given current range hashes) instead of the
	 * whole file. Absence means whole-file binding.
	 */
	rangeHash?: string;
}

/** What one derived artifact was written from. */
export interface Provenance {
	/** Identifier of the artifact: wiki-relative path, or card module id. */
	document: string;
	chapterId?: string;
	sectionId?: string;
	generatedAt: string;
	sources: ProvenanceSource[];
}

export interface ProvenanceIndex {
	version: 1;
	generatedAt: string;
	documents: Provenance[];
}

/** How a derived artifact stands relative to the repository as it is now. */
export type Freshness =
	| "current"
	/** At least one source changed since generation. */
	| "stale"
	/** Every source it was written from is gone. */
	| "orphaned"
	/** The artifact records no sources, so nothing can be said about it. */
	| "unknown";

export interface DocumentStatus {
	document: string;
	freshness: Freshness;
	/** Sources whose content hash no longer matches. */
	changed: string[];
	/** Sources the repository no longer contains. */
	deleted: string[];
	/** Sources still exactly as they were. */
	unchanged: string[];
	generatedAt: string;
}

/** Options for tolerance normalization (comment, whitespace, docstring stripping). */
export interface NormalizationOptions {
	/** If true, ignore single-line (//, #) and multi-line comments. Default: false. */
	ignoreComments?: boolean;
	/** If true, collapse whitespace sequences and trim line endings. Default: false. */
	ignoreWhitespace?: boolean;
	/** If true, ignore docstrings/documentation blocks. Default: false. */
	ignoreDocstrings?: boolean;
}

/** Documentation categories for multi-category freshness tracking. */
export type DocCategory =
	| "architecture"
	| "cards"
	| "subsystems"
	| "procedures"
	| "api"
	| "data_models"
	| "security"
	| "runbooks"
	| "benchmarks"
	| "tutorials"
	| "other";

export interface CategoryFreshness {
	category: DocCategory;
	total: number;
	fresh: number;
	stale: number;
	orphaned: number;
	percentage: number;
}

export type FreshnessTier = "pristine" | "healthy" | "warning" | "critical";

export interface FreshnessDial {
	/** 0..100 percentage. */
	overallPercentage: number;
	tier: FreshnessTier;
	categories: Record<DocCategory, CategoryFreshness>;
	totalDocuments: number;
	freshDocuments: number;
	staleDocuments: number;
	orphanedDocuments: number;
}

/** One line within a unified diff hunk. */
export interface DiffHunkLine {
	type: "add" | "delete" | "context";
	text: string;
	oldLine?: number;
	newLine?: number;
}

/** A unified diff hunk. */
export interface DiffHunk {
	oldStart: number;
	oldCount: number;
	newStart: number;
	newCount: number;
	lines: DiffHunkLine[];
}

export type DriftKind =
	| "signature_changed"
	| "body_modified"
	| "source_deleted"
	| "comment_only"
	| "whole_file_drift";

/** Exact source diff invalidating a document or bound symbol. */
export interface SourceDiff {
	path: string;
	symbol?: string;
	startLine?: number;
	endLine?: number;
	driftKind: DriftKind;
	hunks: DiffHunk[];
	additions: number;
	deletions: number;
}

export interface DocumentDriftReport {
	document: string;
	freshness: Freshness;
	changedSources: SourceDiff[];
	summary: string;
}

export interface RegenerationTask {
	id: string;
	document: string;
	priority: number;
	category: DocCategory;
	changedSources: SourceDiff[];
	estimatedTokenSavings: number;
	status: "queued" | "running" | "completed" | "failed" | "skipped";
	error?: string;
}

export interface RegenerationQueueStats {
	totalTasks: number;
	queued: number;
	completed: number;
	failed: number;
	estimatedTokensSaved: number;
	tokenSavingsRatio: number;
}

/** Options for staleness computation. All fields optional; defaults preserve whole-file behavior. */
export interface StalenessOptions {
	/**
	 * Return false to exclude a file from `undocumentedFiles`. Applied after
	 * the built-in non-source exclusions (tests, lockfiles, dotfiles,
	 * scripts/, config files).
	 */
	undocumentedFilter?: (file: FileRecord) => boolean;
	/**
	 * Current range hashes keyed by binding key (`path#symbol` or
	 * `path:start-end`; see `bindingKeyFor`). When provided, sources with a
	 * `rangeHash` binding are judged against it; otherwise they fall back to
	 * whole-file comparison.
	 */
	symbolHashes?: ReadonlyMap<string, string>;
	/**
	 * Normalization tolerance options when comparing source contents.
	 * When enabled, comments and cosmetic whitespace edits will not invalidate documents.
	 */
	tolerance?: NormalizationOptions;
}

/** Options for inverse invalidation lookup. */
export interface InvalidationOptions {
	/**
	 * Binding keys (`path#symbol`, `path:start-end`) whose ranges changed.
	 * When provided, symbol-bound sources match against this set instead of
	 * the file path, so edits outside the bound range do not invalidate.
	 * When absent, every source matches by file path (whole-file default).
	 */
	changedSymbols?: Iterable<string>;
}

/** One source that moved, for a targeted regeneration diff. */
export interface ChangedSource {
	path: string;
	was: string;
	now: string | null;
	symbol?: string;
	startLine?: number;
	endLine?: number;
}

export interface StalenessReport {
	/** Artifacts that have moved past the state they describe. */
	stale: DocumentStatus[];
	current: DocumentStatus[];
	orphaned: DocumentStatus[];
	/** Every document, in the order given. */
	documents: DocumentStatus[];

	/** Distinct source files that changed under at least one document. */
	changedFiles: string[];
	/** Distinct source files that were deleted under at least one document. */
	deletedFiles: string[];
	/**
	 * Files the scan contains that no document was written from. Not a defect —
	 * documentation is selective — but it is the honest denominator for "how
	 * much of this repository is described at all?".
	 */
	undocumentedFiles: string[];

	/** 0..1. The share of documents that still match their sources. */
	freshness: number;
	/** True when nothing is stale or orphaned. */
	ok: boolean;
}

// ---------------------------------------------------------------------------
// Step 22: Orphaned Documentation Detector Types (UX-0851 - UX-0860)
// ---------------------------------------------------------------------------

export type OrphanRecommendation = "archive" | "repoint" | "delete";

export interface OrphanItem {
	document: string;
	category: DocCategory;
	missingSources: string[];
	missingSymbols?: string[];
	recommendation: OrphanRecommendation;
	explanation: string;
}

export interface OrphanReport {
	orphans: OrphanItem[];
	byCategory: Record<DocCategory, OrphanItem[]>;
	totalOrphans: number;
	criticalCount: number;
	summary: string;
}

export interface OrphanDetectionOptions {
	knownRenames?: ReadonlyMap<string, string>;
	customClassifier?: (doc: string) => DocCategory;
}

// ---------------------------------------------------------------------------
// Step 22: Historical Staleness Graph Types (UX-0861 - UX-0870)
// ---------------------------------------------------------------------------

export interface StalenessSnapshot {
	timestamp: string;
	label?: string;
	documents: readonly Provenance[];
	currentHashes: ReadonlyMap<string, string>;
}

export interface StalenessDataPoint {
	timestamp: string;
	label?: string;
	overallFreshness: number; // 0..100
	categoryFreshness: Record<DocCategory, number>; // 0..100 per category
	totalDocuments: number;
	staleDocuments: number;
	orphanedDocuments: number;
}

export interface CategoryDecayMetric {
	category: DocCategory;
	initialFreshness: number;
	latestFreshness: number;
	netDecay: number; // positive = decay (loss of freshness), negative = improvement
	decayVelocity: number; // net decay per snapshot
	trend: "improving" | "stable" | "decaying";
}

export interface HistoricalStalenessGraph {
	points: StalenessDataPoint[];
	categoryDecay: Record<DocCategory, CategoryDecayMetric>;
	overallDecayVelocity: number;
	renderAsciiSparkline(category?: DocCategory): string;
	renderMermaid(): string;
	renderMarkdownSummary(): string;
}

// ---------------------------------------------------------------------------
// Step 22: Configurable Tolerance Threshold Types (UX-0871 - UX-0880)
// ---------------------------------------------------------------------------

export interface CategoryToleranceConfig {
	ignoreComments?: boolean;
	ignoreWhitespace?: boolean;
	ignoreDocstrings?: boolean;
	maxAllowedDiffPercentage?: number;
}

export interface ToleranceConfig {
	default: CategoryToleranceConfig;
	byCategory?: Partial<Record<DocCategory, CategoryToleranceConfig>>;
}

export interface ToleranceEvaluation {
	isTolerated: boolean;
	category: DocCategory;
	reason: string;
	detectedDriftKind: DriftKind;
	effectiveDiffPercentage: number;
}

// ---------------------------------------------------------------------------
// Step 22: Drift Compliance Report Types (UX-0881 - UX-0890)
// ---------------------------------------------------------------------------

export interface CategoryCompliance {
	category: DocCategory;
	totalDocuments: number;
	freshDocuments: number;
	staleDocuments: number;
	orphanedDocuments: number;
	freshnessPercentage: number;
	targetPercentage: number;
	compliant: boolean;
	status: "PASS" | "WARN" | "FAIL";
}

export interface RemediationPriorityItem {
	document: string;
	category: DocCategory;
	priority: "P0" | "P1" | "P2" | "P3";
	action: string;
	staleSources: string[];
}

export interface DriftComplianceReport {
	timestamp: string;
	overallFreshness: number;
	targetFreshness: number;
	compliant: boolean;
	categories: Record<DocCategory, CategoryCompliance>;
	remediationPriorities: RemediationPriorityItem[];
	markdown: string;
}

export interface DriftComplianceOptions {
	targetFreshness?: number; // default: 80%
	categoryTargets?: Partial<Record<DocCategory, number>>;
	title?: string;
	generatedBy?: string;
}

// ---------------------------------------------------------------------------
// Step 22: Instant Zero-Token Staleness Check Types (UX-0891 - UX-0900)
// ---------------------------------------------------------------------------

export interface InstantCategoryHealth {
	category: DocCategory;
	total: number;
	fresh: number;
	stale: number;
	orphaned: number;
	freshnessPercentage: number;
	healthy: boolean;
}

export interface InstantStalenessResult {
	executionDurationMs: number;
	ok: boolean;
	overallFreshnessPercentage: number;
	totalDocuments: number;
	categories: Record<DocCategory, InstantCategoryHealth>;
	staleDocuments: string[];
	orphanedDocuments: string[];
}


