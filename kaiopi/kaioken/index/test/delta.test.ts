import { describe, expect, it } from "vitest";
import {
	applyIndexDelta,
	computeIndexDelta,
	diffFileMaps,
	diffSymbolRecords,
	type FileMap,
	type IndexResult,
	type SymbolRecord,
} from "../src/index.ts";

describe("incremental AST delta indexing (UX-0601-UX-0610 / UX-0681-UX-0690)", () => {
	const symA: SymbolRecord = {
		name: "FuncA",
		kind: "function",
		signature: "function FuncA(): void",
		startLine: 1,
		endLine: 5,
		exported: true,
		doc: "Original doc",
	};

	const symB: SymbolRecord = {
		name: "FuncB",
		kind: "function",
		signature: "function FuncB(): number",
		startLine: 7,
		endLine: 10,
		exported: false,
		doc: "",
	};

	it("identifies added and removed symbols", () => {
		const delta = diffSymbolRecords([symA], [symB]);
		expect(delta.removed).toHaveLength(1);
		expect(delta.removed[0]?.name).toBe("FuncA");
		expect(delta.added).toHaveLength(1);
		expect(delta.added[0]?.name).toBe("FuncB");
		expect(delta.modified).toHaveLength(0);
	});

	it("identifies modified symbols with precise change categories", () => {
		const modifiedSymA: SymbolRecord = {
			...symA,
			signature: "function FuncA(val: number): void",
			startLine: 2,
			endLine: 6,
			doc: "Updated doc",
			exported: false,
		};

		const delta = diffSymbolRecords([symA], [modifiedSymA]);
		expect(delta.added).toHaveLength(0);
		expect(delta.removed).toHaveLength(0);
		expect(delta.modified).toHaveLength(1);

		const mod = delta.modified[0]!;
		expect(mod.oldSymbol.name).toBe("FuncA");
		expect(mod.newSymbol.name).toBe("FuncA");
		expect(mod.diffKinds).toContain("signature");
		expect(mod.diffKinds).toContain("lines");
		expect(mod.diffKinds).toContain("doc");
		expect(mod.diffKinds).toContain("exported");
	});

	it("computes comprehensive delta across an entire repository index", () => {
		const oldIndex: IndexResult = {
			root: "/mock/repo",
			builtAt: "2026-01-01T00:00:00.000Z",
			fileCount: 2,
			symbolCount: 2,
			unparsedLanguages: {},
			files: [
				{
					path: "src/a.ts",
					language: "typescript",
					hash: "h1",
					lineCount: 10,
					unparsed: false,
					symbols: [symA],
				},
				{
					path: "src/deleted.ts",
					language: "typescript",
					hash: "h2",
					lineCount: 5,
					unparsed: false,
					symbols: [symB],
				},
			],
		};

		const updatedSymA: SymbolRecord = {
			...symA,
			signature: "function FuncA(x: string): void",
		};

		const newSymC: SymbolRecord = {
			name: "NewSym",
			kind: "const",
			signature: "const NewSym = 42",
			startLine: 1,
			endLine: 1,
			exported: true,
			doc: "",
		};

		const newIndex: IndexResult = {
			root: "/mock/repo",
			builtAt: "2026-01-02T00:00:00.000Z",
			fileCount: 2,
			symbolCount: 2,
			unparsedLanguages: {},
			files: [
				{
					path: "src/a.ts",
					language: "typescript",
					hash: "h1-modified",
					lineCount: 12,
					unparsed: false,
					symbols: [updatedSymA],
				},
				{
					path: "src/new.ts",
					language: "typescript",
					hash: "h3",
					lineCount: 5,
					unparsed: false,
					symbols: [newSymC],
				},
			],
		};

		const indexDelta = computeIndexDelta(oldIndex, newIndex);
		expect(indexDelta.hasChanges).toBe(true);
		expect(indexDelta.files.added).toEqual(["src/new.ts"]);
		expect(indexDelta.files.deleted).toEqual(["src/deleted.ts"]);
		expect(indexDelta.files.modified).toEqual(["src/a.ts"]);
		expect(indexDelta.files.unchanged).toEqual([]);

		expect(indexDelta.summary.totalAdded).toBe(1);
		expect(indexDelta.summary.totalRemoved).toBe(1);
		expect(indexDelta.summary.totalModified).toBe(1);

		const aDelta = indexDelta.symbols["src/a.ts"]!;
		expect(aDelta.modified).toHaveLength(1);
		expect(aDelta.modified[0]?.diffKinds).toEqual(["signature"]);
	});

	it("applies incremental file updates and deletions without full rescanning", async () => {
		const baseIndex: IndexResult = {
			root: "/mock/repo",
			builtAt: "2026-01-01T00:00:00.000Z",
			fileCount: 2,
			symbolCount: 2,
			unparsedLanguages: {},
			files: [
				{
					path: "src/math.ts",
					language: "typescript",
					hash: "h_math",
					lineCount: 10,
					unparsed: false,
					symbols: [symA],
				},
				{
					path: "src/old.ts",
					language: "typescript",
					hash: "h_old",
					lineCount: 5,
					unparsed: false,
					symbols: [symB],
				},
			],
		};

		const outcome = await applyIndexDelta(baseIndex, [
			{
				path: "src/old.ts",
				deleted: true,
			},
			{
				path: "src/math.ts",
				language: "typescript",
				source: "export function FuncA(val: number): void { return; }\nexport const PI = 3.14;\n",
				hash: "h_math_v2",
			},
		]);

		expect(outcome.index.fileCount).toBe(1);
		expect(outcome.index.files[0]?.path).toBe("src/math.ts");
		expect(outcome.stats.parsed).toBe(1);
		expect(outcome.delta.files.deleted).toEqual(["src/old.ts"]);
		expect(outcome.delta.files.modified).toEqual(["src/math.ts"]);
		expect(outcome.index.symbolCount).toBe(2); // FuncA + PI
	});
});
