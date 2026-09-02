/**
 * A deliberately small markdown renderer.
 *
 * The serving layer exists so a human can audit generated knowledge, which means
 * it must render without a network. Pulling a markdown library that fetches CSS,
 * fonts or highlighter themes at runtime would break the one property the layer
 * is for. This handles the subset the wiki actually emits.
 */

export function renderMarkdown(source: string): string {
	const lines = source.split(/\r?\n/);
	const out: string[] = [];

	let inFence = false;
	let fenceLang = "";
	let fenceBuffer: string[] = [];
	let listType: "ul" | "ol" | null = null;
	let paragraph: string[] = [];

	const closeParagraph = () => {
		if (paragraph.length === 0) return;
		out.push(`<p>${inline(paragraph.join(" "))}</p>`);
		paragraph = [];
	};

	const closeList = () => {
		if (!listType) return;
		out.push(`</${listType}>`);
		listType = null;
	};

	const closeBlocks = () => {
		closeParagraph();
		closeList();
	};

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i] as string;

		const fence = /^\s*(?:```|~~~)(.*)$/.exec(line);
		if (fence) {
			if (inFence) {
				out.push(
					`<pre class="code"${fenceLang ? ` data-lang="${escapeAttr(fenceLang)}"` : ""}><code>${escapeHtml(
						fenceBuffer.join("\n"),
					)}</code></pre>`,
				);
				fenceBuffer = [];
				inFence = false;
				fenceLang = "";
			} else {
				closeBlocks();
				inFence = true;
				fenceLang = (fence[1] ?? "").trim();
			}
			continue;
		}

		if (inFence) {
			fenceBuffer.push(line);
			continue;
		}

		if (line.trim() === "") {
			closeBlocks();
			continue;
		}

		// GFM Table parsing: line with pipe whose next line is a delimiter row
		if (line.includes("|") && i + 1 < lines.length && isDelimiterRow(lines[i + 1] as string)) {
			const headerLine = line;
			const delimiterLine = lines[i + 1] as string;
			const headerCells = splitTableRow(headerLine);
			const alignments = parseAlignments(delimiterLine);

			if (headerCells.length > 0 && alignments.length > 0) {
				closeBlocks();
				const theadCells = headerCells.map((cell, idx) => {
					const align = alignments[idx];
					const alignAttr = align ? ` align="${align}"` : "";
					return `<th${alignAttr}>${inline(cell)}</th>`;
				});

				const tbodyRows: string[] = [];
				let j = i + 2;
				while (j < lines.length) {
					const rowLine = lines[j] as string;
					if (!rowLine.trim() || !rowLine.includes("|")) break;
					const rowCells = splitTableRow(rowLine);
					const rowHtml = rowCells.map((cell, idx) => {
						const align = alignments[idx];
						const alignAttr = align ? ` align="${align}"` : "";
						return `<td${alignAttr}>${inline(cell)}</td>`;
					});
					tbodyRows.push(`<tr>${rowHtml.join("")}</tr>`);
					j++;
				}

				const tableHtml = [
					'<div class="table-wrap"><table>',
					`<thead><tr>${theadCells.join("")}</tr></thead>`,
					tbodyRows.length > 0 ? `<tbody>${tbodyRows.join("")}</tbody>` : "",
					"</table></div>",
				].join("");

				out.push(tableHtml);
				i = j - 1;
				continue;
			}
		}

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (heading) {
			closeBlocks();
			const level = (heading[1] as string).length;
			const text = (heading[2] as string).trim();
			out.push(`<h${level} id="${slug(text)}">${inline(text)}</h${level}>`);
			continue;
		}

		if (/^\s*(?:---|\*\*\*|___)\s*$/.test(line)) {
			closeBlocks();
			out.push("<hr>");
			continue;
		}

		const quote = /^\s*>\s?(.*)$/.exec(line);
		if (quote) {
			closeBlocks();
			out.push(`<blockquote>${inline(quote[1] as string)}</blockquote>`);
			continue;
		}

		const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
		const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
		if (bullet || numbered) {
			closeParagraph();
			const wanted = bullet ? "ul" : "ol";
			if (listType !== wanted) {
				closeList();
				out.push(`<${wanted}>`);
				listType = wanted;
			}
			out.push(`<li>${inline((bullet ?? numbered)?.[1] as string)}</li>`);
			continue;
		}

		closeList();
		paragraph.push(line.trim());
	}

	if (inFence && fenceBuffer.length > 0) {
		out.push(`<pre class="code"><code>${escapeHtml(fenceBuffer.join("\n"))}</code></pre>`);
	}
	closeBlocks();

	return out.join("\n");
}

function splitTableRow(line: string): string[] {
	const trimmed = line.trim();
	const content = trimmed.replace(/^\|/, "").replace(/\|$/, "");
	const cells: string[] = [];
	let current = "";
	let inCode = false;

	for (let i = 0; i < content.length; i++) {
		const ch = content[i] as string;
		if (ch === "`") {
			inCode = !inCode;
			current += ch;
		} else if (ch === "\\" && i + 1 < content.length && content[i + 1] === "|") {
			current += "|";
			i++;
		} else if (ch === "|" && !inCode) {
			cells.push(current.trim());
			current = "";
		} else {
			current += ch;
		}
	}
	cells.push(current.trim());
	return cells;
}

function isDelimiterRow(line: string): boolean {
	const trimmed = line.trim();
	if (!trimmed.includes("|")) return false;
	const cells = splitTableRow(trimmed);
	if (cells.length === 0) return false;
	return cells.every((cell) => /^:?-+:?$/.test(cell));
}

function parseAlignments(delimiterLine: string): Array<"left" | "center" | "right" | null> {
	const cells = splitTableRow(delimiterLine);
	return cells.map((cell) => {
		const left = cell.startsWith(":");
		const right = cell.endsWith(":");
		if (left && right) return "center";
		if (right) return "right";
		if (left) return "left";
		return null;
	});
}

/**
 * Inline spans.
 *
 * Splitting on backticks first means code spans are never seen by the emphasis
 * or link rules — no placeholder round-trip, so there is no sentinel that could
 * collide with real text.
 */
export function inline(text: string): string {
	const segments = text.split("`");
	let out = "";

	for (let i = 0; i < segments.length; i++) {
		const segment = segments[i] as string;
		// Odd segments sit between a matched pair of backticks. A trailing
		// unmatched backtick leaves a final odd segment: that is literal text,
		// and the backtick the split consumed has to be put back.
		const isCode = i % 2 === 1 && i < segments.length - 1;
		if (isCode) {
			out += `<code>${escapeHtml(segment)}</code>`;
		} else {
			out += (i % 2 === 1 ? escapeHtml("`") : "") + spans(segment);
		}
	}

	return out;
}

function spans(text: string): string {
	let work = escapeHtml(text);

	work = work.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt: string, src: string) =>
		isSafeUrl(src) ? `<img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}">` : escapeHtml(alt),
	);

	work = work.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, href: string) =>
		isSafeUrl(href) ? `<a href="${escapeAttr(href)}">${label}</a>` : label,
	);

	work = work.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	work = work.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

	return work;
}

/**
 * Generated documents are model output. Treating their links as trusted would
 * make the audit surface an injection surface, so only relative links and plain
 * http(s) are emitted — never `javascript:` or `data:`.
 */
export function isSafeUrl(url: string): boolean {
	const trimmed = url.trim();
	if (trimmed === "") return false;
	if (/^(?:https?:)?\/\//i.test(trimmed)) return true;
	if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return false;
	return true;
}

/** One heading in a rendered document, for the on-page table of contents. */
export interface Heading {
	level: number;
	text: string;
	slug: string;
}

/**
 * The headings of a document, in order.
 *
 * A generated chapter is long by construction — it is written to cover every
 * export in scope — so arriving at the top of one with no map is the single
 * worst moment in reading the wiki. The renderer already assigns each heading a
 * slug; this extracts the same slugs so the navigation and the anchors cannot
 * disagree.
 */
export function outline(source: string): Heading[] {
	const out: Heading[] = [];
	let inFence = false;

	for (const line of source.split(/\r?\n/)) {
		if (/^\s*(?:```|~~~)/.test(line)) {
			inFence = !inFence;
			continue;
		}
		if (inFence) continue;

		const heading = /^(#{1,6})\s+(.*)$/.exec(line);
		if (!heading) continue;

		const text = (heading[2] as string).trim();
		if (text === "") continue;
		out.push({ level: (heading[1] as string).length, text, slug: slug(text) });
	}

	return out;
}

/**
 * Escape text and mark the query terms inside it.
 *
 * A result list where the reader has to re-find their own words in every snippet
 * makes them read all of them. Marking happens after escaping, so the only
 * markup that can reach the page is the `<mark>` this function writes.
 *
 * A term only marks where a word starts. Marking anywhere would cut identifiers
 * into pieces — `handleWikiSearch` for the query "wiki search" — and a name
 * broken into three highlighted fragments is harder to read than an unmarked
 * one. Terms with no Latin letters are matched anywhere instead, because a
 * script that does not separate words has no word start to anchor to.
 */
export function highlight(text: string, terms: readonly string[]): string {
	const escaped = escapeHtml(text);
	const wanted = [...new Set(terms.map((term) => term.trim()).filter((term) => term.length > 1))]
		// Longest first, so "search" is not consumed by "sea" inside it.
		.sort((a, b) => b.length - a.length)
		.map((term) =>
			/[a-z]/i.test(term) ? `(?<![\\p{L}\\p{N}_])${escapeRegExp(term)}` : escapeRegExp(term),
		);

	if (wanted.length === 0) return escaped;

	return escaped.replace(
		new RegExp(`(${wanted.join("|")})`, "giu"),
		(match) => `<mark>${match}</mark>`,
	);
}

/**
 * Drop the document's own title line.
 *
 * A generated chapter opens with `# Title`, and the page already shows that
 * title in its header next to the freshness badge and the path. Rendering both
 * puts the same words on screen twice and pushes the first real sentence below
 * the fold.
 */
export function stripTitle(source: string, title: string): string {
	const match = /^\s*#\s+(.*?)\s*(?:\r?\n|$)/.exec(source);
	if (!match || (match[1] as string).trim() !== title.trim()) return source;
	return source.slice(match[0].length).replace(/^\s*(?:\r?\n)/, "");
}

/** The words of a query, as the reader typed them. */
export function queryTerms(query: string): string[] {
	return query.split(/[^\p{L}\p{N}_]+/u).filter(Boolean);
}

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, "-")
		.replace(/^-+|-+$/g, "");
}

export function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

export function escapeAttr(text: string): string {
	return escapeHtml(text).replace(/'/g, "&#39;");
}
