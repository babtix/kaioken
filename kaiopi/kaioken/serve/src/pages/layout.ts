import type { IndexResult } from "@kaioken/index";
import type { Freshness } from "@kaioken/provenance";
import type { Library } from "../library.ts";
import { escapeAttr, escapeHtml } from "../markdown.ts";
export { escapeAttr, escapeHtml };

/**
 * Kaioken design system, inlined so every page stays self-contained.
 *
 * Source of truth: `website/design/design.md` + `kaioken-design-system.css`
 * (dark-first, hairline rules, zero radius on containers, Geist Mono chrome,
 * red `#ff3b1f` / `#b81600` accent, ember `#ff9500` / `#9a5600` secondary).
 *
 * Two deliberate deviations from the website stylesheet:
 * - No Google Fonts `@import`. Serve pages render offline ("nothing on this
 *   page left this machine") and the CSP forbids external requests, so the
 *   font stacks resolve to Geist when installed and system fonts otherwise.
 * - No global `ul/ol { list-style: none }` reset. Generated markdown renders
 *   real lists, so list resets are scoped to chrome components instead.
 */
export const STYLE = `
/* ---- 1. tokens: dark first (design.md sections 5-6) ---------------------- */
:root {
  color-scheme: dark;
  --ink-1000: #08080a; --ink-950: #0a0a0b; --ink-900: #101012;
  --ink-850: #16161a; --ink-800: #1c1c21; --ink-700: #232327;
  --ink-600: #33333a; --ink-400: #70707a; --ink-300: #a8a8b0;
  --ink-100: #e6e6e9; --ink-50: #f5f5f6;
  --paper-50: #ffffff; --paper-100: #fafaf9; --paper-200: #f0efed;
  --paper-300: #e3e2de; --paper-400: #c9c7c1; --paper-600: #6b6b73;
  --paper-800: #33333a; --paper-950: #141416;
  --red-bright: #ff3b1f; --red-mid: #ff1e00; --red-deep: #c01500; --red-ink: #b81600;
  --ember-bright: #ff9500; --ember-mid: #e07f00; --ember-ink: #9a5600;

  --s-1: 4px; --s-2: 8px; --s-3: 12px; --s-4: 16px; --s-5: 24px;
  --s-6: 32px; --s-7: 48px; --s-8: 64px; --s-9: 96px;

  --font-sans: 'Geist', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'Geist Mono', ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
  --font-serif: 'Instrument Serif', Georgia, serif;

  --fs-micro: 10px; --fs-label: 11px; --fs-xs: 12px; --fs-sm: 13px;
  --fs-base: 14px; --fs-md: 15px; --fs-lg: 17px; --fs-xl: 20px;
  --track-h1: -.045em; --track-h2: -.038em; --track-h3: -.022em; --track-label: .12em;
  --lh-body: 1.62;

  --r-none: 0px; --r-sm: 2px; --r-md: 3px; --r-full: 999px; --hair: 1px;
  --dur-fast: .14s; --dur-ui: .2s; --ease: cubic-bezier(.22, 1, .36, 1);

  --page-max: 1200px; --prose-max: 62ch;
  --gutter: clamp(20px, 4vw, 48px);
  --control-h: 38px;

  --bg: var(--ink-950); --bg-sunk: var(--ink-1000);
  --bg-raise: var(--ink-900); --bg-raise-2: var(--ink-850);
  --fg: var(--ink-50); --fg-2: var(--ink-300); --fg-mute: var(--ink-400);
  --rule: var(--ink-700); --rule-strong: var(--ink-600);
  --accent: var(--red-bright); --accent-hov: var(--red-mid); --accent-fg: #ffffff;
  --accent-soft: rgba(255, 59, 31, 0.09); --accent-line: rgba(255, 59, 31, 0.24);
  --ember: var(--ember-bright); --ember-soft: rgba(255, 149, 0, 0.08);
  --select: rgba(255, 59, 31, 0.22);

  --kai-red: var(--accent); --kai-orange: var(--accent); --kai-amber: var(--ember);
  --kai-tan: #d7af87; --kai-blue: #87d7ff; --kai-green: #10b981;
  --kai-sage: #87af87; --kai-rose: var(--accent);
  --kai-panel: var(--bg-raise); --kai-dim: var(--fg-mute);

  /* Serve-component aliases: the views predate the token names. */
  --surface: var(--bg-raise); --surface-2: var(--bg-raise-2);
  --muted: var(--fg-2); --faint: var(--fg-mute);
  --line: var(--rule); --line-strong: var(--rule-strong);
  --accent-ink: var(--accent-fg);
  --code-bg: var(--bg-sunk);
  --mark: rgba(255, 59, 31, 0.32);
  --ok: var(--kai-green); --ok-soft: rgba(16, 185, 129, 0.12); --ok-bar: var(--kai-green);
  --warn: var(--ember); --warn-soft: var(--ember-soft); --warn-bar: var(--ember);
  --bad: var(--accent); --bad-soft: var(--accent-soft); --bad-bar: var(--accent);
  --r: var(--r-none);
  --shadow: 0 0 0 1px rgba(255,255,255,0.06), 0 4px 16px -4px rgba(0,0,0,0.35);
}
/* ---- light theme (design.md section 7: html[data-theme="light"]) --------- */
[data-theme='light'] {
  color-scheme: light;
  --bg: var(--paper-100); --bg-sunk: var(--paper-200);
  --bg-raise: var(--paper-50); --bg-raise-2: var(--paper-50);
  --fg: var(--paper-950); --fg-2: var(--paper-800); --fg-mute: var(--paper-600);
  --rule: var(--paper-300); --rule-strong: var(--paper-400);
  --accent: var(--red-ink); --accent-hov: var(--red-deep); --accent-fg: var(--paper-50);
  --accent-soft: rgba(184, 22, 0, 0.07); --accent-line: rgba(184, 22, 0, 0.22);
  --ember: var(--ember-ink); --ember-soft: rgba(154, 86, 0, 0.07);
  --select: rgba(184, 22, 0, 0.15);
  --mark: rgba(184, 22, 0, 0.16);
  --shadow: 0 0 0 1px var(--rule), 0 4px 16px -4px rgba(0,0,0,0.05);
}

/* ---- 2. base ------------------------------------------------------------ */
* { box-sizing: border-box; }
body, h1, h2, h3, h4, p, figure, blockquote, dl, dd { margin: 0; }
html {
  background: var(--bg); color: var(--fg);
  font-family: var(--font-sans); font-size: var(--fs-base); line-height: var(--lh-body);
  -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;
  scroll-behavior: smooth; scroll-padding-top: 84px;
}
@media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
body { min-height: 100vh; background: var(--bg); }
::selection { background: var(--select); }
a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 2px; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
code, pre { font-family: var(--font-mono); }
img, svg { display: block; max-width: 100%; }

.skip {
  position: absolute; left: -9999px; top: 8px; z-index: 20;
  background: var(--accent); color: var(--accent-fg);
  padding: 8px 14px; border-radius: var(--r-sm); text-decoration: none;
  font-family: var(--font-mono); font-size: var(--fs-sm);
}
.skip:focus { left: 12px; }

/* ---- 3. typography utilities (design.md section 12) ---------------------- */
.mono { font-family: var(--font-mono); }
.serif { font-family: var(--font-serif); font-style: italic; font-weight: 400; color: var(--accent); }
.lead { color: var(--fg-2); font-size: var(--fs-md); line-height: 1.65; }
.label {
  font-family: var(--font-mono); font-size: var(--fs-label); font-weight: 500;
  letter-spacing: var(--track-label); text-transform: uppercase;
  color: var(--fg-mute); line-height: 1.4;
}
.label--accent { color: var(--accent); }

/* ---- 4. buttons (design.md section 13) ----------------------------------- */
.btn {
  display: inline-flex; align-items: center; justify-content: center; gap: var(--s-2);
  height: var(--control-h); padding-inline: var(--s-4);
  border: var(--hair) solid var(--rule-strong); border-radius: var(--r-none);
  background: transparent; color: var(--fg);
  font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 500;
  white-space: nowrap; cursor: pointer; text-decoration: none;
  transition: background var(--dur-ui) var(--ease), border-color var(--dur-ui) var(--ease), color var(--dur-ui) var(--ease);
}
.btn:hover { background: var(--bg-raise); border-color: var(--fg-mute); color: var(--fg); }
.btn--primary { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-weight: 600; }
.btn--primary:hover { background: var(--accent-hov); border-color: var(--accent-hov); color: var(--accent-fg); }
.btn--sm { height: 30px; padding-inline: var(--s-3); font-size: var(--fs-xs); }
.btn--lg { height: 46px; padding-inline: var(--s-5); font-size: 14.5px; }

/* ---- 5. header (design.md section 16.1) ---------------------------------- */
.hdr {
  position: sticky; top: 0; left: 0; right: 0; z-index: 1000;
  background: color-mix(in srgb, var(--bg) 90%, transparent);
  backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);
  border-bottom: var(--hair) solid var(--rule);
}
.wrap { width: 100%; max-width: var(--page-max); margin-inline: auto; padding-inline: var(--gutter); }
.hdr-in { display: flex; align-items: center; gap: var(--s-5); height: 56px; }
.brand {
  display: inline-flex; align-items: center; gap: var(--s-2);
  font-family: var(--font-mono); font-size: var(--fs-sm); font-weight: 600;
  letter-spacing: .02em; color: var(--fg); text-decoration: none; white-space: nowrap;
}
.brand-mark {
  width: 20px; height: 20px; border-radius: var(--r-sm); background: var(--accent);
  color: var(--accent-fg); display: grid; place-items: center;
  font-size: 12px; font-weight: 700;
}
.nav { display: flex; align-items: center; gap: var(--s-1); flex-wrap: wrap; margin-right: auto; }
.nav-a {
  padding: 5px var(--s-3); border-radius: var(--r-sm);
  color: var(--fg-mute); font-family: var(--font-mono); font-size: var(--fs-xs);
  text-decoration: none; white-space: nowrap;
  transition: color var(--dur-ui) var(--ease), background var(--dur-ui) var(--ease);
}
.nav-a:hover { color: var(--fg); background: var(--bg-raise); }
.nav-a.is-active, .nav-a[aria-current="page"] { color: var(--accent); background: var(--accent-soft); font-weight: 500; }
.hdr-right { display: flex; align-items: center; gap: var(--s-2); margin-left: auto; }
.tgl {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px;
  border: var(--hair) solid var(--rule); border-radius: var(--r-sm);
  color: var(--fg-mute); font-size: 14px; line-height: 1;
  transition: color var(--dur-ui) var(--ease), border-color var(--dur-ui) var(--ease);
}
.tgl:hover { color: var(--fg); border-color: var(--rule-strong); }
form.find { display: flex; gap: var(--s-2); align-items: center; }
form.find input {
  width: 236px; max-width: 46vw; height: 30px; padding: 0 var(--s-3);
  font-family: var(--font-mono); font-size: var(--fs-xs);
  color: var(--fg); background: var(--bg-raise);
  border: var(--hair) solid var(--rule); border-radius: var(--r-sm);
}
form.find input::placeholder { color: var(--fg-mute); }
form.find input:focus { outline: none; border-color: var(--accent); }
@media (max-width: 900px) { .nav { display: none; } }
@media (max-width: 620px) {
  .hdr-in { gap: var(--s-3); }
  form.find input { width: 150px; }
}

/* ---- 6. page shell ------------------------------------------------------- */
.page { max-width: var(--page-max); margin: 0 auto; padding: 34px var(--gutter) 110px; }
.page--railed {
  display: grid; gap: 40px; align-items: start;
  grid-template-columns: 224px minmax(0, 1fr) 236px;
  grid-template-areas: "sidebar main rail";
}
.page--railed.no-sidebar { grid-template-columns: minmax(0, 1fr) 236px; grid-template-areas: "main rail"; }
.page--railed.no-rail { grid-template-columns: 224px minmax(0, 1fr); grid-template-areas: "sidebar main"; }
.page--railed.no-sidebar.no-rail { grid-template-columns: minmax(0, 1fr); grid-template-areas: "main"; }
.page--railed > .main { grid-area: main; min-width: 0; }
.page--railed > .sidebar { grid-area: sidebar; }
.page--railed > .rail { grid-area: rail; }
.sidebar, .rail {
  position: sticky; top: 72px; font-size: var(--fs-sm);
  max-height: calc(100vh - 96px); overflow: auto; padding-right: 6px;
}
@media (max-width: 940px) {
  .page--railed { display: block; }
  .page--railed > .sidebar, .page--railed > .rail {
    position: static; max-height: none; margin-top: 56px;
    padding-top: 22px; border-top: var(--hair) solid var(--rule);
  }
}
/* The sidebar and rail carry the page's headings where there is room for them. */
@media (min-width: 941px) { .narrow-only { display: none; } }
@media (max-width: 620px) {
  .page { padding: 22px 16px 72px; }
}

/* ---- 7. headings and text ------------------------------------------------ */
h1 { font-size: 27px; line-height: 1.25; letter-spacing: var(--track-h3); margin: 0 0 8px; font-weight: 600; }
h2 { font-size: 19px; letter-spacing: -0.012em; margin: 34px 0 10px; font-weight: 600; }
h3 { font-size: 16px; margin: 24px 0 6px; font-weight: 600; }
.lede { color: var(--fg-2); font-size: var(--fs-md); margin: 0 0 26px; max-width: var(--prose-max); }
.sub { color: var(--fg-mute); font-size: var(--fs-sm); margin: 0 0 22px; }
.muted { color: var(--fg-mute); }
.mono, code, pre.code { font-family: var(--font-mono); }
.crumbs {
  display: flex; gap: 7px; flex-wrap: wrap; align-items: center;
  font-size: var(--fs-sm); font-family: var(--font-mono); color: var(--fg-mute); margin: 0 0 10px;
}
.crumbs a { color: var(--fg-2); text-decoration: none; }
.crumbs a:hover { color: var(--accent); text-decoration: underline; }

/* ---- 8. cards, stats, meters --------------------------------------------- */
.grid { display: grid; gap: var(--hair); grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); border: var(--hair) solid var(--rule); background: var(--rule); }
.card {
  background: var(--bg); border: 0;
  border-radius: var(--r-none); padding: var(--s-5); box-shadow: none;
  transition: background var(--dur-ui) var(--ease);
}
a.card { display: block; color: inherit; text-decoration: none; }
a.card:hover { background: var(--bg-raise); }
a.card:hover h3 { color: var(--accent); }
.card h3 { margin: 0 0 6px; font-size: var(--fs-md); }
.card h3 a { color: inherit; text-decoration: none; }
.card h3 a:hover { color: var(--accent); }
.card p { margin: 0; font-size: var(--fs-sm); color: var(--fg-mute); }
.stats {
  display: grid; gap: var(--hair); margin: 0 0 30px;
  grid-template-columns: repeat(auto-fit, minmax(148px, 1fr));
  border: var(--hair) solid var(--rule); background: var(--rule);
}
.stat { display: flex; flex-direction: column; gap: 2px; padding: var(--s-4); background: var(--bg); }
.stat .n {
  font-size: var(--fs-lg); font-weight: 500; letter-spacing: -.02em;
  font-variant-numeric: tabular-nums; line-height: 1.1; color: var(--fg);
}
.stat .k { font-size: var(--fs-xs); font-family: var(--font-mono); color: var(--fg-mute); margin-top: 3px; }
.meter { height: 6px; border-radius: var(--r-none); background: var(--bg-sunk); border: var(--hair) solid var(--rule); overflow: hidden; margin: 10px 0 6px; }
.meter i { display: block; height: 100%; background: var(--ok-bar); }
.meter.warn i { background: var(--warn-bar); }
.meter.bad i { background: var(--bad-bar); }

/* ---- 9. badges, tags, chips ---------------------------------------------- */
.badge {
  display: inline-flex; align-items: center; gap: 5px; vertical-align: middle;
  font-family: var(--font-mono); font-size: var(--fs-label); font-weight: 500;
  letter-spacing: .04em; text-transform: uppercase;
  padding: 3px 8px; border-radius: var(--r-sm); border: var(--hair) solid transparent; white-space: nowrap;
}
.badge::before { content: ""; width: 6px; height: 6px; border-radius: var(--r-full); background: currentColor; }
.badge-current { color: var(--ok); background: var(--ok-soft); }
.badge-stale { color: var(--warn); background: var(--warn-soft); }
.badge-orphaned { color: var(--bad); background: var(--bad-soft); }
.badge-unknown { color: var(--fg-mute); background: var(--bg-sunk); border-color: var(--rule); }
.tag {
  display: inline-block; font-family: var(--font-mono);
  font-size: var(--fs-micro); letter-spacing: .08em; text-transform: uppercase;
  padding: 3px 8px; border-radius: var(--r-sm); background: var(--bg-raise);
  color: var(--fg-mute); border: var(--hair) solid var(--rule);
}
.chips { display: flex; gap: var(--s-2); flex-wrap: wrap; margin: 0 0 22px; }
.chip {
  font-family: var(--font-mono); font-size: var(--fs-xs); padding: 5px var(--s-3);
  border-radius: var(--r-sm); text-decoration: none;
  border: var(--hair) solid var(--rule); background: var(--bg-raise); color: var(--fg-mute);
  transition: color var(--dur-fast) var(--ease), background var(--dur-fast) var(--ease);
}
.chip:hover { color: var(--fg); }
.chip[aria-current] { background: var(--accent); border-color: var(--accent); color: var(--accent-fg); font-weight: 500; }
.chip .n { opacity: .65; margin-left: 4px; font-variant-numeric: tabular-nums; }

/* ---- 10. sidebar and rail ------------------------------------------------- */
.sidebar h3, .rail h3 {
  font-family: var(--font-mono); font-size: var(--fs-label); text-transform: uppercase;
  letter-spacing: var(--track-label); color: var(--fg-mute); margin: 0 0 9px; font-weight: 500;
}
.sidebar ul, .rail ul { list-style: none; margin: 0 0 22px; padding: 0; }
.sidebar li a, .rail li a {
  display: block; padding: 4px 10px; margin: 1px 0; border-radius: var(--r-sm);
  color: var(--fg-2); text-decoration: none; border-left: 2px solid transparent;
  font-family: var(--font-mono); font-size: var(--fs-xs);
}
.sidebar li a:hover, .rail li a:hover { color: var(--fg); background: var(--bg-raise); }
.sidebar li a.on, .rail li a.on {
  color: var(--accent); font-weight: 500;
  background: var(--accent-soft); border-left-color: var(--accent);
}

/* the left sidebar: every generated document, grouped by chapter */
.sidebar .all-link {
  display: block; padding: 5px 10px; margin: 0 0 14px; border-radius: var(--r-sm);
  color: var(--fg); text-decoration: none; font-weight: 600;
  font-family: var(--font-mono); font-size: var(--fs-xs);
}
.sidebar .all-link:hover { background: var(--bg-raise); }
.sidebar .all-link.on { color: var(--accent); background: var(--accent-soft); }
.sidebar details.sec { margin: 0 0 1px; }
.sidebar details.sec summary {
  list-style: none; cursor: pointer; display: flex; align-items: center;
  gap: 6px; padding: 6px 10px; border-radius: var(--r-sm);
  font-family: var(--font-mono); font-size: var(--fs-xs); font-weight: 500; color: var(--fg);
}
.sidebar details.sec summary::-webkit-details-marker { display: none; }
.sidebar details.sec summary::marker { content: ""; }
.sidebar details.sec summary::before {
  content: "›"; display: inline-block; width: 10px; color: var(--fg-mute);
  transition: transform var(--dur-fast) var(--ease);
}
.sidebar details.sec[open] > summary::before { transform: rotate(90deg); }
.sidebar details.sec summary:hover { background: var(--bg-raise); }
.sidebar details.sec summary .count {
  margin-left: auto; color: var(--fg-mute); font-weight: 400; font-variant-numeric: tabular-nums;
}
.sidebar details.sec ul { margin: 2px 0 8px; padding-left: 15px; }

/* the right rail: a small local-graph preview, then the on-page h2/h3 outline */
.rail-graph {
  width: 100%; height: 150px; margin: 0 0 20px;
  border: var(--hair) solid var(--rule); border-radius: var(--r-sm);
  overflow: hidden; background: var(--bg-sunk);
}
.rail-graph canvas { display: block; width: 100%; height: 100%; }
.rail .chapter {
  font-weight: 600; color: var(--fg); font-size: var(--fs-xs); font-family: var(--font-mono);
  margin: 18px 0 5px; padding: 0 10px;
}
.rail .chapter:first-child { margin-top: 0; }
.rail a.chapter-link { display: block; color: inherit; text-decoration: none; padding: 3px 0; }
.rail a.chapter-link:hover { color: var(--accent); }
.rail a.chapter-link.on { color: var(--accent); background: none; }
.rail .toc a { font-size: var(--fs-xs); color: var(--fg-mute); padding: 2px 10px 2px 20px; }
.rail .toc a.l3 { padding-left: 30px; }
.rail .toc a:hover { color: var(--fg); background: none; text-decoration: underline; }

/* ---- 11. prose (design .prose: max 62ch) ---------------------------------- */
.prose { font-size: 16px; line-height: 1.7; max-width: var(--prose-max); }
.prose > :first-child { margin-top: 0; }
.prose h2 {
  font-size: 21px; margin: 2em 0 .6em; padding-top: .5em;
  border-top: var(--hair) solid var(--rule);
}
.prose h3 { font-size: 17px; margin: 1.6em 0 .4em; }
.prose h4 { font-size: 15px; margin: 1.4em 0 .3em; }
.prose p, .prose ul, .prose ol { margin: 0 0 1.05em; }
.prose ul, .prose ol { padding-left: 24px; }
.prose ul { list-style: disc; }
.prose ol { list-style: decimal; }
.prose li { margin: 0 0 .3em; }
.prose h1:target, .prose h2:target, .prose h3:target, .prose h4:target {
  background: var(--accent-soft); box-shadow: -10px 0 0 var(--accent-soft), inset 2px 0 0 var(--accent);
  padding-left: 10px; margin-left: -10px; border-radius: var(--r-sm);
}
code {
  background: var(--code-bg); padding: 1px 5px; border-radius: var(--r-sm);
  font-size: 0.88em; border: var(--hair) solid var(--rule);
}
pre.code {
  position: relative; background: var(--code-bg); border: var(--hair) solid var(--rule);
  padding: 14px 16px; border-radius: var(--r-sm); overflow-x: auto;
  font-size: var(--fs-sm); line-height: 1.55; margin: 0 0 1.2em;
}
pre.code code { background: none; padding: 0; border: 0; font-size: inherit; }
pre.code[data-lang]::before {
  content: attr(data-lang); position: absolute; top: 0; right: 0;
  font-family: var(--font-mono); font-size: var(--fs-micro); letter-spacing: var(--track-label);
  text-transform: uppercase; color: var(--fg-mute); padding: 4px 10px;
}
blockquote {
  margin: 0 0 1.1em; padding: 2px 0 2px 16px;
  border-left: 2px solid var(--rule-strong); color: var(--fg-2);
}
hr { border: 0; border-top: var(--hair) solid var(--rule); margin: 32px 0; }
img { max-width: 100%; height: auto; }

/* ---- 12. tables and lists (design.md section 16.7) ------------------------ */
.table-wrap { overflow-x: auto; margin: 12px 0 8px; border: var(--hair) solid var(--rule); }
table { border-collapse: collapse; width: 100%; font-size: var(--fs-base); }
th, td { text-align: left; padding: var(--s-3) var(--s-4); border-bottom: var(--hair) solid var(--rule); }
th[align="center"], td[align="center"] { text-align: center; }
th[align="right"], td[align="right"] { text-align: right; }
th[align="left"], td[align="left"] { text-align: left; }
thead th {
  background: var(--bg-raise); color: var(--fg-mute);
  font-family: var(--font-mono); font-weight: 500; font-size: var(--fs-label);
  letter-spacing: var(--track-label); text-transform: uppercase; white-space: nowrap;
}
tbody tr { transition: background var(--dur-ui) var(--ease); }
tbody tr:hover { background: var(--bg-raise); }
tbody tr:last-child td { border-bottom: 0; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
ul.rows { list-style: none; padding: 0; margin: 0; }
ul.rows li {
  display: flex; gap: 12px; align-items: baseline; justify-content: space-between;
  padding: 8px 12px; border-bottom: var(--hair) solid var(--rule); font-size: var(--fs-base);
}
ul.rows li:hover { background: var(--bg-raise); }
ul.rows .meta { color: var(--fg-mute); font-size: var(--fs-xs); font-family: var(--font-mono); white-space: nowrap; }

/* ---- 13. search ----------------------------------------------------------- */
.result { padding: 16px 0; border-bottom: var(--hair) solid var(--rule); }
.result:last-child { border-bottom: 0; }
.result .where {
  display: flex; gap: 9px; align-items: center; flex-wrap: wrap;
  font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg-mute); margin-bottom: 5px;
}
.result h3 { margin: 0 0 5px; font-size: 16px; }
.result h3 a { text-decoration: none; }
.result h3 a:hover { text-decoration: underline; }
.result .snippet { font-size: var(--fs-base); color: var(--fg-2); line-height: 1.6; }
.result .within { color: var(--fg-mute); font-weight: 400; font-size: var(--fs-base); }
.result:target {
  background: var(--accent-soft); border-radius: var(--r-sm);
  padding-left: 14px; padding-right: 14px; margin: 0 -14px;
}
mark { background: var(--mark); color: inherit; border-radius: var(--r-sm); padding: 0 2px; }

/* ---- 14. panels, empty states, pager -------------------------------------- */
.panel {
  background: var(--bg); border: var(--hair) solid var(--rule);
  border-radius: var(--r-none); padding: 16px 18px; margin: 30px 0 0;
}
.panel > h3 {
  margin: 0 0 10px; font-family: var(--font-mono); font-size: var(--fs-sm);
  text-transform: uppercase; letter-spacing: .07em; color: var(--fg-mute); font-weight: 500;
}
.panel summary { cursor: pointer; font-size: var(--fs-base); font-weight: 600; }
.panel summary::marker { color: var(--fg-mute); }
details.panel[open] > summary { margin-bottom: 12px; }
.note {
  display: flex; gap: 10px; align-items: flex-start;
  border: var(--hair) solid var(--rule); border-left: 2px solid var(--ember);
  background: var(--ember-soft); color: var(--fg);
  border-radius: var(--r-sm); padding: 12px 14px; font-size: var(--fs-sm); margin: 0 0 22px;
}
.note.bad { border-left-color: var(--accent); background: var(--accent-soft); }
.empty {
  padding: 26px; border: var(--hair) dashed var(--rule-strong); border-radius: var(--r-none);
  color: var(--fg-2); font-size: var(--fs-base); background: var(--bg-raise);
}
.empty h2 { margin-top: 0; }
.empty pre.code { margin-top: 12px; margin-bottom: 0; }
.pager { display: grid; gap: var(--hair); grid-template-columns: 1fr 1fr; margin-top: 46px; border: var(--hair) solid var(--rule); background: var(--rule); }
.pager a {
  display: block; padding: 12px 16px; text-decoration: none; color: inherit; background: var(--bg);
  transition: background var(--dur-ui) var(--ease);
}
.pager a:hover { background: var(--bg-raise); }
.pager a:hover .to { color: var(--accent); }
.pager .dir { font-family: var(--font-mono); font-size: var(--fs-xs); color: var(--fg-mute); margin-bottom: 3px; }
.pager .to { font-weight: 600; font-size: var(--fs-base); }
.pager .next { text-align: right; grid-column: 2; }
@media (max-width: 620px) {
  .pager { grid-template-columns: 1fr; }
  .pager .next { text-align: left; grid-column: 1; }
}

/* ---- 15. footer (design.md section 16.9: ftr-end status row) --------------- */
footer.foot {
  max-width: var(--page-max); margin: 0 auto; padding: 0 var(--gutter) 40px;
  color: var(--fg-mute); font-family: var(--font-mono); font-size: var(--fs-xs);
}
.foot-in {
  display: flex; flex-wrap: wrap; align-items: center; gap: var(--s-2);
  padding-top: var(--s-5); border-top: var(--hair) solid var(--rule);
}
.status-dot { width: 6px; height: 6px; border-radius: var(--r-full); background: var(--kai-green); flex: none; }
.foot .mono { color: var(--fg-2); }

@media print {
  @page {
    margin: 1.5cm 1.5cm 2cm 1.5cm;
    size: auto;
  }
  *, *::before, *::after {
    box-shadow: none !important;
    text-shadow: none !important;
  }
  body {
    background: #fff !important;
    color: #111 !important;
    font-size: 11pt !important;
    line-height: 1.5 !important;
  }
  .hdr, .sidebar, .rail, .pager, .skip, footer.foot, .tgl, button, form.find {
    display: none !important;
  }
  .page, .page--railed, .main, .content {
    display: block !important;
    width: 100% !important;
    max-width: 100% !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    color: #000 !important;
  }
  p, blockquote, pre, table {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  pre, code {
    font-family: var(--font-mono) !important;
    font-size: 9.5pt !important;
    white-space: pre-wrap !important;
    word-break: break-all !important;
    border: 1px solid #ddd !important;
  }
  blockquote {
    border-left: 3pt solid #ccc !important;
    padding-left: 12pt !important;
    margin-left: 0 !important;
    color: #333 !important;
  }
}
`;

/** Theme boot: runs in <head> so the first paint already matches the stored theme. */
const THEME_BOOT_JS = `try{var __t=localStorage.getItem('kaioken-theme')||'dark';document.documentElement.dataset.theme=__t;}catch(__e){document.documentElement.dataset.theme='dark';}`;

/** Theme toggle wiring, rendered once at the end of <body>. */
const THEME_TOGGLE_JS = `(function(){var b=document.getElementById('k-theme');if(!b)return;function label(){var l=document.documentElement.dataset.theme==='light';b.textContent=l?'\\u25D0':'\\u25D1';b.setAttribute('aria-label',l?'Switch to dark theme':'Switch to light theme');}b.addEventListener('click',function(){var next=document.documentElement.dataset.theme==='light'?'dark':'light';document.documentElement.dataset.theme=next;try{localStorage.setItem('kaioken-theme',next);}catch(e){}label();if(window.__kaioRecolor)window.__kaioRecolor();});label();})();`;

/** Live reload listener over Server-Sent Events (#UX-1511 – #UX-1520). */
const LIVE_RELOAD_JS = `(function(){if(typeof window==='undefined'||!window.EventSource)return;try{var es=new EventSource('/api/events');es.addEventListener('reload',function(){location.reload();});es.onerror=function(){};}catch(e){}})();`;

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
				`<a class="nav-a${shell.active === href ? " is-active" : ""}" href="${href}"${shell.active === href ? ' aria-current="page"' : ""}>${label}</a>`,
		)
		.join("");

	return `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(shell.title)}</title>
<script>${THEME_BOOT_JS}</script>
<style>${STYLE}</style>
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<header class="hdr"><div class="hdr-in wrap">
  <a class="brand" href="/"><span class="brand-mark" aria-hidden="true">K</span>kaioken</a>
  <nav class="nav" aria-label="Sections">${nav}</nav>
  <div class="hdr-right">
    <form class="find" action="/search" method="get" role="search">
      <input type="search" name="q" aria-label="Search this repository"
        placeholder="Search this repository" value="${escapeAttr(shell.query ?? "")}"${
				shell.focusSearch ? " autofocus" : ""
			}>
      <button class="btn btn--sm" type="submit">Search</button>
    </form>
    <button class="tgl" id="k-theme" type="button" aria-label="Toggle theme" title="Toggle theme">&#x25D1;</button>
  </div>
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
<footer class="foot"><div class="foot-in">
  <span class="status-dot" aria-hidden="true"></span>
  <span>Local only — rendered from <span class="mono">${escapeHtml(site.root)}</span> · nothing on this page left this machine.</span>
</div></footer>
<script>${THEME_TOGGLE_JS}</script>
<script>${LIVE_RELOAD_JS}</script>
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
