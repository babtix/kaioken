import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { join, normalize, resolve, sep } from "node:path";
import { type IndexResult, readIndexArtifact } from "@kaioken/index";
import { KAIOKEN_DIR } from "@kaioken/scan";
import { SearchIndex } from "@kaioken/search";
import { firstHeading } from "@kaioken/search";
import { renderMarkdown } from "./markdown.js";
import {
	docPage,
	filePage,
	filesPage,
	notFoundPage,
	overviewPage,
	searchPage,
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

	const server = createServer((req, res) => {
		handle(req.url ?? "/", { root, index, search })
			.then((response) => {
				res.writeHead(response.status, {
					"content-type": response.type,
					// The pages are self-contained; forbid everything else outright.
					"content-security-policy":
						"default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self'",
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
		close: () => closeServer(server),
	};
}

interface Context {
	root: string;
	index: IndexResult | null;
	search: SearchIndex;
}

interface Response {
	status: number;
	type: string;
	body: string;
}

const HTML = "text/html; charset=utf-8";
const JSON_TYPE = "application/json; charset=utf-8";

/** Routing is a pure function of the URL so it can be tested without a socket. */
export async function handle(rawUrl: string, ctx: Context): Promise<Response> {
	const url = new URL(rawUrl, "http://localhost");
	const path = decodeURIComponent(url.pathname);

	if (path === "/") {
		return html(
			overviewPage(
				ctx.root,
				ctx.index,
				ctx.search.kinds(),
				ctx.search.chunkCount,
				ctx.search.semantic,
			),
		);
	}

	if (path === "/files") return html(filesPage(ctx.index));

	if (path === "/search" || path === "/api/search") {
		const query = url.searchParams.get("q") ?? "";
		const limit = clampLimit(url.searchParams.get("limit"));
		const hits = query.trim() ? await ctx.search.search({ text: query, limit }) : [];

		if (path === "/api/search") {
			return {
				status: 200,
				type: JSON_TYPE,
				body: `${JSON.stringify({ query, semantic: ctx.search.semantic, hits }, null, 2)}\n`,
			};
		}
		return html(searchPage(query, hits, ctx.search.semantic));
	}

	if (path.startsWith("/f/")) {
		const page = filePage(ctx.index, path.slice(3));
		return page ? html(page) : html(notFoundPage("No such indexed file."), 404);
	}

	if (path.startsWith("/d/")) return serveDoc(ctx.root, path.slice(3));

	return html(notFoundPage("No such page."), 404);
}

/**
 * Wiki documents are read from disk on request. The path is confined to the wiki
 * directory: a request is untrusted input, and `../` in a URL must not reach the
 * rest of the machine.
 */
async function serveDoc(root: string, rawPath: string): Promise<Response> {
	const wikiRoot = join(root, KAIOKEN_DIR, "wiki");
	const target = resolve(wikiRoot, normalize(rawPath));

	if (target !== wikiRoot && !target.startsWith(wikiRoot + sep)) {
		return html(notFoundPage("No such document."), 404);
	}
	if (!target.toLowerCase().endsWith(".md")) {
		return html(notFoundPage("Only generated markdown is served here."), 404);
	}

	let body: string;
	try {
		body = await readFile(target, "utf8");
	} catch {
		return html(notFoundPage("No such document."), 404);
	}

	return html(docPage(rawPath, firstHeading(body, rawPath), renderMarkdown(body)));
}

function clampLimit(raw: string | null): number {
	const parsed = Number.parseInt(raw ?? "", 10);
	if (!Number.isFinite(parsed)) return 20;
	return Math.min(Math.max(parsed, 1), 100);
}

function html(body: string, status = 200): Response {
	return { status, type: HTML, body };
}

function closeServer(server: Server): Promise<void> {
	return new Promise((done) => {
		server.close(() => done());
		server.closeAllConnections?.();
	});
}
