import type { IndexResult } from "@kaioken/index";
import type { Freshness } from "@kaioken/provenance";
import type { Library } from "../library.ts";
import { escapeAttr, escapeHtml } from "../markdown.ts";
export { escapeAttr, escapeHtml };

export const STYLE = `
:root {
  color-scheme: light;
  --bg: #faf9f7; --surface: #ffffff; --surface-2: #f2f1ed;
  --fg: #17181c; --muted: #5f6672; --faint: #8d94a1;
  --line: #e6e4df; --line-strong: #d3d0c9;
  --accent: #b3341c; --accent-ink: #ffffff; --accent-soft: #fbeee9;
  --code-bg: #f4f3ef; --mark: #ffe6a1;
  --ok: #1c7a4e; --ok-soft: #e7f4ec; --ok-bar: #35a86f;
  --warn: #8a5b00; --warn-soft: #faf0dc; --warn-bar: #d99b23;
  --bad: #a52f1e; --bad-soft: #fbe9e6; --bad-bar: #d9503a;
  --r: 10px; --r-sm: 6px;
  --shadow: 0 1px 1px rgba(20,20,25,.04), 0 8px 24px -18px rgba(20,20,25,.55);
}
@media (prefers-color-scheme: dark) {
  :root {
    color-scheme: dark;
    --bg: #131417; --surface: #191b1f; --surface-2: #212429;
    --fg: #e8e8e6; --muted: #a0a6b0; --faint: #767d89;
    --line: #2a2d33; --line-strong: #3a3e46;
    --accent: #ff7a5c; --accent-ink: #1a0f0c; --accent-soft: #2c1c17;
    --code-bg: #1d2025; --mark: #4b4118;
    --ok: #5fcf95; --ok-soft: #16281f; --ok-bar: #3f9d6c;
    --warn: #e0ac54; --warn-soft: #2a2114; --warn-bar: #b98530;
    --bad: #ff8a75; --bad-soft: #2c1a17; --bad-bar: #c05340;
    --shadow: 0 1px 1px rgba(0,0,0,.3), 0 8px 24px -18px rgba(0,0,0,.9);
  }
}

* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 84px; }
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body {
  margin: 0; background: var(--bg); color: var(--fg);
  font: 15px/1.6 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 3px; }

.skip {
  position: absolute; left: -9999px; top: 8px; z-index: 20;
  background: var(--accent); color: var(--accent-ink);
  padding: 8px 14px; border-radius: var(--r-sm); text-decoration: none;
}
.skip:focus { left: 12px; }

/* ---- top bar ---------------------------------------------------------- */
.topbar {
  position: sticky; top: 0; z-index: 10;
  background: color-mix(in srgb, var(--bg) 88%, transparent);
  backdrop-filter: saturate(1.4) blur(8px);
  border-bottom: 1px solid var(--line);
}
.topbar-in {
  max-width: 1140px; margin: 0 auto; padding: 10px 28px;
  display: flex; align-items: center; gap: 22px; flex-wrap: wrap;
}
.brand {
  display: inline-flex; align-items: center; gap: 9px;
  font-weight: 650; letter-spacing: -0.01em; color: var(--fg); text-decoration: none;
}
.brand .mark {
  width: 22px; height: 22px; border-radius: 6px; background: var(--accent);
  color: var(--accent-ink); display: grid; place-items: center;
  font-size: 13px; font-weight: 700;
}
.tabs { display: flex; gap: 4px; flex-wrap: wrap; margin-right: auto; }
.tabs a {
  color: var(--muted); text-decoration: none; font-size: 14px;
  padding: 5px 11px; border-radius: var(--r-sm);
}
.tabs a:hover { color: var(--fg); background: var(--surface-2); }
.tabs a[aria-current] { color: var(--fg); background: var(--surface-2); font-weight: 600; }
form.find { display: flex; gap: 7px; align-items: center; }
form.find input {
  width: 236px; max-width: 46vw; padding: 7px 12px; font-size: 14px; font-family: inherit;
  color: var(--fg); background: var(--surface);
  border: 1px solid var(--line); border-radius: 999px;
}
form.find input::placeholder { color: var(--faint); }
form.find input:focus { outline: none; border-color: var(--accent); }
form.find button {
  padding: 7px 14px; font-size: 14px; font-family: inherit; cursor: pointer;
  border-radius: 999px; border: 1px solid var(--line);
  background: var(--surface-2); color: var(--fg);
}
form.find button:hover { border-color: var(--line-strong); }
/* On a phone the chrome must not cost half the screen before the first word. */
@media (max-width: 620px) {
  .topbar-in { gap: 8px 14px; padding: 8px 16px; }
  .tabs { order: 3; width: 100%; gap: 2px; margin-right: 0; }
  .tabs a { padding: 4px 9px; font-size: 13px; }
  form.find { order: 2; margin-left: auto; }
  form.find input { width: 150px; }
  form.find button { padding: 7px 12px; }
}

/* ---- page shell ------------------------------------------------------- */
.page { max-width: 1280px; margin: 0 auto; padding: 34px 28px 110px; }
.page--railed {
  display: grid; gap: 40px; align-items: start;
  grid-template-columns: 224px minmax(0, 1fr) 236px;
  grid-template-areas: "sidebar main rail";
}
.page--railed.no-sidebar { grid-template-columns: minmax(0, 1fr) 236px; grid-template-areas: "main rail"; }
.page--railed.no-rail { grid-template-columns: 224px minmax(0, 1fr); grid-template-areas: "sidebar main"; }
.page--railed.no-sidebar.no-rail { grid-template-columns: minmax(0, 1fr); grid-template-areas: "main"; }
.page--railed > .main { grid-area: main; }
.page--railed > .sidebar { grid-area: sidebar; }
.page--railed > .rail { grid-area: rail; }
.sidebar, .rail {
  position: sticky; top: 72px; font-size: 13.5px;
  max-height: calc(100vh - 96px); overflow: auto; padding-right: 6px;
}
@media (max-width: 940px) {
  .page--railed { display: block; }
  .page--railed > .sidebar, .page--railed > .rail {
    position: static; max-height: none; margin-top: 56px;
    padding-top: 22px; border-top: 1px solid var(--line);
  }
}
/* The sidebar and rail carry the page's headings where there is room for them. */
@media (min-width: 941px) { .narrow-only { display: none; } }
@media (max-width: 620px) {
  .page { padding: 22px 16px 72px; }
  footer.foot { padding: 0 16px 32px; }
}

/* ---- headings and text ------------------------------------------------ */
h1 { font-size: 27px; line-height: 1.25; letter-spacing: -0.022em; margin: 0 0 8px; }
h2 { font-size: 19px; letter-spacing: -0.012em; margin: 34px 0 10px; }
h3 { font-size: 16px; margin: 24px 0 6px; }
.lede { color: var(--muted); font-size: 15px; margin: 0 0 26px; max-width: 62ch; }
.sub { color: var(--muted); font-size: 13.5px; margin: 0 0 22px; }
.muted { color: var(--muted); }
.mono, code, pre.code {
  font-family: ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace;
}
.crumbs {
  display: flex; gap: 7px; flex-wrap: wrap; align-items: center;
  font-size: 13px; color: var(--faint); margin: 0 0 10px;
}
.crumbs a { color: var(--muted); text-decoration: none; }
.crumbs a:hover { color: var(--accent); text-decoration: underline; }

/* ---- cards, stats, meters --------------------------------------------- */
.grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
.card {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 16px 18px; box-shadow: var(--shadow);
}
a.card { display: block; color: inherit; text-decoration: none; }
a.card:hover { border-color: var(--accent); }
.card h3 { margin: 0 0 6px; font-size: 15.5px; }
.card p { margin: 0; font-size: 13.5px; color: var(--muted); }
.stats {
  display: grid; gap: 12px; margin: 0 0 30px;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
}
.stat {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 14px 16px;
}
.stat .n {
  font-size: 26px; font-weight: 640; letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums; line-height: 1.1;
}
.stat .k { font-size: 12.5px; color: var(--muted); margin-top: 3px; }
.meter { height: 6px; border-radius: 999px; background: var(--surface-2); overflow: hidden; margin: 10px 0 6px; }
.meter i { display: block; height: 100%; background: var(--ok-bar); border-radius: 999px; }
.meter.warn i { background: var(--warn-bar); }
.meter.bad i { background: var(--bad-bar); }

/* ---- badges and chips -------------------------------------------------- */
.badge {
  display: inline-flex; align-items: center; gap: 5px; vertical-align: middle;
  font-size: 11.5px; font-weight: 600; padding: 2px 9px 2px 8px;
  border-radius: 999px; border: 1px solid transparent; white-space: nowrap;
}
.badge::before { content: ""; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
.badge-current { color: var(--ok); background: var(--ok-soft); }
.badge-stale { color: var(--warn); background: var(--warn-soft); }
.badge-orphaned { color: var(--bad); background: var(--bad-soft); }
.badge-unknown { color: var(--muted); background: var(--surface-2); }
.tag {
  display: inline-block; font-size: 11px; letter-spacing: 0.04em; text-transform: uppercase;
  padding: 1px 7px; border-radius: 4px; background: var(--surface-2);
  color: var(--muted); border: 1px solid var(--line);
}
.chips { display: flex; gap: 8px; flex-wrap: wrap; margin: 0 0 22px; }
.chip {
  font-size: 12.5px; padding: 4px 12px; border-radius: 999px; text-decoration: none;
  border: 1px solid var(--line); background: var(--surface); color: var(--muted);
}
.chip:hover { border-color: var(--line-strong); color: var(--fg); }
.chip[aria-current] { background: var(--accent); border-color: var(--accent); color: var(--accent-ink); }
.chip .n { opacity: .65; margin-left: 4px; font-variant-numeric: tabular-nums; }

/* ---- sidebar and rail --------------------------------------------------- */
.sidebar h3, .rail h3 {
  font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--faint); margin: 0 0 9px; font-weight: 650;
}
.sidebar ul, .rail ul { list-style: none; margin: 0 0 22px; padding: 0; }
.sidebar li a, .rail li a {
  display: block; padding: 4px 10px; margin: 1px 0; border-radius: var(--r-sm);
  color: var(--muted); text-decoration: none; border-left: 2px solid transparent;
}
.sidebar li a:hover, .rail li a:hover { color: var(--fg); background: var(--surface-2); }
.sidebar li a.on, .rail li a.on {
  color: var(--accent); font-weight: 600;
  background: var(--accent-soft); border-left-color: var(--accent);
}

/* the left sidebar: every generated document, grouped by chapter */
.sidebar .all-link {
  display: block; padding: 5px 10px; margin: 0 0 14px; border-radius: var(--r-sm);
  color: var(--fg); text-decoration: none; font-weight: 650; font-size: 13px;
}
.sidebar .all-link:hover { background: var(--surface-2); }
.sidebar .all-link.on { color: var(--accent); background: var(--accent-soft); }
.sidebar details.sec { margin: 0 0 1px; }
.sidebar details.sec summary {
  list-style: none; cursor: pointer; display: flex; align-items: center;
  gap: 6px; padding: 6px 10px; border-radius: var(--r-sm);
  font-size: 12.5px; font-weight: 600; color: var(--fg);
}
.sidebar details.sec summary::-webkit-details-marker { display: none; }
.sidebar details.sec summary::marker { content: ""; }
.sidebar details.sec summary::before {
  content: "›"; display: inline-block; width: 10px; color: var(--faint);
  transition: transform 0.15s;
}
.sidebar details.sec[open] > summary::before { transform: rotate(90deg); }
.sidebar details.sec summary:hover { background: var(--surface-2); }
.sidebar details.sec summary .count {
  margin-left: auto; color: var(--faint); font-weight: 400; font-variant-numeric: tabular-nums;
}
.sidebar details.sec ul { margin: 2px 0 8px; padding-left: 15px; }
.sidebar details.sec li a { font-size: 13px; }

/* the right rail: a small local-graph preview, then the on-page h2/h3 outline */
.rail-graph {
  width: 100%; height: 150px; margin: 0 0 20px;
  border: 1px solid var(--line); border-radius: var(--r-sm);
  overflow: hidden; background: var(--surface);
}
.rail-graph canvas { display: block; width: 100%; height: 100%; }
.rail .chapter {
  font-weight: 600; color: var(--fg); font-size: 12.5px;
  margin: 18px 0 5px; padding: 0 10px;
}
.rail .chapter:first-child { margin-top: 0; }
.rail a.chapter-link { display: block; color: inherit; text-decoration: none; padding: 3px 0; }
.rail a.chapter-link:hover { color: var(--accent); }
.rail a.chapter-link.on { color: var(--accent); background: none; }
.rail .toc a { font-size: 12.5px; color: var(--faint); padding: 2px 10px 2px 20px; }
.rail .toc a.l3 { padding-left: 30px; }
.rail .toc a:hover { color: var(--fg); background: none; text-decoration: underline; }

/* ---- prose ------------------------------------------------------------ */
.prose { font-size: 16px; line-height: 1.72; }
.prose > :first-child { margin-top: 0; }
.prose h2 {
  font-size: 21px; margin: 2em 0 .6em; padding-top: .5em;
  border-top: 1px solid var(--line);
}
.prose h3 { font-size: 17px; margin: 1.6em 0 .4em; }
.prose h4 { font-size: 15px; margin: 1.4em 0 .3em; }
.prose p, .prose ul, .prose ol { margin: 0 0 1.05em; }
.prose li { margin: 0 0 .3em; }
.prose h1:target, .prose h2:target, .prose h3:target, .prose h4:target {
  background: var(--accent-soft); box-shadow: -10px 0 0 var(--accent-soft), inset 3px 0 0 var(--accent);
  padding-left: 10px; margin-left: -10px; border-radius: 2px;
}
code {
  background: var(--code-bg); padding: 1px 5px; border-radius: 4px;
  font-size: 0.88em; border: 1px solid var(--line);
}
pre.code {
  position: relative; background: var(--code-bg); border: 1px solid var(--line);
  padding: 14px 16px; border-radius: var(--r); overflow-x: auto;
  font-size: 13px; line-height: 1.6; margin: 0 0 1.2em;
}
pre.code code { background: none; padding: 0; border: 0; font-size: inherit; }
pre.code[data-lang]::before {
  content: attr(data-lang); position: absolute; top: 0; right: 0;
  font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase;
  color: var(--faint); padding: 4px 10px;
}
blockquote {
  margin: 0 0 1.1em; padding: 2px 0 2px 16px;
  border-left: 3px solid var(--line-strong); color: var(--muted);
}
hr { border: 0; border-top: 1px solid var(--line); margin: 32px 0; }
img { max-width: 100%; height: auto; }

/* ---- tables and lists -------------------------------------------------- */
.table-wrap { overflow-x: auto; margin: 12px 0 8px; }
table { border-collapse: collapse; width: 100%; font-size: 14px; }
th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid var(--line); }
th[align="center"], td[align="center"] { text-align: center; }
th[align="right"], td[align="right"] { text-align: right; }
th[align="left"], td[align="left"] { text-align: left; }
th { color: var(--muted); font-weight: 600; font-size: 12.5px; }
tbody tr:hover { background: var(--surface-2); }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
ul.rows { list-style: none; padding: 0; margin: 0; }
ul.rows li {
  display: flex; gap: 12px; align-items: baseline; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: 14px;
}
ul.rows li:hover { background: var(--surface-2); }
ul.rows .meta { color: var(--faint); font-size: 12.5px; white-space: nowrap; }

/* ---- search ----------------------------------------------------------- */
.result { padding: 16px 0; border-bottom: 1px solid var(--line); }
.result:last-child { border-bottom: 0; }
.result .where {
  display: flex; gap: 9px; align-items: center; flex-wrap: wrap;
  font-size: 12.5px; color: var(--faint); margin-bottom: 5px;
}
.result h3 { margin: 0 0 5px; font-size: 16px; }
.result h3 a { text-decoration: none; }
.result h3 a:hover { text-decoration: underline; }
.result .snippet { font-size: 14px; color: var(--muted); line-height: 1.6; }
.result .within { color: var(--faint); font-weight: 400; font-size: 14px; }
.result:target {
  background: var(--accent-soft); border-radius: var(--r);
  padding-left: 14px; padding-right: 14px; margin: 0 -14px;
}
mark { background: var(--mark); color: inherit; border-radius: 3px; padding: 0 2px; }

/* ---- panels, empty states, pager -------------------------------------- */
.panel {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: var(--r); padding: 16px 18px; margin: 30px 0 0;
}
.panel > h3 { margin: 0 0 10px; font-size: 13px; text-transform: uppercase; letter-spacing: .07em; color: var(--faint); }
.panel summary { cursor: pointer; font-size: 14px; font-weight: 600; }
.panel summary::marker { color: var(--faint); }
details.panel[open] > summary { margin-bottom: 12px; }
.note {
  display: flex; gap: 10px; align-items: flex-start;
  border: 1px solid var(--line); border-left: 3px solid var(--warn);
  background: var(--warn-soft); color: var(--fg);
  border-radius: var(--r-sm); padding: 12px 14px; font-size: 13.5px; margin: 0 0 22px;
}
.note.bad { border-left-color: var(--bad); background: var(--bad-soft); }
.empty {
  padding: 26px; border: 1px dashed var(--line-strong); border-radius: var(--r);
  color: var(--muted); font-size: 14px; background: var(--surface);
}
.empty h2 { margin-top: 0; }
.empty pre.code { margin-top: 12px; margin-bottom: 0; }
.pager { display: grid; gap: 12px; grid-template-columns: 1fr 1fr; margin-top: 46px; }
.pager a {
  display: block; padding: 12px 16px; border: 1px solid var(--line);
  border-radius: var(--r); text-decoration: none; color: inherit; background: var(--surface);
}
.pager a:hover { border-color: var(--accent); }
.pager .dir { font-size: 12px; color: var(--faint); margin-bottom: 3px; }
.pager .to { font-weight: 600; font-size: 14px; }
.pager .next { text-align: right; grid-column: 2; }
@media (max-width: 620px) {
  .pager { grid-template-columns: 1fr; }
  .pager .next { text-align: left; grid-column: 1; }
}
footer.foot {
  max-width: 1140px; margin: 0 auto; padding: 0 28px 40px;
  color: var(--faint); font-size: 12.5px;
}

@media print {
  .topbar, .sidebar, .rail, .pager, .skip, footer.foot { display: none !important; }
  .page--railed { display: block; }
  body { background: #fff; }
}
`;

/** What every page needs to draw its chrome. */
export interface Site {
	root: string;
	library: Library;
	index: IndexResult | null;
}

export interface Shell {
	title: string;
	active: string;
	body: string;
	/** Left column: the full generated document tree. */
	sidebar?: string;
	/** Right column: the related-documents graph and the on-page outline. */
	rail?: string;
	query?: string;
	/** Only the search page should take focus on load; reading pages must not. */
	focusSearch?: boolean;
}

export function layout(site: Site, shell: Shell): string {
	const tabs: [string, string, boolean][] = [
		["/", "Overview", true],
		["/wiki", "Wiki", site.library.docs.length > 0],
		["/cards", "Cards", site.library.cards.length > 0],
		["/skills", "Skills", site.library.skills.length > 0],
		["/files", "Files", (site.index?.files.length ?? 0) > 0],
		["/search", "Search", true],
	];

	const nav = tabs
		.filter(([, , show]) => show)
		.map(
			([href, label]) =>
				`<a href="${href}"${shell.active === href ? ' aria-current="page"' : ""}>${label}</a>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(shell.title)}</title>
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="topbar"><div class="topbar-in">
  <a class="brand" href="/"><span class="mark" aria-hidden="true">K</span>kaioken</a>
  <nav class="tabs" aria-label="Sections">${nav}</nav>
  <form class="find" action="/search" method="get" role="search">
    <input type="search" name="q" aria-label="Search this repository"
      placeholder="Search this repository" value="${escapeAttr(shell.query ?? "")}"${
				shell.focusSearch ? " autofocus" : ""
			}>
    <button type="submit">Search</button>
  </form>
</div></header>
<div class="page${
				shell.sidebar || shell.rail
					? ` page--railed${shell.sidebar ? "" : " no-sidebar"}${shell.rail ? "" : " no-rail"}`
					: ""
			}">
<main class="main" id="main">
${shell.body}
</main>
${shell.sidebar ? `<aside class="sidebar" aria-label="All documents">${shell.sidebar}</aside>` : ""}
${shell.rail ? `<aside class="rail" aria-label="On this page">${shell.rail}</aside>` : ""}
</div>
<footer class="foot">Rendered locally from <span class="mono">${escapeHtml(site.root)}</span> — nothing on this page left this machine.</footer>
</body>
</html>`;
}

/* ------------------------------------------------------------------ parts */

export const FRESHNESS_LABEL: Record<Freshness, string> = {
	current: "current",
	stale: "stale",
	orphaned: "orphaned",
	unknown: "unverified",
};

export function badge(freshness: Freshness, title = ""): string {
	return `<span class="badge badge-${freshness}"${
		title ? ` title="${escapeAttr(title)}"` : ""
	}>${FRESHNESS_LABEL[freshness]}</span>`;
}

export function meter(fraction: number): string {
	const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
	const tone = percent === 100 ? "" : percent >= 60 ? " warn" : " bad";
	return `<div class="meter${tone}"><i style="width:${percent}%"></i></div>`;
}

export function stat(n: number | string, label: string): string {
	return `<div class="stat"><div class="n">${escapeHtml(String(n))}</div><div class="k">${escapeHtml(label)}</div></div>`;
}

/** Path segments are encoded so a file with a space in its name still opens. */
export function hrefFor(prefix: string, path: string): string {
	return escapeAttr(prefix + path.split("/").map(encodeURIComponent).join("/"));
}

export function fileLink(path: string): string {
	return `<a class="mono" href="${hrefFor("/f/", path)}">${escapeHtml(path)}</a>`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

export function shortDate(iso: string): string {
	if (!iso) return "";
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

export function command(text: string): string {
	return `<pre class="code"><code>${escapeHtml(text)}</code></pre>`;
}


/* -------------------------------------------------------------- not found */

export function notFoundPage(site: Site, what: string): string {
	return layout(site, {
		title: "Not found",
		active: "",
		body: `<h1>Not found</h1>
      <div class="empty">
        <p style="margin-top:0">${escapeHtml(what)}</p>
        <p style="margin-bottom:0">
          <a href="/">Overview</a> ·
          ${site.library.docs.length > 0 ? '<a href="/wiki">Wiki</a> · ' : ""}
          <a href="/search">Search</a>
        </p>
      </div>`,
	});
}

export function str(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : "";
}
