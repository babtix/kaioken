/**
 * Declaration kinds. Deliberately a closed set: the wiki's coverage rubric and
 * the verifier's grounding oracle both switch on these, so a new kind is a
 * deliberate change rather than whatever a grammar happened to call something.
 */
export type SymbolKind =
	| "function"
	| "method"
	| "class"
	| "interface"
	| "type"
	| "struct"
	| "enum"
	| "trait"
	| "impl"
	| "const"
	| "var"
	| "module";

/** One declaration, as it appears in the structural map. */
export interface SymbolRecord {
	name: string;
	kind: SymbolKind;
	/** The declaration head, body removed. Shown in bundles instead of the body. */
	signature: string;
	/** 1-based, inclusive. Anchor resolution depends on these being exact. */
	startLine: number;
	endLine: number;
	/** Visible outside its defining unit. Drives the phase-4 coverage rubric. */
	exported: boolean;
	/** Leading comment block or docstring, comment markers stripped. */
	doc: string;
	/** Enclosing declaration name, for methods and nested types. */
	parent?: string;
}

/** The declaration inventory for one file. */
export interface FileMap {
	path: string;
	language: string;
	/** Content hash from the scan. An unchanged hash means no reparse. */
	hash: string;
	lineCount: number;
	/** True when the language has no grammar bound; symbols will be empty. */
	unparsed: boolean;
	symbols: SymbolRecord[];
}

export interface IndexResult {
	root: string;
	builtAt: string;
	fileCount: number;
	symbolCount: number;
	/** Languages encountered with no grammar bound, with file counts. */
	unparsedLanguages: Record<string, number>;
	files: FileMap[];
}
