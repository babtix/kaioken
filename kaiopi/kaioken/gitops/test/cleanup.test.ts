import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pruneWorktrees, readHookLog } from "../src/cleanup.ts";
import { git } from "../src/run.ts";
import { createWorktree } from "../src/worktree.ts";

describe("cleanup: Worktree Cleanup Wizard and Hook Log Reader", () => {
	it("reads hook log and handles missing log gracefully", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-hooklog-"));
		try {
			const missing = await readHookLog(repo);
			expect(missing).toContain("No hook log found");

			await mkdir(join(repo, ".kaioken"), { recursive: true });
			await writeFile(join(repo, ".kaioken", "hook.log"), "line 1\nline 2\nline 3\n");

			const content = await readHookLog(repo, 2);
			expect(content).toContain("line 2\nline 3");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("prunes merged worktrees and scratch directories", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-prune-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "README.md"), "# Init\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			// Create worktree task and commit
			const wtPath = await createWorktree(repo, "merged-task");
			await writeFile(join(wtPath, "doc.md"), "# Doc\n");
			await git(wtPath, "add", "-A");
			await git(wtPath, "commit", "-m", "doc commit");

			// Merge into base branch so it's merged
			await git(repo, "merge", "--ff-only", "kaioken/merged-task");

			// Dry run first
			const dryReport = await pruneWorktrees(repo, { dryRun: true });
			expect(dryReport.prunedWorktrees.length).toBe(1);
			expect(dryReport.prunedWorktrees[0].name).toBe("merged-task");

			// Real prune
			const report = await pruneWorktrees(repo);
			expect(report.prunedWorktrees.length).toBe(1);
			expect(report.prunedWorktrees[0].name).toBe("merged-task");
			expect(report.prunedWorktrees[0].reason).toContain("already merged");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
