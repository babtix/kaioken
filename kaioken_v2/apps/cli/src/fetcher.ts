import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { WebFetchPort, WebFetchResult } from "@kaioken/research";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { httpFetchPort } from "./web.js";

/**
 * Choosing what reads the pages research finds.
 *
 * Finding a page and reading it are separate jobs, and only the second one
 * costs money. A plain fetch gets the markup a server sends; an API reader
 * renders the page and strips the boilerplate for a credit. Which one is right
 * depends on the sites in question and on whose budget it is, so it is a
 * setting rather than a heuristic — and the setting is *reported*, always,
 * because "which reader am I actually getting" is the first thing anyone
 * debugging a thin report wants to know.
 */

export type FetcherMode = "auto" | "api" | "http";

export const FETCHER_MODES: FetcherMode[] = ["auto", "api", "http"];

export interface FetcherSettings {
	mode: FetcherMode;
}

const SETTINGS_FILE = "research.json";

export function fetcherSettingsPath(root: string): string {
	return join(resolve(root), KAIOKEN_DIR, SETTINGS_FILE);
}

/** The repository's recorded choice. `auto` when nothing has been chosen. */
export async function readFetcherMode(root: string): Promise<FetcherMode> {
	try {
		const parsed = JSON.parse(await readFile(fetcherSettingsPath(root), "utf8")) as {
			fetcher?: unknown;
		};
		return isMode(parsed.fetcher) ? parsed.fetcher : "auto";
	} catch {
		return "auto";
	}
}

export async function writeFetcherMode(root: string, mode: FetcherMode): Promise<void> {
	const path = fetcherSettingsPath(root);
	await mkdir(join(resolve(root), KAIOKEN_DIR), { recursive: true });

	// Merged rather than overwritten: this file is the research settings, and
	// this command owns one key in it.
	let existing: Record<string, unknown> = {};
	try {
		const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
		if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
	} catch {
		existing = {};
	}
	existing.fetcher = mode;
	await writeFile(path, `${JSON.stringify(existing, null, 2)}\n`, "utf8");
}

export function isMode(value: unknown): value is FetcherMode {
	return typeof value === "string" && (FETCHER_MODES as string[]).includes(value);
}

export interface ResolvedFetcher {
	fetch: WebFetchPort;
	/** One sentence saying how pages will actually be read. */
	describe: string;
	/** False when the chosen mode cannot run — an API mode with no key. */
	ok: boolean;
}

/**
 * The reader the current settings actually produce.
 *
 * A settings screen and a real run resolve through this same function, so the
 * two can never disagree about what is configured.
 */
export function resolveFetchPort(mode: FetcherMode): ResolvedFetcher {
	const key = process.env["FIRECRAWL_API_KEY"] ?? "";
	const http = httpFetchPort();

	if (mode === "http") {
		return { fetch: http, describe: "pages read over HTTP only", ok: true };
	}

	if (mode === "api") {
		// Asked for explicitly, so a missing key is an error rather than a quiet
		// downgrade to the thing the user just switched away from.
		if (!key) {
			return {
				fetch: http,
				describe:
					"fetcher mode \"api\" needs FIRECRAWL_API_KEY — set it, or run `kaioken fetcher http`",
				ok: false,
			};
		}
		return {
			fetch: firecrawlFetchPort(key, http),
			describe: "pages read through Firecrawl, falling back to HTTP",
			ok: true,
		};
	}

	// auto: the key is the whole signal. Someone who has configured Firecrawl
	// has said what they want read the pages; someone who has not gets HTTP and
	// spends nothing.
	return key
		? {
				fetch: firecrawlFetchPort(key, http),
				describe: "pages read through Firecrawl, falling back to HTTP",
				ok: true,
			}
		: {
				fetch: http,
				describe: "pages read over HTTP (no FIRECRAWL_API_KEY, so nothing is rendered)",
				ok: true,
			};
}

const FIRECRAWL_TIMEOUT_MS = 45_000;

/**
 * The API reader, with the plain fetch behind it.
 *
 * The fallback is not politeness: a research run that loses a source loses a
 * citation, and a credit-metered service that rate-limits mid-run would
 * otherwise silently thin the evidence set. Falling back keeps the page, and
 * the sanitizer downstream treats both readers' output identically.
 */
export function firecrawlFetchPort(key: string, fallback: WebFetchPort): WebFetchPort {
	return {
		async fetch(url: string): Promise<WebFetchResult> {
			try {
				const response = await globalThis.fetch("https://api.firecrawl.dev/v1/scrape", {
					method: "POST",
					headers: {
						"content-type": "application/json",
						authorization: `Bearer ${key}`,
					},
					body: JSON.stringify({ url, formats: ["markdown"], onlyMainContent: true }),
					signal: AbortSignal.timeout(FIRECRAWL_TIMEOUT_MS),
				});
				if (!response.ok) return fallback.fetch(url);

				const payload = (await response.json()) as {
					success?: boolean;
					data?: { markdown?: unknown; metadata?: { title?: unknown; statusCode?: unknown } };
				};
				const markdown = payload.data?.markdown;
				if (payload.success === false || typeof markdown !== "string" || markdown.trim() === "") {
					return fallback.fetch(url);
				}

				const title = payload.data?.metadata?.title;
				const status = payload.data?.metadata?.statusCode;
				return {
					body: markdown,
					...(typeof status === "number" ? { status } : { status: 200 }),
					...(typeof title === "string" && title ? { title } : {}),
				};
			} catch {
				return fallback.fetch(url);
			}
		},
	};
}
