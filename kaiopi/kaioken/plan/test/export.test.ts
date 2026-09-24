import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { cardToFrontmatter, cardToMarkdown, exportCardsToObsidianVault, generateVaultMapOfContent } from "../src/export.ts";
import type { Card } from "../src/types.ts";

const sampleCard: Card = {
	moduleId: "auth",
	name: "Authentication & Identity",
	generatedAt: "2026-09-24T00:00:00.000Z",
	summary: "Centralized JWT validation and user credential security.",
	keyPoints: ["Zero-allocation token header parsing", "Automated key rotation"],
	entryPoints: [
		{
			name: "verifyToken",
			file: "src/auth/jwt.ts",
			note: "Validates incoming bearer tokens",
			line: 42,
			kind: "function",
			exported: true,
		},
		{
			name: "SessionGuard",
			file: "src/auth/guard.ts",
			note: "Route authentication middleware",
			line: 18,
			kind: "class",
			exported: true,
		},
	],
	sources: [
		{ path: "src/auth/jwt.ts", hash: "a1b2c3d4" },
		{ path: "src/auth/guard.ts", hash: "e5f6g7h8" },
	],
	verification: {
		grounded: 2,
		ungrounded: [],
		unknownFiles: [],
		uncovered: [],
		score: 100,
		status: "grounded",
	},
};

describe("export: Obsidian and Markdown bridge", () => {
	it("generates structured YAML frontmatter", () => {
		const fm = cardToFrontmatter(sampleCard, { extraTags: ["security", "p0"] });
		expect(fm.id).toBe("auth");
		expect(fm.title).toBe("Authentication & Identity");
		expect(fm.type).toBe("knowledge-card");
		expect(fm.grounded_score).toBe("100%");
		expect(fm.citations_verified).toBe(2);
		expect(fm.sources).toEqual(["src/auth/jwt.ts", "src/auth/guard.ts"]);
		expect(fm.tags).toContain("security");
		expect(fm.tags).toContain("p0");
	});

	it("converts knowledge card to clean Markdown with Obsidian wikilinks and callouts", () => {
		const md = cardToMarkdown(sampleCard, { wikilinks: true, callouts: true });

		// Check YAML frontmatter boundaries
		expect(md.startsWith("---\n")).toBe(true);
		const secondFence = md.indexOf("\n---\n", 4);
		expect(secondFence).toBeGreaterThan(0);
		const rawYaml = md.slice(4, secondFence);
		const parsed = parseYaml(rawYaml);
		expect(parsed.id).toBe("auth");

		// Check Callouts
		expect(md).toContain("> [!abstract] Architectural Overview");
		expect(md).toContain("> [!tip] Key Takeaways & Invariants");

		// Check Wikilinks and Entry Points Table
		expect(md).toContain("`[[verifyToken]]`");
		expect(md).toContain("`[[src/auth/jwt.ts]]`");
		expect(md).toContain("42");
		expect(md).toContain("✔ Grounded");

		// Check Provenance
		expect(md).toContain("- [[src/auth/jwt.ts]] `(sha: a1b2c3d4)`");
	});

	it("generates Obsidian Map of Content (MOC.md)", () => {
		const moc = generateVaultMapOfContent([sampleCard]);
		expect(moc).toContain("# 🗺️ Repository Knowledge Base — Map of Content");
		expect(moc).toContain("| `auth` |");
		expect(moc).toContain("[[auth\\|Authentication & Identity]]");
		expect(moc).toContain("2/2");
	});

	it("exports cards into an Obsidian vault directory", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "kaioken-obsidian-test-"));
		try {
			const report = await exportCardsToObsidianVault([sampleCard], tempDir);
			expect(report.filesWritten.length).toBe(2); // auth.md and MOC.md

			const cardFile = await readFile(join(tempDir, "auth.md"), "utf8");
			expect(cardFile).toContain("Authentication & Identity");

			const mocFile = await readFile(report.indexFile, "utf8");
			expect(mocFile).toContain("Knowledge Cards — Map of Content");
		} finally {
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
