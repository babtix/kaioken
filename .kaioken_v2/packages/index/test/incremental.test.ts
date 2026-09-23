import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scan } from "@kaioken/scan";
import { afterEach, describe, expect, it } from "vitest";
import { buildIndex } from "../dist/index.js";

/**
 * Parsing is the expensive half of phase 1, so "unchanged file is not reparsed"
 * is a correctness property, not an optimisation: it is what makes the index
 * cheap enough to keep current, and staleness in phase 5 depends on the same
 * content hashes.
 */

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(files: Record<string, string>): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-index-"));
	roots.push(root);
	for (const [path, content] of Object.entries(files)) {
		await writeFile(join(root, path), content, "utf8");
	}
	return root;
}

describe("incremental build", () => {
	it("parses every indexable file on a cold build", async () => {
		const root = await repo({
			"a.ts": "export const a = 1;\n",
			"b.py": "def b():\n    pass\n",
		});
		const { index, stats } = await buildIndex(await scan(root));
		expect(stats.parsed).toBe(2);
		expect(stats.reused).toBe(0);
		expect(index.symbolCount).toBe(2);
	});

	it("reparses nothing when no content changed", async () => {
		const root = await repo({ "a.ts": "export const a = 1;\n", "b.py": "def b():\n    pass\n" });
		const first = await buildIndex(await scan(root));
		const second = await buildIndex(await scan(root), { previous: first.index });

		expect(second.stats.parsed).toBe(0);
		expect(second.stats.reused).toBe(2);
		expect(second.index.symbolCount).toBe(first.index.symbolCount);
	});

	it("reparses only the file whose content changed", async () => {
		const root = await repo({ "a.ts": "export const a = 1;\n", "b.py": "def b():\n    pass\n" });
		const first = await buildIndex(await scan(root));

		await writeFile(join(root, "a.ts"), "export const a = 1;\nexport const c = 2;\n", "utf8");
		const second = await buildIndex(await scan(root), { previous: first.index });

		expect(second.stats.parsed).toBe(1);
		expect(second.stats.reused).toBe(1);
		expect(second.index.symbolCount).toBe(3);
	});

	it("reparses everything when forced", async () => {
		const root = await repo({ "a.ts": "export const a = 1;\n" });
		const first = await buildIndex(await scan(root));
		const second = await buildIndex(await scan(root), { previous: first.index, force: true });
		expect(second.stats.parsed).toBe(1);
		expect(second.stats.reused).toBe(0);
	});

	it("drops a file that no longer exists", async () => {
		const root = await repo({ "a.ts": "export const a = 1;\n", "b.ts": "export const b = 1;\n" });
		const first = await buildIndex(await scan(root));
		expect(first.index.fileCount).toBe(2);

		await rm(join(root, "b.ts"));
		const second = await buildIndex(await scan(root), { previous: first.index });
		expect(second.index.files.map((f) => f.path)).toEqual(["a.ts"]);
	});
});

describe("indexability", () => {
	it("skips binaries and languages with no grammar rather than recording empties", async () => {
		const root = await repo({
			"a.ts": "export const a = 1;\n",
			"notes.md": "# heading\n",
			"script.rb": "def hello\nend\n",
		});
		const { index, stats } = await buildIndex(await scan(root));
		expect(index.files.map((f) => f.path)).toEqual(["a.ts"]);
		expect(stats.skipped).toBe(2);
		expect(index.unparsedLanguages).toEqual({});
	});
});
