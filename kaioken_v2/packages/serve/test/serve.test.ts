import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, writeIndexArtifact } from "@kaioken/index";
import { scan, writeScanArtifact } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import { highlight, outline, renderMarkdown, serve } from "../dist/index.js";

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

/**
 * A repository with a written wiki, its outline, its provenance, a card and a
 * skill — the state the serve layer actually exists to present.
 */
async function documented(options: { move?: string } = {}): Promise<string> {
	const root = await repo({
		...FILES,
		"src/rank.ts": [
			"/** Ranks passages against a query. */",
			"export function rank(query: string): number {",
			"\treturn query.length;",
			"}",
			"",
		].join("\n"),
		".kaioken/wiki-plan.yaml": [
			"version: 1",
			"generatedAt: 2026-01-01T00:00:00.000Z",
			"multiplier: 1",
			"chapters:",
			"  - id: core",
			"    title: Retrieval",
			"    goal: How a query becomes a ranked list.",
			"    files:",
			"      - src/rank.ts",
			"    sections:",
			"      - id: ranking",
			"        title: Ranking",
			"        summary: BM25 and the semantic layer.",
			"        files:",
			"          - src/rank.ts",
			"  - id: later",
			"    title: Serving",
			"    goal: How it is read.",
			"    files:",
			"      - src/wiki.ts",
			"",
		].join("\n"),
		".kaioken/wiki/core/index.md": [
			"# Retrieval",
			"",
			"## Scope",
			"",
			"Everything about ranking.",
			"",
		].join("\n"),
		".kaioken/wiki/core/ranking.md": [
			"# Ranking",
			"",
			"## Lexical",
			"",
			"BM25 runs always.",
			"",
		].join("\n"),
		".kaioken/wiki/later/index.md": [
			"# Serving",
			"",
			"## Routes",
			"",
			"One function of the URL.",
			"",
		].join("\n"),
		".kaioken/cards/core.json": JSON.stringify(
			{
				moduleId: "core",
				name: "Core retrieval",
				summary: "Ranks passages.",
				keyPoints: ["BM25 always runs."],
				entryPoints: [{ name: "rank", file: "src/rank.ts", note: "The ranking entry point." }],
				sources: [{ path: "src/rank.ts", hash: "x" }],
				verification: { grounded: 1, ungrounded: [], unknownFiles: [], uncovered: [] },
			},
			null,
			2,
		),
		".kaioken/skills/add-a-route/SKILL.md": [
			"---",
			"name: add-a-route",
			"description: Add a page to the serve layer.",
			"---",
			"",
			"# add-a-route",
			"",
			"## Steps",
			"",
			"1. Add the route.",
			"",
		].join("\n"),
	});

	// Provenance is written from the scan, so "current" means current. One source
	// can be given a hash that no longer matches, which is what staleness is.
	const scanned = JSON.parse(await readFile(join(root, ".kaioken/scan.json"), "utf8")) as {
		files: { path: string; hash: string }[];
	};
	const hashOf = (path: string): string =>
		scanned.files.find((file) => file.path === path)?.hash ?? "missing";

	const documents = [
		{ document: "core/index.md", chapterId: "core", sources: ["src/rank.ts"] },
		{
			document: "core/ranking.md",
			chapterId: "core",
			sectionId: "ranking",
			sources: ["src/rank.ts"],
		},
		{ document: "later/index.md", chapterId: "later", sources: ["src/wiki.ts"] },
	].map((record) => ({
		...record,
		generatedAt: "2026-01-01T00:00:00.000Z",
		sources: record.sources.map((path) => ({
			path,
			hash: options.move === record.document ? "0".repeat(40) : hashOf(path),
		})),
	}));

	await writeFile(
		join(root, ".kaioken/provenance.json"),
		JSON.stringify({ version: 1, generatedAt: "2026-01-01T00:00:00.000Z", documents }, null, 2),
		"utf8",
	);

	return root;
}

const text = async (url: string): Promise<string> => (await fetch(url)).text();

/**
 * The wiki is what this server exists for. A chapter nobody can navigate to is a
 * chapter nobody reads, so these are about reaching a document at all — not
 * about how it looks once reached.
 */
describe("browsing the wiki", () => {
	it("lists chapters in the order the plan puts them, not the directory's", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/wiki`);

		expect(page).toContain("Retrieval");
		expect(page).toContain("Serving");
		expect(page.indexOf("Retrieval")).toBeLessThan(page.indexOf("Serving"));
		// The plan's wording is what tells a reader which chapter to open.
		expect(page).toContain("How a query becomes a ranked list.");
	});

	it("carries the whole outline into every document, with the current one marked", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/d/core/ranking.md`);

		expect(page).toContain('aria-current="page"');
		expect(page).toContain("/d/later/index.md");
		// Its own headings, so a long chapter has a map.
		expect(page).toContain('href="#lexical"');
	});

	it("offers the next document in reading order", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/d/core/index.md`);

		expect(page).toContain("Next");
		expect(page).toContain("/d/core/ranking.md");
	});

	it("does not print the document's title twice", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/d/core/ranking.md`);

		expect(page).toContain("<h1>Ranking</h1>");
		expect(page).not.toContain('<h1 id="ranking">Ranking</h1>');
	});

	it("says what a document was written from", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/d/core/index.md`);

		expect(page).toContain("Written from 1 file");
		expect(page).toContain("/f/src/rank.ts");
	});
});

/**
 * Presenting a document the code has moved past as though it were current would
 * be worse than presenting none, so the label has to be on the page a reader is
 * actually reading.
 */
describe("freshness", () => {
	it("marks a document stale on its own page when a source has changed", async () => {
		const server = await start(await documented({ move: "core/ranking.md" }));
		const page = await text(`${server.url}/d/core/ranking.md`);

		expect(page).toContain("badge-stale");
		expect(page).toContain("changed since this was written");
		expect(page).toContain("kaioken update");
	});

	it("leaves an untouched document current", async () => {
		const server = await start(await documented({ move: "core/ranking.md" }));
		const page = await text(`${server.url}/d/core/index.md`);

		expect(page).toContain("badge-current");
		expect(page).not.toContain("changed since this was written");
	});

	it("reports what it cannot judge rather than claiming freshness", async () => {
		// FILES has a wiki document but no provenance record for it.
		const server = await start(await repo(FILES));
		expect(await text(`${server.url}/wiki`)).toContain("Freshness is unknown");
	});

	it("links a source file back to the documents written from it", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/f/src/rank.ts`);

		expect(page).toContain("Documented in");
		expect(page).toContain("/d/core/ranking.md");
	});
});

/**
 * The search index returns four tenants. A result that cannot be opened is worse
 * than one that was never returned, so every tenant needs a page.
 */
describe("every tenant is browsable", () => {
	it("opens a knowledge card", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/c/core.json`);

		expect(page).toContain("Core retrieval");
		expect(page).toContain("The ranking entry point.");
		expect(page).toContain("/f/src/rank.ts");
	});

	it("opens a skill without its frontmatter", async () => {
		const server = await start(await documented());
		const page = await text(`${server.url}/s/add-a-route/SKILL.md`);

		expect(page).toContain("add-a-route");
		expect(page).toContain("Add the route.");
		expect(page).not.toContain("description: Add a page");
	});

	it("points every search result at a page that exists", async () => {
		const server = await start(await documented());
		const found = (await (await fetch(`${server.url}/api/search?q=rank&limit=25`)).json()) as {
			hits: { kind: string; path: string }[];
		};

		const seen = new Set<string>();
		for (const hit of found.hits) {
			const href =
				hit.kind === "symbol"
					? `/f/${hit.path}`
					: hit.kind === "card"
						? `/c/${hit.path.replace(/^cards\//, "")}`
						: hit.kind === "skill"
							? `/s/${hit.path.replace(/^skills\//, "")}`
							: `/d/${hit.path}`;
			if (seen.has(href)) continue;
			seen.add(href);
			expect((await fetch(`${server.url}${href}`)).status, href).toBe(200);
		}
		expect(seen.size).toBeGreaterThan(1);
	});

	it("restricts a search to one tenant when asked", async () => {
		const server = await start(await documented());
		const found = (await (await fetch(`${server.url}/api/search?q=ranking&kind=wiki`)).json()) as {
			hits: { kind: string }[];
		};

		expect(found.hits.length).toBeGreaterThan(0);
		expect(found.hits.every((hit) => hit.kind === "wiki")).toBe(true);
	});

	it("keeps the traversal guard on every store", async () => {
		const server = await start(await documented());
		for (const path of ["/s/../wiki/core/index.md", "/c/../scan.json", "/c/../../package.json"]) {
			expect((await fetch(`${server.url}${path}`)).status, path).toBe(404);
		}
	});
});

describe("reading aids", () => {
	it("takes the outline from the headings, skipping fenced code", () => {
		const found = outline(
			["# Title", "", "```md", "## Not a heading", "```", "", "## Real"].join("\n"),
		);
		expect(found.map((heading) => heading.text)).toEqual(["Title", "Real"]);
		expect(found[1]?.slug).toBe("real");
	});

	it("marks query terms where a word starts, and nowhere else", () => {
		expect(highlight("Handles a wiki search", ["wiki"])).toContain("<mark>wiki</mark>");
		// Cutting an identifier into highlighted fragments makes it harder to read.
		expect(highlight("handleWikiSearch", ["wiki"])).toBe("handleWikiSearch");
	});

	it("escapes before it marks, so a snippet cannot inject markup", () => {
		const marked = highlight("<script>wiki</script>", ["wiki"]);
		expect(marked).not.toContain("<script>");
		expect(marked).toContain("<mark>wiki</mark>");
	});
});

describe("markdown tables", () => {
	it("renders a basic GFM table", () => {
		const md = [
			"| Header 1 | Header 2 |",
			"| --- | --- |",
			"| Cell 1 | Cell 2 |",
			"| Cell 3 | Cell 4 |",
		].join("\n");
		const html = renderMarkdown(md);
		expect(html).toContain('<div class="table-wrap"><table>');
		expect(html).toContain("<thead><tr><th>Header 1</th><th>Header 2</th></tr></thead>");
		expect(html).toContain("<tbody><tr><td>Cell 1</td><td>Cell 2</td></tr><tr><td>Cell 3</td><td>Cell 4</td></tr></tbody>");
		expect(html).toContain("</table></div>");
	});

	it("respects alignment markers", () => {
		const md = [
			"| Left | Center | Right |",
			"| :--- | :---: | ---: |",
			"| 1 | 2 | 3 |",
		].join("\n");
		const html = renderMarkdown(md);
		expect(html).toContain('<th align="left">Left</th>');
		expect(html).toContain('<th align="center">Center</th>');
		expect(html).toContain('<th align="right">Right</th>');
		expect(html).toContain('<td align="left">1</td>');
		expect(html).toContain('<td align="center">2</td>');
		expect(html).toContain('<td align="right">3</td>');
	});

	it("handles pipes inside code spans in table cells", () => {
		const md = [
			"| Syntax | Description |",
			"| --- | --- |",
			"| `a | b` | Union type |",
		].join("\n");
		const html = renderMarkdown(md);
		expect(html).toContain("<td><code>a | b</code></td>");
		expect(html).toContain("<td>Union type</td>");
	});

	it("falls back to paragraph when table is malformed without valid delimiter row", () => {
		const md = [
			"| Col 1 | Col 2 |",
			"not a delimiter",
			"| Val 1 | Val 2 |",
		].join("\n");
		const html = renderMarkdown(md);
		expect(html).not.toContain("<table");
		expect(html).toContain("<p>");
	});
});
