import { extractFile } from "./extract.ts";
import type { BuildStats } from "./build.ts";
import type { FileMap, IndexResult, SymbolRecord } from "./types.ts";

export type SymbolDiffKind = "signature" | "lines" | "doc" | "exported" | "parent";

export interface ModifiedSymbolDiff {
	oldSymbol: SymbolRecord;
	newSymbol: SymbolRecord;
	diffKinds: SymbolDiffKind[];
}

export interface SymbolDelta {
	added: SymbolRecord[];
	removed: SymbolRecord[];
	modified: ModifiedSymbolDiff[];
}

export interface FileDelta {
	added: string[];
	modified: string[];
	deleted: string[];
	unchanged: string[];
}

export interface IndexDeltaSummary {
	totalAdded: number;
	totalRemoved: number;
	totalModified: number;
	totalUnchanged: number;
}

export interface IndexDelta {
	files: FileDelta;
	symbols: Record<string, SymbolDelta>;
	summary: IndexDeltaSummary;
	hasChanges: boolean;
}

/**
 * Compare two sets of symbol declarations for a single file.
 * Matches symbols by their name and optional parent scope.
 */
export function diffSymbolRecords(
	oldSymbols: SymbolRecord[] = [],
	newSymbols: SymbolRecord[] = [],
): SymbolDelta {
	const delta: SymbolDelta = {
		added: [],
		removed: [],
		modified: [],
	};

	const oldKey = (s: SymbolRecord) => `${s.parent ? `${s.parent}.` : ""}${s.name}:${s.kind}`;
	const oldMap = new Map<string, SymbolRecord>();
	for (const s of oldSymbols) {
		oldMap.set(oldKey(s), s);
	}

	const seenOldKeys = new Set<string>();

	for (const newSym of newSymbols) {
		const key = oldKey(newSym);
		const oldSym = oldMap.get(key);

		if (!oldSym) {
			delta.added.push(newSym);
			continue;
		}

		seenOldKeys.add(key);

		const diffKinds: SymbolDiffKind[] = [];
		if (oldSym.signature !== newSym.signature) diffKinds.push("signature");
		if (oldSym.startLine !== newSym.startLine || oldSym.endLine !== newSym.endLine) {
			diffKinds.push("lines");
		}
		if (oldSym.doc !== newSym.doc) diffKinds.push("doc");
		if (oldSym.exported !== newSym.exported) diffKinds.push("exported");
		if (oldSym.parent !== newSym.parent) diffKinds.push("parent");

		if (diffKinds.length > 0) {
			delta.modified.push({
				oldSymbol: oldSym,
				newSymbol: newSym,
				diffKinds,
			});
		}
	}

	for (const oldSym of oldSymbols) {
		const key = oldKey(oldSym);
		if (!seenOldKeys.has(key)) {
			delta.removed.push(oldSym);
		}
	}

	return delta;
}

/**
 * Compare two FileMap instances.
 */
export function diffFileMaps(oldFile?: FileMap, newFile?: FileMap): SymbolDelta {
	return diffSymbolRecords(oldFile?.symbols, newFile?.symbols);
}

/**
 * Compute the comprehensive delta between an old index and a new index.
 */
export function computeIndexDelta(oldIndex: IndexResult, newIndex: IndexResult): IndexDelta {
	const oldFiles = new Map<string, FileMap>();
	for (const f of oldIndex.files) oldFiles.set(f.path, f);

	const newFiles = new Map<string, FileMap>();
	for (const f of newIndex.files) newFiles.set(f.path, f);

	const files: FileDelta = {
		added: [],
		modified: [],
		deleted: [],
		unchanged: [],
	};

	const symbols: Record<string, SymbolDelta> = {};
	let totalAdded = 0;
	let totalRemoved = 0;
	let totalModified = 0;
	let totalUnchanged = 0;

	for (const [path, newFile] of newFiles) {
		const oldFile = oldFiles.get(path);
		if (!oldFile) {
			files.added.push(path);
			const symDelta = diffSymbolRecords([], newFile.symbols);
			symbols[path] = symDelta;
			totalAdded += symDelta.added.length;
		} else if (oldFile.hash !== newFile.hash) {
			files.modified.push(path);
			const symDelta = diffSymbolRecords(oldFile.symbols, newFile.symbols);
			symbols[path] = symDelta;
			totalAdded += symDelta.added.length;
			totalRemoved += symDelta.removed.length;
			totalModified += symDelta.modified.length;
		} else {
			files.unchanged.push(path);
			totalUnchanged += newFile.symbols.length;
		}
	}

	for (const [path, oldFile] of oldFiles) {
		if (!newFiles.has(path)) {
			files.deleted.push(path);
			const symDelta = diffSymbolRecords(oldFile.symbols, []);
			symbols[path] = symDelta;
			totalRemoved += symDelta.removed.length;
		}
	}

	files.added.sort();
	files.modified.sort();
	files.deleted.sort();
	files.unchanged.sort();

	const hasChanges =
		files.added.length > 0 ||
		files.modified.length > 0 ||
		files.deleted.length > 0 ||
		totalAdded > 0 ||
		totalRemoved > 0 ||
		totalModified > 0;

	return {
		files,
		symbols,
		summary: {
			totalAdded,
			totalRemoved,
			totalModified,
			totalUnchanged,
		},
		hasChanges,
	};
}

export interface FileUpdateSpec {
	path: string;
	source?: string;
	language?: string;
	hash?: string;
	deleted?: boolean;
}

/**
 * Apply selective incremental updates to an existing index without re-scanning.
 */
export async function applyIndexDelta(
	previousIndex: IndexResult,
	updates: FileUpdateSpec[],
): Promise<{ index: IndexResult; delta: IndexDelta; stats: BuildStats }> {
	const fileMap = new Map<string, FileMap>();
	for (const file of previousIndex.files) {
		fileMap.set(file.path, file);
	}

	let parsedCount = 0;
	let reusedCount = previousIndex.files.length;

	for (const update of updates) {
		if (update.deleted) {
			if (fileMap.delete(update.path)) {
				reusedCount--;
			}
			continue;
		}

		if (update.source !== undefined && update.language) {
			const hash = update.hash ?? `hash-${Date.now()}`;
			const prior = fileMap.get(update.path);
			if (prior && prior.hash === hash) {
				continue;
			}

			const extracted = await extractFile({
				path: update.path,
				language: update.language,
				hash,
				source: update.source,
			});

			if (fileMap.has(update.path)) {
				reusedCount--;
			}
			fileMap.set(update.path, extracted);
			parsedCount++;
		}
	}

	const files = Array.from(fileMap.values()).sort((a, b) =>
		a.path.localeCompare(b.path),
	);

	let symbolCount = 0;
	const unparsedLanguages: Record<string, number> = {};
	for (const f of files) {
		symbolCount += f.symbols.length;
		if (f.unparsed) {
			unparsedLanguages[f.language] = (unparsedLanguages[f.language] ?? 0) + 1;
		}
	}

	const newIndex: IndexResult = {
		root: previousIndex.root,
		builtAt: new Date().toISOString(),
		fileCount: files.length,
		symbolCount,
		unparsedLanguages,
		files,
	};

	const delta = computeIndexDelta(previousIndex, newIndex);
	const stats: BuildStats = {
		parsed: parsedCount,
		reused: Math.max(0, reusedCount),
		skipped: 0,
	};

	return { index: newIndex, delta, stats };
}
