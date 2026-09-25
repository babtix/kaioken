import { existsSync, readdirSync, statSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { currentBranch } from "./diff.ts";
import { listWorktrees, type WorktreeEntry, type DelegationTaskType } from "./recipe.ts";
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

export interface CleanupWizardOptions extends PruneOptions {
	/** Filter wizard actions to a specific task archetype (UX-1861 to UX-1870). */
	taskType?: DelegationTaskType | string;
}

export interface CleanupWizardEntry {
	name: string;
	path: string;
	taskType: string;
	branchName: string;
	isRegistered: boolean;
	isMerged: boolean;
	isStale: boolean;
	reason: string;
	sizeBytes: number;
}

export interface CleanupWizardReport {
	entries: CleanupWizardEntry[];
	prunedCount: number;
	preservedCount: number;
	reclaimedBytes: number;
	dryRun: boolean;
	byArchetype: Record<string, { total: number; pruned: number }>;
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
 * Interactive worktree cleanup wizard pruning stale directories across the 10 task archetypes (UX-1861 to UX-1870).
 */
export async function interactiveWorktreeCleanupWizard(
	repo: string,
	options: CleanupWizardOptions = {},
): Promise<CleanupWizardReport> {
	if (!(await isRepo(repo))) {
		return {
			entries: [],
			prunedCount: 0,
			preservedCount: 0,
			reclaimedBytes: 0,
			dryRun: Boolean(options.dryRun),
			byArchetype: {},
		};
	}

	const dryRun = Boolean(options.dryRun);
	const base = options.baseBranch || (await currentBranch(repo)) || "main";

	// Discover registered worktrees
	const registered = await listWorktrees(repo);
	const registeredPaths = new Set(registered.map((w) => normalize(w.path)));

	// Find merged branches
	const mergedBranchesResult = await gitLine(repo, "branch", "--merged", base);
	const mergedBranches = new Set(
		mergedBranchesResult
			.split(/\r?\n/)
			.map((b) => b.trim().replace(/^[*+]\s*/, "").trim())
			.filter(Boolean),
	);

	const wtDir = join(repo, ".kaioken", "worktrees");
	const entries: CleanupWizardEntry[] = [];
	const byArchetype: Record<string, { total: number; pruned: number }> = {};
	let reclaimedBytes = 0;
	let prunedCount = 0;
	let preservedCount = 0;

	if (existsSync(wtDir)) {
		let subdirs: string[] = [];
		try {
			subdirs = readdirSync(wtDir);
		} catch {
			subdirs = [];
		}

		for (const name of subdirs) {
			const taskType = inferTaskTypeFromName(name);
			if (options.taskType && taskType.toLowerCase() !== options.taskType.toLowerCase()) {
				continue;
			}

			const fullPath = join(wtDir, name);
			const norm = normalize(fullPath);
			const isReg = registeredPaths.has(norm);
			const branchName = `kaioken/${name}`;
			const isMerged = mergedBranches.has(branchName);

			let isStale = false;
			let reason = "Active worktree";

			if (!isReg) {
				isStale = true;
				reason = "Orphaned directory not registered with git worktree list";
			} else if (isMerged) {
				isStale = true;
				reason = `Merged into ${base}`;
			} else if (options.force) {
				isStale = true;
				reason = "Forced cleanup requested";
			}

			const sizeBytes = getDirectorySize(fullPath);

			if (!byArchetype[taskType]) {
				byArchetype[taskType] = { total: 0, pruned: 0 };
			}
			byArchetype[taskType].total++;

			if (isStale) {
				prunedCount++;
				reclaimedBytes += sizeBytes;
				byArchetype[taskType].pruned++;

				if (!dryRun) {
					if (isReg) {
						await git(repo, "worktree", "remove", fullPath, "--force").catch(() => {});
					}
					await rm(fullPath, { recursive: true, force: true }).catch(() => {});
					if (isMerged || options.force) {
						const delFlag = options.force ? "-D" : "-d";
						await git(repo, "branch", delFlag, branchName).catch(() => {});
					}
				}
			} else {
				preservedCount++;
			}

			entries.push({
				name,
				path: fullPath,
				taskType,
				branchName,
				isRegistered: isReg,
				isMerged,
				isStale,
				reason,
				sizeBytes,
			});
		}
	}

	return {
		entries,
		prunedCount,
		preservedCount,
		reclaimedBytes,
		dryRun,
		byArchetype,
	};
}

/**
 * Format cleanup wizard report card for terminal or reporting.
 */
export function renderCleanupWizardReport(
	report: CleanupWizardReport,
	options: { plain?: boolean } = {},
): string {
	const border = "─".repeat(68);
	const modeStr = report.dryRun ? "[DRY RUN - PREVIEW ONLY]" : "[EXECUTED]";
	const lines = [
		`┌${border}┐`,
		`│ 🧹 WORKTREE CLEANUP WIZARD REPORT ${modeStr.padStart(34)} │`,
		`├${border}┤`,
		`│ Pruned Directories : ${pad(String(report.prunedCount), 45)} │`,
		`│ Preserved Active   : ${pad(String(report.preservedCount), 45)} │`,
		`│ Reclaimed Disk     : ${pad(formatBytes(report.reclaimedBytes), 45)} │`,
		`├${border}┤`,
		`│ Archetype Breakdown:                                               │`,
	];

	for (const [arch, stats] of Object.entries(report.byArchetype)) {
		const line = `• ${arch.toUpperCase()}: ${stats.pruned} pruned / ${stats.total} total`;
		lines.push(`│   ${pad(line, 64)} │`);
	}

	lines.push(`├${border}┤`, `│ Detailed Items:                                                    │`);

	for (const entry of report.entries.slice(0, 10)) {
		const statusIcon = entry.isStale ? "✓ PRUNED" : "• ACTIVE";
		const desc = `[${statusIcon}] ${entry.name} (${entry.taskType}) - ${entry.reason}`;
		lines.push(`│   ${pad(desc, 64)} │`);
	}
	if (report.entries.length > 10) {
		lines.push(`│   ${pad(`... and ${report.entries.length - 10} more items`, 64)} │`);
	}

	lines.push(`└${border}┘`);
	return lines.join("\n");
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
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

function pad(str: string, width: number): string {
	if (str.length >= width) return str.slice(0, width);
	return str + " ".repeat(width - str.length);
}
