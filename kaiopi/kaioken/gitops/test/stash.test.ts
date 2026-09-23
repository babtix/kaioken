import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { git } from "../src/run.ts";
import { detectUntracked, pushAutoStash, withAutoStash } from "../src/stash.ts";
import { worktreeStatus } from "../src/worktree.ts";

describe("stash: Auto-stash Guard and Untracked Detection", () => {
	it("detects untracked files honoring .gitignore", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-untracked-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, ".gitignore"), "ignored.log\n");
			await writeFile(join(repo, "tracked.txt"), "hello\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			await writeFile(join(repo, "new-file.ts"), "export const x = 1;\n");
			await writeFile(join(repo, "ignored.log"), "some log\n");

			const untracked = await detectUntracked(repo);
			expect(untracked).toContain("new-file.ts");
			expect(untracked).not.toContain("ignored.log");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("returns created: false when tree is clean", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-stash-clean-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "tracked.txt"), "hello\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			const res = await pushAutoStash(repo, "test-clean");
			expect(res?.created).toBe(false);
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});

	it("safely stashes dirty working tree and untracked files and restores them", async () => {
		const repo = await mkdtemp(join(tmpdir(), "kaio-stash-roundtrip-"));
		try {
			await git(repo, "init");
			await git(repo, "config", "user.name", "Tester");
			await git(repo, "config", "user.email", "test@domain.com");
			await writeFile(join(repo, "tracked.txt"), "line 1\n");
			await git(repo, "add", "-A");
			await git(repo, "commit", "-m", "init");

			// Make modifications and add untracked file
			await writeFile(join(repo, "tracked.txt"), "line 1\nline 2 (dirty)\n");
			await writeFile(join(repo, "scratch.txt"), "untracked file\n");

			let executedInside = false;

			const result = await withAutoStash(repo, "test-op", async () => {
				executedInside = true;
				// Working tree should be completely clean inside operation
				const statusInside = await worktreeStatus(repo);
				const untrackedInside = await detectUntracked(repo);
				expect(statusInside.dirty.length).toBe(0);
				expect(untrackedInside.length).toBe(0);
				return "op-success";
			});

			expect(executedInside).toBe(true);
			expect(result).toBe("op-success");

			// Outside operation, dirty state and untracked files are restored
			const statusAfter = await worktreeStatus(repo);
			const untrackedAfter = await detectUntracked(repo);
			expect(statusAfter.dirty).toContain("tracked.txt");
			expect(untrackedAfter).toContain("scratch.txt");
		} finally {
			await rm(repo, { recursive: true, force: true });
		}
	});
});
