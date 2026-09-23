import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { buildIndex, type IndexResult, SymbolOracle } from "@kaioken/index";
import { scan, type ScanResult } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import {
	coverageOf,
	extractClaims,
	findPadding,
	verifyDocument,
} from "../src/index.ts";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const WALK = [
	"/** Walks the working tree once. */",
	"export function walkTree(root: string): string[] {",
	"\treturn [root];",
	"}",
	"",
	"export const DEFAULT_IGNORES = [];",
	"",
].join("\n");

const SOURCE = { "src/walk.ts": WALK, "README.md": "# Demo\n" };

async function repo(files: Record<string, string> = SOURCE): Promise<{
	root: string;
	scan: ScanResult;
	index: IndexResult;
	oracle: SymbolOracle;
}> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-verifycore-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	const scanned = await scan(root);
	const { index } = await buildIndex(scanned);
	return { root, scan: scanned, index, oracle: new SymbolOracle(index) };
}

describe("extractClaims", () => {
	it("extracts file, symbol, and anchor claims from code spans", () => {
		const text = "See `src/walk.ts` and `src/walk.ts:2-4` for `walkTree()`.";
		const claims = extractClaims(text);

		expect(claims.map((c) => c.kind)).toContain("file");
		expect(claims.map((c) => c.kind)).toContain("anchor");
		expect(claims.map((c) => c.kind)).toContain("symbol");
	});

	it("extracts attributed code fences as excerpt claims", () => {
		const doc = [
			"```ts src/walk.ts:2-4",
			"export function walkTree(root: string): string[] {",
			"\treturn [root];",
			"}",
			"```",
		].join("\n");

		const claims = extractClaims(doc);
		const excerpt = claims.find((c) => c.kind === "excerpt");
		expect(excerpt).toBeDefined();
		expect(excerpt?.file).toBe("src/walk.ts");
		expect(excerpt?.text).toContain("walkTree");
	});
});

describe("findPadding", () => {
	it("detects generic boilerplate phrases", () => {
		const body = "This module provides functionality for scanning and seamlessly integrates with tools.";
		const padding = findPadding(body);
		expect(padding.map((p) => p.phrase)).toContain("provides functionality for");
		expect(padding.map((p) => p.phrase)).toContain("seamlessly integrates");
	});
});

describe("verifyDocument", () => {
	it("grounds valid references against the oracle", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const body = "The `walkTree` function in `src/walk.ts` returns the paths.";

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/walk.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				try {
					const { readFile } = await import("node:fs/promises");
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
		});

		expect(report.grounded).toBeGreaterThan(0);
		expect(report.defects.filter((d) => d.kind === "unknown_symbol")).toHaveLength(0);
	});

	it("flags hallucinated symbols as defects", async () => {
		const { root, scan: scanned, oracle } = await repo();
		const body = "Call `nonExistentFunction()` to authenticate.";

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/walk.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				try {
					const { readFile } = await import("node:fs/promises");
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
		});

		const unknown = report.defects.filter((d) => d.kind === "unknown_symbol");
		expect(unknown.length).toBeGreaterThan(0);
		expect(unknown[0]?.claim).toBe("nonExistentFunction");
	});

	it("does not falsely ground fabricated paths with generic filenames", async () => {
		const { root, scan: scanned, oracle } = await repo({
			"src/walk.ts": 'const helper = "index.ts"; export function walkTree() { return helper; }',
			"README.md": "# Demo\n",
		});
		const body = "See `src/controllers/index.ts` and `lib/utils.ts` for details.";

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/walk.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				try {
					const { readFile } = await import("node:fs/promises");
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
		});

		const unknownFiles = report.defects.filter((d) => d.kind === "unknown_file");
		expect(unknownFiles.map((d) => d.claim)).toContain("src/controllers/index.ts");
		expect(unknownFiles.map((d) => d.claim)).toContain("lib/utils.ts");
	});

	it("does not ground generic filenames solely from scopeText", async () => {
		const { root, scan: scanned, oracle } = await repo({
			"src/walk.ts": '// Mentions types.ts and mod.rs in comments\nexport function walkTree() { return []; }',
			"README.md": "# Demo\n",
		});
		const body = "Refer to `foo/types.ts` for types.";

		const report = await verifyDocument({
			body,
			oracle,
			scope: ["src/walk.ts"],
			knownFiles: new Set(scanned.files.map((f) => f.path)),
			readSource: async (p) => {
				try {
					const { readFile } = await import("node:fs/promises");
					return await readFile(join(root, p), "utf8");
				} catch {
					return null;
				}
			},
		});

		const unknownFiles = report.defects.filter((d) => d.kind === "unknown_file");
		expect(unknownFiles.map((d) => d.claim)).toContain("foo/types.ts");
	});
});

