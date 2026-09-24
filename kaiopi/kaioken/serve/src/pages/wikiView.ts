import type { Site } from "./layout.ts";
import { layout, badge, meter, plural, shortDate, command, escapeHtml, escapeAttr, hrefFor, fileLink } from "./layout.ts";
import { freshnessSummary } from "./overviewView.ts";
import type { Library, WikiChapter, WikiDoc } from "../library.ts";
import type { Heading } from "../markdown.ts";
import { docId } from "../graph.ts";
import { GRAPH_ENGINE_JS } from "../graphEngineAsset.ts";

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
        ${doc ? verificationBadge(doc) : ""}
        ${doc && library.judged ? `${badge(doc.freshness)} ` : ""}
        ${doc?.generatedAt ? `written ${escapeHtml(shortDate(doc.generatedAt))} · ` : ""}
        ${doc && doc.sources.length > 0 ? `from ${plural(doc.sources.length, "file")}` : ""}
      </p>
      ${doc ? staleNote(doc) : ""}
      ${headings.length > 1 ? mobileToc(headings) : ""}
      <article class="prose">${html}</article>
      ${doc ? verificationPanel(doc) : ""}
      ${doc ? provenancePanel(doc) : ""}
      ${pager(previous, next)}`,
	});
}

/**
 * Whether the verifier's claim checks held up.
 *
 * This is deliberately separate from the freshness badge beside it. Freshness
 * asks "do the sources still match?" and grounding asks "were the claims about
 * them true?" — a document can be perfectly fresh and still have asserted
 * something false, so collapsing them into one label would hide exactly the
 * failure the verifier exists to catch.
 */
function verificationBadge(doc: WikiDoc): string {
	const verdict = doc.verification;
	if (!verdict) {
		return `<span class="badge badge-unknown" title="No verification record was written for this document">unverified</span> `;
	}
	if (verdict.defects > 0) {
		return `<span class="badge badge-orphaned" title="${verdict.defects} claim(s) could not be confirmed against the sources">${verdict.defects} ungrounded</span> `;
	}
	return `<span class="badge badge-current" title="${verdict.grounded} claim(s) checked against the sources">verified ✓</span> `;
}

/**
 * The verifier's findings, including the ones that failed.
 *
 * A badge saying "3 ungrounded" tells a reader to be suspicious and nothing
 * more. Naming the claim and its line turns that into something actionable,
 * which is the whole reason defects are persisted rather than counted.
 */
function verificationPanel(doc: WikiDoc): string {
	const verdict = doc.verification;
	if (!verdict) return "";

	const uncovered =
		verdict.uncovered > 0
			? `<p class="muted" style="font-size:12.5px;margin:12px 0 0">
        ${verdict.uncovered} exported declaration(s) in scope are never mentioned here,
        so this document is not a complete account of its own files.
      </p>`
			: "";

	if (verdict.defects === 0) {
		return `<details class="panel">
    <summary>Verified — ${verdict.grounded} claim(s) checked</summary>
    <p class="muted" style="font-size:13.5px;margin:0">
      Every claim this document makes about its sources was checked against the code at
      generation time and held up.
    </p>
    ${uncovered}
  </details>`;
	}

	return `<details class="panel" open>
    <summary>${verdict.defects} ungrounded claim(s) of ${verdict.grounded + verdict.defects} checked</summary>
    <ul class="rows">${verdict.samples
			.map(
				(defect) =>
					`<li style="display:block">
          <div>${escapeHtml(defect.claim)}${
						defect.line !== undefined ? `<span class="muted"> · line ${defect.line}</span>` : ""
					}</div>
          <div class="muted" style="font-size:12.5px">${escapeHtml(defect.detail)}</div>
        </li>`,
			)
			.join("")}</ul>
    <p class="muted" style="font-size:12.5px;margin:12px 0 0">
      These could not be confirmed against the files listed below. Treat them as claims to
      check, not as fact — the code is ground truth.
    </p>
    ${uncovered}
  </details>`;
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
export function mobileToc(headings: readonly Heading[]): string {
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
        doc: v('--accent', '#ff3b1f'),
        file: v('--fg-mute', '#70707a'),
        section: v('--fg-mute', '#70707a'),
        edge: v('--rule', '#232327'),
        label: v('--fg-mute', '#70707a'),
        accent: v('--accent', '#ff3b1f')
      };
    }
    function recolor() { engine.setColors(colors()); }
    engine.setColors(colors());
    // The site themes via data-theme (toggle), not the OS preference.
    new MutationObserver(recolor).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.__kaioRecolor = recolor;

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
