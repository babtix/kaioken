import type {
	Citation,
	CitationDefect,
	ResearchSource,
	ResearchVerification,
	SourceExcerpt,
} from "./types.js";

/**
 * The adversarial pass over a generated research document.
 *
 * "Every claim traces to a numbered page actually fetched" is enforced here,
 * deterministically. The document may cite sources only as [N]; the verifier
 * resolves each citation against the evidence list the pipeline itself built,
 * and checks attributed quotes against the sanitised content the page actually
 * contained. A model cannot pass this by writing plausible prose — the page
 * either was fetched and says what is attributed, or the defect is reported.
 */

/** `[3]`, `[12]` — a bracketed number, the only citation form allowed. */
const CITE = /\[(\d{1,2})\]/g;

/**
 * Verify a document's citations against the evidence.
 *
 * A citation grounds when: the number names a fetched source, and — when the
 * claim includes a quoted string — the quote appears in that source's
 * sanitised text. Quote matching is whitespace-insensitive and case-ordained
 * (the sanitizer normalises whitespace, the model does not).
 */
export function verifyCitations(
	body: string,
	sources: readonly ResearchSource[],
	excerpts: readonly SourceExcerpt[],
): ResearchVerification {
	const byNumber = new Map(excerpts.map((e) => [e.sourceNumber, e]));
	const fetched = new Set(sources.filter((s) => s.fetched).map((s) => s.number));

	const defects: CitationDefect[] = [];
	let grounded = 0;
	let cited = 0;

	const lines = body.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;
		const lineNumber = i + 1;
		const citations = citationsIn(line, lineNumber);

		if (citations.length === 0) continue;
		cited += citations.length;

		for (const citation of citations) {
			const verdict = check(citation, byNumber, fetched);
			if (verdict === "grounded") {
				grounded++;
				continue;
			}
			defects.push(verdict);
		}
	}

	return {
		grounded,
		defects,
		groundedRatio: cited === 0 ? 1 : grounded / cited,
	};
}

function citationsIn(line: string, lineNumber: number): Citation[] {
	const out: Citation[] = [];
	CITE.lastIndex = 0;
	for (const match of line.matchAll(CITE)) {
		const sourceNumber = Number.parseInt(match[1] as string, 10);
		if (!Number.isFinite(sourceNumber) || sourceNumber < 1) continue;
		out.push({ line: lineNumber, sourceNumber, quote: quoteBefore(line, match.index ?? 0) });
	}
	return out;
}

/**
 * A short attributed quote, if the citation carries one.
 *
 * Documents are prompted to write "claim, because the page says "..." [2]".
 * The quote is the prose inside quotation marks immediately before the
 * bracket. Only a bounded span is taken — a quote must be checkable, not a
 * second document.
 */
function quoteBefore(line: string, citeIndex: number): string | undefined {
	const before = line.slice(Math.max(0, citeIndex - 220), citeIndex);
	const match = /[""«]([^""»]{12,200})[""»][\s,;.:]*$/.exec(before);
	return match ? (match[1] as string) : undefined;
}

function check(
	citation: Citation,
	byNumber: ReadonlyMap<number, SourceExcerpt>,
	fetched: ReadonlySet<number>,
): "grounded" | CitationDefect {
	const excerpt = byNumber.get(citation.sourceNumber);

	if (!excerpt) {
		return {
			kind: "unknown_source",
			claim: `[${citation.sourceNumber}]`,
			line: citation.line,
			detail:
				`no source number ${citation.sourceNumber} exists — the document cites a page ` +
				"that was never fetched",
		};
	}

	if (!fetched.has(citation.sourceNumber)) {
		return {
			kind: "cites_failed_fetch",
			claim: `[${citation.sourceNumber}]`,
			line: citation.line,
			detail: `source ${citation.sourceNumber} could not be fetched and may not be cited`,
		};
	}

	if (citation.quote && !containsQuote(excerpt.text, citation.quote)) {
		return {
			kind: "quote_not_found",
			claim: citation.quote,
			line: citation.line,
			detail:
				`the quoted text does not appear in source ${citation.sourceNumber} ` +
				"as it was fetched and sanitised",
		};
	}

	return "grounded";
}

/** Whitespace-insensitive containment: the sanitizer collapsed whitespace. */
function containsQuote(haystack: string, quote: string): boolean {
	const fold = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
	return fold(haystack).includes(fold(quote));
}

/**
 * Claims the document makes with no citation at all.
 *
 * Reported separately from citation defects: an uncited sentence is the
 * document's own synthesis, which is legitimate — but it must be visible so a
 * reader knows which sentences rest on a fetched page and which do not.
 */
export function uncitedSentences(body: string): { line: number; text: string }[] {
	const out: { line: number; text: string }[] = [];
	const lines = body.split(/\r?\n/);
	for (let i = 0; i < lines.length; i++) {
		const line = (lines[i] as string).trim();
		// Only declarative prose counts; headers and list markers are structure.
		if (line.length < 40) continue;
		if (/^#|^[-*|>]/.test(line)) continue;
		if (/\[\d{1,2}\]/.test(line)) continue;
		// A line this long without a citation is a claim about the world.
		out.push({ line: i + 1, text: line });
	}
	return out;
}
