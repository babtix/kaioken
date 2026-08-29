import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { FileRecord, ScanResult } from "@kaioken/scan";
import { extractFile } from "./extract.js";
import { isSupportedLanguage } from "./grammars.js";
import type { FileMap, IndexResult } from "./types.js";

export interface BuildOptions {
	/**
	 * A previous index. Files whose scan hash is unchanged are carried across
	 * rather than reparsed — parsing is the expensive half of phase 1.
	 */
	previous?: IndexResult | null;
	/** Ignore `previous` and reparse everything. */
	force?: boolean;
	/** Called once per file, after it is parsed or reused. */
	onProgress?: (done: number, total: number, path: string) => void;
}

export interface BuildStats {
	parsed: number;
	reused: number;
	skipped: number;
}

export interface BuildOutcome {
	index: IndexResult;
	stats: BuildStats;
}

/**
 * Build the declaration inventory for a scanned repository.
 *
 * The scan decides what exists; this decides what is declared. Keeping them
 * separate is what lets the index be rebuilt without re-walking the tree, and
 * lets the tree be re-walked without reparsing.
 */
export async function buildIndex(
	scanResult: ScanResult,
	options: BuildOptions = {},
): Promise<BuildOutcome> {
	const previous = options.force ? null : (options.previous ?? null);
	const priorByPath = new Map<string, FileMap>();
	if (previous) {
		for (const file of previous.files) priorByPath.set(file.path, file);
	}

	const candidates = scanResult.files.filter(isIndexable);
	const files: FileMap[] = [];
	const stats: BuildStats = {
		parsed: 0,
		reused: 0,
		skipped: scanResult.files.length - candidates.length,
	};

	let done = 0;
	for (const record of candidates) {
		const prior = priorByPath.get(record.path);
		if (prior && prior.hash === record.hash && prior.language === record.language) {
			files.push(prior);
			stats.reused++;
			done++;
			options.onProgress?.(done, candidates.length, record.path);
			continue;
		}

		let source: string;
		try {
			source = await readFile(join(scanResult.root, record.path), "utf8");
		} catch {
			// A file that vanished between scan and index is reported by omission.
			done++;
			continue;
		}

		files.push(
			await extractFile({
				path: record.path,
				language: record.language,
				hash: record.hash,
				source,
			}),
		);
		stats.parsed++;
		done++;
		options.onProgress?.(done, candidates.length, record.path);
	}

	files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

	const unparsedLanguages: Record<string, number> = {};
	let symbolCount = 0;
	for (const file of files) {
		symbolCount += file.symbols.length;
		if (file.unparsed) {
			unparsedLanguages[file.language] = (unparsedLanguages[file.language] ?? 0) + 1;
		}
	}

	return {
		index: {
			root: scanResult.root,
			builtAt: new Date().toISOString(),
			fileCount: files.length,
			symbolCount,
			unparsedLanguages,
			files,
		},
		stats,
	};
}

/**
 * Binary files have no declarations, and files whose language has no grammar
 * would only add empty entries. Both are excluded rather than recorded as
 * unparsed, so `unparsedLanguages` means "a grammar would help here" — an
 * actionable signal rather than a list of every PNG in the repo.
 */
function isIndexable(record: FileRecord): boolean {
	if (record.binary) return false;
	return isSupportedLanguage(record.language);
}
