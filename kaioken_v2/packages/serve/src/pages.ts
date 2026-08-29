import type { IndexResult } from "@kaioken/index";
import type { SearchHit } from "@kaioken/search";
import { escapeAttr, escapeHtml } from "./markdown.js";

/**
 * Every page is one self-contained document: styles inline, no external fonts,
 * no CDN, no analytics. Nothing about browsing generated knowledge should
 * require a network, and nothing about it should leave the machine.
 */

const STYLE = `
:root {
  --bg: #ffffff; --fg: #1a1a1a; --muted: #666; --line: #e2e2e2;
  --accent: #b3341c; --code-bg: #f6f6f4; --hit: #fff5b1;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #16171a; --fg: #e6e6e6; --muted: #9a9a9a; --line: #2c2e33;
    --accent: #ff7a5c; --code-bg: #1e2024; --hit: #4a4320;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.wrap { max-width: 860px; margin: 0 auto; padding: 0 24px 96px; }
header { border-bottom: 1px solid var(--line); margin-bottom: 28px; }
header .wrap { padding-top: 20px; padding-bottom: 16px; }
.brand { font-weight: 650; letter-spacing: -0.01em; color: var(--accent); text-decoration: none; }
nav { display: flex; gap: 18px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
nav a { color: var(--muted); text-decoration: none; font-size: 14px; }
nav a:hover { color: var(--fg); }
h1 { font-size: 25px; letter-spacing: -0.02em; margin: 22px 0 6px; }
h2 { font-size: 20px; letter-spacing: -0.01em; margin: 30px 0 8px; }
h3 { font-size: 17px; margin: 24px 0 6px; }
a { color: var(--accent); }
.muted { color: var(--muted); }
.sub { color: var(--muted); font-size: 14px; margin: 0 0 22px; }
form.search { display: flex; gap: 8px; margin: 18px 0 6px; }
input[type=search] {
  flex: 1; padding: 9px 12px; font-size: 15px; color: var(--fg);
  background: var(--bg); border: 1px solid var(--line); border-radius: 7px;
}
input[type=search]:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
button {
  padding: 9px 16px; font-size: 15px; cursor: pointer; border-radius: 7px;
  border: 1px solid var(--line); background: var(--code-bg); color: var(--fg);
}
table { border-collapse: collapse; width: 100%; margin: 14px 0; font-size: 14px; }
th, td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--line); }
th { color: var(--muted); font-weight: 550; }
td.num { text-align: right; font-variant-numeric: tabular-nums; }
code, pre.code { font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace; }
code { background: var(--code-bg); padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
pre.code {
  background: var(--code-bg); padding: 13px 15px; border-radius: 8px;
  overflow-x: auto; font-size: 13px; line-height: 1.55;
}
pre.code code { background: none; padding: 0; font-size: inherit; }
blockquote {
  margin: 14px 0; padding: 2px 0 2px 15px;
  border-left: 3px solid var(--line); color: var(--muted);
}
hr { border: 0; border-top: 1px solid var(--line); margin: 28px 0; }
.hit { padding: 15px 0; border-bottom: 1px solid var(--line); }
.hit:last-child { border-bottom: 0; }
.hit .where { font-size: 13px; color: var(--muted); margin-bottom: 3px; }
.hit .title { font-weight: 600; margin-bottom: 4px; }
.hit .snippet { font-size: 14px; color: var(--fg); }
.tag {
  display: inline-block; font-size: 11px; text-transform: uppercase;
  letter-spacing: 0.05em; padding: 1px 6px; border-radius: 4px;
  background: var(--code-bg); color: var(--muted); border: 1px solid var(--line);
}
.stats { display: flex; gap: 28px; flex-wrap: wrap; margin: 18px 0 4px; }
.stat .n { font-size: 24px; font-weight: 600; letter-spacing: -0.02em; }
.stat .k { font-size: 13px; color: var(--muted); }
.empty {
  padding: 22px; border: 1px dashed var(--line); border-radius: 9px;
  color: var(--muted); font-size: 14px;
}
ul.files { list-style: none; padding: 0; }
ul.files li { padding: 5px 0; border-bottom: 1px solid var(--line); font-size: 14px; }
.sig { font-size: 13px; color: var(--muted); }
`;

export function layout(title: string, body: string, query = ""): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header><div class="wrap">
  <a class="brand" href="/">kaioken</a>
  <nav>
    <a href="/">Overview</a>
    <a href="/files">Files</a>
    <a href="/search">Search</a>
  </nav>
</div></header>
<div class="wrap">
<form class="search" action="/search" method="get">
  <input type="search" name="q" placeholder="Search this repository" value="${escapeAttr(query)}" autofocus>
  <button type="submit">Search</button>
</form>
${body}
</div>
</body>
</html>`;
}

export function overviewPage(
	root: string,
	index: IndexResult | null,
	counts: Record<string, number>,
	chunkCount: number,
	semantic: boolean,
): string {
	if (!index) {
		return layout(
			"kaioken",
			`<h1>Nothing indexed yet</h1>
       <p class="sub">${escapeHtml(root)}</p>
       <div class="empty">Run <code>kaioken scan</code> in this repository first.</div>`,
		);
	}

	const languages = Object.entries(
		index.files.reduce<Record<string, number>>((acc, file) => {
			acc[file.language] = (acc[file.language] ?? 0) + 1;
			return acc;
		}, {}),
	).sort((a, b) => b[1] - a[1]);

	const tenants = Object.entries(counts).sort((a, b) => b[1] - a[1]);

	return layout(
		"kaioken",
		`<h1>Repository knowledge</h1>
     <p class="sub">${escapeHtml(root)}</p>
     <div class="stats">
       <div class="stat"><div class="n">${index.symbolCount}</div><div class="k">declarations</div></div>
       <div class="stat"><div class="n">${index.fileCount}</div><div class="k">indexed files</div></div>
       <div class="stat"><div class="n">${chunkCount}</div><div class="k">searchable passages</div></div>
     </div>
     <p class="muted" style="font-size:13px">
       Ranking: lexical (BM25)${semantic ? " + semantic" : ""}.
       ${semantic ? "" : "No embedding provider configured — search still works."}
     </p>
     <h2>Corpus</h2>
     ${
				tenants.length === 0
					? '<div class="empty">Nothing in the corpus yet.</div>'
					: `<table><tr><th>Tenant</th><th class="num">Documents</th></tr>${tenants
							.map(([kind, n]) => `<tr><td>${escapeHtml(kind)}</td><td class="num">${n}</td></tr>`)
							.join("")}</table>`
			}
     <h2>Languages</h2>
     <table><tr><th>Language</th><th class="num">Files</th></tr>${languages
				.map(([lang, n]) => `<tr><td>${escapeHtml(lang)}</td><td class="num">${n}</td></tr>`)
				.join("")}</table>`,
	);
}

export function filesPage(index: IndexResult | null): string {
	if (!index || index.files.length === 0) {
		return layout("Files", `<h1>Files</h1><div class="empty">Nothing indexed yet.</div>`);
	}

	const rows = index.files
		.map(
			(file) =>
				`<li><a href="/f/${escapeAttr(file.path)}">${escapeHtml(file.path)}</a>
         <span class="muted"> · ${escapeHtml(file.language)} · ${file.symbols.length} declarations</span></li>`,
		)
		.join("");

	return layout(
		"Files",
		`<h1>Files</h1><p class="sub">${index.files.length} indexed</p><ul class="files">${rows}</ul>`,
	);
}

export function filePage(index: IndexResult | null, path: string): string | null {
	const file = index?.files.find((f) => f.path === path);
	if (!file) return null;

	const rows = file.symbols
		.map(
			(symbol) => `<div class="hit">
        <div class="where">${escapeHtml(symbol.kind)} · lines ${symbol.startLine}–${symbol.endLine} ·
          ${symbol.exported ? "exported" : "internal"}</div>
        <div class="title">${escapeHtml(symbol.parent ? `${symbol.parent}.` : "")}${escapeHtml(symbol.name)}</div>
        <pre class="code"><code>${escapeHtml(symbol.signature)}</code></pre>
        ${symbol.doc ? `<div class="snippet">${escapeHtml(symbol.doc)}</div>` : ""}
      </div>`,
		)
		.join("");

	return layout(
		file.path,
		`<h1>${escapeHtml(file.path)}</h1>
     <p class="sub">${escapeHtml(file.language)} · ${file.lineCount} lines · ${file.symbols.length} declarations</p>
     ${file.symbols.length === 0 ? '<div class="empty">No declarations indexed.</div>' : rows}`,
	);
}

export function searchPage(query: string, hits: SearchHit[], semantic: boolean): string {
	if (!query.trim()) {
		return layout(
			"Search",
			`<h1>Search</h1>
       <p class="sub">Lexical ranking${semantic ? " and semantic ranking are" : " is"} available.</p>
       <div class="empty">Type a query above. Search needs no credentials and no network.</div>`,
			query,
		);
	}

	if (hits.length === 0) {
		return layout(
			`${query} — no results`,
			`<h1>No results</h1><p class="sub">Nothing in the corpus matches “${escapeHtml(query)}”.</p>`,
			query,
		);
	}

	const body = hits
		.map((hit) => {
			const href =
				hit.kind === "symbol" ? `/f/${escapeAttr(hit.path)}` : `/d/${escapeAttr(hit.path)}`;
			return `<div class="hit">
        <div class="where">
          <span class="tag">${escapeHtml(hit.kind)}</span>
          ${escapeHtml(hit.path)}${hit.line ? `:${hit.line}` : ""}
          ${hit.via.includes("semantic") ? '<span class="tag">semantic</span>' : ""}
        </div>
        <div class="title"><a href="${href}">${escapeHtml(hit.heading || hit.title)}</a></div>
        <div class="snippet">${escapeHtml(hit.snippet)}</div>
      </div>`;
		})
		.join("");

	return layout(
		`${query} — search`,
		`<h1>${hits.length} result${hits.length === 1 ? "" : "s"}</h1>
     <p class="sub">for “${escapeHtml(query)}”</p>${body}`,
		query,
	);
}

export function docPage(path: string, title: string, html: string): string {
	return layout(title, `<h1>${escapeHtml(title)}</h1><p class="sub">${escapeHtml(path)}</p>${html}`);
}

export function notFoundPage(what: string): string {
	return layout(
		"Not found",
		`<h1>Not found</h1><div class="empty">${escapeHtml(what)}</div>`,
	);
}
