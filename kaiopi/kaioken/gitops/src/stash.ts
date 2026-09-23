import { git, gitLine, isRepo } from "./run.ts";
import { worktreeStatus } from "./worktree.ts";

export interface AutoStashRecord {
	created: boolean;
	stashId?: string;
	message: string;
	untrackedCount: number;
	dirtyCount: number;
}

export interface PopStashResult {
	success: boolean;
	conflicted: boolean;
	message: string;
}

/**
 * List untracked files in the repository honoring .gitignore.
 */
export async function detectUntracked(repo: string): Promise<string[]> {
	if (!(await isRepo(repo))) return [];
	const out = await gitLine(repo, "ls-files", "--others", "--exclude-standard");
	if (!out) return [];
	return out
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);
}

/**
 * Push an automatic stash containing staged, unstaged, and untracked changes.
 */
export async function pushAutoStash(repo: string, reason: string): Promise<AutoStashRecord | null> {
	if (!(await isRepo(repo))) return null;

	const status = await worktreeStatus(repo);
	const untracked = await detectUntracked(repo);

	if (status.dirty.length === 0 && untracked.length === 0) {
		return {
			created: false,
			message: "Working tree clean, no stash needed.",
			untrackedCount: 0,
			dirtyCount: 0,
		};
	}

	const tag = `kaioken-guard: ${reason} [${Date.now()}]`;
	const res = await git(repo, "stash", "push", "--include-untracked", "-m", tag);
	if (!res.ok) {
		throw new Error(
			`Failed to create auto-stash guard: ${res.stderr.trim()}. ` +
				`Recovery: inspect changes with git status --porcelain and manually stash or commit before proceeding.`,
		);
	}

	// Read stash ref
	const list = await gitLine(repo, "stash", "list", "-1");
	const stashId = list.split(":")[0]?.trim() || "stash@{0}";

	return {
		created: true,
		stashId,
		message: tag,
		untrackedCount: untracked.length,
		dirtyCount: status.dirty.length,
	};
}

/**
 * Pop an automatic stash, restoring previously stashed changes.
 */
export async function popAutoStash(repo: string): Promise<PopStashResult> {
	const res = await git(repo, "stash", "pop");
	if (res.ok) {
		return {
			success: true,
			conflicted: false,
			message: "Auto-stash restored cleanly.",
		};
	}

	// Check if pop caused merge conflict
	const status = await worktreeStatus(repo);
	if (status.conflicted.length > 0) {
		return {
			success: false,
			conflicted: true,
			message:
				`Restoring auto-stash resulted in merge conflicts in: ${status.conflicted.join(", ")}. ` +
				`The stash entry has been preserved. Recovery: resolve <<<<<<< conflict markers, then run git stash drop.`,
		};
	}

	return {
		success: false,
		conflicted: false,
		message: `Failed to pop auto-stash: ${res.stderr.trim()}`,
	};
}

/**
 * Run a critical git operation enclosed within an auto-stash guard.
 *
 * If the working tree has dirty modifications or untracked files,
 * they are safely stashed before running `operation`, and popped afterwards.
 */
export async function withAutoStash<T>(
	repo: string,
	reason: string,
	operation: () => Promise<T>,
): Promise<T> {
	const stash = await pushAutoStash(repo, reason);
	if (!stash || !stash.created) {
		return await operation();
	}

	let opError: unknown = null;
	let result: T | undefined;

	try {
		result = await operation();
	} catch (err) {
		opError = err;
	} finally {
		const popResult = await popAutoStash(repo);
		if (!popResult.success) {
			const warning = `Warning: auto-stash pop issue: ${popResult.message}`;
			if (opError) {
				const msg = opError instanceof Error ? opError.message : String(opError);
				throw new Error(`${msg}\n${warning}`);
			}
			throw new Error(warning);
		}
	}

	if (opError) {
		throw opError;
	}

	return result as T;
}
