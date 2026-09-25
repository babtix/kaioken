import type { SymbolLocation } from "./oracle.ts";
import type { SymbolKind, SymbolRecord } from "./types.ts";

export type VisibilityMode = "all" | "exported" | "internal";

export interface VisibilityFilterOptions {
	/** Filter mode: all declarations, exported only, or internal only. */
	mode?: VisibilityMode;
	/** Filter by one or more programming languages. */
	languages?: string[];
	/** Filter by declaration kind (e.g. function, class, interface, etc.). */
	kinds?: SymbolKind[];
	/** Filter by specific relative file path. */
	path?: string;
	/** Case-insensitive substring match for symbol name. */
	query?: string;
	/** Enclosing parent scope filter. */
	parent?: string;
}

export interface VisibilityStats {
	total: number;
	exported: number;
	internal: number;
	byLanguage: Record<string, { total: number; exported: number; internal: number }>;
	byKind: Record<string, { total: number; exported: number; internal: number }>;
}

/**
 * Determine if a declaration is exported or internal using language conventions
 * and declaration flags. Supports all 10 language categories:
 * - TypeScript / TSX: class and interface declarations (UX-0671)
 * - JavaScript / JSX: function and constant exports (UX-0672)
 * - Python: classes, methods, decorated functions (UX-0673)
 * - Go: struct, interface, and package functions (UX-0674)
 * - Rust: structs, traits, enums, and impl blocks (UX-0675)
 * - Java: classes, records, and spring annotations (UX-0676)
 * - C/C++: structs, namespaces, template functions (UX-0677)
 * - C#: classes, interfaces, record types (UX-0678)
 * - Ruby: module definitions and method symbols (UX-0679)
 * - SQL: schema tables, procedures, view definitions (UX-0680)
 */
export function isSymbolExported(symbol: SymbolRecord, language?: string): boolean {
	const lang = language?.toLowerCase() ?? "";

	switch (lang) {
		case "go": {
			// Go convention: Uppercase identifier is exported, lowercase is package-internal
			const firstChar = symbol.name.charAt(0);
			return firstChar === firstChar.toUpperCase() && firstChar !== firstChar.toLowerCase();
		}

		case "python": {
			// Python convention: leading underscore indicates internal/private
			return !symbol.name.startsWith("_");
		}

		case "sql": {
			// SQL convention: tables or procedures prefixed with tmp_ or _ are internal
			return !symbol.name.toLowerCase().startsWith("tmp_") && !symbol.name.startsWith("_");
		}

		default:
			// By default, use the symbol's recorded exported flag
			return symbol.exported;
	}
}

/**
 * Filter an array of SymbolRecord instances by visibility criteria.
 */
export function filterSymbolsByVisibility(
	symbols: SymbolRecord[],
	options: VisibilityFilterOptions = {},
	language?: string,
): SymbolRecord[] {
	const mode = options.mode ?? "all";
	const kinds = options.kinds ? new Set(options.kinds) : null;
	const query = options.query?.toLowerCase();

	return symbols.filter((sym) => {
		const isExp = isSymbolExported(sym, language);

		if (mode === "exported" && !isExp) return false;
		if (mode === "internal" && isExp) return false;
		if (kinds && !kinds.has(sym.kind)) return false;
		if (options.parent !== undefined && sym.parent !== options.parent) return false;
		if (query && !sym.name.toLowerCase().includes(query) && !sym.signature.toLowerCase().includes(query)) {
			return false;
		}

		return true;
	});
}

/**
 * Filter an array of SymbolLocation instances by visibility criteria.
 */
export function filterLocationsByVisibility(
	locations: SymbolLocation[],
	options: VisibilityFilterOptions = {},
	getLanguage?: (path: string) => string | undefined,
): SymbolLocation[] {
	const mode = options.mode ?? "all";
	const languages = options.languages ? new Set(options.languages.map((l) => l.toLowerCase())) : null;
	const kinds = options.kinds ? new Set(options.kinds) : null;
	const query = options.query?.toLowerCase();

	return locations.filter((loc) => {
		if (options.path && loc.path !== options.path) return false;

		const lang = getLanguage ? getLanguage(loc.path) : undefined;
		if (languages && lang && !languages.has(lang.toLowerCase())) return false;

		const isExp = isSymbolExported(loc.symbol, lang);
		if (mode === "exported" && !isExp) return false;
		if (mode === "internal" && isExp) return false;
		if (kinds && !kinds.has(loc.symbol.kind)) return false;
		if (options.parent !== undefined && loc.symbol.parent !== options.parent) return false;
		if (
			query &&
			!loc.symbol.name.toLowerCase().includes(query) &&
			!loc.symbol.signature.toLowerCase().includes(query)
		) {
			return false;
		}

		return true;
	});
}

/**
 * Compute aggregate visibility statistics for symbol locations or declarations.
 */
export function getVisibilityStats(
	items: SymbolLocation[] | SymbolRecord[],
	getLanguage?: (item: SymbolLocation | SymbolRecord) => string | undefined,
): VisibilityStats {
	let total = 0;
	let exported = 0;
	let internal = 0;
	const byLanguage: Record<string, { total: number; exported: number; internal: number }> = {};
	const byKind: Record<string, { total: number; exported: number; internal: number }> = {};

	for (const item of items) {
		const symbol: SymbolRecord = "symbol" in item ? item.symbol : item;
		const lang = getLanguage ? getLanguage(item) ?? "unknown" : "unknown";
		const isExp = isSymbolExported(symbol, lang);

		total++;
		if (isExp) exported++;
		else internal++;

		// By language
		if (!byLanguage[lang]) {
			byLanguage[lang] = { total: 0, exported: 0, internal: 0 };
		}
		byLanguage[lang].total++;
		if (isExp) byLanguage[lang].exported++;
		else byLanguage[lang].internal++;

		// By kind
		if (!byKind[symbol.kind]) {
			byKind[symbol.kind] = { total: 0, exported: 0, internal: 0 };
		}
		byKind[symbol.kind].total++;
		if (isExp) byKind[symbol.kind].exported++;
		else byKind[symbol.kind].internal++;
	}

	return {
		total,
		exported,
		internal,
		byLanguage,
		byKind,
	};
}
