import type { Site } from "./layout.ts";
import { layout, plural, escapeHtml, escapeAttr, hrefFor } from "./layout.ts";
import type { SearchHit } from "@kaioken/search";
import { highlight, queryTerms } from "../markdown.ts";

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
      <div id="search-results">${results}</div>
<script>
(function() {
  const input = document.querySelector('form[role="search"] input[name="q"]');
  const container = document.getElementById("search-results");
  if (!input || !container) return;
  let timer;
  input.addEventListener("input", function() {
    clearTimeout(timer);
    timer = setTimeout(async function() {
      const q = input.value.trim();
      if (!q) return;
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(q));
        if (!res.ok) return;
        const data = await res.json();
        if (data.hits && data.hits.length > 0) {
          container.innerHTML = data.hits.map(function(h) {
            const lead = h.kind === 'symbol' ? (h.heading || h.title) : (h.title || h.heading);
            const href = (h.kind === 'symbol' ? '/f/' + h.path + (h.line ? '#L' + h.line : '') : h.kind === 'card' ? '/c/' + h.path.replace(/^cards\//, '') : h.kind === 'skill' ? '/s/' + h.path.replace(/^skills\//, '') : '/d/' + h.path);
            return '<article class="result"><div class="where"><span class="tag">' + h.kind + '</span> <span class="mono">' + h.path + (h.line ? ':' + h.line : '') + '</span></div><h3><a href="' + href + '">' + lead + '</a></h3><div class="snippet">' + (h.snippet || '') + '</div></article>';
          }).join('');
        }
      } catch (e) {}
    }, 150);
  });
})();
</script>`,
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
