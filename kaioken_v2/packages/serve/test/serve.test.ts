import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, writeIndexArtifact } from "@kaioken/index";
import { scan, writeScanArtifact } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import { renderMarkdown, serve } from "../dist/index.js";

const roots: string[] = [];
const servers: { close(): Promise<void> }[] = [];

afterEach(async () => {
	await Promise.all(servers.splice(0).map((s) => s.close()));
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-serve-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	const scanned = await scan(root);
	await writeScanArtifact(root, scanned);
	const { index } = await buildIndex(scanned);
	await writeIndexArtifact(root, index);
	return root;
}

/** Port 0 lets the OS pick, so tests never collide with a real server. */
async function start(root: string) {
	const server = await serve({ root, port: 0 });
	servers.push(server);
	return server;
}

const FILES = {
	"src/wiki.ts": [
		"/** Handles a wiki search request. */",
		"export function handleWikiSearch(q: string): string[] {",
		"\treturn [q];",
		"}",
		"",
	].join("\n"),
	".kaioken/wiki/core/overview.md": [
		"# Retrieval overview",
		"",
		"## Ranking",
		"",
		"Lexical ranking always runs and needs no credentials at all.",
		"",
	].join("\n"),
};

describe("serving", () => {
	it("renders an overview of what is indexed", async () => {
		const server = await start(await repo(FILES));
		const body = await (await fetch(`${server.url}/`)).text();
		expect(body).toContain("Repository knowledge");
		expect(body).toContain("declarations");
	});

	it("lists indexed files and opens one", async () => {
		const server = await start(await repo(FILES));
		expect(await (await fetch(`${server.url}/files`)).text()).toContain("src/wiki.ts");

		const page = await (await fetch(`${server.url}/f/src/wiki.ts`)).text();
		expect(page).toContain("handleWikiSearch");
		expect(page).toContain("Handles a wiki search request.");
	});

	it("renders a generated chapter as readable html", async () => {
		const server = await start(await repo(FILES));
		const page = await (await fetch(`${server.url}/d/core/overview.md`)).text();
		expect(page).toContain("Retrieval overview");
		expect(page).toContain("<h2 id=\"ranking\">Ranking</h2>");
	});

	it("answers a search from the browser", async () => {
		const server = await start(await repo(FILES));
		const page = await (await fetch(`${server.url}/search?q=wiki+search`)).text();
		expect(page).toContain("handleWikiSearch");
	});

	it("exposes a json search endpoint", async () => {
		const server = await start(await repo(FILES));
		const res = await fetch(`${server.url}/api/search?q=wiki+search&limit=3`);
		expect(res.headers.get("content-type")).toContain("application/json");

		const body = (await res.json()) as { semantic: boolean; hits: { heading: string }[] };
		expect(body.semantic).toBe(false);
		expect(body.hits[0]?.heading).toContain("handleWikiSearch");
	});

	it("works on a repository with nothing indexed yet", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-serve-"));
		roots.push(root);
		const server = await start(root);
		expect(await (await fetch(`${server.url}/`)).text()).toContain("Nothing indexed yet");
	});
});

/**
 * A request is untrusted input, and generated documents are model output.
 * Neither is allowed to reach past the wiki directory or to inject script.
 */
describe("boundaries", () => {
	it("binds loopback only, so knowledge is not published by accident", async () => {
		const server = await start(await repo(FILES));
		expect(server.url.startsWith("http://127.0.0.1:")).toBe(true);
	});

	it("refuses to traverse out of the wiki directory", async () => {
		const server = await start(await repo(FILES));
		for (const path of [
			"/d/../../../package.json",
			"/d/..%2f..%2fpackage.json",
			"/d/core/../../../../etc/passwd",
		]) {
			expect((await fetch(`${server.url}${path}`)).status).toBe(404);
		}
	});

	it("serves only markdown from the wiki directory", async () => {
		const root = await repo(FILES);
		await writeFile(join(root, ".kaioken/wiki/secret.env"), "TOKEN=abc\n", "utf8");
		const server = await start(root);
		expect((await fetch(`${server.url}/d/secret.env`)).status).toBe(404);
	});

	it("sends a content security policy that forbids script", async () => {
		const server = await start(await repo(FILES));
		const csp = (await fetch(`${server.url}/`)).headers.get("content-security-policy");
		expect(csp).toContain("default-src 'none'");
		expect(csp).not.toContain("script-src");
	});

	it("returns 404 for unknown pages and files", async () => {
		const server = await start(await repo(FILES));
		expect((await fetch(`${server.url}/nope`)).status).toBe(404);
		expect((await fetch(`${server.url}/f/does/not/exist.ts`)).status).toBe(404);
	});
});

describe("markdown rendering", () => {
	it("renders headings, lists, code and emphasis", () => {
		const html = renderMarkdown(
			["# Title", "", "- one", "- two", "", "```ts", "const x = 1;", "```", "", "**bold** and *italic* and `code`"].join("\n"),
		);
		expect(html).toContain('<h1 id="title">Title</h1>');
		expect(html).toContain("<li>one</li>");
		expect(html).toContain("<code>const x = 1;</code>");
		expect(html).toContain("<strong>bold</strong>");
		expect(html).toContain("<em>italic</em>");
	});

	it("does not let markup in a generated document become html", () => {
		const html = renderMarkdown("A paragraph with <script>alert(1)</script> in it.");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;script&gt;");
	});

	it("does not apply emphasis rules inside a code span", () => {
		expect(renderMarkdown("Use `a * b * c` carefully.")).toContain("<code>a * b * c</code>");
	});

	it("drops a javascript: link rather than rendering it", () => {
		const html = renderMarkdown("[click](javascript:alert(1))");
		expect(html).not.toContain("javascript:");
		expect(html).toContain("click");
	});

	it("keeps relative and http links", () => {
		expect(renderMarkdown("[a](./other.md)")).toContain('href="./other.md"');
		expect(renderMarkdown("[b](https://example.com)")).toContain('href="https://example.com"');
	});

	it("treats an unmatched backtick as literal text", () => {
		expect(renderMarkdown("a ` b")).toContain("<p>a ` b</p>");
	});
});
