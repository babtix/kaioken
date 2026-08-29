import type { ProvenanceSource } from "@kaioken/provenance";

/**
 * The research tenant.
 *
 * Every other tenant grounds a document in files the repository already
 * contains. Research grounds a document in pages on the web — which makes the
 * verification problem different in kind: the "structural index" here is the
 * set of pages actually fetched, pinned to their content at fetch time. A
 * claim that cites page [3] checks out only if page 3 was fetched, its content
 * still contains what the claim attributes to it, and the citation survives
 * exactly as the sanitizer emitted it.
 */

/** One web page actually fetched, pinned to its content. */
export interface ResearchSource {
	/**
	 * The number a document must cite: [1]..[N], assigned in fetch order.
	 * Citations are positions in the evidence list, never URLs the model
	 * re-types — a model that re-types URLs invents them.
	 */
	number: number;
	url: string;
	title: string;
	/** Content hash at fetch time. Pins what the page said when it was read. */
	hash: string;
	/** Fetch status: a page that failed is listed, and cannot be cited. */
	fetched: boolean;
	/** Why the fetch failed, when it did. */
	error?: string;
}

/**
 * A block of sanitised page content handed to the model.
 *
 * The sanitizer's output is data, labelled as data: the model sees numbered
 * fences, and the verifier checks citations against exactly these numbers.
 */
export interface SourceExcerpt {
	sourceNumber: number;
	/** Sanitised text. No markup, no scripts, bounded in length. */
	text: string;
	/** Characters dropped by sanitisation, so truncation is never silent. */
	truncated: boolean;
}

/** One numbered claim a generated document makes about a source. */
export interface Citation {
	/** 1-based line in the generated document. */
	line: number;
	/** The source number cited: [3] -> 3. */
	sourceNumber: number;
	/** Optional short quote the claim attributes to the source. */
	quote?: string;
}

export type CitationDefectKind =
	/** The document cites a source number that was never fetched. */
	| "unknown_source"
	/** The attributed quote does not appear in the cited page's content. */
	| "quote_not_found"
	/** The claim names no source at all. */
	| "uncited_claim"
	/** The claim cites only a page whose fetch failed. */
	| "cites_failed_fetch";

export interface CitationDefect {
	kind: CitationDefectKind;
	/** What the document claimed. */
	claim: string;
	/** Line in the generated document. */
	line?: number;
	detail: string;
}

export interface ResearchVerification {
	/** Citations checked and confirmed. */
	grounded: number;
	defects: CitationDefect[];
	/** Fraction of non-uncited claims that resolved to a fetched page. */
	groundedRatio: number;
}

/** A generated research document, with everything needed to re-derive it. */
export interface ResearchDocument {
	/** The question asked, verbatim. Doubles as the artifact's file name. */
	question: string;
	/** Wiki-relative style path under .kaioken/research/. */
	path: string;
	title: string;
	body: string;
	/** The pages the document may cite, in citation order. */
	sources: ResearchSource[];
	generatedAt: string;
	verification: ResearchVerification;
	/**
	 * Provenance over the fetched pages, so the same staleness machinery that
	 * ages wiki chapters ages research: a page whose hash moves is stale.
	 */
	sourcesAsProvenance: ProvenanceSource[];
}

/** Depth dial, same shape as the other tenants. */
export interface ResearchDepth {
	/** Distinct pages to gather before writing. */
	targetSources: number;
	/** Search queries to issue before falling back to fewer sources. */
	targetQueries: number;
	/** Characters of sanitised content per page handed to the model. */
	excerptChars: number;
	maxOutputTokens: number;
	/** Adversarial repair passes past the breadth threshold. */
	refinementPasses: number;
}

export const MIN_MULTIPLIER = 1;
export const MAX_MULTIPLIER = 10;
/** Past this, more sources stop helping and scrutiny starts. */
export const BREADTH_THRESHOLD = 5;

export function parseMultiplier(raw: string | number | undefined): number | null {
	if (raw === undefined) return MIN_MULTIPLIER;
	const text = String(raw).trim().toLowerCase();
	const match = /^x?(\d+)$/.exec(text);
	if (!match) return null;
	const value = Number.parseInt(match[1] as string, 10);
	if (value < MIN_MULTIPLIER || value > MAX_MULTIPLIER) return null;
	return value;
}

export function depthFor(multiplier: number): ResearchDepth {
	const n = Math.min(Math.max(multiplier, MIN_MULTIPLIER), MAX_MULTIPLIER);
	const breadth = Math.min(n, BREADTH_THRESHOLD);
	return {
		targetSources: 3 + breadth * 2,
		targetQueries: 1 + breadth,
		excerptChars: 1500 + breadth * 700,
		maxOutputTokens: 1500 + breadth * 600,
		refinementPasses: Math.max(0, n - BREADTH_THRESHOLD),
	};
}
