import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BufferPool, IgnoreStack, type ScanProgress, type ScanResult, scan } from "../src/index.ts";

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

	it.runIf(process.platform !== "win32")(
		"scans case-variant sibling directories on case-sensitive platforms",
		async () => {
			const root = await repo({
				"Component/a.ts": "1\n",
				"component/b.ts": "2\n",
			});
			const result = await scan(root);
			expect(paths(result)).toEqual(["Component/a.ts", "component/b.ts"]);
		},
	);
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

	it("honours child .gitignore negation overriding parent ignore", async () => {
		const root = await repo({
			".gitignore": "*.log\n",
			"src/.gitignore": "!important.log\n",
			"drop.log": "x\n",
			"src/drop.log": "x\n",
			"src/important.log": "keep\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "src/.gitignore", "src/important.log"]);
	});

	it("does not re-include a negated file if parent directory is excluded", async () => {
		const root = await repo({
			".gitignore": "excluded/\n!excluded/file.txt\n",
			"excluded/file.txt": "secret\n",
			"a.ts": "export const a = 1;\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "a.ts"]);
	});

	it("does not re-include a negated file via nested .gitignore if parent directory is excluded", async () => {
		const root = await repo({
			".gitignore": "excluded/\n",
			"excluded/.gitignore": "!file.txt\n",
			"excluded/file.txt": "secret\n",
			"a.ts": "export const a = 1;\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "a.ts"]);
	});

	it("re-includes a file when parent directory itself is not excluded", async () => {
		const root = await repo({
			".gitignore": "dir/*\n!dir/keep.txt\n",
			"dir/drop.txt": "1\n",
			"dir/keep.txt": "2\n",
		});
		expect(paths(await scan(root))).toEqual([".gitignore", "dir/keep.txt"]);
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

describe("binary handling and large files", () => {
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

	it("flags secrets past the 64KB mark in large files", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
		roots.push(root);
		const padding = "x".repeat(70 * 1024);
		const secret = 'const key = "AKIAIOSFODNN7EXAMPLE";\n';
		await writeFile(join(root, "big.txt"), `${padding}\n${secret}`);
		const result = await scan(root, { maxReadBytes: 64 * 1024 });
		const big = result.files.find((f) => f.path === "big.txt");
		expect(big?.risk).toContain("credentials");
	});

	it("flags private keys past the 64KB mark in large files", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
		roots.push(root);
		const padding = "x".repeat(80 * 1024);
		const key = "-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----\n";
		await writeFile(join(root, "big_key.txt"), `${padding}\n${key}`);
		const result = await scan(root, { maxReadBytes: 64 * 1024 });
		const big = result.files.find((f) => f.path === "big_key.txt");
		expect(big?.risk).toContain("private_key");
	});

	it("respects maxSecretScanBytes limit on huge files", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-scan-"));
		roots.push(root);
		const padding = "x".repeat(100 * 1024);
		const secret = 'const key = "AKIAIOSFODNN7EXAMPLE";\n';
		await writeFile(join(root, "huge.txt"), `${padding}\n${secret}`);
		const result = await scan(root, { maxReadBytes: 32 * 1024, maxSecretScanBytes: 50 * 1024 });
		const huge = result.files.find((f) => f.path === "huge.txt");
		expect(huge?.risk).not.toContain("credentials");
	});
});

describe("case sensitivity", () => {
	it("matches patterns case-sensitively when ignoreCase is false", async () => {
		const root = await repo({
			".gitignore": "*.log\n",
			"test.LOG": "2\n",
			"other.txt": "3\n",
		});
		const result = await scan(root, { ignoreCase: false });
		expect(paths(result)).toEqual([".gitignore", "other.txt", "test.LOG"]);
	});

	it("matches patterns case-insensitively when ignoreCase is true", async () => {
		const root = await repo({
			".gitignore": "*.log\n",
			"test.LOG": "2\n",
			"other.txt": "3\n",
		});
		const result = await scan(root, { ignoreCase: true });
		expect(paths(result)).toEqual([".gitignore", "other.txt"]);
	});

	it("evaluates IgnoreStack case sensitivity option directly", () => {
		const caseSensitive = IgnoreStack.fromPatterns(["*.log"], { ignoreCase: false });
		expect(caseSensitive.ignores("file.log")).toBe(true);
		expect(caseSensitive.ignores("file.LOG")).toBe(false);

		const caseInsensitive = IgnoreStack.fromPatterns(["*.log"], { ignoreCase: true });
		expect(caseInsensitive.ignores("file.log")).toBe(true);
		expect(caseInsensitive.ignores("file.LOG")).toBe(true);
	});
});

describe("BufferPool", () => {
	it("acquires, loans and recycles slabs without excessive allocation", () => {
		const pool = new BufferPool(1024, 4);
		expect(pool.size).toBe(0);
		expect(pool.slabBytes).toBe(1024);

		const b1 = pool.acquire();
		expect(b1.length).toBe(1024);
		expect(pool.size).toBe(0);

		pool.release(b1);
		expect(pool.size).toBe(1);

		const b2 = pool.acquire();
		expect(b2).toBe(b1); // Recycled same instance
		expect(pool.size).toBe(0);

		pool.release(b2);
		pool.clear();
		expect(pool.size).toBe(0);
	});
});

describe("streaming progress and cancellation", () => {
	it("emits real-time progress events with throughput metrics during scan", async () => {
		const root = await repo({
			"a.ts": "1\n",
			"b.ts": "2\n",
			"c.ts": "3\n",
		});

		const progressEvents: ScanProgress[] = [];
		const result = await scan(root, {
			onProgress: (p) => progressEvents.push({ ...p }),
		});

		expect(result.fileCount).toBe(3);
		expect(progressEvents.length).toBeGreaterThanOrEqual(1);
		const last = progressEvents[progressEvents.length - 1]!;
		expect(last.scannedFiles).toBe(3);
		expect(last.throughputFilesPerSec).toBeGreaterThanOrEqual(0);
	});

	it("aborts traversal cleanly when AbortSignal is triggered", async () => {
		const root = await repo({
			"file1.ts": "1\n",
			"file2.ts": "2\n",
		});

		const controller = new AbortController();
		controller.abort();

		const result = await scan(root, { signal: controller.signal });
		expect(result.fileCount).toBe(0);
	});
});
