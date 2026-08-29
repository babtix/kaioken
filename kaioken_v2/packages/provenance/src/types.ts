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

/** One source a derived artifact was written from, pinned to its content. */
export interface ProvenanceSource {
	path: string;
	/**
	 * Content hash at generation time. Comparing this against the current scan
	 * is the whole invalidation mechanism — no git required, and no scanning of
	 * prose for file paths and hoping the model wrote a tidy list.
	 */
	hash: string;
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
