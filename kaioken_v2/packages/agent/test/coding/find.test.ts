import { describe, expect, it } from "vitest";
import { createFindTool, type FileSystemPort } from "../../dist/index.js";

function normPath(p: string): string {
	return p.replace(/^[a-zA-Z]:[/\\]/, "/").replace(/\\/g, "/");
}

function mockFs(
	tree: Record<string, Array<{ name: string; isDirectory: boolean; size: number }>>,
): FileSystemPort {
	const storage: Record<string, Array<{ name: string; isDirectory: boolean; size: number }>> = {};
	for (const [k, v] of Object.entries(tree)) {
		storage[normPath(k)] = v;
	}
	return {
		async readFile() { throw new Error("not implemented"); },
		async writeFile() {},
		async exists() { return true; },
		async mkdir() {},
		async readdir(path) { return storage[normPath(path)] ?? []; },
		async stat(path) { return { isFile: true, isDirectory: false, size: 0 }; },
	};
}

describe("find tool", () => {
	it("finds files matching a glob pattern", async () => {
		const fs = mockFs({
			"/repo": [
				{ name: "main.ts", isDirectory: false, size: 100 },
				{ name: "test.ts", isDirectory: false, size: 200 },
				{ name: "src", isDirectory: true, size: 0 },
			],
			"/repo/src": [
				{ name: "util.ts", isDirectory: false, size: 50 },
				{ name: "index.js", isDirectory: false, size: 30 },
			],
		});
		const tool = createFindTool("/repo", fs);

		const result = await tool.run({ pattern: "*.ts" });

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("main.ts");
		expect(result.text).toContain("test.ts");
		expect(result.text).toContain("src/util.ts");
		expect(result.text).not.toContain("index.js");
	});

	it("skips node_modules and .git", async () => {
		const fs = mockFs({
			"/repo": [
				{ name: "node_modules", isDirectory: true, size: 0 },
				{ name: ".git", isDirectory: true, size: 0 },
				{ name: "app.ts", isDirectory: false, size: 100 },
			],
			"/repo/node_modules": [
				{ name: "pkg.ts", isDirectory: false, size: 100 },
			],
		});
		const tool = createFindTool("/repo", fs);

		const result = await tool.run({ pattern: "*.ts" });

		expect(result.text).toContain("app.ts");
		expect(result.text).not.toContain("pkg.ts");
	});

	it("reports no matches", async () => {
		const fs = mockFs({ "/repo": [] });
		const tool = createFindTool("/repo", fs);

		const result = await tool.run({ pattern: "*.rs" });

		expect(result.text).toContain("no files matching");
	});

	it("rejects empty pattern", async () => {
		const fs = mockFs({ "/repo": [] });
		const tool = createFindTool("/repo", fs);

		const result = await tool.run({ pattern: "" });
		expect(result.isError).toBe(true);
	});

	it("refuses search path outside workspace", async () => {
		const fs = mockFs({});
		const tool = createFindTool("/repo", fs);

		const result = await tool.run({ pattern: "*.ts", path: "../../../etc" });
		expect(result.isError).toBe(true);
	});
});
