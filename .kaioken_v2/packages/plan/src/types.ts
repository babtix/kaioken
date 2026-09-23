import type { ProvenanceSource } from "@kaioken/provenance";

/**
 * The module plan is the first human checkpoint in the pipeline.
 *
 * A machine's decomposition of an unfamiliar codebase is a hypothesis, and the
 * cheapest moment to correct it is before anything expensive runs. So the plan
 * is an editable artifact, and every later stage reads it back rather than
 * re-deriving its own view.
 */

export interface Module {
	/** Stable identifier. Referenced by cards, and by the user's edits. */
	id: string;
	name: string;
	/** What this module is for, in the author's own words. */
	purpose: string;
	/** Repo-relative POSIX paths this module owns. */
	files: string[];
	children?: Module[];
}

export interface ModulePlan {
	version: 1;
	generatedAt: string;
	/** Multiplier the plan was proposed at. Recorded so a rerun is comparable. */
	multiplier: number;
	modules: Module[];
}

/** A knowledge card: the compact, uniform, queryable counterpart to a chapter. */
export interface Card {
	moduleId: string;
	name: string;
	generatedAt: string;
	/** One paragraph: what this module does and why it exists. */
	summary: string;
	/** The handful of things a newcomer must understand first. */
	keyPoints: string[];
	/** Declarations the card asserts are the module's public surface. */
	entryPoints: CardEntryPoint[];
	/**
	 * Which files this card was written from, pinned to their content.
	 *
	 * Paths alone would be decoration: staleness needs to know whether a source
	 * has since changed, which only the hash can answer.
	 */
	sources: ProvenanceSource[];
	/** What the verifier found. A card always ships with its own report card. */
	verification: CardVerification;
}

export interface CardEntryPoint {
	name: string;
	file: string;
	/** Why a reader should start here. */
	note: string;
}

export interface CardVerification {
	/** Entry points whose symbol the repository actually declares. */
	grounded: number;
	/** Claims the structural index could not confirm. Reported, never hidden. */
	ungrounded: string[];
	/** Source files the card names that the scan does not contain. */
	unknownFiles: string[];
	/** Exported declarations in scope that the card never mentions. */
	uncovered: string[];
}

/** A problem found by validating a plan against the scan. */
export interface PlanDefect {
	severity: "error" | "warning";
	kind:
		| "unknown_file"
		| "duplicate_id"
		| "empty_module"
		| "overlapping_files"
		| "missing_purpose"
		| "orphaned_files";
	moduleId?: string;
	message: string;
	/** The specific paths or ids involved, when listing them helps. */
	items?: string[];
}

export interface PlanValidation {
	ok: boolean;
	defects: PlanDefect[];
	/** Files in the scan that no module claims. */
	orphans: string[];
	moduleCount: number;
	coveredFiles: number;
}
