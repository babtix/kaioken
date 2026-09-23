import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	buildSymbolPreviewCard,
	extractFallbackDeclarations,
	type IndexResult,
	renderPlainPreviewCard,
	renderSymbolPreviewCard,
	SymbolOracle,
	type SymbolRecord,
} from "../src/index.ts";

const tempDirs: string[] = [];

afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((d) => rm(d, { recursive: true, force: true })));
});

describe("scope-aware symbol definition preview cards (UX-0631-UX-0640)", () => {
	it("builds a preview card with exact line ranges and surrounding context lines", async () => {
		const tempRoot = await mkdtemp(join(tmpdir(), "preview-card-"));
		tempDirs.push(tempRoot);

		const sourceCode = [
			"// Order management module",
			"import { Database } from './db';",
			"",
			"export class OrderManager {",
			"  /** Process incoming user order */",
			"  processOrder(id: string): boolean {",
			"    return true;",
			"  }",
			"}",
			"",
			"export const defaultManager = new OrderManager();",
		].join("\n");

		await writeFile(join(tempRoot, "order.ts"), sourceCode, "utf8");

		const methodSym: SymbolRecord = {
			name: "processOrder",
			kind: "method",
			signature: "processOrder(id: string): boolean",
			startLine: 6,
			endLine: 8,
			exported: true,
			doc: "Process incoming user order",
			parent: "OrderManager",
		};

		const classSym: SymbolRecord = {
			name: "OrderManager",
			kind: "class",
			signature: "class OrderManager",
			startLine: 4,
			endLine: 9,
			exported: true,
			doc: "",
		};

		const index: IndexResult = {
			root: tempRoot,
			builtAt: new Date().toISOString(),
			fileCount: 1,
			symbolCount: 2,
			unparsedLanguages: {},
			files: [
				{
					path: "order.ts",
					language: "typescript",
					hash: "h_order",
					lineCount: 11,
					unparsed: false,
					symbols: [classSym, methodSym],
				},
			],
		};

		const oracle = new SymbolOracle(index);
		const card = await buildSymbolPreviewCard(oracle, tempRoot, "processOrder", {
			contextLines: 2,
		});

		expect(card).not.toBeNull();
		expect(card!.symbol.name).toBe("processOrder");
		expect(card!.scopeChain).toEqual(["OrderManager", "processOrder"]);
		expect(card!.exported).toBe(true);
		expect(card!.lines).toEqual({ start: 6, end: 8 });

		// Snippet includes lines 4 to 10 (context lines +/- 2)
		expect(card!.snippet.startLine).toBe(4);
		expect(card!.snippet.lines.some((l) => l.isDeclaration && l.lineNumber === 6)).toBe(true);

		// Render plain ASCII card
		const plainOutput = renderPlainPreviewCard(card!);
		expect(plainOutput).toContain("+- [TYPESCRIPT] method processOrder (order.ts:6-8) [EXPORTED]");
		expect(plainOutput).toContain("Scope: OrderManager › processOrder");
		expect(plainOutput).toContain("processOrder(id: string): boolean");
		expect(plainOutput).toContain("Process incoming user order");

		// Render ANSI styled card
		const ansiOutput = renderSymbolPreviewCard(card!, { color: true, plain: false });
		expect(ansiOutput).toContain("processOrder");
	});

	it("extracts declarations across 10 languages using regex fallback when unparsed", () => {
		const tsResult = extractFallbackDeclarations({
			path: "a.ts",
			language: "typescript",
			hash: "h",
			source: "export function runTask(): void {}\nexport class Worker {}\nexport { a as b } from './mod';\n",
		});
		expect(tsResult.symbols.map((s) => s.name)).toEqual(["runTask", "Worker"]);
		expect(tsResult.reexports).toEqual([{ name: "b", importedName: "a", from: "./mod" }]);

		const pyResult = extractFallbackDeclarations({
			path: "b.py",
			language: "python",
			hash: "h",
			source: "from .calc import add as sum_fn\ndef execute_all():\n    pass\n",
		});
		expect(pyResult.symbols.map((s) => s.name)).toEqual(["execute_all"]);
		expect(pyResult.reexports).toEqual([{ name: "sum_fn", importedName: "add", from: ".calc" }]);

		const goResult = extractFallbackDeclarations({
			path: "c.go",
			language: "go",
			hash: "h",
			source: "func PublicService() {}\ntype User struct {}\n",
		});
		expect(goResult.symbols.map((s) => s.name)).toEqual(["PublicService", "User"]);

		const rsResult = extractFallbackDeclarations({
			path: "d.rs",
			language: "rust",
			hash: "h",
			source: "pub fn start_engine() {}\npub struct Config {}\n",
		});
		expect(rsResult.symbols.map((s) => s.name)).toEqual(["start_engine", "Config"]);

		const sqlResult = extractFallbackDeclarations({
			path: "schema.sql",
			language: "sql",
			hash: "h",
			source: "CREATE TABLE users (id INT PRIMARY KEY);\n",
		});
		expect(sqlResult.symbols.map((s) => s.name)).toEqual(["users"]);
	});
});
