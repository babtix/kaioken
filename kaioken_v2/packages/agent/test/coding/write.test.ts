import { describe, expect, it } from "vitest";
import { createWriteTool, type FileSystemPort } from "../../dist/index.js";

function normPath(p: string): string {
	return p.replace(/^[a-zA-Z]:[/\\]/, "/").replace(/\\/g, "/");
}

function mockFs(
	files: Record<string, string> = {},
): FileSystemPort & { written: Record<string, string>; dirs: string[] } {
	const storage: Record<string, string> = {};
	for (const [k, v] of Object.entries(files)) {
		storage[normPath(k)] = v;
	}
	const written: Record<string, string> = {};
	const dirs: string[] = [];
	return {
		written, dirs,
		async readFile(path) {
			const n = normPath(path);
			if (n in storage) return storage[n]!;
			throw new Error("ENOENT");
		},
		async writeFile(path, content) {
			const n = normPath(path);
			written[n] = content;
			storage[n] = content;
		},
		async exists(path) { return normPath(path) in storage; },
		async mkdir(path) { dirs.push(normPath(path)); },
		async readdir() { return []; },
		async stat(path) {
			const n = normPath(path);
			if (n in storage) return { isFile: true, isDirectory: false, size: storage[n]!.length };
			throw new Error("ENOENT");
		},
	};
}

describe("write tool", () => {
	it("creates a new file", async () => {
		const fs = mockFs();
		const tool = createWriteTool("/repo", fs);

		const result = await tool.run({
			path: "src/new.ts",
			content: "export const x = 1;\n",
		});

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("created");
		expect(fs.written["/repo/src/new.ts"]).toBe("export const x = 1;\n");
	});

	it("reports overwrite of existing file", async () => {
		const fs = mockFs({ "/repo/old.ts": "old content" });
		const tool = createWriteTool("/repo", fs);

		const result = await tool.run({ path: "old.ts", content: "new content" });

		expect(result.text).toContain("overwrote");
	});

	it("creates parent directories", async () => {
		const fs = mockFs();
		const tool = createWriteTool("/repo", fs);

		await tool.run({ path: "deep/nested/dir/file.ts", content: "x" });

		expect(fs.dirs.length).toBeGreaterThan(0);
	});

	it("refuses to write outside the workspace", async () => {
		const fs = mockFs();
		const tool = createWriteTool("/repo", fs);

		const result = await tool.run({
			path: "../../../etc/evil",
			content: "bad",
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain("outside");
	});

	it("rejects missing path", async () => {
		const fs = mockFs();
		const tool = createWriteTool("/repo", fs);

		const result = await tool.run({ path: "", content: "x" });
		expect(result.isError).toBe(true);
	});
});
