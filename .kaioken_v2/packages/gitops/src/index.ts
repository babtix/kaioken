export { git, gitDir, gitLine, isRepo, type GitResult } from "./run.js";
export { hookPath, hookStatus, installPostCommit, removePostCommit, type HookStatus } from "./hook.js";
export { currentBranch, readDiff, recentSubjects, type DiffSnapshot } from "./diff.js";
