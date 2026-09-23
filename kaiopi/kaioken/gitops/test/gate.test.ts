import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { safeMerge } from "../src/gate.ts";
import { git } from "../src/run.ts";
import { createWorktree } from "../src/worktree.ts";

describe("gate: Fast-forward Merge Verification Gate", () => {
	it("blocks merge when verification gate fails", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-gate-fail-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const wtPath = await createWorktree(repo, "buggy-task");
			await writeFile(join(wtPath, "broken.ts"), "syntax error (\n");
			await git(wtPath, "add", "-A");
			await git(wtPath, "commit", "-m", "broken work");

			const result = await safeMerge(repo, "buggy-task", {
				verify: true,
				verifyFn: async () => ({
					pass: false,
					summary: "FAIL broken.test.ts: SyntaxError in broken.ts:1",
				}),
			});

			expect(result.success).toBe(false);
			expect(result.testPassed).toBe(false);
			expect(result.message).toContain("MERGE GATE BLOCKED: Tests failed");
			expect(result.message).toContain("SyntaxError in broken.ts:1");
			expect(result.message).toContain("RECOVERY PROTOCOL");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("completes fast-forward merge and cleans branch when verification passes", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-gate-pass-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const wtPath = await createWorktree(repo, "clean-task");
			await writeFile(join(wtPath, "feature.ts"), "export const ok = true;\n");
			await git(wtPath, "add", "-A");
			await git(wtPath, "commit", "-m", "clean work");

			const result = await safeMerge(repo, "clean-task", {
				verify: true,
				verifyFn: async () => ({
					pass: true,
					summary: "100% tests passed cleanly",
				}),
			});

			expect(result.success).toBe(true);
			expect(result.testPassed).toBe(true);
			expect(result.message).toContain("Cleanly merged kaioken/clean-task via verified fast-forward");

			// Check that branch was removed
			const branchList = await git(repo, "branch", "--list", "kaioken/clean-task");
			expect(branchList.stdout.trim()).toBe("");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("merges with auto-stash when working tree is dirty", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-gate-autostash-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const wtPath = await createWorktree(repo, "stashed-merge-task");
			await writeFile(join(wtPath, "added.txt"), "hello from worktree\n");
			await git(wtPath, "add", "-A");
			await git(wtPath, "commit", "-m", "worktree commit");

			// Dirty base tree with another file
			await writeFile(join(repo, "unrelated.txt"), "base dirty uncommitted file\n");

			const result = await safeMerge(repo, "stashed-merge-task", {
				verify: false,
				autoStash: true,
			});

			expect(result.success).toBe(true);

			// Unrelated file is still present in repo after merge
			const stat = await git(repo, "status", "--porcelain");
			expect(stat.stdout).toContain("unrelated.txt");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
