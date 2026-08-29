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

	for (const line of lines) {
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
