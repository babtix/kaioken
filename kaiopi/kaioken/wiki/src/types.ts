import type { Provenance, ProvenanceIndex, ProvenanceSource } from "@kaioken/provenance";
import type {
	Claim,
	ClaimKind,
	Defect as CoreDefect,
	VerificationReport as CoreVerificationReport,
} from "@kaioken/verifycore";

export type Defect =
	| CoreDefect
	| {
			kind: "broken_link";
			claim: string;
			line?: number;
			detail: string;
	  };

export interface VerificationReport {
	grounded: number;
	defects: Defect[];
	uncovered: string[];
	coverage: number;
}

export type { Claim, ClaimKind, Provenance, ProvenanceIndex, ProvenanceSource };

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

export interface RunFailure {
	/** "document" — generation, verification, or the sink threw.
	 *  "sections" — planSections threw; the chapter document may still exist. */
	kind: "document" | "sections";
	chapterId: string;
	sectionId?: string;
	/** The path the document would have had, for `wiki retry` and the report. */
	document: string;
	reason: string;
}

export interface WikiRunState {
	version: 1;
	updatedAt: string;
	/** The model and multiplier the failed run used, so a retry is not
	 *  silently shallower than the run it repairs. */
	model: string;
	multiplier: number;
	failures: RunFailure[];
}
