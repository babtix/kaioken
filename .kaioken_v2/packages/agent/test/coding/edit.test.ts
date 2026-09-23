import { describe, expect, it } from "vitest";
import { createEditTool, type FileSystemPort } from "../../dist/index.js";

function normPath(p: string): string {
	return p.replace(/^[a-zA-Z]:[/\\]/, "/").replace(/\\/g, "/");
}

function mockFs(
	files: Record<string, string> = {},
): FileSystemPort & { written: Record<string, string> } {
	const storage: Record<string, string> = {};
	for (const [k, v] of Object.entries(files)) {
		storage[normPath(k)] = v;
	}
	const written: Record<string, string> = {};
	return {
		written,
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
		async mkdir() {},
		async readdir() { return []; },
		async stat(path) {
			const n = normPath(path);
			if (n in storage) return { isFile: true, isDirectory: false, size: storage[n]!.length };
			throw new Error("ENOENT");
		},
	};
}

describe("edit tool", () => {
	it("replaces unique text in a file", async () => {
		const fs = mockFs({ "/repo/file.ts": "const a = 1;\nconst b = 2;\n" });
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "file.ts",
			oldText: "const a = 1;",
			newText: "const a = 42;",
		});

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("edited");
		expect(fs.written["/repo/file.ts"]).toContain("const a = 42;");
		expect(fs.written["/repo/file.ts"]).toContain("const b = 2;");
	});

	it("refuses when oldText appears more than once", async () => {
		const fs = mockFs({ "/repo/file.ts": "x = 1;\nx = 1;\n" });
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "file.ts",
			oldText: "x = 1;",
			newText: "x = 2;",
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain("2 times");
	});

	it("reports when oldText is not found", async () => {
		const fs = mockFs({ "/repo/file.ts": "const a = 1;\n" });
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "file.ts",
			oldText: "const b = 2;",
			newText: "const b = 3;",
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain("not found");
	});

	it("preserves CRLF line endings", async () => {
		const fs = mockFs({ "/repo/file.ts": "line one\r\nline two\r\nline three\r\n" });
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "file.ts",
			oldText: "line two",
			newText: "line TWO",
		});

		expect(result.isError).toBeUndefined();
		expect(fs.written["/repo/file.ts"]).toContain("\r\n");
		expect(fs.written["/repo/file.ts"]).toContain("line TWO");
		expect(result.details).toMatchObject({ lineEnding: "CRLF" });
	});

	it("preserves LF line endings", async () => {
		const fs = mockFs({ "/repo/file.ts": "line one\nline two\nline three\n" });
		const tool = createEditTool("/repo", fs);

		await tool.run({ path: "file.ts", oldText: "line two", newText: "line TWO" });

		expect(fs.written["/repo/file.ts"]).not.toContain("\r");
	});

	it("reports match mode in details", async () => {
		const fs = mockFs({ "/repo/file.ts": "const  a  = 1;\n" });
		const tool = createEditTool("/repo", fs);

		// oldText has different whitespace — should fallback
		const result = await tool.run({
			path: "file.ts",
			oldText: "const a = 1;",
			newText: "const a = 2;",
		});

		// The tool should find it via whitespace-normalized fallback
		expect(result.isError).toBeUndefined();
		expect(result.details).toMatchObject({ matchMode: "whitespace-normalized" });
	});

	it("refuses to edit outside the workspace", async () => {
		const fs = mockFs({});
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "../../../etc/passwd",
			oldText: "root",
			newText: "hacked",
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain("outside");
	});

	it("reports missing file", async () => {
		const fs = mockFs({});
		const tool = createEditTool("/repo", fs);

		const result = await tool.run({
			path: "missing.ts",
			oldText: "x",
			newText: "y",
		});

		expect(result.isError).toBe(true);
		expect(result.text).toContain("no such file");
	});
});
