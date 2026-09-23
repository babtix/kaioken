import type { SourceExcerpt } from "./types.ts";

/**
 * The boundary where untrusted web content becomes labelled data.
 *
 * A fetched page is hostile input wearing prose: scripts, injection attempts,
 * and model-targeted instructions arrive in exactly the channel the model is
 * told to trust. The sanitizer is the reason they cannot land — everything the
 * model later reads has passed through here, and nothing the model produces
 * can re-enter the evidence set without being fetched and sanitised again.
 */

const SKIP_TAGS = new Set(["script", "style", "noscript", "template", "svg"]);
const BLOCK_TAGS = new Set([
	"p",
	"div",
	"li",
	"tr",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"section",
	"article",
	"blockquote",
	"header",
	"footer",
	"nav",
	"main",
	"aside",
]);

/**
 * Strip markup down to readable text using a deterministic character state machine.
 *
 * Script and style contents are removed whole — their text is code, not
 * prose, and leaving it in would hand the model instructions disguised as
 * noise. Tags are then dropped, entities decoded, and whitespace collapsed.
 */
export function htmlToText(html: string): string {
	let out = "";
	let i = 0;
	const n = html.length;

	while (i < n) {
		// Check for HTML comment <!--
		if (html.startsWith("<!--", i)) {
			const end = html.indexOf("-->", i + 4);
			if (end === -1) {
				break;
			}
			i = end + 3;
			out += " ";
			continue;
		}

		const ch = html[i];
		if (ch === "<") {
			i++;
			let isClosing = false;
			if (i < n && html[i] === "/") {
				isClosing = true;
				i++;
			}

			// Read tag name
			let tagName = "";
			while (i < n && /[a-zA-Z0-9:-]/.test(html[i]!)) {
				tagName += html[i]!;
				i++;
			}
			tagName = tagName.toLowerCase();

			// If it is a skip tag (script, style, noscript, etc.) and it's an opening tag
			if (!isClosing && SKIP_TAGS.has(tagName)) {
				// Read until closing '>' of opening tag
				while (i < n && html[i] !== ">") {
					i++;
				}
				if (i < n) i++;

				// Skip until </tagName>
				const closeNeedle = `</${tagName}`;
				while (i < n) {
					const idx = html.toLowerCase().indexOf(closeNeedle, i);
					if (idx === -1) {
						i = n;
						break;
					}
					const endTagIdx = html.indexOf(">", idx + closeNeedle.length);
					if (endTagIdx === -1) {
						i = n;
						break;
					}
					i = endTagIdx + 1;
					break;
				}
				out += " ";
				continue;
			}

			// Otherwise, read attributes until closing '>'
			let inQuote: string | null = null;
			while (i < n) {
				const c = html[i]!;
				if (inQuote) {
					if (c === inQuote) {
						inQuote = null;
					}
				} else if (c === '"' || c === "'") {
					inQuote = c;
				} else if (c === ">") {
					i++;
					break;
				}
				i++;
			}

			// Emit block boundary newline
			if (tagName === "br" || (isClosing && BLOCK_TAGS.has(tagName))) {
				out += "\n";
			} else {
				out += " ";
			}
			continue;
		}

		out += ch;
		i++;
	}

	const decoded = decodeEntities(out);

	// Collapse whitespace and empty lines
	return decoded
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n")
		.trim();
}

function decodeEntities(text: string): string {
	const named: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: " ",
		mdash: "—",
		ndash: "–",
		hellip: "…",
	};
	return text
		.replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
			const code = Number.parseInt(hex, 16);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
		})
		.replace(/&#(\d+);/g, (_, dec: string) => {
			const code = Number.parseInt(dec, 10);
			return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : " ";
		})
		.replace(/&([a-z]+);/gi, (match, name: string) => named[name.toLowerCase()] ?? match);
}

/**
 * Fence sanitised content as a numbered source.
 *
 * The fence is the label: the model sees `[source N]` and is told the content
 * inside is data, not instructions. Anything inside that *looks* like an
 * instruction is indistinguishable from the page's real text — which is the
 * point. The model is never asked to obey page content, only to cite it.
 */
export function fenceSource(excerpt: SourceExcerpt): string {
	const label = `[source ${excerpt.sourceNumber}]${excerpt.truncated ? " (truncated)" : ""}`;
	return `${label}\n${excerpt.text}`;
}

/**
 * Bound a page's text to the excerpt budget.
 *
 * The head is kept rather than a middle slice: page titles and leading
 * paragraphs carry the page's own claim about what it is, which is what a
 * citation needs to be checked against.
 */
export function excerptOf(text: string, maxChars: number): SourceExcerpt {
	const clean = text.trim();
	const truncated = clean.length > maxChars;
	return {
		sourceNumber: 0, // assigned by the gatherer, never by the model
		text: truncated ? `${clean.slice(0, maxChars)}…` : clean,
		truncated,
	};
}

/**
 * Patterns an instruction-injection attempt tends to wear.
 *
 * Used only for *reporting*: a page whose text matches is flagged in the run
 * output, never silently dropped — the filter is a signal, not a censor, and
 * a page is not less citable for containing the word "system prompt".
 */
export function injectionPatterns(text: string): string[] {
	const patterns = [
		/ignore (all )?(previous|prior|above) instructions/i,
		/disregard (all )?(previous|prior|above)/i,
		/you are now/i,
		/new instructions:/i,
		/as an ai language model/i,
		/system prompt:/i,
		/(do not|don't) (tell|inform|reveal) (the )?user/i,
	];
	const found: string[] = [];
	for (const pattern of patterns) {
		if (pattern.test(text)) found.push(pattern.source);
	}
	return found;
}
