import {
	type FuzzyLookupOptions,
	ReExportEngine,
	type ReExportResolution,
} from "./reexport.ts";
import type { FileMap, IndexResult, SymbolRecord } from "./types.ts";
import {
	type LinkerOptions,
	type SymbolDependencyGraph,
	type SymbolGraphNode,
	linkSymbolDependencyGraph,
} from "./graph_linker.ts";
import {
	type VisibilityFilterOptions,
	type VisibilityStats,
	filterLocationsByVisibility,
	getVisibilityStats,
} from "./visibility.ts";

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
	private readonly rawIndex: IndexResult;
	private readonly byName = new Map<string, SymbolLocation[]>();
	private readonly byPath = new Map<string, FileMap>();
	private readonly reexportEngine: ReExportEngine;

	constructor(index: IndexResult) {
		this.rawIndex = index;
		this.reexportEngine = new ReExportEngine(index.files);

		for (const file of index.files) {
			this.byPath.set(file.path, file);
			for (const symbol of file.symbols) {
				const list = this.byName.get(symbol.name);
				const location: SymbolLocation = { path: file.path, symbol };
				if (list) list.push(location);
				else this.byName.set(symbol.name, [location]);
			}
		}

		// Register re-exported names so has(name) and lookup(name) connect re-exports
		for (const file of index.files) {
			if (!file.reexports) continue;
			for (const re of file.reexports) {
				if (re.name === "*") {
					const targetPath = this.resolvePath(file.path, re.from);
					const targetFile = targetPath ? this.byPath.get(targetPath) : null;
					if (targetFile) {
						for (const sym of targetFile.symbols) {
							if (sym.exported) {
								const list = this.byName.get(sym.name);
								const location: SymbolLocation = { path: targetFile.path, symbol: sym };
								if (list) {
									if (!list.some((l) => l.path === location.path && l.symbol.name === sym.name)) {
										list.push(location);
									}
								} else {
									this.byName.set(sym.name, [location]);
								}
							}
						}
					}
				} else {
					const resolved = this.resolve(file.path, re.name);
					if (resolved) {
						const list = this.byName.get(re.name);
						const location: SymbolLocation = { path: resolved.path, symbol: resolved.symbol };
						if (list) {
							if (!list.some((l) => l.path === location.path && l.symbol.name === resolved.symbol.name)) {
								list.push(location);
							}
						} else {
							this.byName.set(re.name, [location]);
						}
					}
				}
			}
		}
	}

	/** Definitive: the repository either declares or re-exports this name or it does not. */
	has(name: string): boolean {
		return this.byName.has(name);
	}

	/** Every declaration of a name. More than one is normal and not an error. */
	lookup(name: string): SymbolLocation[] {
		return this.byName.get(name) ?? [];
	}

	/** Scoped lookup, resolving local declarations or re-exports. */
	lookupIn(path: string, name: string): SymbolRecord | null {
		const loc = this.resolve(path, name);
		return loc ? loc.symbol : null;
	}

	/** Resolve a symbol name from a given file to its originating declaration location. */
	resolve(path: string, name: string): SymbolLocation | null {
		return this.reexportEngine.resolve(path, name);
	}

	/** Resolve complete re-export chain tracing provenance across files. */
	resolveChain(path: string, name: string): ReExportResolution | null {
		return this.reexportEngine.resolveChain(path, name);
	}

	/** Perform partial and fuzzy symbol matching across declarations. */
	findFuzzy(query: string, options?: FuzzyLookupOptions): SymbolLocation[] {
		return this.reexportEngine.findFuzzy(query, options);
	}

	/** Retrieve full re-export graph mapping files to their re-export records. */
	getReExportGraph(): Map<string, FileMap["reexports"]> {
		return this.reexportEngine.getReExportGraph();
	}

	resolvePath(fromPath: string, specifier: string): string | null {
		return this.reexportEngine.resolvePath(fromPath, specifier);
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
		const files = path
			? [this.byPath.get(path)].filter((f): f is FileMap => f !== undefined)
			: [...this.byPath.values()];
		for (const file of files) {
			for (const symbol of file.symbols) {
				if (symbol.exported) out.push({ path: file.path, symbol });
			}
			if (file.reexports) {
				for (const re of file.reexports) {
					if (re.name === "*") {
						const targetPath = this.resolvePath(file.path, re.from);
						const targetFile = targetPath ? this.byPath.get(targetPath) : null;
						if (targetFile) {
							for (const sym of targetFile.symbols) {
								if (
									sym.exported &&
									!out.some((o) => o.path === targetFile.path && o.symbol.name === sym.name)
								) {
									out.push({ path: targetFile.path, symbol: sym });
								}
							}
						}
					} else {
						const resolved = this.resolve(file.path, re.name);
						if (
							resolved &&
							!out.some((o) => o.path === resolved.path && o.symbol.name === resolved.symbol.name)
						) {
							out.push(resolved);
						}
					}
				}
			}
		}
		return out;
	}

	get symbolCount(): number {
		let total = 0;
		for (const file of this.byPath.values()) total += file.symbols.length;
		return total;
	}

	private depGraph?: SymbolDependencyGraph;

	/**
	 * Retrieve or initialize the structural symbol dependency graph (UX-0691 to UX-0700).
	 */
	getDependencyGraph(options?: LinkerOptions): SymbolDependencyGraph {
		if (!this.depGraph) {
			this.depGraph = linkSymbolDependencyGraph(this.rawIndex, options);
		}
		return this.depGraph;
	}

	getDependencies(symbolName: string, path?: string): SymbolGraphNode[] {
		return this.getDependencyGraph().getDependencies(symbolName, path);
	}

	getDependents(symbolName: string, path?: string): SymbolGraphNode[] {
		return this.getDependencyGraph().getDependents(symbolName, path);
	}

	getTypeHierarchy(symbolName: string): { parents: SymbolGraphNode[]; children: SymbolGraphNode[] } {
		return this.getDependencyGraph().getTypeHierarchy(symbolName);
	}

	/**
	 * Query symbols using visibility and language filters (UX-0671 to UX-0680).
	 */
	querySymbols(options: VisibilityFilterOptions = {}): SymbolLocation[] {
		const allLocs: SymbolLocation[] = [];
		for (const [path, file] of this.byPath.entries()) {
			for (const symbol of file.symbols) {
				allLocs.push({ path, symbol });
			}
		}

		return filterLocationsByVisibility(
			allLocs,
			options,
			(p) => this.byPath.get(p)?.language,
		);
	}

	getInternalSymbols(path?: string, language?: string): SymbolLocation[] {
		return this.querySymbols({
			mode: "internal",
			path,
			languages: language ? [language] : undefined,
		});
	}

	getExportedSymbols(path?: string, language?: string): SymbolLocation[] {
		return this.querySymbols({
			mode: "exported",
			path,
			languages: language ? [language] : undefined,
		});
	}

	getVisibilitySummary(): VisibilityStats {
		const allLocs: SymbolLocation[] = [];
		for (const [path, file] of this.byPath.entries()) {
			for (const symbol of file.symbols) {
				allLocs.push({ path, symbol });
			}
		}

		return getVisibilityStats(
			allLocs,
			(item) => {
				const loc = item as SymbolLocation;
				return this.byPath.get(loc.path)?.language;
			},
		);
	}
}

