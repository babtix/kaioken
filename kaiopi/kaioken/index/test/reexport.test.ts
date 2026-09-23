import { describe, expect, it } from "vitest";
import {
	type FileMap,
	type IndexResult,
	ReExportEngine,
	SymbolOracle,
} from "../src/index.ts";

describe("multi-hop re-export chain resolution engine (UX-0621-UX-0630)", () => {
	const files: FileMap[] = [
		{
			path: "src/deep/core.ts",
			language: "typescript",
			hash: "h_core",
			lineCount: 10,
			unparsed: false,
			symbols: [
				{
					name: "primitiveEngine",
					kind: "function",
					signature: "function primitiveEngine(): void",
					startLine: 1,
					endLine: 3,
					exported: true,
					doc: "Core primitive",
				},
			],
		},
		{
			path: "src/middle/adapter.ts",
			language: "typescript",
			hash: "h_adapter",
			lineCount: 5,
			unparsed: false,
			symbols: [],
			reexports: [
				{
					name: "engineAlias",
					importedName: "primitiveEngine",
					from: "../deep/core",
				},
			],
		},
		{
			path: "src/facade/gateway.ts",
			language: "typescript",
			hash: "h_gateway",
			lineCount: 5,
			unparsed: false,
			symbols: [],
			reexports: [
				{
					name: "publicEngine",
					importedName: "engineAlias",
					from: "../middle/adapter",
				},
			],
		},
		{
			path: "src/index.ts",
			language: "typescript",
			hash: "h_index",
			lineCount: 5,
			unparsed: false,
			symbols: [],
			reexports: [
				{
					name: "*",
					from: "./facade/gateway",
				},
			],
		},
	];

	it("resolves multi-hop 3-level chain tracing each intermediate hop", () => {
		const engine = new ReExportEngine(files);
		const chainResult = engine.resolveChain("src/index.ts", "publicEngine");

		expect(chainResult.found).toBe(true);
		expect(chainResult.cyclic).toBe(false);
		expect(chainResult.depth).toBe(3);
		expect(chainResult.declaration?.path).toBe("src/deep/core.ts");
		expect(chainResult.declaration?.symbol.name).toBe("primitiveEngine");

		expect(chainResult.chain).toHaveLength(3);
		expect(chainResult.chain[0]?.fromPath).toBe("src/index.ts");
		expect(chainResult.chain[0]?.toPath).toBe("src/facade/gateway.ts");
		expect(chainResult.chain[1]?.fromPath).toBe("src/facade/gateway.ts");
		expect(chainResult.chain[1]?.toPath).toBe("src/middle/adapter.ts");
		expect(chainResult.chain[2]?.fromPath).toBe("src/middle/adapter.ts");
		expect(chainResult.chain[2]?.toPath).toBe("src/deep/core.ts");
	});

	it("guards against infinite recursion on circular re-export loops", () => {
		const cyclicFiles: FileMap[] = [
			{
				path: "cycle/a.ts",
				language: "typescript",
				hash: "h_a",
				lineCount: 5,
				unparsed: false,
				symbols: [],
				reexports: [{ name: "loop", from: "./b" }],
			},
			{
				path: "cycle/b.ts",
				language: "typescript",
				hash: "h_b",
				lineCount: 5,
				unparsed: false,
				symbols: [],
				reexports: [{ name: "loop", from: "./c" }],
			},
			{
				path: "cycle/c.ts",
				language: "typescript",
				hash: "h_c",
				lineCount: 5,
				unparsed: false,
				symbols: [],
				reexports: [{ name: "loop", from: "./a" }],
			},
		];

		const engine = new ReExportEngine(cyclicFiles);
		const result = engine.resolveChain("cycle/a.ts", "loop");
		expect(result.found).toBe(false);
		expect(result.cyclic).toBe(true);
	});

	it("resolves multi-hop re-exports across Python modules", () => {
		const pyFiles: FileMap[] = [
			{
				path: "pkg/sub/math.py",
				language: "python",
				hash: "py_math",
				lineCount: 10,
				unparsed: false,
				symbols: [
					{
						name: "calculate",
						kind: "function",
						signature: "def calculate(n):",
						startLine: 1,
						endLine: 2,
						exported: true,
						doc: "",
					},
				],
			},
			{
				path: "pkg/sub/__init__.py",
				language: "python",
				hash: "py_sub_init",
				lineCount: 5,
				unparsed: false,
				symbols: [],
				reexports: [
					{
						name: "compute",
						importedName: "calculate",
						from: "./math",
					},
				],
			},
			{
				path: "pkg/__init__.py",
				language: "python",
				hash: "py_init",
				lineCount: 5,
				unparsed: false,
				symbols: [],
				reexports: [
					{
						name: "compute",
						importedName: "compute",
						from: "./sub",
					},
				],
			},
		];

		const engine = new ReExportEngine(pyFiles);
		const res = engine.resolveChain("pkg/__init__.py", "compute");
		expect(res.found).toBe(true);
		expect(res.declaration?.path).toBe("pkg/sub/math.py");
		expect(res.declaration?.symbol.name).toBe("calculate");
	});

	it("resolves Go dot-import wildcard re-exports", () => {
		const goFiles: FileMap[] = [
			{
				path: "core/math.go",
				language: "go",
				hash: "go_math",
				lineCount: 10,
				unparsed: false,
				symbols: [
					{
						name: "Sum",
						kind: "function",
						signature: "func Sum(a, b int) int",
						startLine: 3,
						endLine: 5,
						exported: true,
						doc: "",
					},
				],
			},
			{
				path: "api/service.go",
				language: "go",
				hash: "go_svc",
				lineCount: 10,
				unparsed: false,
				symbols: [],
				reexports: [
					{
						name: "*",
						from: "../core/math",
					},
				],
			},
		];

		const engine = new ReExportEngine(goFiles);
		const loc = engine.resolve("api/service.go", "Sum");
		expect(loc).not.toBeNull();
		expect(loc?.path).toBe("core/math.go");
		expect(loc?.symbol.name).toBe("Sum");
	});

	it("performs fuzzy symbol search matching prefixes and substrings across re-exports", () => {
		const index: IndexResult = {
			root: "/repo",
			builtAt: "2026-01-01T00:00:00.000Z",
			fileCount: files.length,
			symbolCount: 1,
			unparsedLanguages: {},
			files,
		};

		const oracle = new SymbolOracle(index);
		const matches = oracle.findFuzzy("primEng");
		expect(matches.length).toBeGreaterThan(0);
		expect(matches[0]?.symbol.name).toBe("primitiveEngine");

		const exact = oracle.findFuzzy("primitiveEngine");
		expect(exact[0]?.symbol.name).toBe("primitiveEngine");
	});
});
