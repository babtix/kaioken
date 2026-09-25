/**
 * Query syntax parser supporting boolean AND/OR/NOT filters across the 10 document archetypes:
 * 1. exported API endpoint declarations (UX-0761)
 * 2. configuration options and environment variables (UX-0762)
 * 3. error codes and exception class definitions (UX-0763)
 * 4. database schema tables and migration scripts (UX-0764)
 * 5. utility functions and helper algorithms (UX-0765)
 * 6. test suite descriptions and assertion blocks (UX-0766)
 * 7. documentation wiki chapters and headings (UX-0767)
 * 8. knowledge card summaries and cited sources (UX-0768)
 * 9. agent procedure instructions and parameters (UX-0769)
 * 10. git commit messages and author metadata (UX-0770)
 */

import type { DomainArchetype } from "./boost.ts";

export type QueryNodeType = "term" | "phrase" | "and" | "or" | "not" | "filter";

export interface TermNode {
	readonly type: "term";
	readonly value: string;
}

export interface PhraseNode {
	readonly type: "phrase";
	readonly phrase: string;
}

export interface AndNode {
	readonly type: "and";
	readonly left: QueryNode;
	readonly right: QueryNode;
}

export interface OrNode {
	readonly type: "or";
	readonly left: QueryNode;
	readonly right: QueryNode;
}

export interface NotNode {
	readonly type: "not";
	readonly child: QueryNode;
}

export interface FilterNode {
	readonly type: "filter";
	readonly field: string;
	readonly value: string;
}

export type QueryNode = TermNode | PhraseNode | AndNode | OrNode | NotNode | FilterNode;

export interface ParsedBooleanQuery {
	readonly rawQuery: string;
	readonly root: QueryNode;
	readonly positiveTerms: string[];
	readonly exactPhrases: string[];
	readonly excludedTerms: string[];
	readonly filters: Record<string, string[]>;
}

export interface QueryCandidate {
	readonly text: string;
	readonly path?: string;
	readonly domain?: DomainArchetype | string;
	readonly heading?: string;
	readonly kind?: string;
}

type TokenType = "TERM" | "PHRASE" | "AND" | "OR" | "NOT" | "FILTER" | "LPAREN" | "RPAREN";

interface Token {
	type: TokenType;
	value: string;
	field?: string;
}

/**
 * Tokenize a boolean query string.
 */
function tokenize(input: string): Token[] {
	const tokens: Token[] = [];
	let i = 0;
	const s = input.trim();

	while (i < s.length) {
		const ch = s[i];

		if (/\s/.test(ch)) {
			i++;
			continue;
		}

		if (ch === "(") {
			tokens.push({ type: "LPAREN", value: "(" });
			i++;
			continue;
		}

		if (ch === ")") {
			tokens.push({ type: "RPAREN", value: ")" });
			i++;
			continue;
		}

		if (ch === '"' || ch === "'") {
			const quote = ch;
			i++;
			let phrase = "";
			while (i < s.length && s[i] !== quote) {
				if (s[i] === "\\" && i + 1 < s.length) {
					i++;
					phrase += s[i];
				} else {
					phrase += s[i];
				}
				i++;
			}
			if (i < s.length && s[i] === quote) {
				i++;
			}
			tokens.push({ type: "PHRASE", value: phrase.trim() });
			continue;
		}

		// Negative token like -term
		if (ch === "-" && i + 1 < s.length && !/\s/.test(s[i + 1])) {
			tokens.push({ type: "NOT", value: "NOT" });
			i++;
			continue;
		}

		// Read regular word
		let word = "";
		while (i < s.length && !/[\s()]/.test(s[i])) {
			word += s[i];
			i++;
		}

		const upper = word.toUpperCase();
		if (upper === "AND" || upper === "&&") {
			tokens.push({ type: "AND", value: "AND" });
		} else if (upper === "OR" || upper === "||") {
			tokens.push({ type: "OR", value: "OR" });
		} else if (upper === "NOT" || upper === "!") {
			tokens.push({ type: "NOT", value: "NOT" });
		} else if (word.includes(":") && !word.startsWith("http")) {
			const colonIdx = word.indexOf(":");
			const field = word.slice(0, colonIdx).toLowerCase();
			const val = word.slice(colonIdx + 1);
			tokens.push({ type: "FILTER", value: val, field });
		} else {
			tokens.push({ type: "TERM", value: word });
		}
	}

	return tokens;
}

/**
 * Recursive descent parser building the query AST.
 */
class QueryParser {
	private pos = 0;
	private readonly tokens: Token[];

	constructor(tokens: Token[]) {
		this.tokens = tokens;
	}

	parse(): QueryNode {
		if (this.tokens.length === 0) {
			return { type: "term", value: "" };
		}
		const node = this.parseOr();
		return node;
	}

	private peek(): Token | undefined {
		return this.tokens[this.pos];
	}

	private consume(): Token | undefined {
		return this.tokens[this.pos++];
	}

	private parseOr(): QueryNode {
		let left = this.parseAnd();

		while (this.pos < this.tokens.length) {
			const next = this.peek();
			if (next && next.type === "OR") {
				this.consume();
				const right = this.parseAnd();
				left = { type: "or", left, right };
			} else {
				break;
			}
		}

		return left;
	}

	private parseAnd(): QueryNode {
		let left = this.parseUnary();

		while (this.pos < this.tokens.length) {
			const next = this.peek();
			if (!next || next.type === "RPAREN" || next.type === "OR") {
				break;
			}

			if (next.type === "AND") {
				this.consume();
			}
			const right = this.parseUnary();
			left = { type: "and", left, right };
		}

		return left;
	}

	private parseUnary(): QueryNode {
		const next = this.peek();
		if (next && next.type === "NOT") {
			this.consume();
			const child = this.parsePrimary();
			return { type: "not", child };
		}
		return this.parsePrimary();
	}

	private parsePrimary(): QueryNode {
		const next = this.peek();
		if (!next) {
			return { type: "term", value: "" };
		}

		if (next.type === "LPAREN") {
			this.consume(); // (
			const inner = this.parseOr();
			if (this.peek()?.type === "RPAREN") {
				this.consume(); // )
			}
			return inner;
		}

		if (next.type === "PHRASE") {
			this.consume();
			return { type: "phrase", phrase: next.value };
		}

		if (next.type === "FILTER") {
			this.consume();
			return { type: "filter", field: next.field || "type", value: next.value };
		}

		this.consume();
		return { type: "term", value: next.value };
	}
}

/**
 * Parse a full query syntax string into a boolean AST.
 */
export function parseQuerySyntax(query: string): ParsedBooleanQuery {
	const rawQuery = query.trim();
	const tokens = tokenize(rawQuery);
	const parser = new QueryParser(tokens);
	const root = parser.parse();

	const positiveTerms: string[] = [];
	const exactPhrases: string[] = [];
	const excludedTerms: string[] = [];
	const filters: Record<string, string[]> = {};

	function collectInfo(node: QueryNode, inNot = false): void {
		switch (node.type) {
			case "term":
				if (node.value) {
					if (inNot) excludedTerms.push(node.value.toLowerCase());
					else positiveTerms.push(node.value);
				}
				break;
			case "phrase":
				if (node.phrase) {
					if (inNot) excludedTerms.push(node.phrase.toLowerCase());
					else exactPhrases.push(node.phrase);
				}
				break;
			case "filter":
				if (!filters[node.field]) filters[node.field] = [];
				filters[node.field].push(node.value);
				break;
			case "not":
				collectInfo(node.child, !inNot);
				break;
			case "and":
				collectInfo(node.left, inNot);
				collectInfo(node.right, inNot);
				break;
			case "or":
				collectInfo(node.left, inNot);
				collectInfo(node.right, inNot);
				break;
		}
	}

	collectInfo(root);

	return {
		rawQuery,
		root,
		positiveTerms,
		exactPhrases,
		excludedTerms,
		filters,
	};
}

/**
 * Evaluate whether candidate matches the parsed boolean query AST.
 */
export function evaluateQueryAst(ast: QueryNode, candidate: QueryCandidate): boolean {
	const textLower = (candidate.text || "").toLowerCase();
	const pathLower = (candidate.path || "").toLowerCase();
	const domainLower = (candidate.domain || "").toLowerCase();
	const headingLower = (candidate.heading || "").toLowerCase();

	switch (ast.type) {
		case "term": {
			if (!ast.value) return true;
			const needle = ast.value.toLowerCase();
			return textLower.includes(needle) || pathLower.includes(needle) || headingLower.includes(needle);
		}
		case "phrase": {
			if (!ast.phrase) return true;
			const phrase = ast.phrase.toLowerCase();
			return textLower.includes(phrase) || headingLower.includes(phrase);
		}
		case "filter": {
			const f = ast.field.toLowerCase();
			const val = ast.value.toLowerCase();
			if (f === "type" || f === "domain") {
				return domainLower === val || domainLower.includes(val);
			}
			if (f === "path" || f === "in") {
				return pathLower.includes(val);
			}
			if (f === "heading" || f === "title") {
				return headingLower.includes(val);
			}
			if (f === "kind") {
				return (candidate.kind || "").toLowerCase() === val;
			}
			return textLower.includes(val);
		}
		case "and":
			return evaluateQueryAst(ast.left, candidate) && evaluateQueryAst(ast.right, candidate);
		case "or":
			return evaluateQueryAst(ast.left, candidate) || evaluateQueryAst(ast.right, candidate);
		case "not":
			return !evaluateQueryAst(ast.child, candidate);
	}
}

/**
 * Format AST to a readable string representation.
 */
export function formatQueryAst(node: QueryNode): string {
	switch (node.type) {
		case "term":
			return `TERM("${node.value}")`;
		case "phrase":
			return `PHRASE("${node.phrase}")`;
		case "filter":
			return `FILTER(${node.field}:${node.value})`;
		case "not":
			return `NOT(${formatQueryAst(node.child)})`;
		case "and":
			return `(${formatQueryAst(node.left)} AND ${formatQueryAst(node.right)})`;
		case "or":
			return `(${formatQueryAst(node.left)} OR ${formatQueryAst(node.right)})`;
	}
}
