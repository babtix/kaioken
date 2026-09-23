export interface FileResolution {
	resolved: boolean;
	exact: boolean;
	resolvedPath?: string;
	candidates: readonly string[];
	isGenericName: boolean;
	fabricatedParent: boolean;
}

export const GENERIC_FILENAMES: ReadonlySet<string> = new Set([
	"index.ts",
	"index.js",
	"index.mjs",
	"index.cjs",
	"index.tsx",
	"index.jsx",
	"types.ts",
	"types.js",
	"types.d.ts",
	"mod.rs",
	"main.go",
	"main.rs",
	"main.py",
	"main.ts",
	"main.js",
	"utils.ts",
	"utils.js",
	"util.ts",
	"util.js",
]);

export class BasenameIndex {
	private readonly exactFiles: ReadonlySet<string>;
	private readonly basenameMap: Map<string, string[]>;
	private readonly directorySet: Set<string>;
	private readonly lowercaseBasenameMap: Map<string, string[]>;

	constructor(knownFiles: ReadonlySet<string> | readonly string[]) {
		const files = knownFiles instanceof Set ? knownFiles : new Set(knownFiles);
		this.exactFiles = files;
		this.basenameMap = new Map();
		this.directorySet = new Set();
		this.lowercaseBasenameMap = new Map();

		for (const file of files) {
			const normalized = file.replace(/\\/g, "/");
			const slash = normalized.lastIndexOf("/");
			const base = slash === -1 ? normalized : normalized.slice(slash + 1);

			let list = this.basenameMap.get(base);
			if (!list) {
				list = [];
				this.basenameMap.set(base, list);
			}
			list.push(normalized);

			const lowerBase = base.toLowerCase();
			let lowerList = this.lowercaseBasenameMap.get(lowerBase);
			if (!lowerList) {
				lowerList = [];
				this.lowercaseBasenameMap.set(lowerBase, lowerList);
			}
			lowerList.push(normalized);

			let dir = slash === -1 ? "" : normalized.slice(0, slash);
			while (dir) {
				this.directorySet.add(dir);
				const prevSlash = dir.lastIndexOf("/");
				dir = prevSlash === -1 ? "" : dir.slice(0, prevSlash);
			}
		}
	}

	hasExact(path: string): boolean {
		const normalized = path.replace(/\\/g, "/");
		return this.exactFiles.has(normalized);
	}

	resolve(mention: string, scopeText?: string): FileResolution {
		const normalized = mention.replace(/\\/g, "/");
		if (this.exactFiles.has(normalized)) {
			return {
				resolved: true,
				exact: true,
				resolvedPath: normalized,
				candidates: [normalized],
				isGenericName: false,
				fabricatedParent: false,
			};
		}

		const slash = normalized.lastIndexOf("/");
		const hasSlash = slash !== -1;
		const base = hasSlash ? normalized.slice(slash + 1) : normalized;
		const isGeneric = GENERIC_FILENAMES.has(base.toLowerCase());
		const parentDir = hasSlash ? normalized.slice(0, slash) : "";

		const fabricatedParent = hasSlash && parentDir.length > 0 && !this.directorySet.has(parentDir);

		const candidates = this.basenameMap.get(base) ?? [];

		if (hasSlash) {
			if (candidates.length > 0) {
				for (const known of candidates) {
					if (known.endsWith(`/${normalized}`)) {
						return {
							resolved: true,
							exact: false,
							resolvedPath: known,
							candidates,
							isGenericName: isGeneric,
							fabricatedParent: false,
						};
					}
				}
			}
		} else {
			if (candidates.length > 0 && !isGeneric) {
				return {
					resolved: true,
					exact: false,
					resolvedPath: candidates[0],
					candidates,
					isGenericName: false,
					fabricatedParent: false,
				};
			}
		}

		if (!isGeneric && scopeText) {
			if (hasSlash && scopeText.includes(normalized)) {
				return {
					resolved: true,
					exact: false,
					resolvedPath: candidates[0],
					candidates,
					isGenericName: false,
					fabricatedParent,
				};
			}
			if (!hasSlash && scopeText.includes(base)) {
				return {
					resolved: true,
					exact: false,
					resolvedPath: candidates[0],
					candidates,
					isGenericName: false,
					fabricatedParent,
				};
			}
		}

		return {
			resolved: false,
			exact: false,
			candidates,
			isGenericName: isGeneric,
			fabricatedParent,
		};
	}

	findClosestFiles(target: string, maxResults = 3): string[] {
		const normalized = target.replace(/\\/g, "/");
		const slash = normalized.lastIndexOf("/");
		const base = (slash === -1 ? normalized : normalized.slice(slash + 1)).toLowerCase();

		const lowerMatches = this.lowercaseBasenameMap.get(base);
		if (lowerMatches && lowerMatches.length > 0) {
			return lowerMatches.slice(0, maxResults);
		}

		const scored: Array<{ path: string; distance: number }> = [];
		for (const path of this.exactFiles) {
			const pBase = (path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path).toLowerCase();
			const dist = levenshtein(base, pBase);
			scored.push({ path, distance: dist });
		}

		scored.sort((a, b) => a.distance - b.distance);
		return scored.slice(0, maxResults).map((s) => s.path);
	}
}

function levenshtein(a: string, b: string): number {
	if (a === b) return 0;
	if (a.length === 0) return b.length;
	if (b.length === 0) return a.length;

	const row: number[] = [];
	for (let j = 0; j <= b.length; j++) row[j] = j;

	for (let i = 1; i <= a.length; i++) {
		let prev = i - 1;
		row[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const cur = row[j] as number;
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			row[j] = Math.min(row[j] as number + 1, row[j - 1] as number + 1, prev + cost);
			prev = cur;
		}
	}

	return row[b.length] as number;
}
