import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";

/**
 * The deterministic half.
 *
 * Everything the model is asked to reason about is gathered here by lookup, with
 * no prompt in sight. This half is separately testable and structurally
 * incapable of hallucinating; the model's job is to interpret it, not to
 * discover it.
 */

export interface DirectoryEvidence {
	path: string;
	fileCount: number;
	/** Languages present, most common first. */
	languages: string[];
	/**
	 * Actual file paths. The model is asked to assign files, so it has to be
	 * shown files — a directory summary alone leaves it nothing real to name.
	 */
	files: string[];
	/** A sample of declaration names, enough to say what lives here. */
	symbols: string[];
	/** Total declarations, which may exceed the sample. */
	symbolCount: number;
}

export interface RepositoryEvidence {
	fileCount: number;
	totalBytes: number;
	languages: Record<string, number>;
	directories: DirectoryEvidence[];
	/** Files that look like an entry point, by convention. */
	entryFiles: string[];
	/** README-ish files, which usually state the repository's own intent. */
	readmes: string[];
}

/** Sampling caps. Evidence has to fit in a prompt without truncating the skeleton. */
const SYMBOLS_PER_DIRECTORY = 12;
const MAX_DIRECTORIES = 120;
const FILES_PER_DIRECTORY = 40;

const ENTRY_BASENAMES = new Set([
	"main.go",
	"main.ts",
	"main.js",
	"main.py",
	"main.rs",
	"index.ts",
	"index.js",
	"cli.ts",
	"bin.ts",
	"app.ts",
	"server.ts",
	"__main__.py",
	"lib.rs",
	"mod.rs",
]);

/**
 * Summarise a repository from the phase-1 artifacts alone.
 *
 * Directories are the unit because they are how authors already grouped their
 * own code: proposing modules over a directory summary asks the model to name
 * and justify an existing structure rather than to invent one.
 */
export function gatherEvidence(scan: ScanResult, index: IndexResult | null): RepositoryEvidence {
	const languages: Record<string, number> = {};
	const byDirectory = new Map<string, { files: string[]; languages: Map<string, number> }>();
	const entryFiles: string[] = [];
	const readmes: string[] = [];

	for (const file of scan.files) {
		languages[file.language] = (languages[file.language] ?? 0) + 1;

		// Generated output and lockfiles describe no intent; including them would
		// invite modules named after build directories.
		if (file.risk.includes("generated") || file.risk.includes("lockfile")) continue;
		if (file.binary) continue;

		const base = basename(file.path).toLowerCase();
		if (base.startsWith("readme")) readmes.push(file.path);
		if (ENTRY_BASENAMES.has(base)) entryFiles.push(file.path);

		const dir = dirname(file.path);
		let entry = byDirectory.get(dir);
		if (!entry) {
			entry = { files: [], languages: new Map() };
			byDirectory.set(dir, entry);
		}
		entry.files.push(file.path);
		entry.languages.set(file.language, (entry.languages.get(file.language) ?? 0) + 1);
	}

	const symbolsByDirectory = new Map<string, { names: string[]; total: number }>();
	for (const file of index?.files ?? []) {
		const dir = dirname(file.path);
		let bucket = symbolsByDirectory.get(dir);
		if (!bucket) {
			bucket = { names: [], total: 0 };
			symbolsByDirectory.set(dir, bucket);
		}
		for (const symbol of file.symbols) {
			bucket.total++;
			// Exported declarations first: they are the module's contract with
			// the rest of the repository, which is what a decomposition is about.
			if (symbol.exported && bucket.names.length < SYMBOLS_PER_DIRECTORY) {
				bucket.names.push(symbol.name);
			}
		}
	}

	const directories: DirectoryEvidence[] = [...byDirectory.entries()]
		.map(([path, entry]) => {
			const symbols = symbolsByDirectory.get(path);
			return {
				path,
				fileCount: entry.files.length,
				languages: [...entry.languages.entries()]
					.sort((a, b) => b[1] - a[1])
					.map(([lang]) => lang),
				files: entry.files.slice(0, FILES_PER_DIRECTORY).sort(),
				symbols: symbols?.names ?? [],
				symbolCount: symbols?.total ?? 0,
			};
		})
		// Densest first, so truncation drops the least informative directories.
		.sort((a, b) => b.symbolCount - a.symbolCount || a.path.localeCompare(b.path))
		.slice(0, MAX_DIRECTORIES);

	directories.sort((a, b) => a.path.localeCompare(b.path));

	return {
		fileCount: scan.fileCount,
		totalBytes: scan.totalBytes,
		languages,
		directories,
		entryFiles: entryFiles.sort(),
		readmes: readmes.sort(),
	};
}

/**
 * Evidence for one module: the declaration skeleton of the files it owns.
 *
 * Signatures rather than bodies, which is the whole point of the structural map
 * — the complete surface of a module costs a fraction of its source.
 */
export interface ModuleEvidence {
	files: ModuleFileEvidence[];
	/**
	 * Files the module claims that the repository does not contain.
	 *
	 * Not the same as "not in the symbol index": a package.json or a README is a
	 * real file with no declarations to extract, and treating it as missing
	 * would flag a correct card. Only a path the scan never saw belongs here.
	 */
	missing: string[];
	totalSymbols: number;
	exportedSymbols: string[];
}

export interface ModuleFileEvidence {
	path: string;
	language: string;
	lineCount: number;
	declarations: string[];
}

export function gatherModuleEvidence(
	index: IndexResult | null,
	files: readonly string[],
	options: { maxDeclarationsPerFile?: number; knownFiles?: ReadonlyMap<string, string> } = {},
): ModuleEvidence {
	const limit = options.maxDeclarationsPerFile ?? 60;
	const byPath = new Map((index?.files ?? []).map((f) => [f.path, f]));

	const out: ModuleFileEvidence[] = [];
	const missing: string[] = [];
	const exported: string[] = [];
	let totalSymbols = 0;

	for (const path of files) {
		const file = byPath.get(path);
		if (!file) {
			// A file the scan knows but the index does not is a real file with
			// nothing to extract — config, docs, a query file. It stays in scope
			// so the card may cite it; it simply contributes no declarations.
			if (options.knownFiles?.has(path)) {
				out.push({ path, language: "", lineCount: 0, declarations: [] });
			} else {
				missing.push(path);
			}
			continue;
		}

		const declarations: string[] = [];
		for (const symbol of file.symbols) {
			totalSymbols++;
			if (symbol.exported) exported.push(symbol.name);
			if (declarations.length < limit) {
				const owner = symbol.parent ? `${symbol.parent}.` : "";
				declarations.push(
					`${symbol.exported ? "+" : "-"} ${owner}${symbol.name} — ${symbol.signature}`,
				);
			}
		}

		out.push({
			path: file.path,
			language: file.language,
			lineCount: file.lineCount,
			declarations,
		});
	}

	return { files: out, missing, totalSymbols, exportedSymbols: exported };
}

function dirname(path: string): string {
	const slash = path.lastIndexOf("/");
	return slash === -1 ? "." : path.slice(0, slash);
}

function basename(path: string): string {
	return path.slice(path.lastIndexOf("/") + 1);
}
