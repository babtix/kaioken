import { describe, expect, it } from "vitest";
import {
	type FileMap,
	type IndexResult,
	resolveExcerpt,
	resolveRange,
	SymbolOracle,
} from "../dist/index.js";

/**
 * The index's other two jobs. These are asserted separately from extraction
 * because phase 4 depends on them behaving definitively — a "maybe" from the
 * oracle is what lets an invented symbol ship, and a fuzzy anchor is what lets a
 * paraphrase pass as a quotation.
 */

const SOURCE = [
	"package sample", // 1
	"", // 2
	"func Add(a, b int) int {", // 3
	"\treturn a + b", // 4
	"}", // 5
	"", // 6
	"func Sub(a, b int) int {", // 7
	"\treturn a - b", // 8
	"}", // 9
].join("\n");

const FILE: FileMap = {
	path: "sample.go",
	language: "go",
	hash: "h",
	lineCount: 9,
	unparsed: false,
	symbols: [
		{
			name: "Add",
			kind: "function",
			signature: "func Add(a, b int) int",
			startLine: 3,
			endLine: 5,
			exported: true,
			doc: "",
		},
		{
			name: "Sub",
			kind: "function",
			signature: "func Sub(a, b int) int",
			startLine: 7,
			endLine: 9,
			exported: true,
			doc: "",
		},
	],
};

const INDEX: IndexResult = {
	root: "/repo",
	builtAt: "2026-01-01T00:00:00.000Z",
	fileCount: 1,
	symbolCount: 2,
	unparsedLanguages: {},
	files: [FILE],
};

describe("grounding oracle", () => {
	const oracle = new SymbolOracle(INDEX);

	it("answers definitively for a declared symbol", () => {
		expect(oracle.has("Add")).toBe(true);
		expect(oracle.lookup("Add")).toHaveLength(1);
		expect(oracle.lookup("Add")[0]?.path).toBe("sample.go");
	});

	it("answers definitively for a symbol the repository does not declare", () => {
		expect(oracle.has("Multiply")).toBe(false);
		expect(oracle.lookup("Multiply")).toEqual([]);
	});

	it("returns the misses, which is the shape a defect report needs", () => {
		expect(oracle.unknownNames(["Add", "Multiply", "Sub", "Divide"])).toEqual([
			"Multiply",
			"Divide",
		]);
	});

	it("scopes a lookup to a file when a claim names both", () => {
		expect(oracle.lookupIn("sample.go", "Add")?.startLine).toBe(3);
		expect(oracle.lookupIn("other.go", "Add")).toBeNull();
		expect(oracle.lookupIn("sample.go", "Nope")).toBeNull();
	});

	it("lists exported declarations for the coverage rubric", () => {
		expect(oracle.exported().map((e) => e.symbol.name).sort()).toEqual(["Add", "Sub"]);
	});
});

describe("anchor resolution", () => {
	it("resolves a verbatim excerpt to exact lines and its enclosing symbol", () => {
		const result = resolveExcerpt(FILE, SOURCE, "func Add(a, b int) int {\n\treturn a + b\n}");
		expect(result.resolved).toBe(true);
		expect(result.anchor).toEqual({
			path: "sample.go",
			startLine: 3,
			endLine: 5,
			symbol: "Add",
		});
	});

	it("tolerates re-indentation, which is presentation rather than misquotation", () => {
		const result = resolveExcerpt(FILE, SOURCE, "    func Add(a, b int) int {\n    return a + b\n    }");
		expect(result.resolved).toBe(true);
		expect(result.anchor?.startLine).toBe(3);
	});

	it("refuses an excerpt the file does not contain", () => {
		const result = resolveExcerpt(FILE, SOURCE, "func Multiply(a, b int) int {");
		expect(result.resolved).toBe(false);
		expect(result.reason).toBe("excerpt_not_found");
	});

	it("refuses a paraphrase rather than matching it loosely", () => {
		const result = resolveExcerpt(FILE, SOURCE, "func Add(a int, b int) int {");
		expect(result.resolved).toBe(false);
		expect(result.reason).toBe("excerpt_not_found");
	});

	it("reports ambiguity instead of guessing which occurrence was meant", () => {
		const result = resolveExcerpt(FILE, SOURCE, "}");
		expect(result.resolved).toBe(false);
		expect(result.reason).toBe("excerpt_ambiguous");
		expect(result.matchCount).toBe(2);
	});

	it("reports an unindexed file rather than silently failing to match", () => {
		expect(resolveExcerpt(null, SOURCE, "anything").reason).toBe("file_not_indexed");
	});

	it("validates a claimed line range against the file's real extent", () => {
		expect(resolveRange(FILE, 3, 5).anchor?.symbol).toBe("Add");
		expect(resolveRange(FILE, 3, 99).resolved).toBe(false);
		expect(resolveRange(FILE, 0, 2).resolved).toBe(false);
	});

	it("picks the innermost enclosing declaration", () => {
		expect(resolveRange(FILE, 8, 8).anchor?.symbol).toBe("Sub");
		expect(resolveRange(FILE, 1, 1).anchor?.symbol).toBeUndefined();
	});
});
