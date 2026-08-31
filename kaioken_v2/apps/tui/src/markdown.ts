/**
 * Terminal markdown, in the Kaioken palette.
 *
 * Wiki chapters, research answers and assistant replies are all markdown, and
 * until now the TUI showed them as raw text — headings as `##`, code fences as
 * three backticks. pi-tui's renderer does the parse and the wrap; this file
 * supplies the palette and decides when rendering is worth it.
 *
 * Pure by construction: markdown in, styled lines out, no terminal involved.
 */
import { Markdown, type MarkdownTheme } from "@earendil-works/pi-tui";
import { visibleWidth } from "./screen.js";
import { bold, fg, italic, strikethrough, underline } from "./theme.js";

/**
 * The role assignments follow DESIGN.md's semantic table: headings take the
 * primary accent, inline code the tan reserved for code, links the blue
 * reserved for paths and queries, and the fence borders the structural line
 * colour so the code inside is what stands out rather than its frame.
 */
export function kaiokenMarkdownTheme(): MarkdownTheme {
	return {
		heading: (t) => bold(fg("accent", t)),
		link: (t) => underline(fg("user", t)),
		linkUrl: (t) => fg("dim", t),
		code: (t) => fg("tool", t),
		codeBlock: (t) => fg("text", t),
		codeBlockBorder: (t) => fg("line", t),
		quote: (t) => italic(fg("muted", t)),
		quoteBorder: (t) => fg("accent", t),
		hr: (t) => fg("line", t),
		listBullet: (t) => fg("accent", t),
		bold,
		italic,
		strikethrough,
		underline,
		codeBlockIndent: "  ",
	};
}

/**
 * Render markdown to lines at a given width.
 *
 * A new renderer per call rather than a cached one: `Markdown` caches
 * internally on (text, width), and the alternative — a module-level instance —
 * would make two concurrent views fight over one buffer.
 */
export function renderMarkdown(text: string, width: number, paddingX = 1): string[] {
	if (!text.trim()) return [];
	const component = new Markdown(text, paddingX, 0, kaiokenMarkdownTheme());
	return unpad(component.render(Math.max(8, width)));
}

/**
 * Drop the right-hand padding the renderer adds to every row.
 *
 * `Markdown` returns rows padded to exactly the width it was given. Nothing
 * renders differently without that padding — the theme sets no background, and
 * nothing in the output is decorated on its right edge — but downstream it was
 * destructive. The transcript indents a wrapped row's continuations by the
 * leading whitespace of the row it came from, and a *blank* row padded to the
 * full width is entirely leading whitespace: it left four columns to wrap into,
 * so the single blank line between two paragraphs came back as twenty-six blank
 * rows. A short reply then needed scrolling to reach its second half, and the
 * transcript it had to re-wrap on every frame was ten times its real size.
 *
 * A row with nothing left after the trim becomes the empty string, which is the
 * gap the transcript already knows how to keep.
 */
function unpad(lines: readonly string[]): string[] {
	return lines.map((line) => {
		// biome-ignore lint: matching escape sequences is the whole job.
		const trimmed = line.replace(/[ \t]+((?:\x1b\[[0-9;?]*[A-Za-z])*)$/, "$1");
		return visibleWidth(trimmed) === 0 ? "" : trimmed;
	});
}

/**
 * Render markdown only when it carries structure worth rendering.
 *
 * A one-line conversational answer gains nothing from a markdown pass except
 * padding and a parse; the v1 TUI made the same call and it held up. Anything
 * with a fence, or two structural signals, goes through the renderer.
 */
export function renderProse(text: string, width: number, paddingX = 1): string[] {
	if (width < 20 || !looksLikeMarkdown(text)) {
		return unpad(text.split("\n").map((line) => `${" ".repeat(paddingX)}${line}`));
	}
	return renderMarkdown(text, width, paddingX);
}

export function looksLikeMarkdown(text: string): boolean {
	if (text.includes("```")) return true;
	let structural = 0;
	for (const raw of text.split("\n")) {
		const line = raw.trim();
		if (
			line.startsWith("#") ||
			line.startsWith("- ") ||
			line.startsWith("* ") ||
			line.startsWith("> ") ||
			line.startsWith("|") ||
			/^\d+\. /.test(line)
		) {
			structural++;
		}
		if (line.includes("**") || line.includes("`")) structural++;
		if (structural >= 2) return true;
	}
	return false;
}
