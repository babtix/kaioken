import type { Site } from "./layout.ts";
import { layout, stat, plural, meter, command, badge, escapeHtml, escapeAttr } from "./layout.ts";
import type { Library } from "../library.ts";

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

export function freshnessSummary(library: Library): string {
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
