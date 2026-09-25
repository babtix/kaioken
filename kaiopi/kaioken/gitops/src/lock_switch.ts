import { existsSync } from "node:fs";
import { mkdir, readFile, rm, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createWorktree, slug, worktreePath } from "./worktree.ts";
import { currentBranch } from "./diff.ts";
import { git } from "./run.ts";
import type { DelegationTaskType } from "./recipe.ts";

export interface LockHandle {
	slug: string;
	lockFilePath: string;
	pid: number;
	acquiredAt: number;
	taskType?: string;
}

export interface AtomicSwitchOptions {
	/** Worktree task archetype for diagnostic guidance (UX-1871 to UX-1880). */
	taskType?: DelegationTaskType | string;
	/** Timeout in milliseconds to wait for lock acquisition before failing (default: 5000). */
	timeoutMs?: number;
	/** Alias for timeoutMs. */
	acquireTimeoutMs?: number;
	/** Retry interval in milliseconds (default: 100). */
	retryIntervalMs?: number;
	/** Maximum age in milliseconds after which a lock is deemed stale and reclaimed (default: 60000). */
	staleLockAgeMs?: number;
	/** Alias for staleLockAgeMs. */
	lockTtlMs?: number;
	/** Automatically create worktree if it does not yet exist (default: true). */
	createIfMissing?: boolean;
}

export interface AtomicSwitchResult {
	success: boolean;
	targetSlug: string;
	targetPath: string;
	taskType: string;
	previousBranch?: string;
	lockHandle?: LockHandle;
	message: string;
	contentionDetected?: boolean;
	lockOwnerPid?: number;
}

/**
 * Atomic worktree switch preventing file lock contention across the 10 task archetypes:
 * 1. experimental refactoring branch (UX-1871)
 * 2. automated dependency upgrade task (UX-1872)
 * 3. documentation rewrite worktree (UX-1873)
 * 4. failing bug investigation sandbox (UX-1874)
 * 5. performance benchmark trial branch (UX-1875)
 * 6. multi-package migration experiment (UX-1876)
 * 7. security patch isolated worktree (UX-1877)
 * 8. feature prototyping scratchpad (UX-1878)
 * 9. code cleanup and formatting sweep (UX-1879)
 * 10. release candidate staging worktree (UX-1880)
 */
export async function atomicWorktreeSwitch(
	root: string,
	targetName: string,
	options: AtomicSwitchOptions = {},
): Promise<AtomicSwitchResult> {
	const taskSlug = slug(targetName);
	const taskType = options.taskType ?? inferTaskTypeFromName(targetName);
	const timeoutMs = options.acquireTimeoutMs ?? options.timeoutMs ?? 5000;
	const retryIntervalMs = options.retryIntervalMs ?? 100;
	const staleAgeMs = options.lockTtlMs ?? options.staleLockAgeMs ?? 60000;
	const createIfMissing = options.createIfMissing ?? true;

	const locksDir = join(root, ".kaioken", "locks");
	await mkdir(locksDir, { recursive: true });
	const lockFilePath = join(locksDir, `${taskSlug}.lock`);

	const prevBranch = (await currentBranch(root)) ?? undefined;
	const startTime = Date.now();
	let lockHandle: LockHandle | undefined;
	let contentionDetected = false;
	let lockOwnerPid: number | undefined;

	while (Date.now() - startTime < timeoutMs) {
		if (existsSync(lockFilePath)) {
			contentionDetected = true;
			// Check if stale lock
			try {
				const lockDataStr = await readFile(lockFilePath, "utf8");
				const lockData = JSON.parse(lockDataStr);
				lockOwnerPid = lockData.pid;

				const age = Date.now() - (lockData.acquiredAt || 0);
				const isDeadPid = lockData.pid && !isProcessRunning(lockData.pid);

				if (age > staleAgeMs || isDeadPid) {
					// Stale lock detected, safely break and reclaim
					await unlink(lockFilePath).catch(() => {});
				}
			} catch {
				// Corrupt lock file, reclaim
				await unlink(lockFilePath).catch(() => {});
			}
		}

		try {
			// Atomic creation using wx flag
			const handle: LockHandle = {
				slug: taskSlug,
				lockFilePath,
				pid: process.pid,
				acquiredAt: Date.now(),
				taskType,
			};
			await writeFile(lockFilePath, JSON.stringify(handle, null, 2), { flag: "wx" });
			lockHandle = handle;
			break;
		} catch {
			// Lock is currently held, wait and retry
			await delay(retryIntervalMs);
		}
	}

	if (!lockHandle) {
		const archetypeDesc = getArchetypeLockDescription(taskType);
		return {
			success: false,
			targetSlug: taskSlug,
			targetPath: worktreePath(root, taskSlug),
			taskType,
			previousBranch: prevBranch,
			contentionDetected: true,
			lockOwnerPid,
			message:
				`Lock contention error: unable to switch to ${archetypeDesc} worktree "${taskSlug}". ` +
				`Another process (PID: ${lockOwnerPid ?? "unknown"}) holds the active worktree lock. ` +
				`Recovery: wait for concurrent task to finish or remove stale lock at ${lockFilePath}.`,
		};
	}

	// Worktree directory resolution / creation
	let wtPath = worktreePath(root, taskSlug);
	if (!existsSync(wtPath)) {
		if (createIfMissing) {
			try {
				wtPath = await createWorktree(root, taskSlug);
			} catch (err: unknown) {
				await releaseWorktreeLock(lockHandle);
				const e = err as Error;
				return {
					success: false,
					targetSlug: taskSlug,
					targetPath: wtPath,
					taskType,
					previousBranch: prevBranch,
					message: `Failed to create worktree during atomic switch: ${e.message}`,
				};
			}
		} else {
			await releaseWorktreeLock(lockHandle);
			return {
				success: false,
				targetSlug: taskSlug,
				targetPath: wtPath,
				taskType,
				previousBranch: prevBranch,
				message: `Destination worktree "${taskSlug}" does not exist and createIfMissing is false.`,
			};
		}
	}

	// Verify clean index state (no git index.lock in worktree or repo)
	const indexLock = join(wtPath, ".git", "index.lock");
	if (existsSync(indexLock)) {
		await releaseWorktreeLock(lockHandle);
		return {
			success: false,
			targetSlug: taskSlug,
			targetPath: wtPath,
			taskType,
			previousBranch: prevBranch,
			contentionDetected: true,
			message: `Git index lock contention detected in target worktree at ${indexLock}.`,
		};
	}

	return {
		success: true,
		targetSlug: taskSlug,
		targetPath: wtPath,
		taskType,
		previousBranch: prevBranch,
		lockHandle,
		message: `Atomically switched to worktree "${taskSlug}" (${taskType}) with exclusive lock protection.`,
	};
}

/**
 * Release an active worktree lock.
 */
export async function releaseWorktreeLock(handle?: LockHandle): Promise<boolean> {
	if (!handle) return false;
	try {
		if (existsSync(handle.lockFilePath)) {
			await unlink(handle.lockFilePath);
			return true;
		}
	} catch {
		// Ignore deletion errors on release
	}
	return false;
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

function inferTaskTypeFromName(name: string): string {
	const lower = name.toLowerCase();
	if (lower.includes("refactor")) return "refactor";
	if (lower.includes("dep") || lower.includes("upgrade")) return "deps";
	if (lower.includes("doc") || lower.includes("wiki")) return "docs";
	if (lower.includes("fix") || lower.includes("bug")) return "fix";
	if (lower.includes("bench") || lower.includes("perf")) return "bench";
	if (lower.includes("migrat")) return "migration";
	if (lower.includes("sec") || lower.includes("vuln")) return "security";
	if (lower.includes("proto")) return "prototype";
	if (lower.includes("clean") || lower.includes("format")) return "cleanup";
	if (lower.includes("stage") || lower.includes("rc")) return "staging";
	return "custom";
}

function getArchetypeLockDescription(taskType: string): string {
	switch (taskType) {
		case "refactor":
			return "experimental refactoring branch (UX-1871)";
		case "deps":
			return "automated dependency upgrade task (UX-1872)";
		case "docs":
			return "documentation rewrite worktree (UX-1873)";
		case "fix":
			return "failing bug investigation sandbox (UX-1874)";
		case "bench":
			return "performance benchmark trial branch (UX-1875)";
		case "migration":
			return "multi-package migration experiment (UX-1876)";
		case "security":
			return "security patch isolated worktree (UX-1877)";
		case "prototype":
			return "feature prototyping scratchpad (UX-1878)";
		case "cleanup":
			return "code cleanup and formatting sweep (UX-1879)";
		case "staging":
			return "release candidate staging worktree (UX-1880)";
		default:
			return "custom worktree task";
	}
}
