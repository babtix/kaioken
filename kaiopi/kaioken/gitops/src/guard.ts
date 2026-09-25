import { detectUntracked } from "./stash.ts";
import { worktreeStatus } from "./worktree.ts";
import type { DelegationTaskType } from "./recipe.ts";

export interface GuardOptions {
	/** Worktree task archetype for risk diagnosis (UX-1891 to UX-1900). */
	taskType?: DelegationTaskType | string;
	/** Include untracked files in dirty calculation (default: true). */
	checkUntracked?: boolean;
	/** Allow stash-and-proceed hint (default: true). */
	suggestStash?: boolean;
}

export interface GuardReport {
	clean: boolean;
	taskType: string;
	archetypeName: string;
	dirtyFiles: string[];
	untrackedFiles: string[];
	hasConflicts: boolean;
	conflictedFiles: string[];
	warningMessage: string;
	remediationOptions: string[];
}

/**
 * Dirty working tree fast-forward guard preventing accidental overwrite across the 10 task archetypes:
 * 1. experimental refactoring branch (UX-1891)
 * 2. automated dependency upgrade task (UX-1892)
 * 3. documentation rewrite worktree (UX-1893)
 * 4. failing bug investigation sandbox (UX-1894)
 * 5. performance benchmark trial branch (UX-1895)
 * 6. multi-package migration experiment (UX-1896)
 * 7. security patch isolated worktree (UX-1897)
 * 8. feature prototyping scratchpad (UX-1898)
 * 9. code cleanup and formatting sweep (UX-1899)
 * 10. release candidate staging worktree (UX-1900)
 */
export async function assertCleanWorkingTreeGuard(
	repo: string,
	options: GuardOptions = {},
): Promise<GuardReport> {
	const taskType = (options.taskType || "custom").toLowerCase();
	const archetypeName = getArchetypeName(taskType);

	const status = await worktreeStatus(repo);
	const dirtyFiles = [...status.dirty];
	const conflictedFiles = [...status.conflicted];

	let untrackedFiles: string[] = [];
	if (options.checkUntracked !== false) {
		untrackedFiles = await detectUntracked(repo);
	}

	const isClean = dirtyFiles.length === 0 && conflictedFiles.length === 0 && untrackedFiles.length === 0;

	if (isClean) {
		return {
			clean: true,
			taskType,
			archetypeName,
			dirtyFiles: [],
			untrackedFiles: [],
			hasConflicts: false,
			conflictedFiles: [],
			warningMessage: `Working tree is clean. Fast-forward merge for ${archetypeName} is safe to proceed.`,
			remediationOptions: [],
		};
	}

	const remediationOptions = getArchetypeRemediation(taskType, dirtyFiles, untrackedFiles);
	const warningMessage =
		`BLOCKED: Dirty working tree detected before fast-forwarding ${archetypeName}. ` +
		`Proceeding would risk irreversible data loss on ${dirtyFiles.length + untrackedFiles.length} file(s).`;

	return {
		clean: false,
		taskType,
		archetypeName,
		dirtyFiles,
		untrackedFiles,
		hasConflicts: conflictedFiles.length > 0,
		conflictedFiles,
		warningMessage,
		remediationOptions,
	};
}

/**
 * Render visual warning card for dirty working tree guard.
 */
export function renderGuardWarningCard(report: GuardReport): string {
	const border = "─".repeat(68);
	const totalDirty = report.dirtyFiles.length + report.untrackedFiles.length;

	const lines = [
		`┌${border}┐`,
		`│ 🛡️  DIRTY WORKING TREE FAST-FORWARD GUARD BLOCKED                   │`,
		`├${border}┤`,
		`│ Task Archetype: ${pad(report.archetypeName, 50)} │`,
		`│ Dirty Files   : ${pad(String(report.dirtyFiles.length), 50)} │`,
		`│ Untracked     : ${pad(String(report.untrackedFiles.length), 50)} │`,
		`│ Total Risk    : ${pad(`${totalDirty} file(s) would be overwritten or lost`, 50)} │`,
		`├${border}┤`,
		`│ Guard Warning:                                                     │`,
		`│   ${pad(report.warningMessage, 64)} │`,
		`├${border}┤`,
		`│ Affected Dirty Paths:                                              │`,
	];

	const sample = [...report.dirtyFiles, ...report.untrackedFiles].slice(0, 6);
	for (const p of sample) {
		lines.push(`│   • ${pad(p, 62)} │`);
	}
	if (totalDirty > 6) {
		lines.push(`│   ... and ${totalDirty - 6} more file(s)${" ".repeat(46 - String(totalDirty).length)} │`);
	}

	lines.push(`├${border}┤`, `│ Recommended Remediations:                                          │`);
	for (let i = 0; i < report.remediationOptions.length; i++) {
		lines.push(`│ ${pad(`${i + 1}. ${report.remediationOptions[i]}`, 66)} │`);
	}
	lines.push(`└${border}┘`);

	return lines.join("\n");
}

function pad(str: string, width: number): string {
	if (str.length >= width) return str.slice(0, width);
	return str + " ".repeat(width - str.length);
}

function getArchetypeName(taskType: string): string {
	switch (taskType) {
		case "refactor":
			return "Experimental Refactoring Branch (UX-1891)";
		case "deps":
			return "Automated Dependency Upgrade Task (UX-1892)";
		case "docs":
			return "Documentation Rewrite Worktree (UX-1893)";
		case "fix":
			return "Failing Bug Investigation Sandbox (UX-1894)";
		case "bench":
			return "Performance Benchmark Trial Branch (UX-1895)";
		case "migration":
			return "Multi-Package Migration Experiment (UX-1896)";
		case "security":
			return "Security Patch Isolated Worktree (UX-1897)";
		case "prototype":
			return "Feature Prototyping Scratchpad (UX-1898)";
		case "cleanup":
			return "Code Cleanup and Formatting Sweep (UX-1899)";
		case "staging":
			return "Release Candidate Staging Worktree (UX-1900)";
		default:
			return "Target Worktree Task";
	}
}

function getArchetypeRemediation(
	taskType: string,
	dirty: string[],
	untracked: string[],
): string[] {
	switch (taskType) {
		case "refactor":
			return [
				"Stash incomplete refactoring edits: git stash push -m 'wip-refactor'",
				"Review unstaged AST changes before fast-forwarding upstream interface",
				"Or enable --auto-stash to temporarily shelve dirty files during merge",
			];
		case "deps":
			return [
				"Commit or discard manual edits to package.json / lockfiles",
				"Shelve untracked dependency install logs with: git clean -df",
				"Fast-forward only after root dependency tree is clean",
			];
		case "docs":
			return [
				"Save unsaved documentation chapter drafts to temporary stash",
				"Ensure no uncommitted markdown chapters are overwritten by incoming wiki sync",
				"Commit documentation notes: git commit -am 'docs: checkpoint'",
			];
		case "fix":
			return [
				"Preserve local debugging printouts or repro scripts in stash",
				"Fast-forward only the verified bugfix commits",
				"Verify test sandbox has no dirty uncommitted fixes",
			];
		case "bench":
			return [
				"Commit or remove dirty benchmark run logs and profiling dumps",
				"Clean working directory to ensure accurate CPU/memory measurements",
				"Stash local benchmark configuration overrides",
			];
		case "migration":
			return [
				"Check that no workspace package build artifacts are uncommitted",
				"Commit cross-package import adjustments before fast-forward",
				"Run git status --ignored to verify no untracked binaries collide",
			];
		case "security":
			return [
				"Ensure uncommitted security audits or patch notes are encrypted or committed",
				"Do not leave sensitive credentials or temporary API keys dirty in tree",
				"Fast-forward security patch into clean staging branch",
			];
		case "prototype":
			return [
				"Shelve scratchpad prototyping spike with: git stash -u",
				"Verify no experimental prototype code is accidentally committed",
				"Safely reset or fast-forward clean prototype commits",
			];
		case "cleanup":
			return [
				"Run git diff to inspect local formatting modifications",
				"Stash unformatted code before pulling formatted sweep",
				"Re-apply formatting rules on top of clean merge",
			];
		case "staging":
			return [
				"CRITICAL: Release candidate staging requires 100% clean working directory",
				"Commit final release notes and version bump tags before merge",
				"Stash or discard any stray untracked development files",
			];
		default:
			return [
				"Commit your changes: git commit -am 'checkpoint'",
				"Shelve changes: git stash push -u -m 'guard-stash'",
				"Discard changes: git restore . && git clean -df",
			];
	}
}
