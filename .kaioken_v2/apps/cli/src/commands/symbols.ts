import { resolve } from "node:path";
import { SymbolOracle, type SymbolRecord } from "@kaioken/index";
import { ensureIndex } from "../artifacts.js";
import type { Flags } from "../main.js";

/**
 * The grounding oracle, exposed. The point of this command is that it answers
 * definitively: a symbol is declared somewhere, or the repository does not
 * declare it — and the exit code says which, so a script can rely on it.
 */
export async function runSymbols(flags: Flags): Promise<number> {
	const root = resolve(flags.root);
	const target = flags.positional[0];

	if (!target) {
		process.stderr.write("kaioken symbols: expected a file path or a symbol name\n");
		return 1;
	}

	const index = await ensureIndex(root, flags.force);
	const oracle = new SymbolOracle(index);

	const normalised = target.split("\\").join("/");
	const file = oracle.file(normalised);

	if (file) {
		const symbols = flags.exported ? file.symbols.filter((s) => s.exported) : file.symbols;
		if (flags.json) {
			process.stdout.write(`${JSON.stringify({ file: file.path, symbols }, null, 2)}\n`);
			return 0;
		}
		const out: string[] = [`${file.path}  (${file.language}, ${file.lineCount} lines)`];
		if (file.unparsed) {
			out.push("  no grammar bound for this language — no declarations indexed");
		} else if (symbols.length === 0) {
			out.push(flags.exported ? "  no exported declarations" : "  no declarations");
		} else {
			out.push("");
			for (const symbol of symbols) out.push(formatSymbol(symbol));
		}
		process.stdout.write(`${out.join("\n")}\n`);
		return 0;
	}

	const found = oracle.lookup(target);
	const matches = flags.exported ? found.filter((m) => m.symbol.exported) : found;

	if (flags.json) {
		process.stdout.write(
			`${JSON.stringify(
				{
					query: target,
					declared: matches.length > 0,
					matches: matches.map((m) => ({ path: m.path, ...m.symbol })),
				},
				null,
				2,
			)}\n`,
		);
		return matches.length > 0 ? 0 : 2;
	}

	if (matches.length === 0) {
		// Distinguish "no such symbol" from "you meant a file we never indexed".
		if (looksLikePath(target)) {
			process.stdout.write(`not indexed: ${target}\n`);
			process.stdout.write("  the scan did not include this file — check the path and ignore rules\n");
		} else {
			process.stdout.write(`not declared: ${target}\n`);
			process.stdout.write("  this repository declares no symbol by that name\n");
		}
		return 2;
	}

	const out: string[] = [
		`${target} — ${matches.length} declaration${matches.length === 1 ? "" : "s"}`,
		"",
	];
	for (const match of matches) {
		out.push(`${match.path}:${match.symbol.startLine}`);
		out.push(formatSymbol(match.symbol));
		out.push("");
	}
	process.stdout.write(`${out.join("\n").trimEnd()}\n`);
	return 0;
}

function formatSymbol(symbol: SymbolRecord): string {
	const visibility = symbol.exported ? "+" : "-";
	const owner = symbol.parent ? `${symbol.parent}.` : "";
	const lines = [
		`  ${visibility} ${symbol.kind.padEnd(9)} ${owner}${symbol.name}  [${symbol.startLine}-${symbol.endLine}]`,
		`      ${truncate(symbol.signature, 120)}`,
	];
	if (symbol.doc) lines.push(`      ${truncate(firstLine(symbol.doc), 120)}`);
	return lines.join("\n");
}

function firstLine(text: string): string {
	const newline = text.indexOf("\n");
	return newline === -1 ? text : text.slice(0, newline);
}

function truncate(text: string, max: number): string {
	return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function looksLikePath(target: string): boolean {
	return target.includes("/") || target.includes("\\") || target.includes(".");
}
