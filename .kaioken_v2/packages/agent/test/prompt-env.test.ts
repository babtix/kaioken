import { describe, expect, it } from "vitest";
import { buildSystemPrompt, type KnowledgeContext } from "../dist/index.js";

function mockContext(): KnowledgeContext {
	return {
		root: "d:\\project\\myrepo",
		index: { files: [] } as never,
		oracle: {} as never,
		scan: { fileCount: 10, files: [] } as never,
		provenance: [],
		skills: [],
		search: null,
	};
}

describe("system prompt environment block", () => {
	it("injects ## Environment with OS, CWD, Shell, and Node", () => {
		const ctx = mockContext();
		const prompt = buildSystemPrompt(ctx, {
			gate: [],
			canWrite: false,
		});

		expect(prompt).toContain("## Environment");
		expect(prompt).toContain("- OS:");
		expect(prompt).toContain("- CWD:");
		expect(prompt).toContain("- Shell:");
		expect(prompt).toContain("- Node:");
		// CWD should be normalized with forward slashes
		expect(prompt).toContain("d:/project/myrepo");
	});

	it("respects environment overrides when provided", () => {
		const ctx = mockContext();
		const prompt = buildSystemPrompt(ctx, {
			gate: [],
			canWrite: true,
			env: {
				os: "custom-os (Linux)",
				cwd: "/custom/cwd",
				shell: "bash",
				node: "v22.10.0",
			},
		});

		expect(prompt).toContain("- OS: custom-os (Linux)");
		expect(prompt).toContain("- CWD: /custom/cwd");
		expect(prompt).toContain("- Shell: bash");
		expect(prompt).toContain("- Node: v22.10.0");
	});
});
