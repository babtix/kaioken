# M8-01 · Daemon-hosted long-running tasks

> Enable asynchronous, daemon-hosted background tasks using M7 worktree isolation so a developer can queue a refactor before bed and review a worktree diff in the morning.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | **`M7-02` (Worktree isolation), `M7-03` (Tool permissions), `M7-05` (Ceilings) — HARD GATE** |
| **Blocks** | `04-subagent-monitor`, `05-completion-notifications`, `M10` |
| **Touches** | `apps/cli/src/commands/daemon.ts`, `apps/cli/src/main.ts`, `apps/cli/test/daemon-tasks.test.ts` |
| **Risk** | High. Involves long-running process lifecycle, background job queues, and worktree sandboxing |
| **Gate-critical** | **Yes — the foundational driver for all background worker execution** |

> [!IMPORTANT]
> **GATE PREREQUISITE:** This leaf is strictly gated behind Milestone M7. No background task execution may be wired or run unattended until worktree isolation (`M7-02`), tool permission matrices (`M7-03`), command denylists (`M7-04`), and resource ceilings (`M7-05`) have landed and passed all verification gates.

## Why this exists

Operating rule 1 states that the bottleneck is review, not generation. Currently, running an agent requires a live, interactive terminal session; closing the laptop or interrupting the process terminates the run. 

The goal of background workers is to decouple task dispatch from task execution. You should be able to queue a complex task ("refactor the error types in packages/model", "generate missing wiki chapters for unindexed modules"), disconnect, and return later to inspect a clean git diff. But without M7 sandboxing, an unattended daemon running on the main branch is dangerous. By pairing the in-flight daemon infrastructure with M7 worktree isolation, tasks execute safely in the background on throwaway branches.

## Current state

Verified in `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| In-flight daemon implementation on disk | `kaioken_v2/apps/cli/src/commands/daemon.ts:1-120` | Uncommitted 1,928-line daemon implementation with HTTP server, SSE events, and run tracking |
| Daemon command wired into CLI entry point | `kaioken_v2/apps/cli/src/main.ts:88` | Command table registers `daemon` command |
| In-memory run tracking exists | `kaioken_v2/apps/cli/src/commands/daemon.ts:80-91` | `RunRecord` tracks `id`, `kind`, `status`, `progress`, `log` |
| Runs lack worktree sandboxing | `kaioken_v2/apps/cli/src/commands/daemon.ts:500-600` | Background tasks currently attempt execution against the primary workspace root |
| M7 sandboxing primitives available | `roadmap/m07-permissions-and-sandboxing/` | Worktree isolation (`M7-02`), permissions (`M7-03`), command filters (`M7-04`), ceilings (`M7-05`) |

`UNVERIFIED:` whether existing daemon HTTP endpoints properly authenticate local loopback callers or rely solely on port binding.

## What done looks like

- [ ] `kaioken daemon task "<prompt>"` submits an asynchronous task to the running daemon (or starts an ephemeral background worker).
- [ ] The task immediately provisions an isolated git worktree via `@kaioken/gitops` (`M7-02`) at `.kaioken/worktrees/<runId>`.
- [ ] Execution runs in `mode: "unattended"`, bounded by M7-03 permissions, M7-04 command denylist, M7-05 resource ceilings, and M7-06 audit logging.
- [ ] The developer can check progress via `kaioken daemon status` or query `GET /api/runs/:id`.
- [ ] On completion, the daemon cleans up the worktree directory while retaining the git branch (`kaioken/run-<id>`), outputting the review command:
  ```bash
  git diff main...kaioken/run-<id>
  ```
- [ ] The done-condition holds: you can queue a refactor before bed, walk away, and review the worktree diff in the morning.

## Steps

1. **Verify M7 Gates:**
   - Confirm `M7-02` (`packages/gitops/src/worktree.ts`), `M7-03` (`packages/agent/src/permissions.ts`), `M7-04`, and `M7-05` exist and tests pass.
2. **Refactor Task Execution in `apps/cli/src/commands/daemon.ts`:**
   - When a task run is initiated:
     1. Call `createWorktree(repoRoot, { branchPrefix: `kaioken/task-` })`.
     2. Initialize `createSession` with `root = worktreeInfo.path`, `mode = "unattended"`, and configured ceilings (`maxTurns: 25`, `maxWallClockMs: 30 * 60 * 1000`).
     3. Wire `onText`, `onThinking`, `onTool` to daemon SSE event broadcaster (`broadcast("task_progress", ...)`).
     4. On completion or ceiling abort:
        - Run verify gate (`packages/agent/src/gate.ts`) inside the worktree.
        - Record final diff snapshot via `diffWorktree`.
        - Mark `RunRecord.status = "completed"` (or `"failed"`).
        - Clean up worktree folder via `removeWorktree(..., { deleteBranch: false })`.
3. **Implement CLI Subcommand `kaioken daemon task`:**
   - Add `task` subcommand to `apps/cli/src/commands/daemon.ts` and `apps/cli/src/main.ts`.
   - Sends HTTP POST to `http://127.0.0.1:<daemonPort>/api/runs` with `{ prompt, options }`.
   - Prints run ID and command to monitor or review diff.
4. **Integration Testing (`apps/cli/test/daemon-tasks.test.ts`):**
   - Test submitting a task against a git fixture repository.
   - Verify task completes inside isolated worktree without touching main branch files.
   - Verify branch is preserved with expected commits for human review.

## In scope

- `kaioken_v2/apps/cli/src/commands/daemon.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/apps/cli/test/daemon-tasks.test.ts`

## Out of scope

- Multi-tenant worker scheduling or cloud job queues (refused non-goal per README §7).
- Terminal UI live charts (belongs to TUI milestone).
- Modifying `packages/gitops` (built in M7-02).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run apps/cli/test/daemon-tasks.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Starting a background task without M7 worktrees landed | Hard check on `createWorktree` export; abort immediately if M7 primitives are absent |
| Deleting the git branch on worktree cleanup | Set `{ deleteBranch: false }` so the branch and commits remain available for review |
| Zombie processes if the daemon is killed during a run | Register `process.on("SIGINT" / "SIGTERM")` to abort active agent runs and clean worktrees |
| Blocking the daemon event loop during synchronous git calls | All gitops and model calls must be fully asynchronous promises |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/src/commands/daemon.ts, wire asynchronous background task execution into the daemon using M7 worktree isolation, permission policies, and resource ceilings.

PRECONDITION: Milestone M7 must be complete. Verify that packages/gitops exports createWorktree and removeWorktree (M7-02), packages/agent exports evaluatePermission (M7-03), and ceilings are enforced (M7-05).

Current state:
- apps/cli/src/commands/daemon.ts exists on disk (1928 lines) with an HTTP server and RunRecord tracking, but executes tasks directly in the workspace root without isolation.
- apps/cli/src/main.ts registers the daemon command.

Implement daemon background task execution:
1. When a task is queued (via POST /api/runs or CLI subcommand `kaioken daemon task <prompt>`):
   - Create an isolated worktree via createWorktree(workspaceRoot, { branchPrefix: "kaioken/task-" }).
   - Initialize the agent session with the worktree path as root, mode: "unattended", and resource ceilings (maxTurns: 30, maxWallClockMs: 30m).
   - Pipe SSE events (thinking, tool calls, text deltas) to active subscribers.
   - On completion, execute gate.ts verification inside the worktree.
   - Remove the physical worktree directory using removeWorktree(..., { deleteBranch: false }), leaving the git branch intact.
   - Record the diff summary in the RunRecord and emit task_complete event.
2. Expose CLI command `kaioken daemon task "<prompt>"` in apps/cli/src/commands/daemon.ts and main.ts to submit tasks and return the run ID.
3. Write characterization tests in apps/cli/test/daemon-tasks.test.ts verifying that a background task runs inside a worktree, generates commits on the task branch, leaves the primary working branch clean, and cleans up the worktree folder.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run apps/cli/test/daemon-tasks.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only apps/cli/src/commands/daemon.ts, apps/cli/src/main.ts, and apps/cli/test/daemon-tasks.test.ts.
</verification_loop>

<missing_context_gating>
Do not bypass M7 safety controls. All background worker execution MUST pass through M7 worktree isolation and M7-03 permissions.
</missing_context_gating>

<action_safety>
Scope strictly to daemon task execution in apps/cli/. Do not modify packages/gitops or packages/agent in this leaf. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of daemon task integration with M7 worktrees.
2. Exact files modified in apps/cli/.
3. Vitest test results and typecheck counts.
4. Confirmation that the primary working branch remains clean during background execution.
</structured_output_contract>
```
