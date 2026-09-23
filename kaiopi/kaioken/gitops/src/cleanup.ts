import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { currentBranch } from "./diff.ts";
import { listWorktrees, type WorktreeEntry } from "./recipe.ts";
import { git, gitLine, isRepo } from "./run.ts";

export interface PrunedWorktreeDetail {
	name: string;
	path: string;
	reason: string;
}

export interface PruneReport {
	prunedWorktrees: PrunedWorktreeDetail[];
	prunedBranches: string[];
	activeWorktrees: string[];
	reclaimedBytes: number;
}

export interface PruneOptions {
	/** Dry run mode without deleting actual directories or branches (default: false). */
	dryRun?: boolean;
	/** Force removal of worktrees even if unmerged (default: false). */
	force?: boolean;
	/** Target base branch to check merge status against (default: current branch or 'main'). */
	baseBranch?: string;
}

/**
 * Interactive worktree cleanup wizard pruning stale scratch directories and merged branches.
 */
export async function pruneWorktrees(
	repo: string,
	options: PruneOptions = {},
): Promise<PruneReport> {
	if (!(await isRepo(repo))) {
		return {
			prunedWorktrees: [],
			prunedBranches: [],
			activeWorktrees: [],
			reclaimedBytes: 0,
		};
	}

	const dryRun = Boolean(options.dryRun);
	const base = options.baseBranch || (await currentBranch(repo)) || "main";

	// 1. Run git's internal worktree prune
	if (!dryRun) {
		await git(repo, "worktree", "prune");
	}

	// 2. Discover registered worktrees
	const registered = await listWorktrees(repo);
	const registeredPaths = new Set(registered.map((w) => normalize(w.path)));

	// 3. Find merged branches
	const mergedBranchesResult = await gitLine(repo, "branch", "--merged", base);
	const mergedBranches = new Set(
		mergedBranchesResult
			.split(/\r?\n/)
			.map((b) => b.trim().replace(/^[*+]\s*/, "").trim())
			.filter(Boolean),
	);

	const wtDir = join(repo, ".kaioken", "worktrees");
	const prunedWorktrees: PrunedWorktreeDetail[] = [];
	const prunedBranches: string[] = [];
	const activeWorktrees: string[] = [];
	let reclaimedBytes = 0;

	// Check on-disk scratch directories
	if (existsSync(wtDir)) {
		let subdirs: string[] = [];
		try {
			subdirs = readdirSync(wtDir);
		} catch {
			subdirs = [];
		}

		for (const name of subdirs) {
			const fullPath = join(wtDir, name);
			const norm = normalize(fullPath);
			const isReg = registeredPaths.has(norm);
			const branchName = `kaioken/${name}`;
			const isMerged = mergedBranches.has(branchName);

			let shouldPrune = false;
			let pruneReason = "";

			if (!isReg) {
				shouldPrune = true;
				pruneReason = "Orphaned directory not registered with git worktree list";
			} else if (isMerged || options.force) {
				shouldPrune = true;
				pruneReason = isMerged ? `Branch ${branchName} already merged into ${base}` : "Forced prune";
			}

			if (shouldPrune) {
				const size = getDirectorySize(fullPath);
				reclaimedBytes += size;
				prunedWorktrees.push({
					name,
					path: fullPath,
					reason: pruneReason,
				});

				if (!dryRun) {
					// Unregister if still registered
					if (isReg) {
						await git(repo, "worktree", "remove", fullPath, "--force").catch(() => {});
					}
					// Remove folder
					await rm(fullPath, { recursive: true, force: true }).catch(() => {});
					// Remove branch if merged
					if (isMerged || options.force) {
						const delFlag = options.force ? "-D" : "-d";
						const delRes = await git(repo, "branch", delFlag, branchName);
						if (delRes.ok) {
							prunedBranches.push(branchName);
						}
					}
				}
			} else {
				activeWorktrees.push(name);
			}
		}
	}

	return {
		prunedWorktrees,
		prunedBranches,
		activeWorktrees,
		reclaimedBytes,
	};
}

/**
 * Read the background hook execution diagnostics from `.kaioken/hook.log`.
 */
export async function readHookLog(repo: string, maxLines = 50): Promise<string> {
	const logPath = join(repo, ".kaioken", "hook.log");
	if (!existsSync(logPath)) {
		return `No hook log found at ${logPath}.`;
	}

	try {
		const content = await readFile(logPath, "utf8");
		const lines = content.split(/\r?\n/).filter(Boolean);
		if (lines.length <= maxLines) {
			return content;
		}
		return lines.slice(-maxLines).join("\n");
	} catch (err: unknown) {
		const e = err as Error;
		return `Error reading hook log: ${e.message}`;
	}
}

function normalize(path: string): string {
	return path.replace(/\\/g, "/").toLowerCase();
}

function getDirectorySize(dir: string): number {
	let total = 0;
	try {
		const entries = readdirSync(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				total += getDirectorySize(full);
			} else if (entry.isFile()) {
				total += statSync(full).size;
			}
		}
	} catch {
		// Ignore permission or file-not-found errors during calculation
	}
	return total;
}
