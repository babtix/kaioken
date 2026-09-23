import type { Site } from "./layout.ts";
import { layout, fileLink, plural, escapeHtml, escapeAttr, hrefFor, command, badge } from "./layout.ts";
import { highlight } from "../markdown.ts";

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
