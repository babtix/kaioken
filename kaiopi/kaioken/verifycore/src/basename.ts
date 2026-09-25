export interface FileResolution {
	resolved: boolean;
	exact: boolean;
	resolvedPath?: string;
	candidates: readonly string[];
	isGenericName: boolean;
	fabricatedParent: boolean;
	missingParent?: string;
}

export interface DomainResolution {
	resolved: boolean;
	exact: boolean;
	matched?: string;
	candidate?: string;
	candidates: readonly string[];
}

export interface BasenameIndexOptions {
	knownFiles?: ReadonlySet<string> | readonly string[];
	metrics?: ReadonlySet<string> | readonly string[];
	configKeys?: ReadonlySet<string> | readonly string[];
	dependencies?: ReadonlySet<string> | readonly string[];
	commits?: ReadonlySet<string> | readonly string[];
	dbEntities?: ReadonlySet<string> | readonly string[];
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

export const DEFAULT_METRICS: ReadonlySet<string> = new Set([
	"< 50ms",
	"50ms",
	"0-allocation",
	"zero-token",
	"o(1)",
	"sub-millisecond",
	"100% offline",
	"< 10ms",
	"10ms",
	"< 1ms",
	"1ms",
	"< 100ms",
	"100ms",
	"p99 < 50ms",
	"0 allocations",
	"p99",
	"zero-allocation",
	"offline",
	"zero-latency",
]);

export const DEFAULT_CONFIG_KEYS: ReadonlySet<string> = new Set([
	"enforcement",
	"minconfidence",
	"enablefuzzyanchor",
	"fuzzythreshold",
	"annotatebody",
	"compileroptions",
	"moduleresolution",
	"workspaces",
	"scripts",
	"dependencies",
	"devdependencies",
	"overrides",
	"type",
	"exports",
	"main",
	"types",
	"private",
	"name",
	"version",
	"engines",
	"target",
	"module",
	"strict",
	"declaration",
	"sourcemap",
	"noemit",
	"include",
	"exclude",
	"extends",
	"verify",
	"scope",
	"check",
]);

export const DEFAULT_DEPENDENCIES: ReadonlySet<string> = new Set([
	"@mario/pi",
	"@earendil-works/pi-tui",
	"vitest",
	"typescript",
	"@kaioken/index",
	"@kaioken/scan",
	"@kaioken/verify",
	"@kaioken/verifycore",
	"@kaioken/plan",
	"@kaioken/wiki",
	"@kaioken/skills",
	"@kaioken/modelport",
	"tree-sitter",
	"tsx",
	"biome",
	"@biomejs/biome",
	"husky",
	"shx",
	"esbuild",
	"@types/node",
]);

export const DEFAULT_COMMITS: ReadonlySet<string> = new Set([
	"a2da6b98",
	"54f5f2c3",
	"08c88325",
	"f9ccb12f",
	"467f0c26",
	"76700ea9",
	"head",
	"head~1",
]);

export const DEFAULT_DB_ENTITIES: ReadonlySet<string> = new Set([
	"checkpoints",
	"sessions",
	"messages",
	"tokens",
	"runs",
	"users",
	"id",
	"created_at",
	"updated_at",
	"session_id",
	"idx_sessions_created_at",
	"idx_checkpoints_session_id",
	"hash",
	"payload",
	"timestamp",
	"metadata",
]);

export class BasenameIndex {
	private readonly exactFiles: ReadonlySet<string>;
	private readonly basenameMap: Map<string, string[]>;
	private readonly directorySet: Set<string>;
	private readonly lowercaseBasenameMap: Map<string, string[]>;

	// O(1) Pre-Indexed registries for UX-1106 through UX-1110
	private readonly metricSet: Set<string>;
	private readonly configKeySet: Set<string>;
	private readonly dependencySet: Set<string>;
	private readonly commitSet: Set<string>;
	private readonly dbEntitySet: Set<string>;

	constructor(
		knownFiles: ReadonlySet<string> | readonly string[] | BasenameIndexOptions = [],
		options?: Omit<BasenameIndexOptions, "knownFiles">,
	) {
		let filesInput: ReadonlySet<string> | readonly string[] = [];
		let opts: BasenameIndexOptions | undefined = options;

		if (knownFiles && (knownFiles instanceof Set || Array.isArray(knownFiles))) {
			filesInput = knownFiles;
		} else if (knownFiles && typeof knownFiles === "object") {
			opts = knownFiles as BasenameIndexOptions;
			filesInput = opts.knownFiles ?? [];
		}

		const files = filesInput instanceof Set ? filesInput : new Set(filesInput);
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

		// Initialize registries with defaults and user additions
		this.metricSet = new Set(DEFAULT_METRICS);
		if (opts?.metrics) {
			for (const m of opts.metrics) this.metricSet.add(m.trim().toLowerCase());
		}

		this.configKeySet = new Set(DEFAULT_CONFIG_KEYS);
		if (opts?.configKeys) {
			for (const k of opts.configKeys) this.configKeySet.add(k.trim().toLowerCase());
		}

		this.dependencySet = new Set(DEFAULT_DEPENDENCIES);
		if (opts?.dependencies) {
			for (const d of opts.dependencies) this.dependencySet.add(d.trim().toLowerCase());
		}

		this.commitSet = new Set(DEFAULT_COMMITS);
		if (opts?.commits) {
			for (const c of opts.commits) this.commitSet.add(c.trim().toLowerCase());
		}

		this.dbEntitySet = new Set(DEFAULT_DB_ENTITIES);
		if (opts?.dbEntities) {
			for (const db of opts.dbEntities) this.dbEntitySet.add(db.trim().toLowerCase());
		}
	}

	hasExact(path: string): boolean {
		const normalized = path.replace(/\\/g, "/");
		return this.exactFiles.has(normalized);
	}

	getKnownFiles(): ReadonlySet<string> {
		return this.exactFiles;
	}

	getDirectorySet(): ReadonlySet<string> {
		return this.directorySet;
	}

	// UX-1151 through UX-1160: Strict directory path verifier
	verifyStrictParentPath(path: string): { valid: boolean; missingParent?: string; fabricatedParent: boolean } {
		const normalized = path.replace(/\\/g, "/");
		const slash = normalized.lastIndexOf("/");
		if (slash === -1) {
			return { valid: true, fabricatedParent: false };
		}

		const parentDir = normalized.slice(0, slash);
		if (!parentDir || parentDir === "." || parentDir === "..") {
			return { valid: true, fabricatedParent: false };
		}

		const segments = parentDir.split("/").filter(Boolean);
		let current = "";
		for (const seg of segments) {
			current = current ? `${current}/${seg}` : seg;
			if (current !== "." && current !== ".." && !this.directorySet.has(current)) {
				return { valid: false, missingParent: current, fabricatedParent: true };
			}
		}

		return { valid: true, fabricatedParent: false };
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

		const parentCheck = this.verifyStrictParentPath(normalized);
		const fabricatedParent = parentCheck.fabricatedParent;

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
					missingParent: parentCheck.missingParent,
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
					missingParent: parentCheck.missingParent,
				};
			}
		}

		return {
			resolved: false,
			exact: false,
			candidates,
			isGenericName: isGeneric,
			fabricatedParent,
			missingParent: parentCheck.missingParent,
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

	// [UX-1106] O(1) Pre-Indexed performance metric assertions
	registerMetrics(metrics: readonly string[]): void {
		for (const m of metrics) this.metricSet.add(m.trim().toLowerCase());
	}

	hasMetric(metric: string): boolean {
		const norm = metric.trim().toLowerCase();
		if (this.metricSet.has(norm)) return true;
		// Also strip leading/trailing punctuation or backticks
		const clean = norm.replace(/^[`'"]+|[`'"]+$/g, "");
		return this.metricSet.has(clean);
	}

	resolveMetric(metric: string): DomainResolution {
		const norm = metric.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.metricSet.has(norm)) {
			return { resolved: true, exact: true, matched: norm, candidates: [norm] };
		}
		// Partial containment match
		for (const m of this.metricSet) {
			if (norm.includes(m) || m.includes(norm)) {
				return { resolved: true, exact: false, matched: m, candidates: [m] };
			}
		}
		const closest = this.findClosestFromSet(norm, this.metricSet);
		return { resolved: false, exact: false, candidate: closest[0], candidates: closest };
	}

	findClosestMetric(metric: string, maxResults = 3): string[] {
		return this.findClosestFromSet(metric.trim().toLowerCase(), this.metricSet, maxResults);
	}

	// [UX-1107] O(1) Pre-Indexed configuration key citations
	registerConfigKeys(keys: readonly string[]): void {
		for (const k of keys) this.configKeySet.add(k.trim().toLowerCase());
	}

	hasConfigKey(key: string): boolean {
		const norm = key.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.configKeySet.has(norm)) return true;
		const lastDot = norm.lastIndexOf(".");
		if (lastDot !== -1 && this.configKeySet.has(norm.slice(lastDot + 1))) return true;
		return false;
	}

	resolveConfigKey(key: string): DomainResolution {
		const norm = key.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.hasConfigKey(norm)) {
			return { resolved: true, exact: true, matched: norm, candidates: [norm] };
		}
		const closest = this.findClosestFromSet(norm, this.configKeySet);
		return { resolved: false, exact: false, candidate: closest[0], candidates: closest };
	}

	findClosestConfigKey(key: string, maxResults = 3): string[] {
		return this.findClosestFromSet(key.trim().toLowerCase(), this.configKeySet, maxResults);
	}

	// [UX-1108] O(1) Pre-Indexed third-party dependency claims
	registerDependencies(deps: readonly string[]): void {
		for (const d of deps) this.dependencySet.add(d.trim().toLowerCase());
	}

	hasDependency(dep: string): boolean {
		const norm = dep.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.dependencySet.has(norm)) return true;
		// Support package sub-paths like "@mario/pi/tui"
		const slash = norm.indexOf("/", norm.startsWith("@") ? norm.indexOf("/") + 1 : 0);
		if (slash !== -1 && this.dependencySet.has(norm.slice(0, slash))) return true;
		return false;
	}

	resolveDependency(dep: string): DomainResolution {
		const norm = dep.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.hasDependency(norm)) {
			return { resolved: true, exact: true, matched: norm, candidates: [norm] };
		}
		const closest = this.findClosestFromSet(norm, this.dependencySet);
		return { resolved: false, exact: false, candidate: closest[0], candidates: closest };
	}

	findClosestDependency(dep: string, maxResults = 3): string[] {
		return this.findClosestFromSet(dep.trim().toLowerCase(), this.dependencySet, maxResults);
	}

	// [UX-1109] O(1) Pre-Indexed historical commit attribution quotes
	registerCommits(commits: readonly string[]): void {
		for (const c of commits) this.commitSet.add(c.trim().toLowerCase());
	}

	hasCommit(shaOrMsg: string): boolean {
		const norm = shaOrMsg.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.commitSet.has(norm)) return true;
		// Prefix match (7-char git short sha)
		for (const c of this.commitSet) {
			if (norm.startsWith(c) || c.startsWith(norm)) return true;
		}
		return false;
	}

	resolveCommit(shaOrMsg: string): DomainResolution {
		const norm = shaOrMsg.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.hasCommit(norm)) {
			return { resolved: true, exact: true, matched: norm, candidates: [norm] };
		}
		const closest = this.findClosestFromSet(norm, this.commitSet);
		return { resolved: false, exact: false, candidate: closest[0], candidates: closest };
	}

	findClosestCommit(shaOrMsg: string, maxResults = 3): string[] {
		return this.findClosestFromSet(shaOrMsg.trim().toLowerCase(), this.commitSet, maxResults);
	}

	// [UX-1110] O(1) Pre-Indexed database column and index citations
	registerDbEntities(entities: readonly string[]): void {
		for (const e of entities) this.dbEntitySet.add(e.trim().toLowerCase());
	}

	hasDbEntity(entity: string): boolean {
		const norm = entity.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.dbEntitySet.has(norm)) return true;
		// Table.column match e.g. "users.id"
		const dot = norm.lastIndexOf(".");
		if (dot !== -1) {
			const col = norm.slice(dot + 1);
			const tbl = norm.slice(0, dot);
			if (this.dbEntitySet.has(col) || this.dbEntitySet.has(tbl)) return true;
		}
		return false;
	}

	resolveDbEntity(entity: string): DomainResolution {
		const norm = entity.trim().toLowerCase().replace(/^[`'"]+|[`'"]+$/g, "");
		if (this.hasDbEntity(norm)) {
			return { resolved: true, exact: true, matched: norm, candidates: [norm] };
		}
		const closest = this.findClosestFromSet(norm, this.dbEntitySet);
		return { resolved: false, exact: false, candidate: closest[0], candidates: closest };
	}

	findClosestDbEntity(entity: string, maxResults = 3): string[] {
		return this.findClosestFromSet(entity.trim().toLowerCase(), this.dbEntitySet, maxResults);
	}

	private findClosestFromSet(target: string, set: Set<string>, maxResults = 3): string[] {
		const clean = target.replace(/^[`'"]+|[`'"]+$/g, "").toLowerCase();
		const scored: Array<{ value: string; distance: number }> = [];

		for (const item of set) {
			const dist = levenshtein(clean, item);
			scored.push({ value: item, distance: dist });
		}

		scored.sort((a, b) => a.distance - b.distance);
		return scored.slice(0, maxResults).map((s) => s.value);
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
			row[j] = Math.min((row[j] as number) + 1, (row[j - 1] as number) + 1, prev + cost);
			prev = cur;
		}
	}

	return row[b.length] as number;
}
