import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { git } from "./run.ts";

export interface WorktreeStatus {
	/** Repository-relative paths with unresolved merge conflicts. */
	conflicted: string[];
	/** Repository-relative paths with staged or unstaged changes. */
	dirty: string[];
}

/**
 * Current conflict and dirty state of `root`.
 *
 * Porcelain v1 marks unmerged entries in the first two columns (`UU`, `AA`,
 * `DD`, `AU`, `UA`, `DU`, `UD`); anything else non-untracked is an
 * uncommitted change that blocks a fast-forward merge.
 */
export async function worktreeStatus(root: string): Promise<WorktreeStatus> {
	const result = await git(root, "status", "--porcelain=v1");
	const lines = result.ok ? result.stdout.split(/\r?\n/).filter((line) => line.trim() !== "") : [];
	const conflicted: string[] = [];
	const dirty: string[] = [];
	for (const line of lines) {
		const code = line.slice(0, 2);
		const path = line.slice(3).replace(/^"(.*)"$/, "$1");
		if (isUnmerged(code)) conflicted.push(path);
		else if (!code.startsWith("?")) dirty.push(path);
	}
	return { conflicted, dirty };
}

export function slug(input: string): string {
	return (
		input
			.trim()
			.toLowerCase()
			.replace(/[^a-z0-9_-]+/g, "-")
			.replace(/^-+|-+$/g, "") || "task"
	);
}

export function worktreePath(root: string, name: string): string {
	const s = slug(name);
	return resolve(join(root, ".kaioken", "worktrees", s));
}

export async function createWorktree(root: string, name: string): Promise<string> {
	const s = slug(name);
	const branch = `kaioken/${s}`;
	const wt = worktreePath(root, s);

	await mkdir(dirname(wt), { recursive: true });

	if (existsSync(wt)) {
		if (await isRegisteredWorktree(root, wt)) return wt;
		throw new Error(
			`Worktree path ${wt} already exists but is not a registered git worktree. ` +
				`Recovery: remove the directory (rm -rf ${wt}) or choose another task name, ` +
				`then retry. Inspect with: git worktree list.`,
		);
	}

	// Check if branch already exists
	const branchCheck = await git(root, "rev-parse", "--verify", branch);
	let res: { ok: boolean; stdout: string; stderr: string };
	if (branchCheck.ok) {
		res = await git(root, "worktree", "add", wt, branch);
	} else {
		res = await git(root, "worktree", "add", "-b", branch, wt);
	}

	if (!res.ok) {
		throw new Error(describeWorktreeAddFailure(wt, branch, res.stderr));
	}

	return wt;
}

export async function ffMerge(root: string, name: string): Promise<{ success: boolean; message: string }> {
	const s = slug(name);
	const branch = `kaioken/${s}`;
	const wt = worktreePath(root, s);

	const branchCheck = await git(root, "rev-parse", "--verify", branch);
	if (!branchCheck.ok) {
		return {
			success: false,
			message:
				`Cannot merge ${branch}: branch does not exist. ` +
				`Recovery: create it first (createWorktree for "${s}"), or check the task name with: git branch --list 'kaioken/*'.`,
		};
	}

	const before = await worktreeStatus(root);
	if (before.conflicted.length > 0) {
		return {
			success: false,
			message: describeConflict(root, before.conflicted),
		};
	}
	if (before.dirty.length > 0) {
		return {
			success: false,
			message: describeDirty(root, before.dirty),
		};
	}

	const mergeRes = await git(root, "merge", "--ff-only", branch);
	if (!mergeRes.ok) {
		return { success: false, message: await describeMergeFailure(root, branch, mergeRes.stderr) };
	}

	// Remove worktree
	await git(root, "worktree", "remove", wt, "--force").catch(() => {});
	// Clean branch
	await git(root, "branch", "-d", branch).catch(() => {});

	return { success: true, message: `Merged ${branch} cleanly via fast-forward.` };
}

export async function removeWorktree(root: string, name: string): Promise<boolean> {
	const s = slug(name);
	const wt = worktreePath(root, s);
	const res = await git(root, "worktree", "remove", wt, "--force");
	return res.ok;
}

function isUnmerged(code: string): boolean {
	return (
		code === "DD" ||
		code === "AU" ||
		code === "UD" ||
		code === "UA" ||
		code === "DU" ||
		code === "AA" ||
		code === "UU"
	);
}

async function isRegisteredWorktree(root: string, wt: string): Promise<boolean> {
	const list = await git(root, "worktree", "list", "--porcelain");
	if (!list.ok) return false;
	const normalized = wt.replace(/\\/g, "/");
	const lines = list.stdout.split(/\r?\n/);
	for (const line of lines) {
		if (!line.startsWith("worktree ")) continue;
		if (line.slice("worktree ".length).replace(/\\/g, "/") === normalized) return true;
	}
	return false;
}

/**
 * Turn an opaque `git worktree add` failure into an error that says what to
 * do next. The raw stderr is kept as a suffix — without it the recovery steps
 * below would be guesses rather than diagnoses.
 */
function describeWorktreeAddFailure(wt: string, branch: string, stderr: string): string {
	const detail = stderr.trim().split(/\r?\n/).slice(0, 3).join(" ");
	if (/already checked out|already used by|checked out at/i.test(stderr)) {
		return (
			`Cannot create worktree at ${wt}: branch ${branch} is already checked out in another worktree (${detail}). ` +
			`Recovery: reuse that worktree, remove it (git worktree remove <path>), or pick another task name. ` +
			`Inspect with: git worktree list.`
		);
	}
	if (/would be overwritten|untracked files|checkout conflict|dirty/i.test(stderr)) {
		return (
			`Cannot create worktree at ${wt}: checkout would overwrite existing files (${detail}). ` +
			`Recovery: remove or stash the conflicting files, or delete the target directory, then retry. ` +
			`Inspect with: git status --porcelain.`
		);
	}
	if (/already exists/i.test(stderr)) {
		return (
			`Cannot create worktree at ${wt}: path or branch already exists (${detail}). ` +
			`Recovery: remove the stale directory or delete the branch (git branch -D ${branch}), then retry. ` +
			`Inspect with: git worktree list; git branch --list 'kaioken/*'.`
		);
	}
	if (/locked/i.test(stderr)) {
		return (
			`Cannot create worktree at ${wt}: worktree is locked (${detail}). ` +
			`Recovery: unlock it (git worktree unlock ${wt}) or remove it, then retry.`
		);
	}
	return (
		`Failed to create worktree at ${wt} for ${branch}: ${detail}. ` +
		`Recovery: inspect with git worktree list and git status --porcelain, ` +
		`then remove the stale path or pick another task name.`
	);
}

function describeConflict(_root: string, files: string[]): string {
	const list = files.slice(0, 10).join(", ");
	return (
		`Cannot merge: repository has unresolved merge conflicts in: ${list}. ` +
		`Recovery: open each file, resolve the <<<<<<< markers, then run git add <file> and git commit. ` +
		`Inspect with: git status --porcelain; git diff --check.`
	);
}

function describeDirty(_root: string, files: string[]): string {
	const list = files.slice(0, 10).join(", ");
	return (
		`Cannot fast-forward: working tree has uncommitted changes in: ${list}. ` +
		`Recovery: commit them (git add -A && git commit) or shelve them (git stash push -m kaioken), then retry. ` +
		`Inspect with: git status --porcelain.`
	);
}

/**
 * Classify a failed `git merge --ff-only` so callers get recovery steps, not
 * git's one-line stderr. Re-reads conflict status because a concurrent merge
 * may have left unmerged entries behind after git exited.
 */
async function describeMergeFailure(root: string, branch: string, stderr: string): Promise<string> {
	const status = await worktreeStatus(root);
	if (status.conflicted.length > 0) return describeConflict(root, status.conflicted);
	const detail = stderr.trim().split(/\r?\n/).slice(0, 3).join(" ");
	if (/not possible to fast-forward|have diverged|divergent|need to merge/i.test(stderr)) {
		return (
			`Cannot fast-forward ${branch}: branches have diverged (${detail}). ` +
			`Recovery: merge manually (git merge ${branch}) and resolve conflicts, ` +
			`or rebase the worktree branch onto main, then retry. ` +
			`Inspect with: git log --oneline --graph --all -20; git status --porcelain.`
		);
	}
	if (/local changes|uncommitted|would be overwritten|stash/i.test(stderr)) {
		return (
			`Cannot fast-forward ${branch}: local changes would be overwritten (${detail}). ` +
			`Recovery: commit or stash the working tree, then retry. ` +
			`Inspect with: git status --porcelain.`
		);
	}
	if (/unmerged|conflict/i.test(stderr)) {
		return `${describeConflict(root, status.conflicted.length > 0 ? status.conflicted : ["<unknown>"])} Git said: ${detail}.`;
	}
	return (
		`Fast-forward merge of ${branch} failed: ${detail}. ` +
		`Recovery: inspect with git status --porcelain and git log --oneline --graph --all -10, ` +
		`then merge manually (git merge ${branch}) if a true merge is needed.`
	);
}
