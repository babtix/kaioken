import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	discoverContextFiles,
	formatContextFilesPrompt,
	type ContextFile,
} from "../dist/index.js";

describe("Context Files Discovery & Formatting", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((r) => rm(r, { recursive: true, force: true })),
		);
	});

	async function createWorkspace(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "kaioken-context-test-"));
		roots.push(root);
		return root;
	}

	it("discovers AGENTS.md and .kaioken/rules/*.md walking up to workspace root", async () => {
		const root = await createWorkspace();

		// Root AGENTS.md
		await writeFile(join(root, "AGENTS.md"), "# Root Guidelines\nFollow monorepo conventions.");

		// Root rules
		const rulesDir = join(root, ".kaioken", "rules");
		await mkdir(rulesDir, { recursive: true });
		await writeFile(join(rulesDir, "style.md"), "Use tabs, not spaces.");
		await writeFile(join(rulesDir, "security.md"), "Never log credentials.");

		// Subpackage
		const subDir = join(root, "packages", "agent", "src");
		await mkdir(subDir, { recursive: true });
		await writeFile(
			join(root, "packages", "agent", "AGENTS.md"),
			"# Agent Package Rules\nTransport-agnostic only.",
		);

		// Discover from deep subDir
		const files = await discoverContextFiles({
			cwd: subDir,
			workspaceRoot: root,
		});

		expect(files).toHaveLength(4);

		// Must be in root-to-leaf order: root files first, then subpackage files
		const paths = files.map((f) => f.relativePath.replace(/\\/g, "/"));
		expect(paths[0]).toBe("AGENTS.md");
		expect(paths.some((p) => p.includes("style.md"))).toBe(true);
		expect(paths.some((p) => p.includes("security.md"))).toBe(true);
		expect(paths[paths.length - 1]).toBe("packages/agent/AGENTS.md");

		const rootAgents = files.find((f) => f.relativePath.replace(/\\/g, "/") === "AGENTS.md");
		expect(rootAgents?.kind).toBe("agent-doc");
		expect(rootAgents?.content).toContain("Follow monorepo conventions.");

		const styleRule = files.find((f) => f.relativePath.includes("style.md"));
		expect(styleRule?.kind).toBe("rule");
		expect(styleRule?.content).toContain("Use tabs, not spaces.");
	});

	it("stops directory traversal at workspace root", async () => {
		const root = await createWorkspace();
		const nestedDir = join(root, "a", "b", "c");
		await mkdir(nestedDir, { recursive: true });

		await writeFile(join(root, "AGENTS.md"), "Workspace boundary agents file");

		const files = await discoverContextFiles({
			cwd: nestedDir,
			workspaceRoot: root,
		});

		expect(files).toHaveLength(1);
		expect(files[0].relativePath.replace(/\\/g, "/")).toBe("AGENTS.md");
	});

	it("formats context files into system prompt block", () => {
		const files: ContextFile[] = [
			{
				path: "/repo/AGENTS.md",
				relativePath: "AGENTS.md",
				content: "# Architecture\nDo not import concrete providers.",
				kind: "agent-doc",
			},
			{
				path: "/repo/.kaioken/rules/testing.md",
				relativePath: ".kaioken/rules/testing.md",
				content: "Run 100% tests before push.",
				kind: "rule",
			},
		];

		const formatted = formatContextFilesPrompt(files);

		expect(formatted).toContain("## Repository Context & Rules");
		expect(formatted).toContain("### Document: AGENTS.md");
		expect(formatted).toContain("Do not import concrete providers.");
		expect(formatted).toContain("### Rule: .kaioken/rules/testing.md");
		expect(formatted).toContain("Run 100% tests before push.");
	});

	it("returns empty string when no context files are found", () => {
		const formatted = formatContextFilesPrompt([]);
		expect(formatted).toBe("");
	});
});
