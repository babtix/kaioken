import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Language, Parser, Query } from "web-tree-sitter";

const require = createRequire(import.meta.url);

/**
 * Adding a language means adding a row here and a query file. Nothing else in
 * the package should need to change — that constraint is the whole reason the
 * extraction is query-driven rather than hand-written per grammar.
 */
interface GrammarSpec {
	/** Module-relative path to the prebuilt grammar, resolved through node. */
	wasm: string;
	/** Query file basename in ./queries. */
	query: string;
}

const GRAMMARS: Record<string, GrammarSpec> = {
	typescript: {
		wasm: "tree-sitter-typescript/tree-sitter-typescript.wasm",
		query: "typescript.scm",
	},
	tsx: {
		wasm: "tree-sitter-typescript/tree-sitter-tsx.wasm",
		query: "typescript.scm",
	},
	javascript: {
		wasm: "tree-sitter-javascript/tree-sitter-javascript.wasm",
		query: "javascript.scm",
	},
	jsx: {
		wasm: "tree-sitter-javascript/tree-sitter-javascript.wasm",
		query: "javascript.scm",
	},
	python: { wasm: "tree-sitter-python/tree-sitter-python.wasm", query: "python.scm" },
	go: { wasm: "tree-sitter-go/tree-sitter-go.wasm", query: "go.scm" },
	rust: { wasm: "tree-sitter-rust/tree-sitter-rust.wasm", query: "rust.scm" },
	java: { wasm: "tree-sitter-java/tree-sitter-java.wasm", query: "java.scm" },
	c: { wasm: "tree-sitter-c/tree-sitter-c.wasm", query: "c.scm" },
	cpp: { wasm: "tree-sitter-cpp/tree-sitter-cpp.wasm", query: "cpp.scm" },
	c_sharp: { wasm: "tree-sitter-c-sharp/tree-sitter-c-sharp.wasm", query: "c_sharp.scm" },
	csharp: { wasm: "tree-sitter-c-sharp/tree-sitter-c-sharp.wasm", query: "c_sharp.scm" },
	ruby: { wasm: "tree-sitter-ruby/tree-sitter-ruby.wasm", query: "ruby.scm" },
};

export function registerGrammar(language: string, spec: GrammarSpec): void {
	GRAMMARS[language] = spec;
	cache.delete(language);
}

export function isSupportedLanguage(language: string): boolean {
	const spec = GRAMMARS[language];
	if (!spec) return false;
	try {
		require.resolve(spec.wasm);
		return true;
	} catch {
		return false;
	}
}

export function supportedLanguages(): string[] {
	return Object.keys(GRAMMARS).filter(isSupportedLanguage).sort();
}

export interface LoadedGrammar {
	language: Language;
	query: Query;
}

const cache = new Map<string, Promise<LoadedGrammar | null>>();
let initialised: Promise<void> | null = null;

/** `Parser.init()` is global and must happen exactly once per process. */
export function initParser(): Promise<void> {
	if (!initialised) initialised = Parser.init();
	return initialised;
}

export async function loadGrammar(language: string): Promise<LoadedGrammar | null> {
	const spec = GRAMMARS[language];
	if (!spec) return null;

	const existing = cache.get(language);
	if (existing) return existing;

	const loading = (async () => {
		try {
			await initParser();
			const wasmPath = require.resolve(spec.wasm);
			const lang = await Language.load(wasmPath);
			const source = await readFile(queryPath(spec.query), "utf8");
			return { language: lang, query: new Query(lang, source) };
		} catch {
			return null;
		}
	})();

	cache.set(language, loading);
	return loading;
}

/** Queries ship as .scm beside the compiled output; the build copies them across. */
function queryPath(basename: string): string {
	return join(dirname(fileURLToPath(import.meta.url)), "queries", basename);
}

export async function newParser(language: Language): Promise<Parser> {
	await initParser();
	const parser = new Parser();
	parser.setLanguage(language);
	return parser;
}

export {
	LanguageParserPool,
	getParserPool,
	withParser,
	clearParserPools,
	getAllPoolStats,
	pruneAllIdleParsers,
} from "./pool.ts";
export type { ParserPoolOptions, PoolStats } from "./pool.ts";
