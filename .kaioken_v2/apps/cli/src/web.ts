import type { WebFetchPort, WebFetchResult, WebHit, WebSearchPort } from "@kaioken/research";

/**
 * The network seam.
 *
 * `@kaioken/research` defines search and fetch as ports; this file is the only
 * place that implements them against the real world. Every other file in the
 * CLI — and every package — stays offline-testable, because the tests script
 * the ports instead of the protocols.
 *
 * Search providers, in priority order:
 *   1. Tavily, when TAVILY_API_KEY is set (a real API, structured results)
 *   2. DuckDuckGo's HTML endpoint, which needs no key and no account
 *
 * Fetch is a bounded GET with a browser-shaped user agent: many sites refuse
 * unknown clients, and the sanitizer below the boundary exists precisely
 * because what comes back is untrusted.
 */

const USER_AGENT =
	"Mozilla/5.0 (compatible; kaioken-research/1.0; +https://github.com/babtix/kaioken)";
const FETCH_TIMEOUT_MS = 20_000;
const MAX_BYTES = 2 * 1024 * 1024;

export function resolveSearchPort(): { search: WebSearchPort; describe: string } {
	const tavily = process.env["TAVILY_API_KEY"];
	if (tavily) {
		return { search: tavilySearch(tavily), describe: "tavily" };
	}
	return { search: duckDuckGoSearch(), describe: "duckduckgo" };
}

function tavilySearch(key: string): WebSearchPort {
	return {
		async search(query, limit) {
			const response = await globalThis.fetch("https://api.tavily.com/search", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({ api_key: key, query, max_results: limit }),
				signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
			});
			if (!response.ok) {
				throw new Error(`tavily returned ${response.status}`);
			}
			const payload = (await response.json()) as {
				results?: { url?: string; title?: string; content?: string }[];
			};
			return (payload.results ?? [])
				.filter((r): r is { url: string; title?: string; content?: string } => typeof r.url === "string")
				.map((r) => ({
					url: r.url,
					title: r.title ?? r.url,
					...(r.content ? { snippet: r.content } : {}),
				}));
		},
	};
}

function duckDuckGoSearch(): WebSearchPort {
	return {
		async search(query, limit) {
			const response = await globalThis.fetch(
				`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
				{
					headers: { "user-agent": USER_AGENT },
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				},
			);
			if (!response.ok) {
				throw new Error(`duckduckgo returned ${response.status}`);
			}
			return parseDuckDuckGo(await response.text(), limit);
		},
	};
}

/**
 * Scrape result links out of the HTML endpoint.
 *
 * Deliberately tolerant: the endpoint is not an API, and its markup drifts.
 * A parse that yields nothing reads as "no results", which the pipeline
 * already handles — never as a crash.
 */
export function parseDuckDuckGo(html: string, limit: number): WebHit[] {
	const hits: WebHit[] = [];
	const seen = new Set<string>();
	const link = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
	for (const match of html.matchAll(link)) {
		if (hits.length >= limit) break;
		const raw = (match[1] ?? "").replace(/&amp;/g, "&");
		const url = unwrapRedirect(raw);
		if (!url || seen.has(url)) continue;
		seen.add(url);
		hits.push({
			url,
			title: stripTags(match[2] ?? "") || url,
		});
	}
	return hits;
}

/** The HTML endpoint wraps offsite links in a /l/?uddg=<encoded> redirect. */
function unwrapRedirect(url: string): string | null {
	const match = /[?&]uddg=([^&]+)/.exec(url);
	if (match) {
		try {
			return decodeURIComponent(match[1] as string);
		} catch {
			return null;
		}
	}
	return url.startsWith("http") ? url : null;
}

function stripTags(html: string): string {
	return html
		.replace(/<[^>]+>/g, "")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"')
		.replace(/&#x27;|&#39;/g, "'")
		.trim();
}

export function httpFetchPort(): WebFetchPort {
	return {
		async fetch(url): Promise<WebFetchResult> {
			try {
				const response = await globalThis.fetch(url, {
					headers: {
						"user-agent": USER_AGENT,
						accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
					},
					redirect: "follow",
					signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
				});
				if (!response.ok) {
					return { status: response.status, error: `HTTP ${response.status}` };
				}
				const type = response.headers.get("content-type") ?? "";
				if (!/text\/|html|xml|json/.test(type)) {
					return { status: response.status, error: `unsupported content-type: ${type || "none"}` };
				}
				const buffer = await response.arrayBuffer();
				const body = new TextDecoder("utf-8", { fatal: false }).decode(
					buffer.byteLength > MAX_BYTES ? buffer.slice(0, MAX_BYTES) : buffer,
				);
				return {
					status: response.status,
					body,
					...(buffer.byteLength > MAX_BYTES ? { error: undefined } : {}),
				};
			} catch (error) {
				return {
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	};
}
