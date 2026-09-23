import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { type ScanResult, scan } from "../dist/index.js";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/** Build a throwaway repository from a path -> content map. */
async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		const abs = join(root, path);
		await mkdir(dirname(abs), { recursive: true });
		await writeFile(abs, content, "utf8");
	}
	return root;
}

function paths(result: ScanResult): string[] {
	return result.files.map((f) => f.path);
}

describe("traversal", () => {
	it("produces repo-relative POSIX paths, sorted", async () => {
		const root = await repo({
			"b.ts": "export const b = 1;\n",
			"a.ts": "export const a = 1;\n",
			"src/nested/c.ts": "export const c = 1;\n",
		});
		const result = await scan(root);
		expect(paths(result)).toEqual(["a.ts", "b.ts", "src/nested/c.ts"]);
	});

	it("records size, content hash and language", async () => {
		const root = await repo({ "a.py": "x = 1\n" });
		const [file] = (await scan(root)).files;
		expect(file?.language).toBe("python");
		expect(file?.size).toBe(6);
		expect(file?.hash).toMatch(/^[0-9a-f]{64}$/);
	});

	it("gives identical content an identical hash, which is what drives reindex", async () => {
		const root = await repo({ "a.ts": "export const x = 1;\n", "b.ts": "export const x = 1;\n" });
		const [a, b] = (await scan(root)).files;
		expect(a?.hash).toBe(b?.hash);
	});
});

describe("ignore rules", () => {
	it("excludes the built-in default set without any ignore file", async () => {
		const root = await repo({
			"src/a.ts": "export const a = 1;\n",
			"node_modules/pkg/index.js": "module.exports = 1;\n",
			".git/config": "[core]\n",
		});
		expect(paths(await scan(root))).toEqual(["src/a.ts"]);
	});

	it("honours a root .gitignore", async () => {
		const root = await repo({
			".gitignore": "build/\n*.log\n",
			"src/a.ts": "export const a = 1;\n",
			"build/out.js": "1\n",
			"debug.log": "noise\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "src/a.ts"]);
	});

	it("scopes a nested .gitignore to its own directory", async () => {
		const root = await repo({
			"src/.gitignore": "skip.ts\n",
			"src/skip.ts": "export const s = 1;\n",
			"src/keep.ts": "export const k = 1;\n",
			// The same filename outside src/ is unaffected by src/'s rules.
			"skip.ts": "export const t = 1;\n",
		});
		expect(paths(await scan(root))).toEqual(["skip.ts", "src/.gitignore", "src/keep.ts"]);
	});

	it("honours negation, so a re-included file survives", async () => {
		const root = await repo({
			".gitignore": "*.log\n!keep.log\n",
			"drop.log": "x\n",
			"keep.log": "y\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "keep.log"]);
	});

	it("honours .kaiokenignore alongside .gitignore", async () => {
		const root = await repo({
			".kaiokenignore": "notes/\n",
			"notes/todo.md": "x\n",
			"README.md": "y\n",
		});
		expect(paths(await scan(root))).toEqual([".kaiokenignore", "README.md"]);
	});

	it("includes dotfiles that no rule excludes", async () => {
		const root = await repo({
			".editorconfig": "root = true\n",
			".github/workflows/ci.yml": "on: push\n",
			"a.ts": "export const a = 1;\n",
		});
		expect(paths(await scan(root))).toEqual([".editorconfig", ".github/workflows/ci.yml", "a.ts"]);
	});

	it("accepts extra patterns from the caller", async () => {
		const root = await repo({ "a.ts": "1\n", "b.ts": "2\n" });
		expect(paths(await scan(root, { ignore: ["b.ts"] }))).toEqual(["a.ts"]);
	});
});

describe("binary handling", () => {
	it("marks a file containing a null byte as binary and skips text rules", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
		roots.push(root);
		await writeFile(join(root, "blob.bin"), Buffer.from([0x00, 0x01, 0x02, 0x00]));
		const [file] = (await scan(root)).files;
		expect(file?.binary).toBe(true);
		expect(file?.risk).not.toContain("credentials");
	});

	it("flags a large binary but not a large text file", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
		roots.push(root);
		await writeFile(join(root, "big.bin"), Buffer.alloc(4096, 1).fill(0, 0, 1));
		await writeFile(join(root, "big.txt"), "a".repeat(4096));
		const result = await scan(root, { largeBinaryBytes: 1024 });
		const big = result.files.find((f) => f.path === "big.bin");
		const text = result.files.find((f) => f.path === "big.txt");
		expect(big?.risk).toContain("large_binary");
		expect(text?.risk).not.toContain("large_binary");
	});
});
