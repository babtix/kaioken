import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { existsSync } from "node:fs";
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
export interface GrammarSpec {
	/** Module-relative path to the prebuilt grammar, resolved through node. */
	wasm: string;
	/** Query file basename in ./queries. */
	query: string;
}

export type GrammarTier = "tree-sitter" | "fallback" | "unsupported";

export interface GrammarInfo {
	language: string;
	wasm?: string;
	query?: string;
	tier: GrammarTier;
	isRegistered: boolean;
	hasQueryFile: boolean;
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

/**
 * Known fallback languages supported via regex declaration extractor
 * when Tree-sitter WASM grammars are absent.
 */
const KNOWN_FALLBACK_LANGUAGES = new Set([
	"typescript",
	"tsx",
	"javascript",
	"jsx",
	"python",
	"go",
	"rust",
	"java",
	"c",
	"cpp",
	"c_sharp",
	"csharp",
	"ruby",
	"sql",
]);

export class GrammarRegistry {
	private readonly grammars = new Map<string, GrammarSpec>();

	constructor() {
		for (const [lang, spec] of Object.entries(GRAMMARS)) {
			this.grammars.set(lang, spec);
		}
	}

	register(language: string, spec: GrammarSpec): void {
		const norm = language.toLowerCase();
		this.grammars.set(norm, spec);
		GRAMMARS[norm] = spec;
		cache.delete(norm);
	}

	unregister(language: string): void {
		const norm = language.toLowerCase();
		this.grammars.delete(norm);
		delete GRAMMARS[norm];
		cache.delete(norm);
	}

	get(language: string): GrammarSpec | undefined {
		return this.grammars.get(language.toLowerCase());
	}

	has(language: string): boolean {
		return this.grammars.has(language.toLowerCase());
	}

	canParseAst(language: string): boolean {
		return isSupportedLanguage(language);
	}

	getLanguageTier(language: string): GrammarTier {
		const norm = language.toLowerCase();
		if (this.canParseAst(norm)) {
			return "tree-sitter";
		}
		if (KNOWN_FALLBACK_LANGUAGES.has(norm)) {
			return "fallback";
		}
		return "unsupported";
	}

	listLanguages(): GrammarInfo[] {
		const all = new Set([...this.grammars.keys(), ...KNOWN_FALLBACK_LANGUAGES]);
		const list: GrammarInfo[] = [];

		for (const lang of Array.from(all).sort()) {
			const spec = this.grammars.get(lang);
			const hasQ = spec ? existsSync(queryPath(spec.query)) : false;
			list.push({
				language: lang,
				wasm: spec?.wasm,
				query: spec?.query,
				tier: this.getLanguageTier(lang),
				isRegistered: spec !== undefined,
				hasQueryFile: hasQ,
			});
		}
		return list;
	}

	listSupportedLanguages(): string[] {
		return supportedLanguages();
	}

	getQueryPath(basename: string): string {
		return queryPath(basename);
	}
}

let defaultRegistry: GrammarRegistry | null = null;

export function getGrammarRegistry(): GrammarRegistry {
	if (!defaultRegistry) {
		defaultRegistry = new GrammarRegistry();
	}
	return defaultRegistry;
}

export function registerGrammar(language: string, spec: GrammarSpec): void {
	getGrammarRegistry().register(language, spec);
}

export function isSupportedLanguage(language: string): boolean {
	const spec = GRAMMARS[language.toLowerCase()];
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
	const norm = language.toLowerCase();
	const spec = GRAMMARS[norm];
	if (!spec) return null;

	const existing = cache.get(norm);
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

	cache.set(norm, loading);
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
