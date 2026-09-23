# Task 07: Improve `@kaioken/gitops`

## Target Package
`kaioken/gitops`

## Files to Inspect & Modify
- [kaioken/gitops/src/diff.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/gitops/src/diff.ts)
- [kaioken/gitops/src/hook.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/gitops/src/hook.ts)
- [kaioken/gitops/src/run.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/gitops/src/run.ts)
- [kaioken/gitops/test/hook.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/gitops/test/hook.test.ts)

---

## Problem Description

1. **Untracked Files Invisible in Diffs**:
   In `diff.ts` (lines 43–65):
   ```ts
   } else if ((await gitLine(repo, "diff", "--cached", "--name-only")) !== "") {
       args = ["--cached"];
       against = "staged";
   } else {
       args = [];
       against = "worktree";
   }
   ```
   `git diff` and `git diff --cached` only report changes to tracked files. When a developer or agent creates new files without staging them (`git add`), `readDiff()` is completely unaware of them.
   - *Fix needed*: Query `git status --porcelain` or `git ls-files --others --exclude-standard` to discover untracked files and include them in the `files` list and synthetic diff patch.

2. **Post-Commit Hook Background Execution on Windows**:
   In `hook.ts` (lines 90–100), the post-commit hook installs a shell script:
   `node ... &` running detached.
   - On Windows environments running Git Bash, detached background node processes can fail if `node` is not in `/bin/sh`'s `PATH`, or if Windows file locks block post-commit completion.
   - *Fix needed*: Check for Windows paths, use the absolute node binary if detectable, and ensure execution errors in background hooks are logged to `.kaioken/hook.log` rather than disappearing into `/dev/null`.

3. **No 3-Way Merge or Conflict Detection in Worktrees**:
   In `worktree.ts`, worktree creation and switching lacks merge conflict checks. If worktree operations fail during branch checkout, errors are opaque.
   - *Fix needed*: Add conflict status detection and clean error recovery for dirty worktrees.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/gitops` and verify all tests pass.
- Add test verifying that untracked files are reported in `DiffSnapshot.files`.
- Verify hook installation, replacement, and removal across POSIX and Windows-style paths.
