import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileMap, SymbolRecord } from "./types.ts";

/**
 * The index's third job. When a generated document quotes code, phase 4 needs to
 * know which lines actually back the quote — and, just as importantly, when
 * nothing does.
 *
 * Resolution is textual and exact by design. A fuzzy match here would let a
 * quote that the model paraphrased pass as verbatim, which is the failure this
 * pass exists to catch.
 */

export interface Anchor {
	path: string;
	startLine: number;
	endLine: number;
	/** The declaration the anchor falls inside, when it falls inside one. */
	symbol?: string;
}

export interface AnchorResolution {
	resolved: boolean;
	anchor?: Anchor;
	/** Why resolution failed. Reported to the author of the document, not swallowed. */
	reason?: "file_not_indexed" | "excerpt_not_found" | "excerpt_ambiguous" | "empty_excerpt";
	/** Number of distinct places the excerpt matched, when more than one. */
	matchCount?: number;
}

export interface ResolveExcerptOptions {
	/** If the excerpt is ambiguous across the file, restrict search to this symbol's AST node boundaries. */
	contextSymbol?: string;
	/** Expected line number hint for disambiguating duplicate occurrences. */
	expectedLine?: number;
}

/**
 * Locate an excerpt in a file's source. `source` is the current content of
 * `file.path` — the caller supplies it so this stays a pure function and the
 * index artifact never has to carry file bodies.
 */
export function resolveExcerpt(
	file: FileMap | null,
	source: string,
	excerpt: string,
	options?: ResolveExcerptOptions,
): AnchorResolution {
	if (!file) return { resolved: false, reason: "file_not_indexed" };

	const needleLines = normaliseLines(excerpt);
	if (needleLines.length === 0) return { resolved: false, reason: "empty_excerpt" };

	const hayLines = source.split(/\r?\n/);
	const normalisedHay = hayLines.map(normaliseLine);

	let matches: number[] = [];
	for (let start = 0; start + needleLines.length <= normalisedHay.length; start++) {
		let ok = true;
		for (let offset = 0; offset < needleLines.length; offset++) {
			if (normalisedHay[start + offset] !== needleLines[offset]) {
				ok = false;
				break;
			}
		}
		if (ok) matches.push(start);
	}

	if (matches.length === 0) return { resolved: false, reason: "excerpt_not_found" };

	// Disambiguate multi-occurrence matches using surrounding AST node boundaries
	if (matches.length > 1 && options?.contextSymbol) {
		const scoped = matches.filter((startIdx) => {
			const start = startIdx + 1;
			const end = start + needleLines.length - 1;
			const sym = enclosingSymbol(file, start, end);
			return sym?.name === options.contextSymbol;
		});
		if (scoped.length > 0) {
			matches = scoped;
		}
	}

	if (matches.length > 1 && options?.expectedLine !== undefined) {
		const targetLine = options.expectedLine;
		matches.sort((a, b) => {
			const diffA = Math.abs(a + 1 - targetLine);
			const diffB = Math.abs(b + 1 - targetLine);
			return diffA - diffB;
		});
		const closest = matches[0]!;
		const second = matches[1];
		const diffClosest = Math.abs(closest + 1 - targetLine);
		const diffSecond = second !== undefined ? Math.abs(second + 1 - targetLine) : Infinity;
		if (diffClosest < diffSecond) {
			matches = [closest];
		}
	}

	if (matches.length > 1) {
		return { resolved: false, reason: "excerpt_ambiguous", matchCount: matches.length };
	}

	const start = (matches[0] as number) + 1;
	const end = start + needleLines.length - 1;
	const symbol = enclosingSymbol(file, start, end);

	return {
		resolved: true,
		anchor: {
			path: file.path,
			startLine: start,
			endLine: end,
			...(symbol ? { symbol: symbol.name } : {}),
		},
	};
}

/**
 * Check a claimed line range against the index. Used when a document cites
 * `file.ts:40-52` rather than quoting.
 */
export function resolveRange(
	file: FileMap | null,
	startLine: number,
	endLine: number,
): AnchorResolution {
	if (!file) return { resolved: false, reason: "file_not_indexed" };
	if (startLine < 1 || endLine < startLine || endLine > file.lineCount) {
		return { resolved: false, reason: "excerpt_not_found" };
	}
	const symbol = enclosingSymbol(file, startLine, endLine);
	return {
		resolved: true,
		anchor: {
			path: file.path,
			startLine,
			endLine,
			...(symbol ? { symbol: symbol.name } : {}),
		},
	};
}

/** The innermost declaration containing the range, when one contains it. */
export function enclosingSymbol(
	file: FileMap,
	startLine: number,
	endLine: number,
): SymbolRecord | null {
	let best: SymbolRecord | null = null;
	for (const symbol of file.symbols) {
		if (symbol.startLine <= startLine && symbol.endLine >= endLine) {
			if (!best || symbol.endLine - symbol.startLine < best.endLine - best.startLine) {
				best = symbol;
			}
		}
	}
	return best;
}

/**
 * Indentation and trailing whitespace are presentation, and a document that
 * re-indents a quote to fit its prose has not misquoted it. Everything else must
 * match exactly.
 */
function normaliseLine(line: string): string {
	return line.trim();
}

function normaliseLines(excerpt: string): string[] {
	const lines = excerpt.split(/\r?\n/).map(normaliseLine);
	while (lines.length > 0 && lines[0] === "") lines.shift();
	while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
	return lines;
}

/**
 * Read exact line ranges for grounded code quoting.
 * Returns the exact slice of lines from `startLine` to `endLine` (1-indexed inclusive).
 */
export async function readExcerpt(
	root: string,
	relPath: string,
	startLine: number,
	endLine: number,
): Promise<string> {
	const fullPath = join(root, relPath);
	let content: string;
	try {
		content = await readFile(fullPath, "utf8");
	} catch {
		return `FILE NOT FOUND: "${relPath}" does not exist in repository.`;
	}
	const lines = content.split(/\r?\n/);
	if (lines.length === 0) return "";
	const s = Math.max(1, Math.min(startLine, lines.length));
	const e = Math.max(s, Math.min(endLine, lines.length));
	return lines.slice(s - 1, e).join("\n");
}

