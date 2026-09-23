import type { FileMap, IndexResult, SymbolRecord } from "./types.js";

/**
 * The index's second job. Phase 4's verifier asks "does this symbol exist?" and
 * needs a definitive answer, not a search result — a maybe is what lets an
 * invented symbol ship.
 *
 * This is a lookup over the same artifact the bundler reads. Forking it into a
 * separate "verification index" would create two things that could disagree.
 */

export interface SymbolLocation {
	path: string;
	symbol: SymbolRecord;
}

export class SymbolOracle {
	private readonly byName = new Map<string, SymbolLocation[]>();
	private readonly byPath = new Map<string, FileMap>();

	constructor(index: IndexResult) {
		for (const file of index.files) {
			this.byPath.set(file.path, file);
			for (const symbol of file.symbols) {
				const list = this.byName.get(symbol.name);
				const location: SymbolLocation = { path: file.path, symbol };
				if (list) list.push(location);
				else this.byName.set(symbol.name, [location]);
			}
		}
	}

	/** Definitive: the repository either declares this name or it does not. */
	has(name: string): boolean {
		return this.byName.has(name);
	}

	/** Every declaration of a name. More than one is normal and not an error. */
	lookup(name: string): SymbolLocation[] {
		return this.byName.get(name) ?? [];
	}

	/** Scoped lookup, for a claim that names both a symbol and its file. */
	lookupIn(path: string, name: string): SymbolRecord | null {
		const file = this.byPath.get(path);
		if (!file) return null;
		return file.symbols.find((s) => s.name === name) ?? null;
	}

	hasFile(path: string): boolean {
		return this.byPath.has(path);
	}

	file(path: string): FileMap | null {
		return this.byPath.get(path) ?? null;
	}

	/**
	 * Names a document claims exist but the repository does not declare. This is
	 * the shape phase 4 reports as defects, so it returns the misses rather than
	 * a boolean over the batch.
	 */
	unknownNames(names: Iterable<string>): string[] {
		const missing: string[] = [];
		for (const name of names) {
			if (!this.byName.has(name)) missing.push(name);
		}
		return missing;
	}

	/**
	 * Every exported declaration, which is what the coverage rubric scores a
	 * generated chapter against.
	 */
	exported(path?: string): SymbolLocation[] {
		const out: SymbolLocation[] = [];
		const files = path ? [this.byPath.get(path)].filter(Boolean) : [...this.byPath.values()];
		for (const file of files as FileMap[]) {
			for (const symbol of file.symbols) {
				if (symbol.exported) out.push({ path: file.path, symbol });
			}
		}
		return out;
	}

	get symbolCount(): number {
		let total = 0;
		for (const file of this.byPath.values()) total += file.symbols.length;
		return total;
	}
}
