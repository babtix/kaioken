import type { IndexResult } from "@kaioken/index";
import type { Freshness } from "@kaioken/provenance";
import type { SearchHit } from "@kaioken/search";
import { docId } from "./graph.js";
import { GRAPH_ENGINE_JS } from "./graphEngineAsset.js";
import type { CardSummary, Library, Skill, WikiChapter, WikiDoc } from "./library.js";
import { titleFromId } from "./library.js";
import { escapeAttr, escapeHtml, type Heading, highlight, queryTerms } from "./markdown.js";

/**
 * Every page is one self-contained document: styles inline, no external fonts,
 * no CDN, no analytics. Nothing about browsing generated knowledge should
 * require a network, and nothing about it should leave the machine.
 *
 * Most pages carry no script at all — navigation, filtering and disclosure
 * are a link, a form, or a `<details>`, and that turns out to be enough. The
 * exceptions are `graphPage` and the local-graph preview in `outlineFor`: a
 * force-directed layout is not something CSS can draw, so both embed the same
 * engine ported from kaioken v1 (`graphEngineAsset.ts`).
 */

const STYLE = `
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

interface Shell {
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

const FRESHNESS_LABEL: Record<Freshness, string> = {
	current: "current",
	stale: "stale",
	orphaned: "orphaned",
	unknown: "unverified",
};

function badge(freshness: Freshness, title = ""): string {
	return `<span class="badge badge-${freshness}"${
		title ? ` title="${escapeAttr(title)}"` : ""
	}>${FRESHNESS_LABEL[freshness]}</span>`;
}

function meter(fraction: number): string {
	const percent = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
	const tone = percent === 100 ? "" : percent >= 60 ? " warn" : " bad";
	return `<div class="meter${tone}"><i style="width:${percent}%"></i></div>`;
}

function stat(n: number | string, label: string): string {
	return `<div class="stat"><div class="n">${escapeHtml(String(n))}</div><div class="k">${escapeHtml(label)}</div></div>`;
}

/** Path segments are encoded so a file with a space in its name still opens. */
function hrefFor(prefix: string, path: string): string {
	return escapeAttr(prefix + path.split("/").map(encodeURIComponent).join("/"));
}

function fileLink(path: string): string {
	return `<a class="mono" href="${hrefFor("/f/", path)}">${escapeHtml(path)}</a>`;
}

function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

function shortDate(iso: string): string {
	if (!iso) return "";
	const at = new Date(iso);
	return Number.isNaN(at.getTime()) ? "" : at.toISOString().slice(0, 10);
}

function command(text: string): string {
	return `<pre class="code"><code>${escapeHtml(text)}</code></pre>`;
}

/* --------------------------------------------------------------- overview */

export function overviewPage(
	site: Site,
	counts: Record<string, number>,
	chunkCount: number,
	semantic: boolean,
): string {
	const { library, index } = site;

	if (!index) {
		return layout(site, {
			title: "kaioken",
			active: "/",
			body: `<h1>Nothing indexed yet</h1>
        <p class="lede mono">${escapeHtml(site.root)}</p>
        <div class="empty">
          <h2>Start here</h2>
          <p>Walk the repository and build the declaration inventory. No network, no credentials.</p>
          ${command("kaioken scan")}
        </div>`,
		});
	}

	const languages = Object.entries(
		index.files.reduce<Record<string, number>>((acc, file) => {
			acc[file.language] = (acc[file.language] ?? 0) + 1;
			return acc;
		}, {}),
	).sort((a, b) => b[1] - a[1]);

	const tenants = Object.entries(counts).sort((a, b) => b[1] - a[1]);
	const start = library.docs[0];

	const wikiPanel =
		library.docs.length === 0
			? `<div class="empty">
           <h2>No wiki yet</h2>
           <p>Outline the chapters, write them, and verify every claim each one makes.</p>
           ${command("kaioken wiki")}
         </div>`
			: `<div class="card">
           <div style="display:flex;gap:14px;align-items:baseline;flex-wrap:wrap">
             <div class="n" style="font-size:24px;font-weight:640">${plural(library.docs.length, "document")}</div>
             <div class="muted" style="font-size:13.5px">across ${plural(library.chapters.length, "chapter")}</div>
             <div style="margin-left:auto">${freshnessSummary(library)}</div>
           </div>
           ${library.judged ? meter(library.freshness) : ""}
           <p style="margin-top:10px">
             ${start ? `<a href="${escapeAttr(start.href)}">Start reading — ${escapeHtml(start.title)}</a> · ` : ""}
             <a href="/wiki">Browse all chapters</a>
           </p>
         </div>`;

	const chapterCards = library.chapters
		.slice(0, 6)
		.map(
			(chapter) => `<a class="card" href="${escapeAttr(chapter.docs[0]?.href ?? "/wiki")}">
        <h3>${escapeHtml(chapter.title)}</h3>
        <p>${escapeHtml(chapter.goal || plural(chapter.docs.length, "document"))}</p>
      </a>`,
		)
		.join("");

	return layout(site, {
		title: "kaioken",
		active: "/",
		body: `<h1>Repository knowledge</h1>
      <p class="lede mono">${escapeHtml(site.root)}</p>
      <div class="stats">
        ${stat(index.symbolCount, "declarations")}
        ${stat(index.fileCount, "indexed files")}
        ${stat(chunkCount, "searchable passages")}
        ${stat(library.docs.length, "wiki documents")}
      </div>

      <h2>The wiki</h2>
      ${wikiPanel}
      ${chapterCards ? `<div class="grid" style="margin-top:14px">${chapterCards}</div>` : ""}
      ${
				library.chapters.length > 6
					? `<p class="sub" style="margin-top:12px"><a href="/wiki">All ${library.chapters.length} chapters →</a></p>`
					: ""
			}

      <h2>Search</h2>
      <p class="sub">
        Ranking is lexical (BM25)${semantic ? " fused with semantic ranking" : ""}.
        ${semantic ? "" : "No embedding provider is configured — search still works, offline."}
      </p>

      <h2>Corpus</h2>
      ${
				tenants.length === 0
					? '<div class="empty">Nothing in the corpus yet.</div>'
					: `<div class="table-wrap"><table><thead><tr><th>Tenant</th><th class="num">Documents</th><th></th></tr></thead><tbody>${tenants
							.map(
								([kind, n]) =>
									`<tr><td>${escapeHtml(kind)}</td><td class="num">${n}</td><td class="num"><a href="/search?q=&amp;kind=${escapeAttr(kind)}" class="muted">search →</a></td></tr>`,
							)
							.join("")}</tbody></table></div>`
			}

      <h2>Languages</h2>
      <div class="table-wrap"><table><thead><tr><th>Language</th><th class="num">Files</th></tr></thead><tbody>${languages
				.map(
					([lang, n]) =>
						`<tr><td><a href="/files?lang=${encodeURIComponent(lang)}">${escapeHtml(lang)}</a></td><td class="num">${n}</td></tr>`,
				)
				.join("")}</tbody></table></div>`,
	});
}

function freshnessSummary(library: Library): string {
	if (!library.judged) return badge("unknown", "No provenance or scan on disk to judge against");
	const { counts } = library;
	if (counts.stale === 0 && counts.orphaned === 0) {
		return badge("current", "Every document still matches the files it was written from");
	}
	const parts: string[] = [];
	if (counts.stale > 0) parts.push(`${counts.stale} stale`);
	if (counts.orphaned > 0) parts.push(`${counts.orphaned} orphaned`);
	return badge(counts.orphaned > 0 ? "orphaned" : "stale", parts.join(", "));
}

/* ------------------------------------------------------------------- wiki */

export function wikiPage(site: Site): string {
	const { library } = site;

	if (library.docs.length === 0) {
		return layout(site, {
			title: "Wiki",
			active: "/wiki",
			body: `<h1>Wiki</h1>
        <div class="empty">
          <h2>Nothing written yet</h2>
          <p>The wiki is a plan-then-elaborate cascade: outline the chapters, write them,
             then check every claim against the code.</p>
          ${command("kaioken wiki")}
          <p style="margin-top:12px" class="muted">
            <code>kaioken wiki --plan</code> stops after the outline so you can edit it first.
          </p>
        </div>`,
		});
	}

	const stale = library.counts.stale + library.counts.orphaned;

	const chapters = library.chapters
		.map((chapter) => {
			const lead = leadDoc(chapter);
			const rest = lead ? chapter.docs.filter((doc) => doc !== lead) : chapter.docs;
			return `<section class="card" style="margin-bottom:14px">
        <div style="display:flex;gap:12px;align-items:baseline;justify-content:space-between">
          <h3 style="font-size:17px">${
						lead
							? `<a href="${escapeAttr(lead.href)}">${escapeHtml(chapter.title)}</a>`
							: escapeHtml(chapter.title)
					}</h3>
          ${library.judged ? badge(chapter.freshness) : ""}
        </div>
        ${chapter.goal ? `<p style="margin-bottom:10px">${escapeHtml(chapter.goal)}</p>` : ""}
        ${
					rest.length > 0
						? `<ul class="rows" style="margin-top:8px">${rest.map(docRow(library)).join("")}</ul>`
						: ""
				}
      </section>`;
		})
		.join("");

	return layout(site, {
		title: "Wiki",
		active: "/wiki",
		sidebar: sidebarFor(library, ""),
		body: `<h1>Wiki</h1>
      <p class="lede">${plural(library.docs.length, "document")} in ${plural(library.chapters.length, "chapter")}${
				library.generatedAt ? `, last written ${escapeHtml(shortDate(library.generatedAt))}` : ""
			}.</p>
      ${
				library.judged
					? `<div class="card" style="margin-bottom:26px">
             <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
               <strong style="font-size:14px">${Math.round(library.freshness * 100)}% still matches the code</strong>
               ${freshnessSummary(library)}
             </div>
             ${meter(library.freshness)}
             ${
								stale > 0
									? `<p class="muted" style="font-size:13px;margin:6px 0 0">Regenerate only what changed with <code>kaioken update</code>.</p>`
									: ""
							}
           </div>`
					: `<div class="note">Freshness is unknown: no provenance record or scan was found, so nothing here can be checked against the code. Run <code>kaioken scan</code>.</div>`
			}
      ${chapters}`,
	});
}

/**
 * The chapter's own opening document, when it has one.
 *
 * A chapter index is titled after its chapter, so listing it as a child of that
 * chapter prints the same words twice and invites the reader to wonder what the
 * difference is. There is none: the chapter heading is the link to it.
 */
function leadDoc(chapter: WikiChapter): WikiDoc | undefined {
	const first = chapter.docs[0];
	return first && first.title.trim() === chapter.title.trim() ? first : undefined;
}

function docRow(library: Library): (doc: WikiDoc) => string {
	return (doc) =>
		`<li>
      <span>
        <a href="${escapeAttr(doc.href)}">${escapeHtml(doc.title)}</a>
        ${doc.blurb ? `<span class="muted" style="font-size:13px"> — ${escapeHtml(doc.blurb)}</span>` : ""}
      </span>
      <span class="meta">${doc.sources.length > 0 ? plural(doc.sources.length, "source") : ""} ${
				library.judged ? badge(doc.freshness) : ""
			}</span>
    </li>`;
}

/* -------------------------------------------------------------- document */

export function docPage(
	site: Site,
	path: string,
	title: string,
	headings: readonly Heading[],
	html: string,
): string {
	const { library } = site;
	const doc = library.byPath.get(path);
	const at = doc ? library.docs.indexOf(doc) : -1;
	const previous = at > 0 ? library.docs[at - 1] : undefined;
	const next = at >= 0 && at < library.docs.length - 1 ? library.docs[at + 1] : undefined;
	const chapter = doc ? library.chapters.find((c) => c.id === doc.chapterId) : undefined;

	return layout(site, {
		title,
		active: "/wiki",
		sidebar: sidebarFor(library, path),
		rail: outlineFor(path, headings),
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/wiki">Wiki</a><span>/</span>
        ${chapter ? `<a href="${escapeAttr(chapter.docs[0]?.href ?? "/wiki")}">${escapeHtml(chapter.title)}</a><span>/</span>` : ""}
        <span class="mono">${escapeHtml(path)}</span>
      </nav>
      <h1>${escapeHtml(title)}</h1>
      <p class="sub">
        ${doc && library.judged ? `${badge(doc.freshness)} ` : ""}
        ${doc?.generatedAt ? `written ${escapeHtml(shortDate(doc.generatedAt))} · ` : ""}
        ${doc && doc.sources.length > 0 ? `from ${plural(doc.sources.length, "file")}` : ""}
      </p>
      ${doc ? staleNote(doc) : ""}
      ${headings.length > 1 ? mobileToc(headings) : ""}
      <article class="prose">${html}</article>
      ${doc ? provenancePanel(doc) : ""}
      ${pager(previous, next)}`,
	});
}

function staleNote(doc: WikiDoc): string {
	if (doc.deleted.length > 0 && doc.deleted.length === doc.sources.length) {
		return `<div class="note bad">Every file this document was written from has been deleted.
      What it describes is gone; the document is kept only so the loss is visible.</div>`;
	}
	if (doc.changed.length === 0 && doc.deleted.length === 0) return "";

	const moved = [...doc.changed, ...doc.deleted];
	return `<div class="note">
    <div>
      <strong>${plural(moved.length, "source file has", "source files have")} changed since this was written.</strong>
      Read it as a starting point, not as current truth — the code is ground truth.
      Regenerate with <code>kaioken update</code>.
      <div style="margin-top:6px">${moved.slice(0, 8).map(fileLink).join(", ")}${
				moved.length > 8 ? `, and ${moved.length - 8} more` : ""
			}</div>
    </div>
  </div>`;
}

/** On a narrow screen the rail moves below the article, so the map moves up. */
function mobileToc(headings: readonly Heading[]): string {
	return `<details class="panel narrow-only" style="margin:0 0 26px">
    <summary>On this page</summary>
    <ul class="rows" style="border-top:1px solid var(--line)">${headings
			.filter((heading) => heading.level >= 2 && heading.level <= 3)
			.map(
				(heading) =>
					`<li style="padding-left:${(heading.level - 2) * 16 + 12}px"><a href="#${escapeAttr(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
			)
			.join("")}</ul>
  </details>`;
}

function provenancePanel(doc: WikiDoc): string {
	if (doc.sources.length === 0) {
		return `<div class="panel"><h3>Provenance</h3>
      <p class="muted" style="margin:0;font-size:13.5px">
        No provenance was recorded for this document, so nothing can be said about what it
        was written from or whether it is still true.
      </p></div>`;
	}

	const state = (path: string): string => {
		if (doc.deleted.includes(path)) return '<span class="badge badge-orphaned">deleted</span>';
		if (doc.changed.includes(path)) return '<span class="badge badge-stale">changed</span>';
		return '<span class="badge badge-current">unchanged</span>';
	};

	return `<details class="panel" open>
    <summary>Written from ${plural(doc.sources.length, "file")}</summary>
    <ul class="rows">${doc.sources
			.map((path) => `<li>${fileLink(path)}<span class="meta">${state(path)}</span></li>`)
			.join("")}</ul>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">
      Every claim in this document was checked against these files at generation time.
      Where the document and the code disagree, the code wins.
    </p>
  </details>`;
}

function pager(previous: WikiDoc | undefined, next: WikiDoc | undefined): string {
	if (!previous && !next) return "";
	return `<nav class="pager" aria-label="Chapter navigation">
    ${
			previous
				? `<a href="${escapeAttr(previous.href)}"><div class="dir">← Previous</div><div class="to">${escapeHtml(previous.title)}</div></a>`
				: "<span></span>"
		}
    ${
			next
				? `<a class="next" href="${escapeAttr(next.href)}"><div class="dir">Next →</div><div class="to">${escapeHtml(next.title)}</div></a>`
				: ""
		}
  </nav>`;
}

/**
 * The left sidebar: the full generated document tree, grouped by chapter and
 * collapsible per chapter (open automatically around the current document).
 * This is the same tree for every wiki page, current or not — it is the map
 * of everything that was written, not just an outline of one page.
 */
function sidebarFor(library: Library, current: string): string {
	if (library.chapters.length === 0) return "";

	const link = (doc: WikiDoc): string =>
		`<a class="${doc.path === current ? "on" : ""}" href="${escapeAttr(doc.href)}"${
			doc.path === current ? ' aria-current="page"' : ""
		}>${escapeHtml(doc.title)}</a>`;

	const sections = library.chapters
		.map((chapter: WikiChapter) => {
			const open = chapter.docs.some((doc) => doc.path === current) ? " open" : "";
			return `<details class="sec"${open}>
        <summary><span class="sec-name">${escapeHtml(chapter.title)}</span><span class="count">${chapter.docs.length}</span></summary>
        <ul>${chapter.docs.map((doc) => `<li>${link(doc)}</li>`).join("")}</ul>
      </details>`;
		})
		.join("");

	return `<h3>All documents</h3><a class="all-link${current === "" ? " on" : ""}" href="/wiki">⌂ Overview</a>${sections}<a class="all-link" href="/graph">◈ Graph</a>`;
}

/**
 * The right rail on a document page: a small local-graph preview — this
 * document and its immediate neighbors, in the same engine as the full-bleed
 * `/graph` page — then the h2/h3 outline of the page itself. The full web of
 * relationships lives on its own page; this is just enough of it to place the
 * document without leaving.
 */
function outlineFor(path: string, headings: readonly Heading[]): string {
	const entries = headings.filter((heading) => heading.level >= 2 && heading.level <= 3);
	const toc =
		entries.length > 0
			? `<h3>On this page</h3><ul class="toc">${entries
					.map(
						(heading) =>
							`<li><a class="${heading.level === 3 ? "l3" : ""}" href="#${escapeAttr(heading.slug)}">${escapeHtml(heading.text)}</a></li>`,
					)
					.join("")}</ul>`
			: "";

	return `${railGraphWidget(path)}${toc}`;
}

/**
 * The small local-graph preview at the top of the rail. It carries a script —
 * the one part of a document page that does — because the ported engine
 * (`graphEngineAsset.ts`) is how this site draws any node graph at all, full
 * page or small preview alike; there is no CSS-only version of it.
 */
function railGraphWidget(path: string): string {
	return `<div class="rail-graph"><canvas id="rail-graph-canvas" aria-label="Documents related to this page" role="img"></canvas></div>
    <script>${GRAPH_ENGINE_JS}</script>
    <script>${railGraphBoot(path)}</script>`;
}

function railGraphBoot(path: string): string {
	return `
(function () {
  function boot() {
    var canvas = document.getElementById('rail-graph-canvas');
    if (!canvas) return;
    var engine = new KaioGraph.GraphEngine();
    engine.mount(canvas);

    function colors() {
      var s = getComputedStyle(document.documentElement);
      var v = function (name, fb) { return (s.getPropertyValue(name).trim()) || fb; };
      return {
        background: 'transparent',
        doc: v('--accent', '#b3341c'),
        file: v('--muted', '#5f6672'),
        section: v('--muted', '#5f6672'),
        edge: v('--line', '#e6e4df'),
        label: v('--muted', '#5f6672'),
        accent: v('--accent', '#b3341c')
      };
    }
    engine.setColors(colors());
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      engine.setColors(colors());
    });

    engine.onSelect = function (node) {
      if (node.kind === 'doc' && node.rel) location.href = '/d/' + encodeURI(node.rel);
    };

    fetch('/graph.json').then(function (r) { return r.json(); }).then(function (g) {
      engine.setGraph(g);
      engine.focus(${JSON.stringify(docId(path))}, 1);
      // A freshly loaded graph starts every node scattered, so a fit taken
      // before the spring layout has pulled the neighborhood together frames
      // the whole cloud instead of these few nodes. Settling synchronously —
      // the same routine reduced-motion uses — makes the first frame the
      // right one, with no dependency on how many animation frames a small
      // preview happens to get before anyone looks at it.
      if (engine.layout) engine.layout.settle();
      engine.fit();
    });
  }
  // Deferred to page load: this widget is a small extra on top of the
  // document, not something that should compete with it for the first paint.
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot);
})();`;
}

/* ------------------------------------------------------------------ files */

export function filesPage(site: Site, language: string): string {
	const index = site.index;
	if (!index || index.files.length === 0) {
		return layout(site, {
			title: "Files",
			active: "/files",
			body: `<h1>Files</h1>
        <div class="empty"><h2>Nothing indexed yet</h2>${command("kaioken scan")}</div>`,
		});
	}

	const byLanguage = index.files.reduce<Record<string, number>>((acc, file) => {
		acc[file.language] = (acc[file.language] ?? 0) + 1;
		return acc;
	}, {});

	const languages = Object.entries(byLanguage).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
	const shown = language ? index.files.filter((file) => file.language === language) : index.files;

	const chips = [
		`<a class="chip" href="/files"${language ? "" : ' aria-current="true"'}>All<span class="n">${index.files.length}</span></a>`,
		...languages.map(
			([name, n]) =>
				`<a class="chip" href="/files?lang=${encodeURIComponent(name)}"${
					language === name ? ' aria-current="true"' : ""
				}>${escapeHtml(name)}<span class="n">${n}</span></a>`,
		),
	].join("");

	// Grouped by directory: a flat list of a thousand paths is a list nobody
	// reads, and the directory is the unit a reader already thinks in.
	const groups = new Map<string, typeof shown>();
	for (const file of shown) {
		const slash = file.path.lastIndexOf("/");
		const dir = slash === -1 ? "." : file.path.slice(0, slash);
		const list = groups.get(dir);
		if (list) list.push(file);
		else groups.set(dir, [file]);
	}

	const body = [...groups]
		.sort((a, b) => a[0].localeCompare(b[0]))
		.map(
			([dir, files]) => `<details class="panel" style="margin:0 0 10px"${
				groups.size <= 12 ? " open" : ""
			}>
        <summary><span class="mono">${escapeHtml(dir)}</span> <span class="muted" style="font-weight:400">· ${plural(files.length, "file")}</span></summary>
        <ul class="rows">${files
					.map((file) => {
						const documents = site.library.bySource.get(file.path) ?? [];
						return `<li>
              <a class="mono" href="${hrefFor("/f/", file.path)}">${escapeHtml(
								file.path.slice(dir === "." ? 0 : dir.length + 1),
							)}</a>
              <span class="meta">${escapeHtml(file.language)} · ${plural(file.symbols.length, "declaration")}${
								documents.length > 0 ? ` · ${plural(documents.length, "doc")}` : ""
							}</span>
            </li>`;
					})
					.join("")}</ul>
      </details>`,
		)
		.join("");

	return layout(site, {
		title: language ? `${language} files` : "Files",
		active: "/files",
		body: `<h1>Files</h1>
      <p class="lede">${plural(shown.length, "indexed file")}${
				language ? ` in ${escapeHtml(language)}` : ""
			}, grouped by directory.</p>
      <div class="chips">${chips}</div>
      ${shown.length === 0 ? '<div class="empty">No files in that language.</div>' : body}`,
	});
}

export function filePage(site: Site, path: string): string | null {
	const file = site.index?.files.find((f) => f.path === path);
	if (!file) return null;

	const documents = site.library.bySource.get(path) ?? [];
	const slash = path.lastIndexOf("/");
	const dir = slash === -1 ? "" : path.slice(0, slash);

	const exported = file.symbols.filter((symbol) => symbol.exported);
	const internal = file.symbols.filter((symbol) => !symbol.exported);

	// Anchored by line, because that is what a search hit knows about it.
	const list = (symbols: typeof file.symbols): string =>
		symbols
			.map(
				(symbol) => `<div class="result" id="L${symbol.startLine}">
        <div class="where">
          <span class="tag">${escapeHtml(symbol.kind)}</span>
          <span>lines ${symbol.startLine}–${symbol.endLine}</span>
        </div>
        <h3>${escapeHtml(symbol.parent ? `${symbol.parent}.` : "")}${escapeHtml(symbol.name)}</h3>
        <pre class="code"><code>${escapeHtml(symbol.signature)}</code></pre>
        ${symbol.doc ? `<div class="snippet">${escapeHtml(symbol.doc)}</div>` : ""}
      </div>`,
			)
			.join("");

	return layout(site, {
		title: file.path,
		active: "/files",
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/files">Files</a><span>/</span>
        ${dir ? `<span class="mono">${escapeHtml(dir)}</span><span>/</span>` : ""}
        <span class="mono">${escapeHtml(path.slice(dir ? dir.length + 1 : 0))}</span>
      </nav>
      <h1 class="mono" style="font-size:22px">${escapeHtml(file.path)}</h1>
      <p class="sub">${escapeHtml(file.language)} · ${plural(file.lineCount, "line")} ·
        ${plural(file.symbols.length, "declaration")}${file.unparsed ? " · no grammar bound for this language" : ""}</p>
      ${
				documents.length > 0
					? `<div class="panel" style="margin:0 0 26px">
             <h3>Documented in</h3>
             <ul class="rows">${documents
								.map(
									(doc) =>
										`<li><a href="${escapeAttr(doc.href)}">${escapeHtml(doc.title)}</a>
                     <span class="meta">${site.library.judged ? badge(doc.freshness) : ""}</span></li>`,
								)
								.join("")}</ul>
           </div>`
					: ""
			}
      ${
				file.symbols.length === 0
					? '<div class="empty">No declarations indexed for this file.</div>'
					: `${exported.length > 0 ? `<h2>Exported <span class="muted" style="font-weight:400">· ${exported.length}</span></h2>${list(exported)}` : ""}
             ${internal.length > 0 ? `<h2>Internal <span class="muted" style="font-weight:400">· ${internal.length}</span></h2>${list(internal)}` : ""}`
			}`,
	});
}

/* ----------------------------------------------------------------- search */

const KIND_LABEL: Record<string, string> = {
	wiki: "Wiki",
	card: "Cards",
	skill: "Skills",
	symbol: "Declarations",
};

export function searchPage(
	site: Site,
	query: string,
	hits: readonly SearchHit[],
	semantic: boolean,
	kind: string,
	available: Record<string, number>,
	limit: number,
): string {
	const terms = queryTerms(query);
	const chips = [
		`<a class="chip" href="/search?q=${encodeURIComponent(query)}"${kind ? "" : ' aria-current="true"'}>Everything</a>`,
		...Object.entries(available)
			.sort((a, b) => b[1] - a[1])
			.map(
				([name, n]) =>
					`<a class="chip" href="/search?q=${encodeURIComponent(query)}&amp;kind=${encodeURIComponent(name)}"${
						kind === name ? ' aria-current="true"' : ""
					}>${escapeHtml(KIND_LABEL[name] ?? name)}<span class="n">${n}</span></a>`,
			),
	].join("");

	if (!query.trim()) {
		return layout(site, {
			title: "Search",
			active: "/search",
			query,
			focusSearch: true,
			body: `<h1>Search</h1>
        <p class="lede">
          Everything indexed is searchable: wiki chapters, knowledge cards, skills and every
          declaration in the repository. Ranking is lexical${
						semantic ? " fused with semantic" : ""
					}, and it needs no credentials and no network.
        </p>
        <div class="chips">${chips}</div>
        <div class="empty">Type a query in the box above.</div>`,
		});
	}

	if (hits.length === 0) {
		return layout(site, {
			title: `${query} — no results`,
			active: "/search",
			query,
			body: `<h1>No results</h1>
        <p class="lede">Nothing in the corpus matches “${escapeHtml(query)}”${
					kind ? ` in ${escapeHtml(KIND_LABEL[kind] ?? kind)}` : ""
				}.</p>
        <div class="chips">${chips}</div>
        <div class="empty">
          Try fewer words, or a declaration name exactly as it is spelled in the code.
          ${kind ? `<p style="margin:10px 0 0"><a href="/search?q=${encodeURIComponent(query)}">Search everything instead →</a></p>` : ""}
        </div>`,
		});
	}

	const results = hits
		.map((hit) => {
			// For a declaration the chunk heading is the name, which is the answer.
			// For everything else it is a subheading inside a document, and leading
			// with it strands the reader in a section of something unnamed.
			const lead = hit.kind === "symbol" ? hit.heading || hit.title : hit.title || hit.heading;
			const within = hit.kind === "symbol" || hit.heading === lead ? "" : hit.heading;

			return `<article class="result">
        <div class="where">
          <span class="tag">${escapeHtml(hit.kind)}</span>
          <span class="mono">${escapeHtml(hit.path)}${hit.line ? `:${hit.line}` : ""}</span>
          ${hit.via.includes("semantic") ? '<span class="tag">semantic</span>' : ""}
        </div>
        <h3><a href="${hitHref(hit)}">${highlight(lead, terms)}</a>${
					within ? `<span class="within"> › ${highlight(within, terms)}</span>` : ""
				}</h3>
        <div class="snippet">${highlight(hit.snippet, terms)}</div>
      </article>`;
		})
		.join("");

	// A result list cut off at the limit with no sign of it reads as "that is
	// everything there is", which is a different claim from "that is the top 20".
	const capped = hits.length >= limit;

	return layout(site, {
		title: `${query} — search`,
		active: "/search",
		query,
		body: `<h1>${capped ? `Top ${hits.length} results` : plural(hits.length, "result")}</h1>
      <p class="sub">for “${escapeHtml(query)}”${
				semantic ? " · lexical and semantic ranking" : " · lexical ranking"
			}${
				capped
					? ` · <a href="/search?q=${encodeURIComponent(query)}${
							kind ? `&amp;kind=${encodeURIComponent(kind)}` : ""
						}&amp;limit=${Math.min(limit * 5, 100)}">show more</a>`
					: ""
			}</p>
      <div class="chips">${chips}</div>
      ${results}`,
	});
}

/**
 * Every tenant the search index returns has to be openable. Linking a card or a
 * skill at the wiki's route — as this once did — produces a result list where
 * some of the links are 404s, which is worse than not returning them.
 */
export function hitHref(hit: SearchHit): string {
	switch (hit.kind) {
		case "symbol":
			return hrefFor("/f/", hit.path) + (hit.line ? `#L${hit.line}` : "");
		case "card":
			return hrefFor("/c/", hit.path.replace(/^cards\//, ""));
		case "skill":
			return hrefFor("/s/", hit.path.replace(/^skills\//, ""));
		default:
			return hrefFor("/d/", hit.path);
	}
}

/* ------------------------------------------------------------ cards, skills */

export function cardsPage(site: Site): string {
	const { cards } = site.library;

	return layout(site, {
		title: "Cards",
		active: "/cards",
		body: `<h1>Knowledge cards</h1>
      <p class="lede">One compact, uniform record per module — the queryable counterpart to a
        wiki chapter.</p>
      ${
				cards.length === 0
					? `<div class="empty"><h2>No cards yet</h2>${command("kaioken plan\nkaioken cards")}</div>`
					: `<div class="grid">${cards
							.map(
								(card: CardSummary) => `<a class="card" href="${escapeAttr(card.href)}">
                  <h3>${escapeHtml(card.name)}</h3>
                  <p>${escapeHtml(card.summary.slice(0, 180))}${card.summary.length > 180 ? "…" : ""}</p>
                  <p class="muted" style="margin-top:10px;font-size:12.5px">
                    ${plural(card.entryPointCount, "entry point")}${
											card.ungrounded > 0 ? ` · ${card.ungrounded} unverified` : ""
										}
                  </p>
                </a>`,
							)
							.join("")}</div>`
			}`,
	});
}

export function cardPage(site: Site, file: string, card: Record<string, unknown>): string {
	const name = str(card["name"]) || file.replace(/\.json$/, "");
	const entryPoints = Array.isArray(card["entryPoints"]) ? card["entryPoints"] : [];
	const keyPoints = Array.isArray(card["keyPoints"]) ? card["keyPoints"] : [];
	const sources = Array.isArray(card["sources"]) ? card["sources"] : [];
	const verification = (card["verification"] ?? {}) as Record<string, unknown>;
	const ungrounded = Array.isArray(verification["ungrounded"]) ? verification["ungrounded"] : [];

	return layout(site, {
		title: name,
		active: "/cards",
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/cards">Cards</a><span>/</span><span class="mono">${escapeHtml(file)}</span>
      </nav>
      <h1>${escapeHtml(name)}</h1>
      <p class="sub">${escapeHtml(str(card["moduleId"]))}${
				card["generatedAt"] ? ` · written ${escapeHtml(shortDate(str(card["generatedAt"])))}` : ""
			}</p>
      ${str(card["summary"]) ? `<p class="prose" style="max-width:68ch">${escapeHtml(str(card["summary"]))}</p>` : ""}
      ${
				keyPoints.length > 0
					? `<h2>Key points</h2><ul class="prose">${keyPoints
							.map((point) => `<li>${escapeHtml(String(point))}</li>`)
							.join("")}</ul>`
					: ""
			}
      ${
				entryPoints.length > 0
					? `<h2>Entry points</h2><div class="table-wrap"><table><thead><tr><th>Name</th><th>File</th><th>Why start here</th></tr></thead><tbody>${entryPoints
							.map((raw) => {
								const entry = (raw ?? {}) as Record<string, unknown>;
								const path = str(entry["file"]);
								return `<tr><td class="mono">${escapeHtml(str(entry["name"]))}</td>
                  <td>${path ? fileLink(path) : ""}</td>
                  <td class="muted">${escapeHtml(str(entry["note"]))}</td></tr>`;
							})
							.join("")}</tbody></table></div>`
					: ""
			}
      ${
				ungrounded.length > 0
					? `<div class="note" style="margin-top:26px">
             <div><strong>${plural(ungrounded.length, "claim")} the structural index could not confirm.</strong>
             Reported rather than hidden: ${escapeHtml(ungrounded.slice(0, 6).map(String).join(", "))}</div>
           </div>`
					: ""
			}
      ${
				sources.length > 0
					? `<details class="panel" open><summary>Written from ${plural(sources.length, "file")}</summary>
             <ul class="rows">${sources
									.map((raw) => {
										const source = (raw ?? {}) as Record<string, unknown>;
										return `<li>${fileLink(str(source["path"]))}</li>`;
									})
									.join("")}</ul>
           </details>`
					: ""
			}`,
	});
}

export function skillsPage(site: Site): string {
	const { skills } = site.library;

	return layout(site, {
		title: "Skills",
		active: "/skills",
		body: `<h1>Skills</h1>
      <p class="lede">Written procedures for recurring tasks in this repository. Unlike everything
        else here they are handwritten — they are indexed so a procedure nobody can find does not
        become a procedure nobody follows.</p>
      ${
				skills.length === 0
					? '<div class="empty">No skills under <code>.kaioken/skills</code>.</div>'
					: `<div class="grid">${skills
							.map(
								(skill: Skill) => `<a class="card" href="${escapeAttr(skill.href)}">
                  <h3>${escapeHtml(skill.name)}</h3>
                  <p>${escapeHtml(skill.description.slice(0, 200))}${skill.description.length > 200 ? "…" : ""}</p>
                </a>`,
							)
							.join("")}</div>`
			}`,
	});
}

export function skillPage(
	site: Site,
	path: string,
	title: string,
	headings: readonly Heading[],
	html: string,
): string {
	return layout(site, {
		title,
		active: "/skills",
		body: `<nav class="crumbs" aria-label="Breadcrumb">
        <a href="/skills">Skills</a><span>/</span><span class="mono">${escapeHtml(path)}</span>
      </nav>
      <h1>${escapeHtml(title)}</h1>
      ${headings.length > 1 ? mobileToc(headings) : ""}
      <article class="prose">${html}</article>`,
	});
}

/* ------------------------------------------------------------------ graph */

/**
 * The full-bleed force-directed graph view, ported from kaioken v1: a canvas
 * driven by the embedded engine (`graphEngineAsset.ts`), plus a small filter
 * strip. Clicking a doc node navigates to `/d/<path>`; file nodes are inert —
 * there is no editor to open into. This is the one page in the site that
 * carries a script, and the one relationship view rich enough to need one.
 */
export function graphPage(): string {
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Graph · kaioken wiki</title>
<style>${STYLE}${GRAPH_STYLE}</style>
</head>
<body class="graph-page">
<a class="graph-back" href="/wiki">← wiki</a>
<div class="graph-bar">
<label><input type="checkbox" id="f-files" checked> files</label>
<label><input type="checkbox" id="f-contains" checked> contains</label>
<label><input type="checkbox" id="f-links" checked> links</label>
<label><input type="checkbox" id="f-source" checked> source</label>
<button type="button" id="g-fit">fit</button>
<span id="g-stats"></span>
</div>
<div class="graph-main"><canvas id="graph-canvas"></canvas>
<div id="g-empty">no wiki generated yet — run the wiki first</div></div>
<script>${GRAPH_ENGINE_JS}</script>
<script>${GRAPH_BOOT_JS}</script>
</body>
</html>`;
}

const GRAPH_STYLE = `
body.graph-page{display:block;height:100vh;overflow:hidden}
.graph-main{position:relative;width:100%;height:100vh}
#graph-canvas{display:block}
.graph-back{position:fixed;top:14px;left:16px;z-index:5;font-size:13px;color:var(--muted);
  text-decoration:none;background:var(--surface);border:1px solid var(--line);
  border-radius:7px;padding:6px 12px;box-shadow:var(--shadow)}
.graph-back:hover{color:var(--accent);border-color:var(--accent)}
.graph-bar{position:fixed;top:14px;right:16px;z-index:5;display:flex;gap:12px;align-items:center;
  background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 12px;
  font-size:12px;color:var(--muted);box-shadow:var(--shadow)}
.graph-bar label{display:flex;gap:4px;align-items:center;cursor:pointer;user-select:none}
.graph-bar input{accent-color:var(--accent)}
.graph-bar button{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);
  background:none;border:1px solid var(--line);border-radius:5px;padding:3px 9px;cursor:pointer}
.graph-bar button:hover{color:var(--accent);border-color:var(--accent)}
#g-stats{font-size:11.5px}
#g-empty{display:none;position:absolute;inset:0;align-items:center;justify-content:center;
  color:var(--muted);font-size:14px}`;

/**
 * Wires the embedded engine to the page: fetch the payload, read the palette
 * off the site's own CSS variables, and navigate on doc clicks.
 */
const GRAPH_BOOT_JS = `
(function () {
  var canvas = document.getElementById('graph-canvas');
  var engine = new KaioGraph.GraphEngine();
  engine.mount(canvas);

  function colors() {
    var s = getComputedStyle(document.documentElement);
    var v = function (name, fb) { return (s.getPropertyValue(name).trim()) || fb; };
    return {
      background: 'transparent',
      doc: v('--accent', '#b3341c'),
      file: v('--muted', '#5f6672'),
      section: v('--muted', '#5f6672'),
      edge: v('--line', '#e6e4df'),
      label: v('--muted', '#5f6672'),
      accent: v('--accent', '#b3341c')
    };
  }
  engine.setColors(colors());
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
    engine.setColors(colors());
  });

  engine.onSelect = function (node) {
    if (node.kind === 'doc' && node.rel) location.href = '/d/' + encodeURI(node.rel);
    /* file nodes are inert: no editor to open into */
  };

  var filters = { files: true, kinds: { contains: true, links: true, source: true } };
  function bind(id, apply) {
    var el = document.getElementById(id);
    el.addEventListener('change', function () { apply(el.checked); engine.setFilters(filters); });
  }
  bind('f-files', function (on) { filters.files = on; });
  bind('f-contains', function (on) { filters.kinds.contains = on; });
  bind('f-links', function (on) { filters.kinds.links = on; });
  bind('f-source', function (on) { filters.kinds.source = on; });
  document.getElementById('g-fit').addEventListener('click', function () { engine.fit(); });

  fetch('/graph.json').then(function (r) { return r.json(); }).then(function (g) {
    engine.setGraph(g);
    document.getElementById('g-stats').textContent =
      g.stats.docs + ' docs · ' + g.stats.files + ' files · ' + g.stats.edges + ' edges';
    if (!g.nodes.length) document.getElementById('g-empty').style.display = 'flex';
  });
})();`;

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

function str(raw: unknown): string {
	return typeof raw === "string" ? raw.trim() : "";
}
