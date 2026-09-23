import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SymbolLocation, SymbolOracle } from "./oracle.ts";
import type { SymbolRecord } from "./types.ts";

export interface PreviewSnippetLine {
	lineNumber: number;
	content: string;
	isDeclaration: boolean;
}

export interface SymbolPreviewCard {
	symbol: SymbolRecord;
	path: string;
	language: string;
	signature: string;
	scopeChain: string[];
	doc: string;
	exported: boolean;
	lines: {
		start: number;
		end: number;
	};
	snippet: {
		lines: PreviewSnippetLine[];
		startLine: number;
		endLine: number;
	};
	reexportChain?: string[];
}

export interface PreviewCardOptions {
	contextLines?: number;
	maxLines?: number;
}

export interface RenderCardOptions {
	color?: boolean;
	maxWidth?: number;
	plain?: boolean;
}

/**
 * Build a scope-aware symbol definition preview card.
 */
export async function buildSymbolPreviewCard(
	oracle: SymbolOracle,
	root: string,
	target: string | SymbolLocation,
	options: PreviewCardOptions = {},
): Promise<SymbolPreviewCard | null> {
	let location: SymbolLocation | null = null;
	let reexportChain: string[] | undefined;

	if (typeof target === "string") {
		const locs = oracle.lookup(target);
		if (locs.length === 0) return null;
		location = locs[0]!;

		// Check if it was reached via re-export chain
		if (typeof oracle.resolveChain === "function") {
			const chainRes = oracle.resolveChain(location.path, target);
			if (chainRes && chainRes.chain.length > 0) {
				reexportChain = chainRes.chain.map((h) => `${h.fromPath} → ${h.toPath}`);
			}
		}
	} else {
		location = target;
	}

	if (!location) return null;

	const file = oracle.file(location.path);
	if (!file) return null;

	const symbol = location.symbol;
	const scopeChain = buildScopeChain(file.symbols, symbol);

	// Read surrounding source snippet
	const fullPath = join(root, location.path);
	let fileContent = "";
	try {
		fileContent = await readFile(fullPath, "utf8");
	} catch {
		fileContent = "";
	}

	const allLines = fileContent ? fileContent.split(/\r?\n/) : [];
	const contextLines = options.contextLines ?? 2;
	const maxLines = options.maxLines ?? 30;

	const snippetStart = Math.max(1, symbol.startLine - contextLines);
	const snippetEnd = Math.min(
		allLines.length || symbol.endLine,
		Math.max(symbol.endLine + contextLines, snippetStart + maxLines - 1),
	);

	const snippetLines: PreviewSnippetLine[] = [];
	for (let lineNum = snippetStart; lineNum <= snippetEnd; lineNum++) {
		const content = allLines[lineNum - 1] ?? "";
		const isDeclaration = lineNum >= symbol.startLine && lineNum <= symbol.endLine;
		snippetLines.push({
			lineNumber: lineNum,
			content,
			isDeclaration,
		});
	}

	return {
		symbol,
		path: location.path,
		language: file.language,
		signature: symbol.signature,
		scopeChain,
		doc: symbol.doc,
		exported: symbol.exported,
		lines: {
			start: symbol.startLine,
			end: symbol.endLine,
		},
		snippet: {
			lines: snippetLines,
			startLine: snippetStart,
			endLine: snippetEnd,
		},
		reexportChain,
	};
}

function buildScopeChain(symbols: SymbolRecord[], target: SymbolRecord): string[] {
	const chain: string[] = [target.name];
	let currentParent = target.parent;

	while (currentParent) {
		chain.unshift(currentParent);
		const parentSym = symbols.find((s) => s.name === currentParent);
		currentParent = parentSym ? parentSym.parent : undefined;
	}

	return chain;
}

/**
 * Render preview card as an ANSI formatted terminal card or plain ASCII fallback.
 */
export function renderSymbolPreviewCard(
	card: SymbolPreviewCard,
	options: RenderCardOptions = {},
): string {
	const plain = options.plain ?? false;
	const color = options.color ?? (!plain && typeof process !== "undefined" && !process.env.NO_COLOR);
	const maxWidth = options.maxWidth ?? 78;

	const cBold = (s: string) => (color ? `\x1b[1m${s}\x1b[22m` : s);
	const cCyan = (s: string) => (color ? `\x1b[36m${s}\x1b[39m` : s);
	const cGreen = (s: string) => (color ? `\x1b[32m${s}\x1b[39m` : s);
	const cYellow = (s: string) => (color ? `\x1b[33m${s}\x1b[39m` : s);
	const cGray = (s: string) => (color ? `\x1b[90m${s}\x1b[39m` : s);
	const cBlue = (s: string) => (color ? `\x1b[34m${s}\x1b[39m` : s);

	const bTopLeft = plain ? "+" : "┌";
	const bTopRight = plain ? "+" : "┐";
	const bBottomLeft = plain ? "+" : "└";
	const bBottomRight = plain ? "+" : "┘";
	const bHoriz = plain ? "-" : "─";
	const bVert = plain ? "|" : "│";

	const lines: string[] = [];

	// Header line
	const badgeLang = `[${card.language.toUpperCase()}]`;
	const badgeExport = card.exported ? "[EXPORTED]" : "[INTERNAL]";
	const title = `${badgeLang} ${card.symbol.kind} ${card.symbol.name} (${card.path}:${card.lines.start}-${card.lines.end}) ${badgeExport}`;
	
	const topHeader = `${bTopLeft}${bHoriz} ${cBold(title)} `;
	const remainingDashes = Math.max(2, maxWidth - stripAnsi(title).length - 5);
	lines.push(`${cCyan(bTopLeft + bHoriz)} ${cBold(cCyan(title))} ${cCyan(bHoriz.repeat(remainingDashes) + bTopRight)}`);

	// Scope breadcrumb
	if (card.scopeChain.length > 1) {
		const scopeStr = card.scopeChain.join(" › ");
		lines.push(`${cCyan(bVert)} ${cGray("Scope:")} ${cYellow(scopeStr)}`);
	}

	// Signature
	lines.push(`${cCyan(bVert)} ${cGray("Signature:")} ${cBold(card.signature)}`);

	// Doc comment
	if (card.doc) {
		lines.push(`${cCyan(bVert)} ${cGray("Documentation:")}`);
		for (const docLine of card.doc.split("\n")) {
			lines.push(`${cCyan(bVert)}   ${cGreen(docLine)}`);
		}
	}

	// Re-export chain
	if (card.reexportChain && card.reexportChain.length > 0) {
		lines.push(`${cCyan(bVert)} ${cGray("Re-export chain:")}`);
		for (const hop of card.reexportChain) {
			lines.push(`${cCyan(bVert)}   ${cBlue("↳")} ${cGray(hop)}`);
		}
	}

	// Code snippet divider
	lines.push(`${cCyan(bVert + bHoriz.repeat(maxWidth - 2) + bVert)}`);

	// Code lines with gutter
	const maxLineDigits = String(card.snippet.endLine).length;
	for (const sLine of card.snippet.lines) {
		const lineNumStr = String(sLine.lineNumber).padStart(maxLineDigits, " ");
		const gutter = sLine.isDeclaration
			? `${cBold(cYellow(lineNumStr))} ${cYellow("►")}`
			: `${cGray(lineNumStr)}  `;

		const lineContent = sLine.content;
		const truncated = lineContent.length > maxWidth - maxLineDigits - 8
			? lineContent.slice(0, maxWidth - maxLineDigits - 11) + "..."
			: lineContent;

		const coloredContent = sLine.isDeclaration ? cBold(truncated) : truncated;
		lines.push(`${cCyan(bVert)} ${gutter} ${coloredContent}`);
	}

	// Bottom line
	lines.push(`${cCyan(bBottomLeft + bHoriz.repeat(maxWidth - 2) + bBottomRight)}`);

	return lines.join("\n");
}

/**
 * Plain ASCII renderer without ANSI escapes.
 */
export function renderPlainPreviewCard(card: SymbolPreviewCard): string {
	return renderSymbolPreviewCard(card, { plain: true, color: false });
}

function stripAnsi(str: string): string {
	return str.replace(/\x1b\[[0-9;]*m/g, "");
}
