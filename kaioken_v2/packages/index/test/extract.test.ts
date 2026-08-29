import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { extractFile, type SymbolRecord } from "../dist/index.js";

/**
 * The fixture suite. Declaration counts and line ranges are asserted exactly,
 * because everything downstream trusts them: the verifier calls a symbol real or
 * invented on this basis, and the anchor resolver quotes these ranges back. An
 * approximate index is worse than no index.
 */

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "langrepo");

async function extract(file: string, language: string) {
	const source = await readFile(join(FIXTURES, file), "utf8");
	return extractFile({ path: file, language, hash: "fixture", source });
}

function find(symbols: SymbolRecord[], name: string, parent?: string): SymbolRecord {
	const match = symbols.find((s) => s.name === name && s.parent === parent);
	if (!match) throw new Error(`no symbol ${parent ? `${parent}.` : ""}${name}`);
	return match;
}

/** Every symbol as `kind name start-end`, which makes a diff readable on failure. */
function shape(symbols: SymbolRecord[]): string[] {
	return symbols.map(
		(s) =>
			`${s.exported ? "+" : "-"} ${s.kind} ${s.parent ? `${s.parent}.` : ""}${s.name} ${s.startLine}-${s.endLine}`,
	);
}

describe("go", () => {
	it("extracts every declaration with exact line ranges", async () => {
		const file = await extract("sample.go", "go");
		expect(file.unparsed).toBe(false);
		expect(file.lineCount).toBe(43);
		expect(shape(file.symbols)).toEqual([
			"+ function Add 7-9",
			"- function unexported 11-13",
			"+ interface Shape 16-18",
			"+ struct Rect 21-24",
			"+ method Area 27-29",
			"+ const Pi 31-31",
			"+ var Registry 33-33",
			"+ type Alias 35-35",
			"+ type Kind 38-38",
			"+ const KindFunc 41-41",
			"+ const KindType 42-42",
		]);
	});

	it("gives each member of a grouped const block its own line range", async () => {
		const { symbols } = await extract("sample.go", "go");
		// The whole block spans 40-43. Reporting that range for every member
		// would make anchor resolution point at the block instead of the line.
		expect(find(symbols, "KindFunc").startLine).toBe(41);
		expect(find(symbols, "KindFunc").endLine).toBe(41);
		expect(find(symbols, "KindFunc").signature).toBe('KindFunc Kind = "func"');
		expect(find(symbols, "KindType").startLine).toBe(42);
	});

	it("does not attribute a block's doc comment to each of its members", async () => {
		const { symbols } = await extract("sample.go", "go");
		expect(find(symbols, "KindFunc").doc).toBe("");
		expect(find(symbols, "Kind").doc).toBe("Kind classifies a declaration.");
	});

	it("uses the capital-letter rule for export status", async () => {
		const { symbols } = await extract("sample.go", "go");
		expect(find(symbols, "Add").exported).toBe(true);
		expect(find(symbols, "unexported").exported).toBe(false);
	});

	it("keeps a multi-line doc comment whole and drops the body from the signature", async () => {
		const { symbols } = await extract("sample.go", "go");
		const add = find(symbols, "Add");
		expect(add.signature).toBe("func Add(a, b int) int");
		expect(add.doc).toBe(
			"Add returns the sum of a and b.\nIt exists so the fixture has a two-line doc comment.",
		);
	});

	it("keeps the right-hand side of a const, which is the declaration's meaning", async () => {
		const { symbols } = await extract("sample.go", "go");
		expect(find(symbols, "Pi").signature).toBe("const Pi = 3.14159");
		expect(find(symbols, "Alias").signature).toBe("type Alias = string");
	});
});

describe("python", () => {
	it("extracts every declaration with exact line ranges", async () => {
		const file = await extract("sample.py", "python");
		expect(file.lineCount).toBe(24);
		expect(shape(file.symbols)).toEqual([
			"+ function add 4-6",
			"- function _private 9-10",
			"+ class Rect 13-21",
			"+ method Rect.area 16-18",
			"- method Rect._hidden 20-21",
			"+ var MAX_SIZE 24-24",
		]);
	});

	it("reads the docstring, not a preceding comment", async () => {
		const { symbols } = await extract("sample.py", "python");
		expect(find(symbols, "add").doc).toBe("Return the sum of a and b.");
		expect(find(symbols, "area", "Rect").doc).toBe("Compute the area.");
	});

	it("does not attach the module docstring to the first declaration", async () => {
		const { symbols } = await extract("sample.py", "python");
		expect(find(symbols, "add").doc).not.toContain("Module docstring");
	});

	it("treats a leading underscore as unexported", async () => {
		const { symbols } = await extract("sample.py", "python");
		expect(find(symbols, "_private").exported).toBe(false);
		expect(find(symbols, "_hidden", "Rect").exported).toBe(false);
	});

	it("indexes module-level assignment but not locals", async () => {
		const { symbols } = await extract("sample.py", "python");
		expect(find(symbols, "MAX_SIZE").kind).toBe("var");
		expect(symbols.some((s) => s.name === "self")).toBe(false);
	});
});

describe("rust", () => {
	it("extracts every declaration with exact line ranges", async () => {
		const file = await extract("sample.rs", "rust");
		expect(file.lineCount).toBe(35);
		expect(shape(file.symbols)).toEqual([
			"+ function add 4-6",
			"- function private_helper 8-10",
			"+ struct Rect 13-16",
			"+ trait Shape 18-20",
			"+ method Shape.area 19-19",
			"- impl Rect 22-26",
			"- method Rect.area 23-25",
			"+ enum Kind 28-31",
			"+ const MAX 33-33",
			"- type Alias 35-35",
		]);
	});

	it("reads a /// doc comment despite the node swallowing its newline", async () => {
		const { symbols } = await extract("sample.rs", "rust");
		expect(find(symbols, "add").doc).toBe("Adds two numbers.");
	});

	it("does not attach the //! crate comment across a blank line", async () => {
		const { symbols } = await extract("sample.rs", "rust");
		expect(find(symbols, "add").doc).not.toContain("Crate docs");
	});

	it("gives a public trait's methods the trait's visibility", async () => {
		const { symbols } = await extract("sample.rs", "rust");
		expect(find(symbols, "Shape").exported).toBe(true);
		expect(find(symbols, "area", "Shape").exported).toBe(true);
	});

	it("uses pub, not naming, for export status", async () => {
		const { symbols } = await extract("sample.rs", "rust");
		expect(find(symbols, "private_helper").exported).toBe(false);
		expect(find(symbols, "Alias").exported).toBe(false);
	});
});

describe("typescript", () => {
	it("extracts every declaration with exact line ranges", async () => {
		const file = await extract("sample.ts", "typescript");
		expect(file.lineCount).toBe(42);
		expect(shape(file.symbols)).toEqual([
			"+ function add 2-4",
			"- function notExported 6-8",
			"+ interface Shape 11-13",
			"+ method Shape.area 12-12",
			"+ type Alias 15-15",
			"+ class Rect 18-33",
			"+ method Rect.constructor 19-22",
			"+ method Rect.area 24-26",
			"- method Rect.scale 28-30",
			"- var Rect.label 32-32",
			"+ const MAX 35-35",
			"- const internalArrow 37-37",
			"+ enum Kind 39-42",
		]);
	});

	it("does not let a private member inherit its class's export", async () => {
		const { symbols } = await extract("sample.ts", "typescript");
		expect(find(symbols, "Rect").exported).toBe(true);
		expect(find(symbols, "area", "Rect").exported).toBe(true);
		expect(find(symbols, "scale", "Rect").exported).toBe(false);
		expect(find(symbols, "label", "Rect").exported).toBe(false);
	});

	it("finds a doc comment that sits in front of the export wrapper", async () => {
		const { symbols } = await extract("sample.ts", "typescript");
		expect(find(symbols, "add").doc).toBe("Adds two numbers.");
		expect(find(symbols, "Shape").doc).toBe("Anything that can report its area.");
	});

	it("indexes top-level arrow bindings, where much of the logic lives", async () => {
		const { symbols } = await extract("sample.ts", "typescript");
		const arrow = find(symbols, "internalArrow");
		expect(arrow.kind).toBe("const");
		expect(arrow.exported).toBe(false);
		expect(arrow.signature).toBe("const internalArrow = (x: number): number => x * 2;");
	});

	it("records each top-level binding once, not once per matching pattern", async () => {
		const { symbols } = await extract("sample.ts", "typescript");
		expect(symbols.filter((s) => s.name === "MAX")).toHaveLength(1);
	});
});

describe("javascript", () => {
	it("extracts every declaration with exact line ranges", async () => {
		const file = await extract("sample.js", "javascript");
		expect(file.lineCount).toBe(18);
		expect(shape(file.symbols)).toEqual([
			"+ function add 2-4",
			"- function notExported 6-8",
			"+ class Rect 10-14",
			"+ method Rect.area 11-13",
			"+ const MAX 16-16",
			"- const arrow 18-18",
		]);
	});

	it("reads a // doc comment", async () => {
		const { symbols } = await extract("sample.js", "javascript");
		expect(find(symbols, "add").doc).toBe("Adds two numbers.");
	});
});

describe("unbound languages", () => {
	it("reports a file as unparsed rather than pretending it has no declarations", async () => {
		const file = await extractFile({
			path: "a.rb",
			language: "ruby",
			hash: "h",
			source: "def hello\nend\n",
		});
		expect(file.unparsed).toBe(true);
		expect(file.symbols).toEqual([]);
		expect(file.lineCount).toBe(2);
	});
});
