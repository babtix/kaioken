import { describe, expect, it } from "vitest";
import { createGrepTool, type ShellPort } from "../../dist/index.js";

function mockShell(
	responses: Record<string, { exitCode: number | null; stdout: string; stderr: string }> = {},
): ShellPort {
	return {
		async exec(command) {
			for (const [key, value] of Object.entries(responses)) {
				if (command.includes(key)) return value;
			}
			return { exitCode: 0, stdout: "", stderr: "" };
		},
	};
}

describe("grep tool", () => {
	it("returns matching lines", async () => {
		const shell = mockShell({
			"rg": {
				exitCode: 0,
				stdout: "src/main.ts:5:const foo = 1;\nsrc/main.ts:10:const bar = foo;\n",
				stderr: "",
			},
		});
		const tool = createGrepTool("/repo", shell);

		const result = await tool.run({ pattern: "foo" });

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("src/main.ts:5");
	});

	it("reports no matches without error", async () => {
		const shell = mockShell({
			"rg": { exitCode: 1, stdout: "", stderr: "" },
		});
		const tool = createGrepTool("/repo", shell);

		const result = await tool.run({ pattern: "nonexistent" });

		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("no matches");
	});

	it("reports rg failure as error", async () => {
		const shell = mockShell({
			"rg": { exitCode: 2, stdout: "", stderr: "invalid regex\n" },
		});
		const tool = createGrepTool("/repo", shell);

		const result = await tool.run({ pattern: "[invalid" });

		expect(result.isError).toBe(true);
	});

	it("rejects empty pattern", async () => {
		const tool = createGrepTool("/repo", mockShell());
		const result = await tool.run({ pattern: "" });
		expect(result.isError).toBe(true);
	});

	it("refuses search path outside workspace", async () => {
		const tool = createGrepTool("/repo", mockShell());
		const result = await tool.run({ pattern: "x", path: "../../../etc" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("outside");
	});
});
