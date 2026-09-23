import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { createWorktree, ffMerge, worktreePath, worktreeStatus } from "../src/index.ts";

const exec = promisify(execFile);

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function repo(): Promise<string> {
	const root = await mkdtemp(join(tmpdir(), "kaioken-wt-"));
	roots.push(root);
	await exec("git", ["init", "--quiet"], { cwd: root });
	await exec("git", ["config", "user.name", "Test"], { cwd: root });
	await exec("git", ["config", "user.email", "test@test.local"], { cwd: root });
	await exec("git", ["config", "commit.gpgsign", "false"], { cwd: root });
	await writeFile(join(root, "base.txt"), "base\n", "utf8");
	await exec("git", ["add", "-A"], { cwd: root });
	await exec("git", ["commit", "-m", "initial", "--quiet"], { cwd: root });
	return root;
}

describe("worktree conflict handling", () => {
	it("refuses a fast-forward when the working tree is dirty", async () => {
		const root = await repo();
		const wt = await createWorktree(root, "dirty-task");
		await writeFile(join(wt, "feature.txt"), "feature\n");
		await exec("git", ["add", "feature.txt"], { cwd: wt });
		await exec("git", ["commit", "-m", "feature", "--quiet"], { cwd: wt });

		await writeFile(join(root, "base.txt"), "base\ndirty\n", "utf8");

		const status = await worktreeStatus(root);
		expect(status.dirty).toContain("base.txt");

		const res = await ffMerge(root, "dirty-task");
		expect(res.success).toBe(false);
		expect(res.message).toMatch(/uncommitted changes/i);
		expect(res.message).toContain("Recovery:");
	});

	it("reports diverged branches with recovery guidance", async () => {
		const root = await repo();
		const wt = await createWorktree(root, "diverge-task");
		await writeFile(join(wt, "wt.txt"), "wt\n");
		await exec("git", ["add", "wt.txt"], { cwd: wt });
		await exec("git", ["commit", "-m", "wt change", "--quiet"], { cwd: wt });

		await writeFile(join(root, "main.txt"), "main\n");
		await exec("git", ["add", "main.txt"], { cwd: root });
		await exec("git", ["commit", "-m", "main change", "--quiet"], { cwd: root });

		const res = await ffMerge(root, "diverge-task");
		expect(res.success).toBe(false);
		expect(res.message).toMatch(/diverged|fast-forward/i);
		expect(res.message).toContain("Recovery:");
	});

	it("reports a missing branch instead of opaque git stderr", async () => {
		const root = await repo();
		const res = await ffMerge(root, "never-created");
		expect(res.success).toBe(false);
		expect(res.message).toMatch(/does not exist/i);
		expect(res.message).toContain("Recovery:");
	});

	it("rejects a stale directory that is not a registered worktree", async () => {
		const root = await repo();
		const wt = worktreePath(root, "stale-task");
		await mkdir(wt, { recursive: true });
		await writeFile(join(wt, "junk.txt"), "junk\n");

		await expect(createWorktree(root, "stale-task")).rejects.toThrow(/not a registered/i);
	});

	it("explains a branch already checked out elsewhere", async () => {
		const root = await repo();
		await createWorktree(root, "taken-task");
		const wt = worktreePath(root, "taken-task");
		// Remove the worktree registration but keep the branch, then block the
		// path with a stale directory so the next add fails on checkout.
		await exec("git", ["worktree", "remove", "--force", wt], { cwd: root });
		await mkdir(wt, { recursive: true });
		await writeFile(join(wt, "blocker.txt"), "blocker\n");

		await expect(createWorktree(root, "taken-task")).rejects.toThrow(/Recovery:/);
	});
});
