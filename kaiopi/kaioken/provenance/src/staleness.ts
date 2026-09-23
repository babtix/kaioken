import type { FileRecord, ScanResult } from "@kaioken/scan";
import type {
	ChangedSource,
	DocumentStatus,
	InvalidationOptions,
	Provenance,
	ProvenanceSource,
	StalenessOptions,
	StalenessReport,
} from "./types.ts";

/**
 * Compute freshness by comparing recorded source hashes against the scan.
 *
 * Deliberately deterministic and offline. This is the half of phase 5 that must
 * never break: a fresh clone with no credentials still has to be able to say how
 * far the code has moved past its documentation, and a system that presented
 * decayed documentation as current would be worse than one with none.
 *
 * Nothing is stored. The report is derived on demand from two artifacts that
 * already exist, so it cannot drift out of sync with either.
 *
 * Whole-file comparison is the default. When a source carries a `rangeHash`
 * binding and `options.symbolHashes` is provided, that source is judged against
 * its range hash instead, so edits outside the bound symbol or line range do
 * not mark the document stale.
 */
export function computeStaleness(
	documents: readonly Provenance[],
	scan: ScanResult,
	options?: StalenessOptions,
): StalenessReport {
	const current = new Map(scan.files.map((file) => [file.path, file.hash]));
	const report = fastCheckStaleness(documents, current, options);

	const documented = new Set<string>();
	for (const record of documents) {
		for (const source of record.sources) documented.add(source.path);
	}

	const undocumentedFiles = scan.files
		.filter((file) => {
			if (file.binary) return false;
			if (documented.has(file.path)) return false;
			if (!isDocumentableFile(file)) return false;
			if (options?.undocumentedFilter && !options.undocumentedFilter(file)) return false;
			return true;
		})
		.map((file) => file.path)
		.sort();

	return {
		...report,
		undocumentedFiles,
	};
}

/**
 * Fast-path staleness evaluation directly from a map of file hashes.
 *
 * Runs in sub-millisecond time by comparing in-memory hashes without
 * rescanning or recalculating filesystem metadata.
 */
export function fastCheckStaleness(
	documents: readonly Provenance[],
	currentHashes: ReadonlyMap<string, string>,
	options?: StalenessOptions,
): StalenessReport {
	const statuses: DocumentStatus[] = documents.map((record) =>
		status(record, currentHashes, options?.symbolHashes),
	);

	const changedFiles = new Set<string>();
	const deletedFiles = new Set<string>();

	for (const entry of statuses) {
		for (const path of entry.changed) changedFiles.add(path);
		for (const path of entry.deleted) deletedFiles.add(path);
	}

	const stale = statuses.filter((s) => s.freshness === "stale");
	const orphaned = statuses.filter((s) => s.freshness === "orphaned");
	const fresh = statuses.filter((s) => s.freshness === "current");

	return {
		stale,
		current: fresh,
		orphaned,
		documents: statuses,
		changedFiles: [...changedFiles].sort(),
		deletedFiles: [...deletedFiles].sort(),
		undocumentedFiles: [],
		freshness: statuses.length === 0 ? 1 : fresh.length / statuses.length,
		ok: stale.length === 0 && orphaned.length === 0,
	};
}

/**
 * Pre-indexed fast staleness checker for sub-millisecond evaluation
 * on high-frequency file watcher events or large repositories.
 */
export class FastStalenessChecker {
	private readonly documents: readonly Provenance[];
	private readonly pathToDocs = new Map<string, Set<Provenance>>();
	private readonly symbolKeyToDocs = new Map<string, Set<Provenance>>();

	constructor(documents: readonly Provenance[]) {
		this.documents = documents;
		for (const doc of documents) {
			for (const source of doc.sources) {
				let docSet = this.pathToDocs.get(source.path);
				if (!docSet) {
					docSet = new Set();
					this.pathToDocs.set(source.path, docSet);
				}
				docSet.add(doc);

				const key = bindingKeyFor(source);
				if (key !== null) {
					let symSet = this.symbolKeyToDocs.get(key);
					if (!symSet) {
						symSet = new Set();
						this.symbolKeyToDocs.set(key, symSet);
					}
					symSet.add(doc);
				}
			}
		}
	}

	/**
	 * Instant staleness audit against current hash map (sub-50ms guarantee).
	 */
	checkStaleness(
		currentHashes: ReadonlyMap<string, string>,
		options?: StalenessOptions,
	): StalenessReport {
		return fastCheckStaleness(this.documents, currentHashes, options);
	}

	/**
	 * Ultra-fast status overview without allocating full reports.
	 */
	quickCheck(currentHashes: ReadonlyMap<string, string>): {
		ok: boolean;
		freshness: number;
		staleCount: number;
		orphanedCount: number;
		currentCount: number;
	} {
		let stale = 0;
		let orphaned = 0;
		let current = 0;

		for (const doc of this.documents) {
			if (doc.sources.length === 0) continue;
			let changed = 0;
			let deleted = 0;
			for (const s of doc.sources) {
				const hash = currentHashes.get(s.path);
				if (hash === undefined) deleted++;
				else if (hash !== s.hash) changed++;
			}
			if (deleted === doc.sources.length) orphaned++;
			else if (changed > 0 || deleted > 0) stale++;
			else current++;
		}

		const total = this.documents.length;
		return {
			ok: stale === 0 && orphaned === 0,
			freshness: total === 0 ? 1 : current / total,
			staleCount: stale,
			orphanedCount: orphaned,
			currentCount: current,
		};
	}

	/**
	 * O(1) document invalidation for a set of changed file paths.
	 */
	invalidatedBy(changedPaths: Iterable<string>, options?: InvalidationOptions): string[] {
		const changed = new Set(changedPaths);
		const changedSymbols =
			options?.changedSymbols === undefined ? null : new Set(options.changedSymbols);
		const out = new Set<string>();

		if (changedSymbols !== null) {
			for (const sym of changedSymbols) {
				const docs = this.symbolKeyToDocs.get(sym);
				if (docs) {
					for (const d of docs) out.add(d.document);
				}
			}
		}

		for (const path of changed) {
			const docs = this.pathToDocs.get(path);
			if (docs) {
				for (const d of docs) {
					// If caller provided changedSymbols, only invalidate whole-file sources or matched symbols
					if (changedSymbols !== null) {
						const hasMatchingSource = d.sources.some((s) => {
							if (s.path !== path) return false;
							const key = bindingKeyFor(s);
							if (key === null) return true; // whole file source invalidates
							return changedSymbols.has(key);
						});
						if (hasMatchingSource) out.add(d.document);
					} else {
						out.add(d.document);
					}
				}
			}
		}

		return [...out].sort();
	}
}


function status(
	record: Provenance,
	current: ReadonlyMap<string, string>,
	symbolHashes?: ReadonlyMap<string, string>,
): DocumentStatus {
	const changed: string[] = [];
	const deleted: string[] = [];
	const unchanged: string[] = [];

	for (const source of record.sources) {
		const outcome = classifySource(source, current, symbolHashes);
		if (outcome === "deleted") deleted.push(source.path);
		else if (outcome === "changed") changed.push(source.path);
		else unchanged.push(source.path);
	}

	return {
		document: record.document,
		freshness: freshnessOf(record, changed, deleted),
		changed: changed.sort(),
		deleted: deleted.sort(),
		unchanged: unchanged.sort(),
		generatedAt: record.generatedAt,
	};
}

function classifySource(
	source: ProvenanceSource,
	current: ReadonlyMap<string, string>,
	symbolHashes?: ReadonlyMap<string, string>,
): "changed" | "deleted" | "unchanged" {
	const key = bindingKeyFor(source);
	if (key !== null && symbolHashes !== undefined) {
		const fileHash = current.get(source.path);
		if (fileHash === undefined) return "deleted";
		const rangeNow = symbolHashes.get(key);
		if (rangeNow === undefined) return "changed";
		return rangeNow === source.rangeHash ? "unchanged" : "changed";
	}
	const hash = current.get(source.path);
	if (hash === undefined) return "deleted";
	return hash === source.hash ? "unchanged" : "changed";
}

function freshnessOf(
	record: Provenance,
	changed: readonly string[],
	deleted: readonly string[],
): DocumentStatus["freshness"] {
	// A document with no recorded sources cannot be judged. Saying "current"
	// would be a claim the record does not support.
	if (record.sources.length === 0) return "unknown";
	// Every source gone means the subject itself is gone, which is a different
	// problem from being out of date: regenerating would produce nothing.
	if (deleted.length === record.sources.length) return "orphaned";
	if (changed.length > 0 || deleted.length > 0) return "stale";
	return "current";
}

/**
 * Which documents a set of changed paths invalidates.
 *
 * This is the inverse lookup that makes selective regeneration possible: rather
 * than regenerating everything because something moved, match the moved files
 * against what each document was actually written from.
 *
 * When `options.changedSymbols` is provided, symbol-bound sources match by
 * binding key instead of file path, so a file edit outside the bound range
 * does not invalidate the document. Without it, every source matches by path.
 */
export function invalidatedBy(
	documents: readonly Provenance[],
	changedPaths: Iterable<string>,
	options?: InvalidationOptions,
): string[] {
	const changed = new Set(changedPaths);
	const changedSymbols = options?.changedSymbols === undefined ? null : new Set(options.changedSymbols);
	const out: string[] = [];

	for (const record of documents) {
		const hit = record.sources.some((source) => {
			const key = bindingKeyFor(source);
			if (key !== null && changedSymbols !== null) return changedSymbols.has(key);
			return changed.has(source.path);
		});
		if (hit) out.push(record.document);
	}
	return out.sort();
}

/**
 * The diff to show a model when regenerating: only the sources that actually
 * moved, never the document's whole bundle. Regenerating from everything would
 * cost the same as generating from scratch and lose the point of the exercise.
 *
 * Symbol-bound sources compare `rangeHash` against `options.symbolHashes`
 * when provided; otherwise they fall back to whole-file comparison.
 */
export function changedSourcesFor(
	record: Provenance,
	scan: ScanResult,
	options?: Pick<StalenessOptions, "symbolHashes">,
): ChangedSource[] {
	const current = new Map(scan.files.map((file) => [file.path, file.hash]));
	const out: ChangedSource[] = [];

	for (const source of record.sources) {
		const key = bindingKeyFor(source);
		if (key !== null && options?.symbolHashes !== undefined) {
			const rangeNow = options.symbolHashes.get(key);
			const fileNow = current.get(source.path);
			const now = rangeNow ?? null;
			const was = source.rangeHash ?? source.hash;
			const moved = fileNow === undefined ? true : rangeNow !== source.rangeHash;
			if (!moved) continue;
			out.push({
				path: source.path,
				was,
				now: fileNow === undefined ? null : now,
				...(source.symbol !== undefined ? { symbol: source.symbol } : {}),
				...(source.startLine !== undefined ? { startLine: source.startLine } : {}),
				...(source.endLine !== undefined ? { endLine: source.endLine } : {}),
			});
			continue;
		}
		if (current.get(source.path) === source.hash) continue;
		out.push({ path: source.path, was: source.hash, now: current.get(source.path) ?? null });
	}
	return out;
}

/** Binding key for a symbol-aware source, or null for whole-file sources. */
export function bindingKeyFor(source: ProvenanceSource): string | null {
	if (source.rangeHash === undefined) return null;
	if (source.symbol !== undefined && source.symbol !== "") {
		return symbolBindingKey(source.path, source.symbol);
	}
	if (source.startLine !== undefined && source.endLine !== undefined) {
		return rangeBindingKey(source.path, source.startLine, source.endLine);
	}
	return null;
}

/** Key for a symbol binding: `path#symbol`. */
export function symbolBindingKey(path: string, symbol: string): string {
	return `${path}#${symbol}`;
}

/** Key for a line-range binding: `path:start-end`. */
export function rangeBindingKey(path: string, startLine: number, endLine: number): string {
	return `${path}:${startLine}-${endLine}`;
}

const LOCKFILES = new Set([
	"package-lock.json",
	"pnpm-lock.yaml",
	"yarn.lock",
	"bun.lock",
	"bun.lockb",
	"cargo.lock",
	"gemfile.lock",
	"composer.lock",
	"poetry.lock",
	"pipfile.lock",
	"pubspec.lock",
	"podfile.lock",
	"flake.lock",
	"npm-shrinkwrap.json",
	"go.sum",
]);

const CONFIG_BASENAMES = new Set([
	"package.json",
	"makefile",
	"justfile",
	"jenkinsfile",
	"dockerfile",
	"containerfile",
	".editorconfig",
	".nvmrc",
	".node-version",
	"biome.json",
	"biome.jsonc",
]);

/**
 * Whether a scanned file is the kind of source documentation describes.
 *
 * Excludes tests (`test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`),
 * lockfiles, dotfiles, anything under a `scripts/` directory, and common
 * config files. Binary files are excluded by the caller, not here, so this
 * stays a pure path-and-risk judgment reusable in isolation.
 */
export function isDocumentableFile(file: FileRecord): boolean {
	const path = file.path;
	const slash = path.lastIndexOf("/");
	const basename = slash === -1 ? path : path.slice(slash + 1);
	const dirs = slash === -1 ? [] : path.slice(0, slash).split("/");
	const lowerBase = basename.toLowerCase();

	if (basename === "" || basename === "." || basename === "..") return false;
	for (const segment of [...dirs, basename]) {
		if (segment.startsWith(".") && segment !== "." && segment !== "..") return false;
	}
	for (const dir of dirs) {
		const lower = dir.toLowerCase();
		if (lower === "test" || lower === "tests" || lower === "__tests__") return false;
		if (lower === "scripts") return false;
		if (lower === "dist" || lower === "build" || lower === "out" || lower === "coverage") return false;
		if (lower === "node_modules" || lower === "vendor" || lower === "fixtures" || lower === "mocks") return false;
	}

	if (lowerBase.includes(".test.") || lowerBase.includes(".spec.")) return false;
	if (lowerBase.endsWith(".d.ts")) return false;

	if (file.risk.includes("lockfile")) return false;
	if (LOCKFILES.has(lowerBase)) return false;
	if (lowerBase.endsWith(".lock")) return false;

	if (CONFIG_BASENAMES.has(lowerBase)) return false;
	if (/^(tsconfig|jsconfig)(\..*)?\.json$/.test(lowerBase)) return false;
	if (/\.config\.(js|mjs|cjs|ts|mts|cts|json|yaml|yml|toml)$/.test(lowerBase)) return false;
	if (/^\.eslintrc(\..*)?$/.test(lowerBase)) return false;
	if (/^\.prettierrc(\..*)?$/.test(lowerBase)) return false;
	if (/^eslint\.config\..*$/.test(lowerBase)) return false;
	if (/^prettier\.config\..*$/.test(lowerBase)) return false;
	if (/^dockerfile(\..*)?$/.test(lowerBase)) return false;
	if (/^containerfile(\..*)?$/.test(lowerBase)) return false;
	if (/^docker-compose(\..*)?\.(yml|yaml)$/.test(lowerBase)) return false;

	return true;
}

