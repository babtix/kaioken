import type { SourceExcerpt } from "./types.js";

/**
 * The boundary where untrusted web content becomes labelled data.
 *
 * A fetched page is hostile input wearing prose: scripts, injection attempts,
 * and model-targeted instructions arrive in exactly the channel the model is
 * told to trust. The sanitizer is the reason they cannot land — everything the
 * model later reads has passed through here, and nothing the model produces
 * can re-enter the evidence set without being fetched and sanitised again.
 */

/**
 * Strip markup down to readable text.
 *
 * Script and style contents are removed whole — their text is code, not
 * prose, and leaving it in would hand the model instructions disguised as
 * noise. Tags are then dropped, entities decoded, and whitespace collapsed.
 */
export function htmlToText(html: string): string {
	let text = html;

	// Whole-element removal before tag stripping: their inner text must not
	// survive as prose.
	for (const tag of ["script", "style", "noscript", "template", "svg"]) {
		text = text.replace(new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?</${tag}>`, "gi"), " ");
		text = text.replace(new RegExp(`<${tag}\\b[^>]*/?>`, "gi"), " ");
	}

	// Comments can carry anything, including conditional markup.
	text = text.replace(/<!--[\s\S]*?-->/g, " ");

	// Block-level boundaries become newlines so paragraphs survive as paragraphs.
	text = text.replace(/<\/(p|div|li|tr|h[1-6]|section|article|blockquote)>/gi, "\n");
	text = text.replace(/<br\s*\/?>/gi, "\n");

	// Everything else that looks like a tag is dropped, never rendered.
	text = text.replace(/<[^>]+>/g, " ");

	text = decodeEntities(text);

	// Collapse the whitespace the stripping left behind.
	text = text
		.split("\n")
		.map((line) => line.replace(/\s+/g, " ").trim())
		.filter(Boolean)
		.join("\n");

	return text.trim();
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
 * a false positive must be visible.
 */
export function injectionPatterns(text: string): string[] {
	const patterns = [
		/ignore (all |any |the )?(previous|prior|above) instructions/i,
		/disregard (all |the )?(previous|prior) instructions/i,
		/you are now (a |an )/i,
		/(reveal|print|repeat) (your |the )?(system )?prompt/i,
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
