import type { Provenance, ProvenanceIndex, ProvenanceSource } from "@kaioken/provenance";

export type { Provenance, ProvenanceIndex, ProvenanceSource };

/**
 * The wiki is a plan-then-elaborate cascade, not one big generation call. Each
 * pass sees the output of the pass above it, and every generative pass is
 * followed by an adversarial one that checks its output against ground truth.
 */

/** One chapter in the global plan. Editable before anything expensive runs. */
export interface Chapter {
	id: string;
	title: string;
	/** What this chapter is meant to explain. Steers the section plan below it. */
	goal: string;
	/** Repo-relative paths this chapter is written from. */
	files: string[];
	/** Planned subsections. Empty until the section plan runs. */
	sections?: Section[];
}

export interface Section {
	id: string;
	title: string;
	/** What this subsection covers, in one sentence. */
	summary: string;
	/** The subset of the chapter's files this subsection is written from. */
	files: string[];
}

export interface WikiPlan {
	version: 1;
	generatedAt: string;
	multiplier: number;
	chapters: Chapter[];
}

/** A claim a generated document makes that can be checked against ground truth. */
export type ClaimKind = "file" | "symbol" | "anchor" | "excerpt";

export interface Claim {
	kind: ClaimKind;
	/** The literal text as written in the document. */
	text: string;
	/** 1-based line in the generated document, so a defect can be located. */
	line: number;
	/** For anchors and excerpts: the file the claim attaches to. */
	file?: string;
	startLine?: number;
	endLine?: number;
}

export interface Defect {
	kind:
		| "unknown_file"
		| "unknown_symbol"
		| "bad_anchor"
		| "excerpt_not_found"
		| "excerpt_ambiguous"
		| "uncovered_export"
		| "padding";
	/** What the document said. */
	claim: string;
	/** Line in the generated document. */
	line?: number;
	detail: string;
}

export interface VerificationReport {
	/** Claims checked and confirmed. */
	grounded: number;
	/** Claims that could not be confirmed. Reported, never shipped silently. */
	defects: Defect[];
	/** Exported declarations in scope the document never mentions. */
	uncovered: string[];
	/** Fraction of in-scope exports the document covers, 0..1. */
	coverage: number;
}

/** One generated document, with everything needed to judge and re-derive it. */
export interface WikiDocument {
	/** Wiki-relative path, e.g. "core/retrieval.md". */
	path: string;
	chapterId: string;
	sectionId?: string;
	title: string;
	body: string;
	provenance: Provenance;
	verification: VerificationReport;
}
