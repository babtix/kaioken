import type { Node, Query } from "web-tree-sitter";
import { loadGrammar, newParser } from "./grammars.js";
import type { FileMap, SymbolKind, SymbolRecord } from "./types.js";

const KINDS = new Set<SymbolKind>([
	"function",
	"method",
	"class",
	"interface",
	"type",
	"struct",
	"enum",
	"trait",
	"impl",
	"const",
	"var",
	"module",
]);

/** Declaration nodes that make an enclosed function a method. */
const TYPE_LIKE = new Set([
	"class_declaration",
	"class_definition",
	"interface_declaration",
	"impl_item",
	"trait_item",
	"struct_item",
]);

export interface ExtractInput {
	path: string;
	language: string;
	hash: string;
	source: string;
}

/**
 * Build the declaration inventory for one file.
 *
 * Extraction is split deliberately: the query says *what counts as a
 * declaration* in this language, and everything below says *what we record about
 * one* — signature, doc, export status, nesting. That split is what makes "add a
 * grammar and a query file, nothing else" true.
 */
export async function extractFile(input: ExtractInput): Promise<FileMap> {
	const lineCount = countLines(input.source);
	const grammar = await loadGrammar(input.language);

	if (!grammar) {
		return {
			path: input.path,
			language: input.language,
			hash: input.hash,
			lineCount,
			unparsed: true,
			symbols: [],
		};
	}

	const parser = await newParser(grammar.language);
	let symbols: SymbolRecord[] = [];
	try {
		const tree = parser.parse(input.source);
		if (tree) {
			symbols = collect(tree.rootNode, grammar.query, input);
			tree.delete();
		}
	} finally {
		parser.delete();
	}

	return {
		path: input.path,
		language: input.language,
		hash: input.hash,
		lineCount,
		unparsed: false,
		symbols,
	};
}

function collect(root: Node, query: Query, input: ExtractInput): SymbolRecord[] {
	const out: SymbolRecord[] = [];
	const seen = new Set<string>();

	for (const match of query.matches(root)) {
		let declNode: Node | null = null;
		let kind: SymbolKind | null = null;
		let nameNode: Node | null = null;

		for (const capture of match.captures) {
			if (capture.name === "name") {
				nameNode = capture.node;
				continue;
			}
			if (!capture.name.startsWith("decl.")) continue;
			const candidate = capture.name.slice("decl.".length) as SymbolKind;
			if (!KINDS.has(candidate)) continue;
			declNode = capture.node;
			kind = candidate;
		}

		if (!declNode || !kind || !nameNode) continue;

		const startLine = declNode.startPosition.row + 1;
		const endLine = declNode.endPosition.row + 1;
		const name = nameNode.text;

		// One declaration can satisfy more than one pattern (an exported const
		// also matches the bare program-level const). Keep the first.
		const key = `${kind}:${name}:${startLine}:${endLine}`;
		if (seen.has(key)) continue;
		seen.add(key);

		const parent = enclosingDeclarationName(declNode);
		const effectiveKind: SymbolKind =
			kind === "function" && parent !== undefined ? "method" : kind;

		out.push({
			name,
			kind: effectiveKind,
			signature: signatureOf(declNode, input.source),
			startLine,
			endLine,
			exported: isExported(declNode, name, input.language),
			doc: docOf(declNode, input.language),
			...(parent !== undefined ? { parent } : {}),
		});
	}

	out.sort((a, b) => a.startLine - b.startLine || a.name.localeCompare(b.name));
	return out;
}

/**
 * The declaration head with the body removed. Grammars name the body field
 * consistently enough that this works across all five languages without a
 * per-language rule — and where it does not, the fallback is the whole
 * declaration, which is the right answer for a one-line declaration anyway.
 */
export function signatureOf(node: Node, source: string): string {
	const decl = widenLoneSpec(node);

	// Only a block-like body is stripped. A `value` field — the right-hand side
	// of a const or a type alias — *is* the declaration's meaning, and cutting it
	// would leave `type Alias =` in the skeleton.
	const body =
		decl.childForFieldName("body") ??
		firstChildOfType(decl, [
			"block",
			"statement_block",
			"field_declaration_list",
			"declaration_list",
			"enum_variant_list",
		]);

	const end = body && body.startIndex > decl.startIndex ? body.startIndex : decl.endIndex;
	return collapse(source.slice(decl.startIndex, end));
}

/**
 * The leading comment block, adjacent only. A comment separated by a blank line
 * belongs to the file or to the preceding declaration, not to this one, and
 * attributing it here would put words in the author's mouth.
 */
export function docOf(decl: Node, language: string): string {
	if (language === "python") {
		const docstring = pythonDocstring(decl);
		if (docstring !== null) return docstring;
	}

	// A doc comment sits before the *outermost* wrapper, not before the inner
	// declaration: `export function f` puts the comment beside the
	// export_statement, so walking from the function would find nothing.
	const anchor = outermostWrapper(decl);

	const lines: string[] = [];
	let cursor: Node | null = anchor.previousNamedSibling;
	let expectedEnd = anchor.startPosition.row - 1;

	while (cursor && isComment(cursor) && commentEndRow(cursor) === expectedEnd) {
		lines.unshift(stripCommentMarkers(cursor.text));
		expectedEnd = cursor.startPosition.row - 1;
		cursor = cursor.previousNamedSibling;
	}

	return collapseBlank(lines.join("\n")).trim();
}

function pythonDocstring(decl: Node): string | null {
	const body = decl.childForFieldName("body");
	if (!body) return null;
	const first = body.namedChild(0);
	if (!first || first.type !== "expression_statement") return null;
	const literal = first.namedChild(0);
	if (!literal || literal.type !== "string") return null;
	return stripPythonString(literal.text);
}

/**
 * Export rules are genuinely per-language — there is no structural property
 * shared by `pub`, a capital letter and an `export` keyword.
 */
export function isExported(decl: Node, name: string, language: string): boolean {
	switch (language) {
		case "go": {
			const first = name.charAt(0);
			return first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
		}
		case "python":
			return !name.startsWith("_");
		case "rust": {
			if (hasChildOfType(decl, "visibility_modifier")) return true;
			// A trait's methods are as visible as the trait itself; they carry no
			// `pub` of their own. Without this a public trait's contract would be
			// invisible to the coverage rubric.
			const owner = enclosingItem(decl, ["trait_item", "impl_item"]);
			return owner ? hasChildOfType(owner, "visibility_modifier") : false;
		}
		case "typescript":
		case "tsx":
		case "javascript":
		case "jsx": {
			// A member of an exported class is part of that class's public
			// surface — unless it says otherwise. Inheriting the class's export
			// blindly would put every private field in the coverage rubric.
			if (isRestrictedMember(decl, name)) return false;
			return hasExportAncestor(decl);
		}
		default:
			return true;
	}
}

/**
 * A class member the class does not expose: `private`/`protected` in
 * TypeScript, or an ECMAScript `#name` hard-private in either language.
 */
function isRestrictedMember(decl: Node, name: string): boolean {
	if (name.startsWith("#")) return true;
	for (let i = 0; i < decl.namedChildCount; i++) {
		const child = decl.namedChild(i);
		if (child?.type !== "accessibility_modifier") continue;
		if (child.text === "private" || child.text === "protected") return true;
	}
	return false;
}

function hasExportAncestor(node: Node): boolean {
	let cursor: Node | null = node.parent;
	while (cursor) {
		if (cursor.type === "export_statement") return true;
		if (cursor.type === "program") return false;
		cursor = cursor.parent;
	}
	return false;
}

function enclosingDeclarationName(node: Node): string | undefined {
	let cursor: Node | null = node.parent;
	while (cursor) {
		if (TYPE_LIKE.has(cursor.type)) {
			const name = cursor.childForFieldName("name");
			if (name) return name.text;
			// Rust impl blocks name their subject in the `type` field.
			const type = cursor.childForFieldName("type");
			if (type) return type.text;
			return undefined;
		}
		cursor = cursor.parent;
	}
	return undefined;
}

/** Wrapper nodes that a declaration's doc comment sits in front of. */
const DOC_WRAPPERS = new Set([
	"export_statement",
	"decorated_definition",
	"lexical_declaration",
	"variable_declaration",
	"expression_statement",
]);

function outermostWrapper(decl: Node): Node {
	let node = widenLoneSpec(decl);
	while (node.parent && DOC_WRAPPERS.has(node.parent.type)) {
		node = node.parent;
	}
	return node;
}

/**
 * Go groups declarations: `const ( A = 1  B = 2 )` is one `const_declaration`
 * holding several specs. Captures sit on the spec so each member gets its own
 * line range — but a declaration holding exactly one spec is really just
 * `const A = 1`, and reporting it without the keyword, or detaching it from its
 * doc comment, would be wrong. Widening only in the lone-spec case gets both
 * forms right, and deliberately does not attribute a block's comment to every
 * member of a group.
 */
function widenLoneSpec(node: Node): Node {
	if (!isSpec(node)) return node;
	const parent = node.parent;
	if (!parent || !parent.type.endsWith("_declaration")) return node;

	let specs = 0;
	for (let i = 0; i < parent.namedChildCount; i++) {
		const child = parent.namedChild(i);
		if (child && isSpec(child)) specs++;
	}
	return specs === 1 ? parent : node;
}

/** `type_alias` is a spec in every way but its node name. */
function isSpec(node: Node): boolean {
	return node.type.endsWith("_spec") || node.type === "type_alias";
}

function enclosingItem(node: Node, types: string[]): Node | null {
	let cursor: Node | null = node.parent;
	while (cursor) {
		if (types.includes(cursor.type)) return cursor;
		cursor = cursor.parent;
	}
	return null;
}

function firstChildOfType(node: Node, types: string[]): Node | null {
	for (let i = 0; i < node.namedChildCount; i++) {
		const child = node.namedChild(i);
		if (child && types.includes(child.type)) return child;
	}
	return null;
}

function hasChildOfType(node: Node, type: string): boolean {
	for (let i = 0; i < node.namedChildCount; i++) {
		if (node.namedChild(i)?.type === type) return true;
	}
	return false;
}

function isComment(node: Node): boolean {
	return node.type === "comment" || node.type === "line_comment" || node.type === "block_comment";
}

/**
 * The last row the comment actually has text on. Rust's `line_comment` includes
 * its trailing newline, which pushes `endPosition.row` one past the visible end;
 * without this correction every Rust doc comment looks detached from the item it
 * documents.
 */
function commentEndRow(node: Node): number {
	return node.text.endsWith("\n") ? node.endPosition.row - 1 : node.endPosition.row;
}

export function stripCommentMarkers(text: string): string {
	let out = text.trim();
	if (out.startsWith("/*")) {
		out = out.slice(2).replace(/\*\/$/, "");
		return out
			.split(/\r?\n/)
			.map((line) => line.replace(/^\s*\*+ ?/, "").trimEnd())
			.join("\n")
			.trim();
	}
	return out
		.split(/\r?\n/)
		.map((line) => line.replace(/^\s*(?:\/\/\/?|#|--)\s?/, "").trimEnd())
		.join("\n")
		.trim();
}

export function stripPythonString(text: string): string {
	let out = text.trim();
	out = out.replace(/^[rRbBuUfF]+/, "");
	const quotes = ['"""', "'''", '"', "'"];
	for (const quote of quotes) {
		if (out.startsWith(quote) && out.endsWith(quote) && out.length >= quote.length * 2) {
			out = out.slice(quote.length, out.length - quote.length);
			break;
		}
	}
	return collapseBlank(out).trim();
}

function collapse(text: string): string {
	return text.replace(/\s+/g, " ").trim();
}

function collapseBlank(text: string): string {
	return text.replace(/\n{3,}/g, "\n\n");
}

function countLines(source: string): number {
	if (source === "") return 0;
	let count = 1;
	for (let i = 0; i < source.length; i++) {
		if (source.charCodeAt(i) === 10) count++;
	}
	// A trailing newline does not start a new line.
	return source.endsWith("\n") ? count - 1 : count;
}
