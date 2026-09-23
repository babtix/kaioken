import type { FileMap, ReExportRecord, SymbolRecord } from "./types.ts";
import type { SymbolLocation } from "./oracle.ts";

export interface ReExportHop {
	fromPath: string;
	exportName: string;
	importedName?: string;
	toPath: string;
}

export interface ReExportResolution {
	found: boolean;
	declaration?: SymbolLocation;
	chain: ReExportHop[];
	cyclic: boolean;
	depth: number;
}

export interface FuzzyLookupOptions {
	maxResults?: number;
	threshold?: number;
	includeInternal?: boolean;
}

const MAX_RESOLUTION_DEPTH = 32;

export class ReExportEngine {
	private readonly filesByPath = new Map<string, FileMap>();
	private readonly reexportsByPath = new Map<string, ReExportRecord[]>();

	constructor(files: FileMap[]) {
		for (const file of files) {
			this.filesByPath.set(file.path, file);
			if (file.reexports && file.reexports.length > 0) {
				this.reexportsByPath.set(file.path, file.reexports);
			}
		}
	}

	resolvePath(fromPath: string, specifier: string): string | null {
		if (this.filesByPath.has(specifier)) return specifier;

		const dir = fromPath.includes("/")
			? fromPath.slice(0, fromPath.lastIndexOf("/"))
			: "";
		const raw = dir ? `${dir}/${specifier}` : specifier;

		const parts: string[] = [];
		for (const seg of raw.split("/")) {
			if (seg === "" || seg === ".") continue;
			if (seg === "..") parts.pop();
			else parts.push(seg);
		}
		const base = parts.join("/");

		const candidates = [
			base,
			`${base}.ts`,
			`${base}.tsx`,
			`${base}.js`,
			`${base}.jsx`,
			`${base}.py`,
			`${base}.go`,
			`${base}.rs`,
			`${base}/index.ts`,
			`${base}/index.tsx`,
			`${base}/index.js`,
			`${base}/index.jsx`,
			`${base}/__init__.py`,
		];

		for (const c of candidates) {
			if (this.filesByPath.has(c)) return c;
		}

		return null;
	}

	resolveChain(startPath: string, symbolName: string): ReExportResolution {
		const visited = new Set<string>();
		const chain: ReExportHop[] = [];

		return this.resolveChainInternal(startPath, symbolName, visited, chain, 0);
	}

	private resolveChainInternal(
		currentPath: string,
		symbolName: string,
		visited: Set<string>,
		chain: ReExportHop[],
		depth: number,
	): ReExportResolution {
		if (depth > MAX_RESOLUTION_DEPTH) {
			return {
				found: false,
				chain,
				cyclic: true,
				depth,
			};
		}

		const visitKey = `${currentPath}:${symbolName}`;
		if (visited.has(visitKey)) {
			return {
				found: false,
				chain,
				cyclic: true,
				depth,
			};
		}
		visited.add(visitKey);

		const file = this.filesByPath.get(currentPath);
		if (!file) {
			return {
				found: false,
				chain,
				cyclic: false,
				depth,
			};
		}

		// 1. Direct declaration match
		const direct = file.symbols.find((s) => s.name === symbolName);
		if (direct) {
			return {
				found: true,
				declaration: { path: file.path, symbol: direct },
				chain,
				cyclic: false,
				depth,
			};
		}

		const reexports = this.reexportsByPath.get(currentPath);
		if (!reexports || reexports.length === 0) {
			return {
				found: false,
				chain,
				cyclic: false,
				depth,
			};
		}

		// 2. Named re-export
		for (const re of reexports) {
			if (re.name === symbolName) {
				const targetPath = this.resolvePath(currentPath, re.from);
				if (!targetPath) continue;

				const targetName = re.importedName && re.importedName !== "*"
					? re.importedName
					: symbolName;

				const hop: ReExportHop = {
					fromPath: currentPath,
					exportName: symbolName,
					importedName: re.importedName,
					toPath: targetPath,
				};

				const result = this.resolveChainInternal(
					targetPath,
					targetName,
					visited,
					[...chain, hop],
					depth + 1,
				);

				if (result.found || result.cyclic) return result;
			}
		}

		// 3. Wildcard re-export
		for (const re of reexports) {
			if (re.name === "*") {
				const targetPath = this.resolvePath(currentPath, re.from);
				if (!targetPath) continue;

				const hop: ReExportHop = {
					fromPath: currentPath,
					exportName: symbolName,
					importedName: "*",
					toPath: targetPath,
				};

				const result = this.resolveChainInternal(
					targetPath,
					symbolName,
					visited,
					[...chain, hop],
					depth + 1,
				);

				if (result.found || result.cyclic) return result;
			}
		}

		return {
			found: false,
			chain,
			cyclic: false,
			depth,
		};
	}

	resolve(path: string, symbolName: string): SymbolLocation | null {
		const res = this.resolveChain(path, symbolName);
		return res.found && res.declaration ? res.declaration : null;
	}

	getReExportGraph(): Map<string, ReExportRecord[]> {
		return new Map(this.reexportsByPath);
	}

	hasReExports(path: string): boolean {
		return this.reexportsByPath.has(path);
	}

	findFuzzy(query: string, options: FuzzyLookupOptions = {}): SymbolLocation[] {
		const q = query.toLowerCase().trim();
		if (!q) return [];

		const maxResults = options.maxResults ?? 20;
		const matches: Array<{ loc: SymbolLocation; score: number }> = [];

		for (const file of this.filesByPath.values()) {
			for (const sym of file.symbols) {
				if (!options.includeInternal && !sym.exported) continue;
				const nameLower = sym.name.toLowerCase();

				let score = 0;
				if (nameLower === q) score = 100;
				else if (nameLower.startsWith(q)) score = 80;
				else if (nameLower.includes(q)) score = 50;
				else {
					let qi = 0;
					for (let i = 0; i < nameLower.length && qi < q.length; i++) {
						if (nameLower[i] === q[qi]) qi++;
					}
					if (qi === q.length) score = 30;
				}

				if (score > 0) {
					matches.push({ loc: { path: file.path, symbol: sym }, score });
				}
			}
		}

		matches.sort((a, b) => b.score - a.score || a.loc.symbol.name.localeCompare(b.loc.symbol.name));
		return matches.slice(0, maxResults).map((m) => m.loc);
	}
}
