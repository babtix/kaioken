import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Every git call this project makes goes through here.
 *
 * `execFile`, never a shell: repository paths and branch names arrive from the
 * user and from disk, and a shell would give a path containing `;` or a branch
 * named `$(…)` a second meaning. The argument vector has no such reading.
 *
 * A large diff is the normal case rather than the exceptional one, so the
 * output cap is generous; past it, the caller gets a truncated body instead of
 * a thrown error, because a partial diff still drafts a usable message.
 */
const MAX_OUTPUT = 16 * 1024 * 1024;

export interface GitResult {
	ok: boolean;
	stdout: string;
	stderr: string;
}

/** Run one git command in `repo`. Never throws for a non-zero exit. */
export async function git(repo: string, ...args: string[]): Promise<GitResult> {
	try {
		const { stdout, stderr } = await exec("git", args, {
			cwd: repo,
			maxBuffer: MAX_OUTPUT,
			windowsHide: true,
		});
		return { ok: true, stdout, stderr };
	} catch (err) {
		const e = err as { stdout?: string; stderr?: string; message?: string };
		return { ok: false, stdout: e.stdout ?? "", stderr: e.stderr ?? e.message ?? "git failed" };
	}
}

/** The trimmed stdout of a git command, or "" if it failed. */
export async function gitLine(repo: string, ...args: string[]): Promise<string> {
	const result = await git(repo, ...args);
	return result.ok ? result.stdout.trim() : "";
}

/** Is this a git repository (or inside one)? */
export async function isRepo(repo: string): Promise<boolean> {
	return (await gitLine(repo, "rev-parse", "--is-inside-work-tree")) === "true";
}

/**
 * The real `.git` directory.
 *
 * In a worktree or a submodule, `.git` is a *file* pointing elsewhere, and the
 * hooks the repository actually runs live at the path git reports here — not
 * at `<repo>/.git/hooks`, which in that layout does not exist.
 */
export async function gitDir(repo: string): Promise<string | null> {
	const dir = await gitLine(repo, "rev-parse", "--absolute-git-dir");
	return dir || null;
}
