/**
 * Column arithmetic.
 *
 * Everything the views need to fit text into a fixed number of terminal
 * columns, and nothing else. The clear-and-repaint loop, the raw key parser
 * and the hand-rolled viewport that used to live here are gone: pi-tui's
 * `TuiAltScreen` owns the terminal, `ScrollView` owns scrolling, and
 * `matchesKey` owns the keyboard. Keeping a second, unused copy of each was a
 * standing invitation for the two to disagree about what the screen looks
 * like.
 *
 * What survives is the part with no pi-tui equivalent at the call sites: two
 * helpers the view functions use on every row.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export { visibleWidth };

/**
 * Truncate to a column width.
 *
 * Measured in display columns, not code units: a CJK ideograph occupies two
 * columns, and an emoji with a variation selector occupies two while spanning
 * several code points. Counting `.length` put both off by enough to tear every
 * row that contained one.
 */
export function truncate(text: string, width: number): string {
	if (width <= 0) return "";
	if (visibleWidth(text) <= width) return text;
	return width > 1 ? truncateToWidth(text, width, "…") : truncateToWidth(text, width, "");
}

/** Truncate or pad to exactly `width` display columns. */
export function pad(text: string, width: number): string {
	const shown = visibleWidth(text);
	if (shown >= width) return truncate(text, width);
	return text + " ".repeat(width - shown);
}

/** Join a frame's lines for tests: assertions run on plain text. */
export function renderToStringHelper(lines: readonly string[]): string {
	return lines.join("\n");
}
