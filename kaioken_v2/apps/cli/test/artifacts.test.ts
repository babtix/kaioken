import { mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ensureIndex } from "../dist/artifacts.js";

/**
 * The index artifact is a cache, and a cache that is rewritten on every read
 * is a cache that costs as much as it saves: on a real repository that is a
 * quarter of a megabyte serialised and written back to disk per command — and,
 * worse, per chat turn. When the build reused every file by hash, the content
 * is identical and the file stays as it is; only a real change writes.
 */
const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("ensureIndex", () => {
	it("does not rewrite the artifact when the build reused everything", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-index-"));
		roots.push(root);
		await writeFile(join(root, "lib.ts"), "export const add = (a: number, b: number) => a + b;\n");

		await ensureIndex(root);
		const path = join(root, ".kaioken", "index.json");
		const before = await stat(path);

		// A warm second run reuses every file by hash; the content is
		// byte-identical apart from its timestamp, and a timestamp is not a
		// change.
		await new Promise((resolve) => setTimeout(resolve, 50));
		await ensureIndex(root);
		const after = await stat(path);
		expect(after.mtimeMs).toBe(before.mtimeMs);
	});

	it("writes when the repository actually moved", async () => {
		const root = await mkdtemp(join(tmpdir(), "kaioken-index-"));
		roots.push(root);
		const source = join(root, "lib.ts");
		await writeFile(source, "export const add = (a: number, b: number) => a + b;\n");

		await ensureIndex(root);
		const path = join(root, ".kaioken", "index.json");
		const before = await stat(path);

		// The scan artifact is what ensureIndex reuses, so moving a file only
		// moves the index once something has re-walked the tree.
		await writeFile(source, "export const add = (a: number, b: number) => a + b + 1;\n");
		await rm(join(root, ".kaioken", "scan.json"));
		await new Promise((resolve) => setTimeout(resolve, 50));
		await ensureIndex(root);
		const after = await stat(path);
		expect(after.mtimeMs).toBeGreaterThan(before.mtimeMs);
	});
});
