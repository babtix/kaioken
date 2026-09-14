import { describe, expect, it } from "vitest";
import { createBashTool, type ShellPort } from "../../dist/index.js";

function mockShell(
	responses: Record<string, { exitCode: number | null; stdout: string; stderr: string }> = {},
): ShellPort & { ran: string[] } {
	const ran: string[] = [];
	return {
		ran,
		async exec(command, options) {
			ran.push(command);
			return responses[command] ?? { exitCode: 0, stdout: "", stderr: "" };
		},
	};
}

describe("bash tool", () => {
	it("executes a command and returns output", async () => {
		const shell = mockShell({ "echo hello": { exitCode: 0, stdout: "hello\n", stderr: "" } });
		const tool = createBashTool("/repo", shell);
		const result = await tool.run({ command: "echo hello" });
		expect(result.isError).toBeUndefined();
		expect(result.text).toContain("hello");
		expect(shell.ran).toEqual(["echo hello"]);
	});

	it("reports non-zero exit code as error", async () => {
		const shell = mockShell({ "exit 1": { exitCode: 1, stdout: "", stderr: "fail\n" } });
		const tool = createBashTool("/repo", shell);
		const result = await tool.run({ command: "exit 1" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("exit code 1");
	});

	it("reports a killed process", async () => {
		const shell = mockShell({ "sleep 999": { exitCode: null, stdout: "", stderr: "" } });
		const tool = createBashTool("/repo", shell);
		const result = await tool.run({ command: "sleep 999" });
		expect(result.text).toContain("killed");
	});

	it("rejects an empty command", async () => {
		const tool = createBashTool("/repo", mockShell());
		const result = await tool.run({ command: "" });
		expect(result.isError).toBe(true);
	});

	it("truncates long output", async () => {
		const longOutput = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join("\n");
		const shell = mockShell({ "big": { exitCode: 0, stdout: longOutput, stderr: "" } });
		const tool = createBashTool("/repo", shell);
		const result = await tool.run({ command: "big" });
		// Should be truncated — the output is over 2000 lines
		expect(result.details).toMatchObject({ truncated: true });
	});

	it("reports when exec throws", async () => {
		const shell: ShellPort = {
			async exec() { throw new Error("ENOENT"); },
		};
		const tool = createBashTool("/repo", shell);
		const result = await tool.run({ command: "nope" });
		expect(result.isError).toBe(true);
		expect(result.text).toContain("ENOENT");
	});
});
