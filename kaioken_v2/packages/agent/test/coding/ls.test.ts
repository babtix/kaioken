import { describe, expect, it } from "vitest";
import { createLsTool, type FileSystemPort } from "../../dist/index.js";

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
		async readdir(path) {
			const n = normPath(path);
			if (n in storage) return storage[n]!;
			throw new Error("ENOENT");
		},
		async stat(path) { return { isFile: true, isDirectory: false, size: 0 }; },
	};
}

describe("ls tool", () => {
	it("lists directory contents with sizes", async () => {
		const fs = mockFs({
			"/repo": [
				{ name: "src", isDirectory: true, size: 0 },
				{ name: "package.json", isDirectory: false, size: 1234 },
				{ name: "README.md", isDirectory: false, size: 5678 },
			],
		});
		const tool = createLsTool("/repo", fs);

		const result = await tool.run({ path: "." });

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("src/");
		expect(result.text).toContain("package.json");
		expect(result.text).toContain("1.2KB");
		expect(result.text).toContain("3 entries");
	});

	it("sorts directories before files", async () => {
		const fs = mockFs({
			"/repo": [
				{ name: "z-file.ts", isDirectory: false, size: 10 },
				{ name: "a-dir", isDirectory: true, size: 0 },
			],
		});
		const tool = createLsTool("/repo", fs);

		const result = await tool.run({});

		const lines = result.text.split("\n");
		const dirLine = lines.findIndex((l) => l.includes("a-dir/"));
		const fileLine = lines.findIndex((l) => l.includes("z-file.ts"));
		expect(dirLine).toBeLessThan(fileLine);
	});

	it("reports empty directory", async () => {
		const fs = mockFs({ "/repo/empty": [] });
		const tool = createLsTool("/repo", fs);

		const result = await tool.run({ path: "empty" });
		expect(result.text).toContain("empty directory");
	});

	it("reports missing directory", async () => {
		const fs = mockFs({});
		const tool = createLsTool("/repo", fs);

		const result = await tool.run({ path: "nope" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("no such directory");
	});

	it("refuses path outside workspace", async () => {
		const fs = mockFs({});
		const tool = createLsTool("/repo", fs);

		const result = await tool.run({ path: "../../../etc" });
		expect(result.isError).toBe(true);
	});
});
