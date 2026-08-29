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
// `::1` is deliberately not here. As a suffix it also matches the public
// address `2001:db8::1`; IPv6 loopback is decided by `isPrivateIpv6`, which
// compares addresses rather than the strings they were written as.
const BLOCKED_HOST_SUFFIXES = ["localhost", "0.0.0.0", ".local", ".internal"];

export function isFetchableUrl(url: string): boolean {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return false;
	}
	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

	// An IPv6 literal keeps its brackets in `hostname`, so every comparison
	// below has to strip them first. Without this the whole filter was a
	// no-op for IPv6: `[::1]` equals nothing in the suffix list, ends with `]`
	// rather than `::1`, and matches none of the IPv4 patterns.
	const raw = parsed.hostname.toLowerCase();
	const host = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;

	if (BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(suffix))) {
		return false;
	}
	if (isPrivateIpv4(host)) return false;
	if (host.includes(":") && isPrivateIpv6(host)) return false;
	return true;
}

/**
 * Loopback, private and link-local IPv4, by literal octet: a search result must
 * never aim the fetcher at the machine's own services.
 */
function isPrivateIpv4(host: string): boolean {
	if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) return true;
	if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
	return /^169\.254\./.test(host);
}

/**
 * The same ranges in IPv6, which has more than one way to write each of them.
 *
 * `::1`, `0:0:0:0:0:0:0:1` and `::ffff:127.0.0.1` are the same machine, and a
 * filter that recognised only the first would be a filter an attacker chooses
 * the spelling to defeat.
 */
function isPrivateIpv6(host: string): boolean {
	// A zone index (`fe80::1%eth0`) is addressing detail, not address.
	const address = host.split("%")[0] as string;

	// IPv4-mapped forms carry the v4 rules with them. The dotted spelling is
	// accepted for completeness, but the one that actually arrives is the hex
	// pair: `new URL()` rewrites `[::ffff:127.0.0.1]` as `[::ffff:7f00:1]`
	// before this function ever sees it, which is how the mapped form slipped
	// past a check that only looked for four dotted octets.
	const embedded = embeddedIpv4(address);
	if (embedded && isPrivateIpv4(embedded)) return true;

	const groups = address.split(":").filter((group) => group !== "");

	// Loopback (::1) and the unspecified address (::), however they are spelled.
	if (groups.every((group) => /^0*$/.test(group))) return true;
	if (
		groups.length > 0 &&
		groups.slice(0, -1).every((group) => /^0*$/.test(group)) &&
		/^0*1$/.test(groups.at(-1) as string) &&
		(address.includes("::") || groups.length === 8)
	) {
		return true;
	}

	// Unique-local (fc00::/7) and link-local (fe80::/10).
	return /^f[cd]/.test(address) || /^fe[89ab]/.test(address);
}

/** The IPv4 address inside an IPv4-mapped IPv6 one, in either spelling. */
function embeddedIpv4(address: string): string | null {
	const dotted = /::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
	if (dotted) return dotted[1] as string;

	const hex = /::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address);
	if (!hex) return null;

	const high = Number.parseInt(hex[1] as string, 16);
	const low = Number.parseInt(hex[2] as string, 16);
	return [high >> 8, high & 0xff, low >> 8, low & 0xff].join(".");
}

/** Assign citation numbers: [1]..[N] in the order sources will be presented. */
export function numberSources(sources: readonly ResearchSource[]): ResearchSource[] {
	return sources.map((source, i) => ({ ...source, number: i + 1 }));
}
