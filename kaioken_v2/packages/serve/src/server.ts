import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, normalize, resolve, sep } from "node:path";
import { type IndexResult, readIndexArtifact } from "@kaioken/index";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { firstHeading, type Kind, SearchIndex } from "@kaioken/search";
import { buildGraph } from "./graph.js";
import { EMPTY_LIBRARY, type Library, readCardFile, readLibrary } from "./library.js";
import { outline, renderMarkdown, stripTitle } from "./markdown.js";
import {
	cardPage,
	cardsPage,
	docPage,
	filePage,
	filesPage,
	graphPage,
	notFoundPage,
	overviewPage,
	searchPage,
	type Site,
	skillPage,
	skillsPage,
	wikiPage,
} from "./pages.js";

export interface ServeOptions {
	root: string;
	port?: number;
	/**
	 * Loopback only by default. Generated knowledge is not public, and a server
	 * that binds every interface makes it so without anyone deciding to.
	 */
	host?: string;
}

export interface RunningServer {
	url: string;
	port: number;
	/**
	 * One line about what is actually there to read, or empty when nothing has
	 * been generated yet. A URL alone does not tell anyone whether opening it is
	 * worth the trip.
	 */
	summary: string;
	close(): Promise<void>;
}

export async function serve(options: ServeOptions): Promise<RunningServer> {
	const root = resolve(options.root);
	const host = options.host ?? "127.0.0.1";
	const port = options.port ?? 7777;

	// Loaded once at start-up: serving is a read of what the pipeline already
	// wrote, never a build. Restarting is the refresh.
	const index = await readIndexArtifact(root);
	const search = await SearchIndex.open(root);
	const library = await readLibrary(root);

	const server = createServer((req, res) => {
		handle(req.url ?? "/", { root, index, search, library })
			.then((response) => {
				res.writeHead(response.status, {
					"content-type": response.type,
					// The pages are self-contained; forbid everything else outright. The
					// graph page is the one exception that carries a script, so it alone
					// gets a policy that permits its own inline engine and its same-origin
					// fetch of /graph.json.
					"content-security-policy": response.graph
						? "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; form-action 'self'"
						: "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'",
					"x-content-type-options": "nosniff",
					"referrer-policy": "no-referrer",
				});
				res.end(response.body);
			})
			.catch((error: unknown) => {
				res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
				res.end(`kaioken serve: ${error instanceof Error ? error.message : String(error)}\n`);
			});
	});

	await new Promise<void>((ready, fail) => {
		server.once("error", fail);
		server.listen(port, host, () => {
			server.removeListener("error", fail);
			ready();
		});
	});

	const actual = (server.address() as { port: number }).port;
	return {
		url: `http://${host}:${actual}`,
		port: actual,
		summary: summarise(library, index?.symbolCount ?? 0),
		close: () => closeServer(server),
	};
}

function summarise(library: Library, symbolCount: number): string {
	const parts: string[] = [];
	if (library.docs.length > 0) {
		const moved = library.counts.stale + library.counts.orphaned;
		parts.push(
			`${library.docs.length} wiki document${library.docs.length === 1 ? "" : "s"}${
				library.judged && moved > 0 ? ` (${moved} stale)` : ""
			}`,
		);
	}
	if (library.cards.length > 0) parts.push(`${library.cards.length} cards`);
	if (library.skills.length > 0) parts.push(`${library.skills.length} skills`);
	if (symbolCount > 0) parts.push(`${symbolCount} declarations`);
	return parts.join(" · ");
}

interface Context {
	root: string;
	index: IndexResult | null;
	search: SearchIndex;
	library?: Library;
}

interface Response {
	status: number;
	type: string;
	body: string;
	/** True only for the graph page and its data, which alone need script and fetch allowed. */
	graph?: boolean;
}

const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";
const KINDS: readonly Kind[] = ["wiki", "card", "skill", "symbol"];

/** Routing is a pure function of the URL so it can be tested without a socket. */
export async function handle(rawUrl: string, ctx: Context): Promise<Response> {
	const url = new URL(rawUrl, "http://localhost");
	const path = decodeURIComponent(url.pathname);
	const site: Site = {
		root: ctx.root,
		index: ctx.index,
		library: ctx.library ?? EMPTY_LIBRARY,
	};

	if (path === "/") {
		return html(
			overviewPage(site, ctx.search.kinds(), ctx.search.chunkCount, ctx.search.semantic),
		);
	}

	if (path === "/wiki") return html(wikiPage(site));
	if (path === "/cards") return html(cardsPage(site));
	if (path === "/skills") return html(skillsPage(site));

	if (path === "/graph") return { status: 200, type: HTML, body: graphPage(), graph: true };
	if (path === "/graph.json") {
		const graph = buildGraph(ctx.root, site.library);
		return {
			status: 200,
			type: JSON_TYPE,
			body: `${JSON.stringify(graph)}\n`,
			graph: true,
		};
	}

	if (path === "/files") return html(filesPage(site, url.searchParams.get("lang") ?? ""));

	if (path === "/search" || path === "/api/search") {
		const query = url.searchParams.get("q") ?? "";
		const limit = clampLimit(url.searchParams.get("limit"));
		const kind = kindOf(url.searchParams.get("kind"));
		const hits = query.trim()
			? await ctx.search.search({ text: query, limit, ...(kind ? { kinds: [kind] } : {}) })
			: [];

		if (path === "/api/search") {
			return {
				status: 200,
				type: JSON_TYPE,
				body: `${JSON.stringify({ query, kind: kind ?? null, semantic: ctx.search.semantic, hits }, null, 2)}\n`,
			};
		}
		return html(
			searchPage(site, query, hits, ctx.search.semantic, kind ?? "", ctx.search.kinds(), limit),
		);
	}

	if (path.startsWith("/f/")) {
		const page = filePage(site, path.slice(3));
		return page ? html(page) : html(notFoundPage(site, "No such indexed file."), 404);
	}

	if (path.startsWith("/d/")) return serveMarkdown(site, "wiki", path.slice(3));
	if (path.startsWith("/s/")) return serveMarkdown(site, "skills", path.slice(3));
	if (path.startsWith("/c/")) return serveCard(site, path.slice(3));

	return html(notFoundPage(site, "No such page."), 404);
}

/**
 * Generated markdown is read from disk on request. The path is confined to the
 * store it belongs to: a request is untrusted input, and `../` in a URL must not
 * reach the rest of the machine.
 */
async function serveMarkdown(
	site: Site,
	store: "wiki" | "skills",
	rawPath: string,
): Promise<Response> {
	const target = confine(join(site.root, KAIOKEN_DIR, store), rawPath);
	if (!target) return html(notFoundPage(site, "No such document."), 404);
	if (!target.toLowerCase().endsWith(".md")) {
		return html(notFoundPage(site, "Only generated markdown is served here."), 404);
	}

	let body: string;
	try {
		body = await readFile(target, "utf8");
	} catch {
		return html(notFoundPage(site, "No such document."), 404);
	}

	if (store === "skills") {
		// Frontmatter is machinery for the agent that loads the skill, not prose
		// for a reader; showing it as a paragraph of stray colons helps nobody.
		const stripped = body.replace(/^﻿/, "").replace(/^---\n[\s\S]*?\n---\n?/, "");
		const skill = site.library.skills.find((entry) => entry.path === rawPath);
		const name = skill?.name || firstHeading(stripped, rawPath);
		const prose = stripTitle(stripped, firstHeading(stripped, rawPath));
		return html(skillPage(site, rawPath, name, outline(prose), renderMarkdown(prose)));
	}

	const title = firstHeading(body, rawPath);
	const prose = stripTitle(body, title);
	// A document page carries the small local-graph preview in its rail, which
	// needs the same relaxed policy as /graph itself.
	return html(docPage(site, rawPath, title, outline(prose), renderMarkdown(prose)), 200, true);
}

/** Cards are JSON on disk; the page is the readable rendering of one. */
async function serveCard(site: Site, rawPath: string): Promise<Response> {
	const target = confine(join(site.root, KAIOKEN_DIR, "cards"), rawPath);
	if (!target || !target.toLowerCase().endsWith(".json")) {
		return html(notFoundPage(site, "No such card."), 404);
	}

	const card = await readCardFile(target);
	if (!card) return html(notFoundPage(site, "No such card."), 404);

	return html(cardPage(site, rawPath, card));
}

/**
 * Resolve a request path inside one store, or refuse it.
 *
 * The check is on the resolved absolute path rather than on the text of the URL:
 * decoding, `..` and separator differences all collapse before it is made, which
 * is the only way to make one comparison stand for all of them.
 */
function confine(storeRoot: string, rawPath: string): string | null {
	const target = resolve(storeRoot, normalize(rawPath));
	if (target !== storeRoot && !target.startsWith(storeRoot + sep)) return null;
	return target;
}

function kindOf(raw: string | null): Kind | null {
	const found = KINDS.find((kind) => kind === raw);
	return found ?? null;
}

function clampLimit(raw: string | null): number {
	const parsed = Number.parseInt(raw ?? "", 10);
	if (!Number.isFinite(parsed)) return 20;
	return Math.min(Math.max(parsed, 1), 100);
}

function html(body: string, status = 200, graph = false): Response {
	return { status, type: HTML, body, graph };
}

function closeServer(server: Server): Promise<void> {
	return new Promise((done) => {
		server.close(() => done());
		server.closeAllConnections?.();
	});
}
