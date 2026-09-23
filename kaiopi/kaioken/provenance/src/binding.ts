import { createHash } from "node:crypto";
import type { NormalizationOptions } from "./types.ts";

/**
 * Normalize source code text by removing comments, docstrings, or collapsing whitespace.
 *
 * This provides tolerance against false-alarm staleness invalidations when someone
 * merely edits comments, fixes typos in docstrings, or adjusts cosmetic whitespace.
 */
export function normalizeSource(text: string, options?: NormalizationOptions): string {
	if (!options) return text;
	let result = text.replace(/\r\n/g, "\n");

	if (options.ignoreDocstrings) {
		// Strip Python triple-quoted docstrings ("""...""" and '''...''')
		result = result.replace(/"""[\s\S]*?"""/g, "");
		result = result.replace(/'''[\s\S]*?'''/g, "");
	}

	if (options.ignoreComments) {
		// Strip multi-line comments /* ... */
		result = result.replace(/\/\*[\s\S]*?\*\//g, "");

		// Strip single-line comments // and #, while being careful not to strip inside quotes
		const lines = result.split("\n");
		const strippedLines = lines.map((line) => {
			let inSingleQuote = false;
			let inDoubleQuote = false;
			let inBacktick = false;

			for (let i = 0; i < line.length; i++) {
				const char = line[i];
				const prev = i > 0 ? line[i - 1] : "";

				if (char === "'" && prev !== "\\" && !inDoubleQuote && !inBacktick) {
					inSingleQuote = !inSingleQuote;
				} else if (char === '"' && prev !== "\\" && !inSingleQuote && !inBacktick) {
					inDoubleQuote = !inDoubleQuote;
				} else if (char === "`" && prev !== "\\" && !inSingleQuote && !inDoubleQuote) {
					inBacktick = !inBacktick;
				} else if (!inSingleQuote && !inDoubleQuote && !inBacktick) {
					// Check for // comment
					if (char === "/" && line[i + 1] === "/") {
						return line.slice(0, i);
					}
					// Check for # comment (Python, Bash, YAML)
					if (char === "#") {
						return line.slice(0, i);
					}
				}
			}
			return line;
		});
		result = strippedLines.join("\n");
	}

	if (options.ignoreWhitespace) {
		// Collapse horizontal whitespace to single space, trim lines, remove blank lines
		result = result
			.split("\n")
			.map((line) => line.replace(/[ \t]+/g, " ").trim())
			.filter((line) => line.length > 0)
			.join("\n");
	}

	return result;
}

/**
 * Compute SHA-256 hash for a specific line range or full content,
 * optionally with tolerance normalization.
 */
export function computeRangeHash(
	content: string,
	startLine?: number,
	endLine?: number,
	options?: NormalizationOptions,
): string {
	let targetText = content;
	if (startLine !== undefined && endLine !== undefined) {
		const lines = content.replace(/\r\n/g, "\n").split("\n");
		const start = Math.max(0, startLine - 1);
		const end = Math.min(lines.length, endLine);
		targetText = lines.slice(start, end).join("\n");
	}

	const normalized = normalizeSource(targetText, options);
	return createHash("sha256").update(normalized, "utf8").digest("hex");
}

export interface SymbolSpan {
	name: string;
	startLine: number;
	endLine: number;
}

/**
 * Compute range hashes for an array of symbols in a source file.
 */
export function computeSymbolHashes(
	content: string,
	symbols: readonly SymbolSpan[],
	options?: NormalizationOptions,
): Map<string, string> {
	const out = new Map<string, string>();
	for (const sym of symbols) {
		const hash = computeRangeHash(content, sym.startLine, sym.endLine, options);
		out.set(sym.name, hash);
	}
	return out;
}

/**
 * Determine if a symbol's content has drifted from its recorded hash,
 * taking normalization options into account.
 */
export function hasSymbolDrifted(
	oldRangeHash: string,
	currentContent: string,
	startLine: number,
	endLine: number,
	options?: NormalizationOptions,
): boolean {
	const currentHash = computeRangeHash(currentContent, startLine, endLine, options);
	return currentHash !== oldRangeHash;
}
