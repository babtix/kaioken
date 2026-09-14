import { describe, expect, it } from "vitest";
import { createEditTool, generateUnifiedDiff, type FileSystemPort } from "../../dist/index.js";

function normPath(p: string): string {
	return p.replace(/^[a-zA-Z]:[/\\]/, "/").replace(/\\/g, "/");
}

describe("generateUnifiedDiff", () => {
	it("generates a clean unified diff for line replacements", () => {
		const oldContent = "line 1\nline 2\nline 3\n";
		const newContent = "line 1\nline TWO\nline 3\n";
		const diff = generateUnifiedDiff("src/sample.ts", oldContent, newContent);

		expect(diff).toContain("--- a/src/sample.ts");
		expect(diff).toContain("+++ b/src/sample.ts");
		expect(diff).toContain("-line 2");
		expect(diff).toContain("+line TWO");
		expect(diff).toContain(" line 1");
	});

	it("returns empty string when content is unchanged", () => {
		const content = "unchanged text\n";
		const diff = generateUnifiedDiff("src/sample.ts", content, content);
		expect(diff).toBe("");
	});
});

describe("edit tool diff integration", () => {
	it("includes diff in tool result details", async () => {
		const storage: Record<string, string> = {
			"/repo/src/sample.ts": "const x = 1;\nconst y = 2;\n",
		};

		const fs: FileSystemPort = {
			async readFile(path) {
				const n = normPath(path);
				const content = storage[n];
				if (content === undefined) throw new Error("ENOENT");
				return content;
			},
			async writeFile(path, content) {
				const n = normPath(path);
				storage[n] = content;
			},
			async exists(path) {
				return normPath(path) in storage;
			},
			async mkdir() {},
			async readdir() {
				return [];
			},
			async stat() {
				return { isFile: true, isDirectory: false, size: 0 };
			},
		};

		const tool = createEditTool("/repo", fs);
		const result = await tool.run({
			path: "src/sample.ts",
			oldText: "const x = 1;",
			newText: "const x = 42;",
		});

		expect(result.isError).toBeUndefined();
		expect(result.details).toHaveProperty("diff");
		const diff = (result.details as { diff: string }).diff;
		expect(diff).toContain("-const x = 1;");
		expect(diff).toContain("+const x = 42;");
	});
});
