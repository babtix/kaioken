import type { ResearchSource } from "./types.js";

/**
 * The network, as two small ports.
 *
 * This package never opens a socket, never reads a credential, never imports
 * a transport. The caller supplies search and fetch, which is what keeps every
 * part of research — including the generation loop — testable offline with a
 * scripted double. "If a stage needs the network to be tested, it is designed
 * wrong" applies with extra force here: the network is the one dependency a
 * research engine cannot think its way out of, so it is confined to two
 * functions the caller owns.
 */

/** One result from a web search. */
export interface WebHit {
	url: string;
	title: string;
	/** The search engine's snippet, if any. Never treated as page content. */
	snippet?: string;
}

export interface WebSearchPort {
	/**
	 * Run one web search. Returns hits or throws — a failed search is a
	 * condition the pipeline handles, not a crash.
	 */
	search(query: string, limit: number): Promise<WebHit[]>;
}

export interface WebFetchResult {
	/** HTTP-style status, when the fetch got that far. */
	status?: number;
	/** Page body (any markup). The caller fetches raw; the sanitizer cleans. */
	body?: string;
	/** Resolved title, when the fetcher can extract one. */
	title?: string;
	error?: string;
}

export interface WebFetchPort {
	fetch(url: string): Promise<WebFetchResult>;
}

/**
 * Dedupe hits across queries.
 *
 * Several queries return overlapping result sets; the same URL twice would
 * spend two fetches on one source and confuse the citation numbering. Order
 * is preserved: first-seen wins, because earlier queries are the caller's
 * preferred framing of the question.
 */
export function dedupeHits(hits: readonly WebHit[]): WebHit[] {
	const seen = new Set<string>();
	const out: WebHit[] = [];
	for (const hit of hits) {
		const key = normaliseUrl(hit.url);
		if (seen.has(key)) continue;
		seen.add(key);
		out.push(hit);
	}
	return out;
}

/** URLs that differ only by trailing slash or fragment are the same page. */
function normaliseUrl(url: string): string {
	try {
		const parsed = new URL(url);
		parsed.hash = "";
		return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}${parsed.search}`;
	} catch {
		return url;
	}
}

/**
 * Sources a page may not become.
 *
 * Not a safety blanket — a boundary decision. Anything the research pipeline
 * would treat as evidence must be a page a person could read in a browser and
 * check with their own eyes.
 */
const BLOCKED_HOST_SUFFIXES = ["localhost", "0.0.0.0", "::1", ".local", ".internal"];

export function isFetchableUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
	const host = parsed.hostname.toLowerCase();
	if (BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix))) {
		return false;
	}
	// Loopback and link-local ranges by literal octet: a search result must
	// never aim the fetcher at the machine's own services.
	if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return false;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
	if (/^169\.254\./.test(host)) return false;
	return true;
}

/** Assign citation numbers: [1]..[N] in the order sources will be presented. */
export function numberSources(sources: readonly ResearchSource[]): ResearchSource[] {
	return sources.map((source, i) => ({ ...source, number: i + 1 }));
}
