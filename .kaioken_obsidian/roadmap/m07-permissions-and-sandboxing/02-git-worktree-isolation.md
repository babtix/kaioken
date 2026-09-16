# M7-02 · Git worktree isolation

> Isolate all autonomous agent operations inside throwaway git worktrees so that unattended executions cannot dirty or corrupt the primary working tree.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-audit-current-autonomy-surface` |
| **Blocks** | `M8-01` (daemon-hosted long-running tasks), `M8` background worker queue |
| **Touches** | `packages/gitops/src/worktree.ts`, `packages/gitops/src/index.ts`, `packages/gitops/test/worktree.test.ts` |
| **Risk** | Medium. Requires careful cleanup of worktree directories and branches on error or abort |
| **Gate-critical** | **Yes — foundational containment primitive for unattended execution** |

## Why this exists

Operating rule 1 states that the bottleneck is review, not generation. The source plan's done-condition for sandboxing is exact and foundational: **you can hand an autonomous run a task, walk away, and the worst case is a wasted worktree**.

Without worktree isolation, an unattended or background agent edits files directly in the user's active checkout. A hallucinated file delete, a half-applied refactor, or a broken intermediate build pollutes the developer's working state and risks uncommitted work. By executing mutating sessions inside ephemeral git worktrees, every autonomous run is physically separated from the developer's branch until a human explicitly reviews the resulting diff and approves a merge.

## Current state

Verified in `kaioken_v2/packages/gitops/`.

| Fact | Evidence | Notes |
|---|---|---|
| Git execution helper exists | `kaioken_v2/packages/gitops/src/run.ts:18-47` | `git(args, options)` wraps `node:child_process.execFile` with buffer and timeout limits |
| Repo detection and status available | `kaioken_v2/packages/gitops/src/run.ts:57-65` | `isRepo(root)` checks `.git` presence |
| Diff inspection available | `kaioken_v2/packages/gitops/src/diff.ts:25-50` | `readDiff(root)` parses unstaged and staged diffs |
| Zero worktree primitives exist today | `kaioken_v2/packages/gitops/src/index.ts:1-4` | Only exports `run.js`, `hook.js`, and `diff.js`. No worktree creation, removal, or listing functions exist |
| Execution tools bind directly to primary root | `kaioken_v2/apps/cli/src/agent-host.ts:182` | `new nodeRuntime.NodeExecutionEnv({ cwd: root })` points directly to the main workspace directory |

`UNVERIFIED:` whether Windows file locking on node processes or tree-sitter binaries interferes with `git worktree remove` without explicit retry loops.

## What done looks like

- [ ] New module `packages/gitops/src/worktree.ts` exporting:
  - `createWorktree(repoRoot: string, options: WorktreeCreateOptions): Promise<WorktreeInfo>`
  - `removeWorktree(repoRoot: string, worktreePath: string, options?: WorktreeRemoveOptions): Promise<void>`
  - `listWorktrees(repoRoot: string): Promise<WorktreeRecord[]>`
  - `diffWorktree(repoRoot: string, worktreeBranch: string, baseRef?: string): Promise<DiffSnapshot>`
- [ ] Ephemeral worktrees are housed under `.kaioken/worktrees/<run-id>/` and ignored by git.
- [ ] Orphaned worktrees from crashed processes can be discovered and pruned via `pruneWorktrees(repoRoot: string)`.
- [ ] Unit test suite in `packages/gitops/test/worktree.test.ts` creating a temporary git fixture, creating a worktree, committing changes inside it, extracting the diff against main, and cleaning it up cleanly.
- [ ] Re-exported from `packages/gitops/src/index.ts`.

## Steps

1. **Implement `packages/gitops/src/worktree.ts`:**
   - Define interfaces `WorktreeInfo` (`id`, `path`, `branch`, `createdAt`, `baseCommit`), `WorktreeRecord`, and `WorktreeCreateOptions`.
   - Implement `createWorktree`:
     - Validate that `repoRoot` is a valid git repository via `isRepo()`.
     - Generate a run ID (`wt-${Date.now()}-${randomHex(4)}`).
     - Compute target path: `join(repoRoot, ".kaioken", "worktrees", id)`. Ensure parent directories exist.
     - Execute `git worktree add -b <branchName> <targetPath> <baseRef>`.
     - Return structured `WorktreeInfo`.
   - Implement `removeWorktree`:
     - Execute `git worktree remove --force <targetPath>`.
     - Delete the transient branch if configured (`git branch -D <branchName>`).
     - Handle Windows file lock retries with exponential backoff (up to 3 attempts).
   - Implement `listWorktrees`:
     - Parse output of `git worktree list --porcelain`.
   - Implement `diffWorktree`:
     - Run `git diff <baseRef>...<branchName>` to generate the clean patch for review.
2. **Add Worktree Exclusion Guard:**
   - Ensure `.kaioken/worktrees` is either added to `.git/info/exclude` or documented as ignored in `.kaioken/.gitignore`.
3. **Comprehensive Unit Testing:**
   - Write tests in `packages/gitops/test/worktree.test.ts` using Node `mkdtemp` and `git init`.
   - Test happy path: create worktree, write file, inspect diff, cleanup.
   - Test abnormal termination: simulate abandoned worktree and verify `pruneWorktrees` removes stale metadata and directories.
   - Test branch collision handling.
4. **Re-export and Typecheck:**
   - Export all public functions and types in `packages/gitops/src/index.ts`.
   - Run typecheck and tests to ensure zero regressions across `@kaioken/gitops`.

## In scope

- `kaioken_v2/packages/gitops/src/worktree.ts`
- `kaioken_v2/packages/gitops/src/index.ts`
- `kaioken_v2/packages/gitops/test/worktree.test.ts`

## Out of scope

- Integrating worktree creation into `apps/cli/src/commands/chat.ts` (this leaf builds the gitops substrate).
- Adding background worker scheduling (that is M8-01).
- Modifying `agent-host.ts` session options (that is M7-03).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific package test verification:

```bash
npx vitest run packages/gitops/test/worktree.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Windows file locks on `.git/worktrees` | `removeWorktree` must wrap deletion in a retry loop catching `EBUSY` / `EPERM` with short backoff |
| Polluting `.git/config` with stale worktree references | Always execute `git worktree prune` after physical directory removal |
| Git branch name collisions on repeated runs | Use timestamp + random entropy in branch names: `kaioken/run-<timestamp>-<hash>` |
| Storing worktrees in system temp outside the repository volume | Keep worktrees inside the same filesystem (`.kaioken/worktrees/`) so hardlinks and relative gitdir references resolve correctly across OSes |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/gitops/, implement git worktree isolation primitives so that autonomous agent sessions can run in throwaway worktrees rather than the primary workspace.

Current state:
- packages/gitops/src/run.ts exports git(), gitDir(), gitLine(), isRepo().
- packages/gitops/src/diff.ts exports readDiff(), currentBranch().
- No worktree capabilities exist in packages/gitops.

Implement packages/gitops/src/worktree.ts with:
1. createWorktree(repoRoot: string, options?: { baseRef?: string; branchPrefix?: string }): Promise<WorktreeInfo>
   - Verifies repoRoot is a repo.
   - Creates directory at repoRoot/.kaioken/worktrees/<id> where id is "wt-<timestamp>-<random4>".
   - Runs `git worktree add -b <branchName> <path> <baseRef>`.
   - Returns { id, path, branch, baseRef, createdAt }.
2. removeWorktree(repoRoot: string, worktreePath: string, options?: { deleteBranch?: boolean; force?: boolean }): Promise<void>
   - Runs `git worktree remove --force <worktreePath>`.
   - Runs `git worktree prune`.
   - If deleteBranch is true, deletes the associated git branch (`git branch -D <branch>`).
   - Retries up to 3 times with 100ms backoff if Windows file locks cause EBUSY/EPERM.
3. listWorktrees(repoRoot: string): Promise<WorktreeRecord[]>
   - Runs `git worktree list --porcelain` and parses paths, HEAD commits, and branches.
4. diffWorktree(repoRoot: string, worktreeBranch: string, baseRef?: string): Promise<DiffSnapshot>
   - Compares the worktree branch to baseRef (defaults to HEAD of primary repo) and returns clean diff information.
5. pruneWorktrees(repoRoot: string): Promise<{ cleaned: string[] }>
   - Finds any directory under .kaioken/worktrees that is no longer listed in `git worktree list` or is stale (>24h) and removes it.

Re-export all functions and types in packages/gitops/src/index.ts.
Create comprehensive characterization unit tests in packages/gitops/test/worktree.test.ts testing creation, writing in the worktree, diffing against main, and clean deletion.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/gitops/test/worktree.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/gitops/src/worktree.ts, packages/gitops/src/index.ts, and packages/gitops/test/worktree.test.ts.
</verification_loop>

<missing_context_gating>
All git operations must route through the existing git() helper in packages/gitops/src/run.ts. Do not spawn child_process directly in worktree.ts.
</missing_context_gating>

<action_safety>
Scope strictly to packages/gitops/. Do not modify apps/cli or any other package in this session. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of worktree primitives added and how errors/Windows file locks are handled.
2. Exact files touched in packages/gitops/.
3. Vitest test results and typecheck counts.
4. Any edge cases identified during git worktree testing on Windows/POSIX.
</structured_output_contract>
```
