/**
 * Parent/child chunking: decoupling retrieval granularity from generation
 * context.
 *
 * A single chunk size cannot serve both. Big chunks embed poorly — one vector
 * averaging two thousand words points at nothing in particular — while small
 * chunks retrieve precisely and then hand the model a fragment that starts
 * mid-argument. So a document is split twice: into parents that are worth
 * reading, and into children that are worth matching, with every child
 * remembering the parent it came from. Children are the only thing search ever
 * touches; parents are what reach the model.
 */

export interface ChunkConfig {
	/** The context window handed to the model. */
	parentTokens: number;
	/** The retrieval window that gets embedded. */
	childTokens: number;
	/** Keeps a sentence spanning two children findable from both. */
	childOverlap: number;
	/**
	 * The rough conversion. Four is the usual approximation for English prose,
	 * and it only has to be close: these are window sizes, not a budget
	 * anything is charged against.
	 */
	charsPerToken: number;
}

/**
 * A ~600-token parent carries a full argument; a ~150-token child is small
 * enough that its embedding means one thing.
 */
export const DEFAULT_CHUNK_CONFIG: ChunkConfig = {
	parentTokens: 600,
	childTokens: 150,
	childOverlap: 20,
	charsPerToken: 4,
};

/** Repair degenerate or missing fields rather than failing on them. */
export function withDefaults(config: Partial<ChunkConfig> = {}): ChunkConfig {
	const out: ChunkConfig = {
		parentTokens: config.parentTokens && config.parentTokens > 0 ? config.parentTokens : DEFAULT_CHUNK_CONFIG.parentTokens,
		childTokens: config.childTokens && config.childTokens > 0 ? config.childTokens : DEFAULT_CHUNK_CONFIG.childTokens,
		childOverlap:
			config.childOverlap !== undefined && config.childOverlap >= 0
				? config.childOverlap
				: DEFAULT_CHUNK_CONFIG.childOverlap,
		charsPerToken:
			config.charsPerToken && config.charsPerToken > 0 ? config.charsPerToken : DEFAULT_CHUNK_CONFIG.charsPerToken,
	};
	// A child larger than its parent has nothing to expand into.
	if (out.childTokens > out.parentTokens) out.childTokens = out.parentTokens;
	// Overlap at or above the window size never advances the cursor.
	if (out.childOverlap >= out.childTokens) out.childOverlap = Math.floor(out.childTokens / 2);
	return out;
}

/**
 * How far past the target size a split may look for a clean boundary.
 *
 * Generous enough to find the end of a long paragraph, tight enough that a
 * document with no boundaries at all still splits near the target.
 */
export const SEARCH_WINDOW = 200;

/** One span of the source, kept with its offset so a caller can locate it. */
export interface Segment {
	/** Offset into the source, in code points. */
	start: number;
	text: string;
}

/**
 * Cut text into spans of roughly `targetChars`, preferring a paragraph break
 * and falling back to a sentence end.
 *
 * Splitting mid-sentence is what makes a retrieved passage read as broken, and
 * a passage that reads as broken gets distrusted whether or not it is correct.
 *
 * Offsets are in code points rather than bytes: the window sizes mean
 * characters, and byte arithmetic would both cut multi-byte scripts into
 * invalid fragments and size their chunks several times too small.
 */
export function splitAtBoundary(runes: readonly string[], targetChars: number): Segment[] {
	const target = targetChars > 0 ? targetChars : 1;
	if (runes.length <= target) {
		const text = runes.join("").trim();
		return text ? [{ start: 0, text }] : [];
	}

	const out: Segment[] = [];
	let start = 0;
	while (start < runes.length) {
		let end = start + target;
		if (end < runes.length) {
			// A paragraph break is the best cut available: it is where the
			// author already decided one thought ended.
			const half = start + Math.floor(target / 2);
			const paragraph = lastIndexOfRunes(runes, "\n\n", half, Math.min(end + SEARCH_WINDOW, runes.length));
			if (paragraph > start) {
				end = paragraph;
			} else {
				const sentence = lastSentenceEnd(runes, half, Math.min(end + SEARCH_WINDOW / 2, runes.length));
				if (sentence.index > start) end = sentence.index + sentence.separator.length;
			}
		}
		if (end > runes.length) end = runes.length;

		const text = runes.slice(start, end).join("").trim();
		if (text) out.push({ start, text });
		// The guard matters: without it a degenerate boundary search that
		// returns the current position spins forever on one document.
		start = Math.max(start + 1, end);
	}
	return out;
}

/** One child with the parent it belongs to. */
export interface Pair {
	parentIndex: number;
	parentText: string;
	parentStart: number;
	childText: string;
	/** The child's offset in the whole document, for heading attribution. */
	childStart: number;
}

/**
 * Split text into parents, then each parent into overlapping children.
 *
 * The loop's exit condition is the load-bearing part. Stepping back by the
 * overlap on the final window steps back to *before* the cursor, so the
 * advance guard moves by a single character and the loop emits one
 * near-duplicate child per remaining character — on a 2,400-character parent
 * that is eighty extra chunks, each costing an embedding call and each
 * crowding the real passages out of fusion with copies of one sentence.
 * Breaking when a window reaches the end of the parent is what prevents it.
 */
export function chunkParentChild(text: string, config: Partial<ChunkConfig> = {}): Pair[] {
	const cfg = withDefaults(config);
	const parentChars = cfg.parentTokens * cfg.charsPerToken;
	const childChars = cfg.childTokens * cfg.charsPerToken;
	const overlapChars = cfg.childOverlap * cfg.charsPerToken;

	const runes = [...text];
	const parents = splitAtBoundary(runes, parentChars);
	const pairs: Pair[] = [];

	for (let parentIndex = 0; parentIndex < parents.length; parentIndex++) {
		const parent = parents[parentIndex] as Segment;
		const pr = [...parent.text];

		// A parent already small enough to embed well is its own child. The
		// alternative — an empty parent, or a child duplicating a fragment of
		// it — buys nothing and costs a wasted vector.
		if (pr.length <= childChars) {
			pairs.push({
				parentIndex,
				parentText: parent.text,
				parentStart: parent.start,
				childText: parent.text,
				childStart: parent.start,
			});
			continue;
		}

		for (let cs = 0; cs < pr.length; ) {
			let ce = cs + childChars;
			if (ce < pr.length) {
				const sentence = lastSentenceEnd(pr, cs + Math.floor(childChars / 2), Math.min(ce + 80, pr.length));
				if (sentence.index > cs) ce = sentence.index + sentence.separator.length;
			}
			if (ce >= pr.length) ce = pr.length;

			const childText = pr.slice(cs, ce).join("").trim();
			if (childText) {
				pairs.push({
					parentIndex,
					parentText: parent.text,
					parentStart: parent.start,
					childText,
					childStart: parent.start + cs,
				});
			}
			// The tail is covered once a window reaches the end of the parent.
			if (ce === pr.length) break;
			cs = Math.max(cs + 1, ce - overlapChars);
		}
	}
	return pairs;
}

/**
 * A document's markdown headings, indexed by offset, so a chunk can be told
 * which section it came from — which gives an isolated passage its subject
 * back, both for embedding quality and for telling a reader where a quote
 * came from.
 */
export class Headings {
	private readonly offsets: number[] = [];
	private readonly titles: string[] = [];

	constructor(runes: readonly string[]) {
		let fenced = false;
		let i = 0;
		while (i < runes.length) {
			const { line, next } = lineAt(runes, i);
			const trimmed = line.trim();
			// A '#' inside a code fence is a comment, not a heading.
			if (trimmed.startsWith("```")) {
				fenced = !fenced;
			} else if (!fenced && line.startsWith("#")) {
				const title = line.replace(/^#+/, "").trim();
				if (title) {
					this.offsets.push(i);
					this.titles.push(title);
				}
			}
			i = next;
		}
	}

	/** The nearest heading at or before `offset`, or "". */
	at(offset: number): string {
		let best = "";
		for (let i = 0; i < this.offsets.length; i++) {
			if ((this.offsets[i] as number) > offset) break;
			best = this.titles[i] as string;
		}
		return best;
	}

	get count(): number {
		return this.titles.length;
	}
}

/**
 * A period followed by a space or newline is the only reliable sentence
 * boundary in plain text. "Dr. Smith" is the price of not shipping a sentence
 * tokeniser, and it costs a slightly early cut, not a wrong one.
 */
const SENTENCE_ENDS = [". ", ".\n", "? ", "! "];

function lastSentenceEnd(
	runes: readonly string[],
	from: number,
	to: number,
): { index: number; separator: string } {
	let best = -1;
	let separator = "";
	for (const candidate of SENTENCE_ENDS) {
		const found = lastIndexOfRunes(runes, candidate, from, to);
		if (found > best) {
			best = found;
			separator = candidate;
		}
	}
	return { index: best, separator };
}

/** The highest index at which `needle` occurs entirely within `[from, to)`. */
function lastIndexOfRunes(runes: readonly string[], needle: string, from: number, to: number): number {
	const chars = [...needle];
	if (chars.length === 0 || from < 0) return -1;
	const end = Math.min(to, runes.length);
	for (let i = end - chars.length; i >= from; i--) {
		let match = true;
		for (let j = 0; j < chars.length; j++) {
			if (runes[i + j] !== chars[j]) {
				match = false;
				break;
			}
		}
		if (match) return i;
	}
	return -1;
}

function lineAt(runes: readonly string[], i: number): { line: string; next: number } {
	let j = i;
	while (j < runes.length && runes[j] !== "\n") j++;
	return { line: runes.slice(i, j).join(""), next: j + 1 };
}
