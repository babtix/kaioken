export { git, gitDir, gitLine, isRepo, type GitResult } from "./run.ts";
export {
	hookPath,
	hookStatus,
	installPostCommit,
	removePostCommit,
	type HookStatus,
} from "./hook.ts";
export { currentBranch, readDiff, recentSubjects, type DiffSnapshot } from "./diff.ts";
export {
	createWorktree,
	removeWorktree,
	slug,
	worktreePath,
	worktreeStatus,
	type WorktreeStatus,
} from "./worktree.ts";
export {
	defaultNativeTestVerify,
	ffMerge,
	safeMerge,
	type SafeMergeOptions,
	type SafeMergeResult,
	type VerificationCheckResult,
	type VerifyFn,
} from "./gate.ts";
export {
	detectUntracked,
	popAutoStash,
	pushAutoStash,
	withAutoStash,
	type AutoStashRecord,
	type PopStashResult,
} from "./stash.ts";
export {
	detectConflicts,
	getConflictPlaybook,
	getThreeWayDiff,
	renderConflictCard,
	renderMarkdownConflictCard,
	renderPlainConflictCard,
	type ConflictPlaybook,
	type ConflictedFileSummary,
	type MergeConflictInfo,
	type ThreeWayDiffFile,
	type ThreeWayDiffResult,
} from "./conflict.ts";
export {
	formatDelegationRecipe,
	generateDelegationRecipe,
	listWorktrees,
	renderMarkdownRecipeCard,
	type DelegationRecipe,
	type DelegationRecipeOptions,
	type DelegationTaskType,
	type WorktreeEntry,
} from "./recipe.ts";
export {
	interactiveWorktreeCleanupWizard,
	pruneWorktrees,
	readHookLog,
	renderCleanupWizardReport,
	type CleanupWizardEntry,
	type CleanupWizardOptions,
	type CleanupWizardReport,
	type PruneOptions,
	type PruneReport,
	type PrunedWorktreeDetail,
} from "./cleanup.ts";
export {
	atomicWorktreeSwitch,
	releaseWorktreeLock,
	type AtomicSwitchOptions,
	type AtomicSwitchResult,
	type LockHandle,
} from "./lock_switch.ts";
export {
	assertCleanWorkingTreeGuard,
	renderGuardWarningCard,
	type GuardOptions,
	type GuardReport,
} from "./guard.ts";
