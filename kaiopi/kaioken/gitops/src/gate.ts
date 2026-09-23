import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { detectConflicts, renderConflictCard } from "./conflict.ts";
import { currentBranch } from "./diff.ts";
import { git } from "./run.ts";
import { withAutoStash } from "./stash.ts";
import { removeWorktree, slug, worktreePath, worktreeStatus } from "./worktree.ts";

const exec = promisify(execFile);

export interface VerificationCheckResult {
	pass: boolean;
	summary: string;
	errorOutput?: string;
}

export type VerifyFn = (worktreePath: string) => Promise<VerificationCheckResult>;

export interface SafeMergeOptions {
	/** Enforce verification gate before fast-forward merge (default: true). */
	verify?: boolean;
	/** Custom verification function. If omitted, runs default native test check. */
	verifyFn?: VerifyFn;
	/** Automatically stash dirty base working tree before merge (default: false). */
	autoStash?: boolean;
	/** Base branch to merge into (default: current branch or 'main'). */
	baseBranch?: string;
	/** Remove worktree directory after successful merge (default: true). */
	removeWorktree?: boolean;
	/** Delete branch after successful merge (default: true). */
	deleteBranch?: boolean;
}

export interface SafeMergeResult {
	success: boolean;
	message: string;
	testPassed?: boolean;
	diverged?: boolean;
	conflicts?: string[];
	verificationSummary?: string;
}

/**
 * Execute native test runner in the worktree directory if no verifyFn is supplied.
 */
export async function defaultNativeTestVerify(wtPath: string): Promise<VerificationCheckResult> {
	if (!existsSync(wtPath)) {
		return { pass: false, summary: `Worktree path ${wtPath} does not exist.` };
	}

	const hasPkg = existsSync(join(wtPath, "package.json"));
	if (!hasPkg) {
		return { pass: true, summary: "No package.json detected; verification gate passed (no-op)." };
	}

	try {
		// Run npm test or vitest with short timeout
		const { stdout, stderr } = await exec("npm", ["test"], {
			cwd: wtPath,
			timeout: 60000,
			windowsHide: true,
		});
		return {
			pass: true,
			summary: "Native test suite passed successfully.",
			errorOutput: stdout.slice(-1000),
		};
	} catch (err: unknown) {
		const e = err as { stdout?: string; stderr?: string; message?: string };
		const detail = (e.stderr || e.stdout || e.message || "Tests failed").trim();
		return {
			pass: false,
			summary: `Test gate failed in worktree:\n${detail.slice(0, 1000)}`,
			errorOutput: detail,
		};
	}
}

/**
 * Fast-forward merge verification gate enforcing passing tests before landing.
 */
export async function safeMerge(
	root: string,
	name: string,
	options: SafeMergeOptions = {},
): Promise<SafeMergeResult> {
	const shouldVerify = options.verify ?? true;
	const verifyFn = options.verifyFn ?? defaultNativeTestVerify;
	const shouldAutoStash = options.autoStash ?? false;
	const shouldRemoveWt = options.removeWorktree ?? true;
	const shouldDeleteBranch = options.deleteBranch ?? true;

	const taskSlug = slug(name);
	const branch = `kaioken/${taskSlug}`;
	const wt = worktreePath(root, taskSlug);

	// 1. Check if branch exists
	const branchCheck = await git(root, "rev-parse", "--verify", branch);
	if (!branchCheck.ok) {
		return {
			success: false,
			message:
				`Cannot merge ${branch}: branch does not exist. ` +
				`Recovery: create it first (createWorktree for "${taskSlug}"), or check task name with: git branch --list 'kaioken/*'.`,
		};
	}

	// 2. Fast-forward verification gate
	if (shouldVerify) {
		const verifyResult = await verifyFn(wt);
		if (!verifyResult.pass) {
			return {
				success: false,
				testPassed: false,
				verificationSummary: verifyResult.summary,
				message:
					`MERGE GATE BLOCKED: Tests failed in worktree "${wt}". ` +
					`Fast-forward merge aborted to prevent broken code from landing in base branch.\n` +
					`Summary:\n${verifyResult.summary}\n\n` +
					`RECOVERY PROTOCOL: Inspect failures in ${wt}, fix assertions, and ensure tests pass before retrying merge.`,
			};
		}
	}

	// 3. Merge execution inside optional auto-stash guard
	const runMerge = async (): Promise<SafeMergeResult> => {
		const before = await worktreeStatus(root);
		if (before.conflicted.length > 0) {
			const conflictInfo = await detectConflicts(root, options.baseBranch, branch);
			return {
				success: false,
				diverged: true,
				conflicts: before.conflicted,
				message: renderConflictCard(conflictInfo),
			};
		}

		if (before.dirty.length > 0 && !shouldAutoStash) {
			return {
				success: false,
				message:
					`Cannot fast-forward: working tree has uncommitted changes in: ${before.dirty.slice(0, 5).join(", ")}. ` +
					`Recovery: commit changes, enable autoStash, or run: git stash push -m "kaioken".`,
			};
		}

		const mergeRes = await git(root, "merge", "--ff-only", branch);
		if (!mergeRes.ok) {
			const curBranch = await currentBranch(root);
			const conflictInfo = await detectConflicts(root, curBranch || "main", branch);
			return {
				success: false,
				diverged: true,
				message:
					`Fast-forward merge of ${branch} failed: branches have diverged.\n` +
					`Recovery: rebase worktree branch onto ${curBranch || "main"} or merge manually.\n` +
					renderConflictCard(conflictInfo),
			};
		}

		if (shouldRemoveWt) {
			await removeWorktree(root, taskSlug).catch(() => {});
		}
		if (shouldDeleteBranch) {
			await git(root, "branch", "-d", branch).catch(() => {});
		}

		return {
			success: true,
			testPassed: shouldVerify ? true : undefined,
			message: `Cleanly merged ${branch} via verified fast-forward.`,
		};
	};

	if (shouldAutoStash) {
		return await withAutoStash(root, `merge-${taskSlug}`, runMerge);
	}
	return await runMerge();
}

/**
 * Backward-compatible ffMerge wrapper calling safeMerge.
 */
export async function ffMerge(
	root: string,
	name: string,
): Promise<{ success: boolean; message: string }> {
	const res = await safeMerge(root, name, { verify: false, autoStash: false });
	return { success: res.success, message: res.message };
}
