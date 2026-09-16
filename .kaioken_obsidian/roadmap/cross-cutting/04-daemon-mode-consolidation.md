# CROSS-04 · Consolidate daemon mode and land in-flight work

> Unify the project's background execution architecture by clarifying the distinct roles of `agent-serve`
> and the uncommitted 1,928-line `daemon` command, landing the work cleanly under Milestone M1.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | Milestone M1-01 (`roadmap/m01-green-everywhere/01-retarget-ci-workflow.md`) |
| **Blocks** | Milestone M8 (Background workers), Studio v0.1 |
| **Touches** | `kaioken_v2/apps/cli/src/commands/daemon.ts`, `agent-serve.ts`, `main.ts`, `packages/serve/src/index.ts` |
| **Risk** | Medium — landing a large uncommitted command (1,928 lines) on disk |
| **Gate-critical** | **Yes — git working tree hygiene blocks clean CI gating** |

## Why this exists

Operating rule 2 dictates that *a green build is a precondition, not a milestone*. Carrying dirty,
uncommitted files across multiple sessions violates this principle. Currently, `git status` shows:
- `?? kaioken_v2/apps/cli/src/commands/daemon.ts` (1,928 lines of uncommitted HTTP daemon implementation)
- `M kaioken_v2/apps/cli/src/main.ts`
- `M kaioken_v2/packages/serve/src/index.ts`

Simultaneously, `apps/cli/src/commands/agent-serve.ts` (187 lines) is already committed and shipped.
Having two separate commands that both "serve" the engine creates confusion: are they two competing
implementations of the same feature, or two distinct operational interfaces?

Cross-referencing [`roadmap/m01-green-everywhere/06-land-in-flight-work.md`](../m01-green-everywhere/06-land-in-flight-work.md),
this leaf resolves the architectural relationship between `agent-serve` and `daemon`, and ensures
the uncommitted code is either cleanly landed with tests or factored into proper modules.

## Current state

Verified against [`kaioken_v2/apps/cli/src/commands/daemon.ts:1-75`](../../kaioken_v2/apps/cli/src/commands/daemon.ts#L1-L75)
and [`kaioken_v2/apps/cli/src/commands/agent-serve.ts:9-44`](../../kaioken_v2/apps/cli/src/commands/agent-serve.ts#L9-L44):

| Fact | Evidence |
|---|---|
| `agent-serve` is a stdio NDJSON protocol | `apps/cli/src/commands/agent-serve.ts:9-12`: "the engine over a newline-delimited JSON wire, for an embedder with no JS boundary into this process: an editor extension host that can only spawn a child process and talk to its stdio." |
| `daemon` is an HTTP / SSE server | `apps/cli/src/commands/daemon.ts:1-75`: multi-workspace REST API, bearer token auth, Server-Sent Events (SSE) broadcasting, model fetching, and background run tracking |
| Git status dirty | `apps/cli/src/commands/daemon.ts` is untracked; `main.ts` and `serve/src/index.ts` are modified in the working tree |
| Daemon test coverage missing | The 1,928 lines in `daemon.ts` have zero unit or integration tests in `apps/cli/test/` |

## The architectural verdict: one thing or two?

They are **two distinct entry points serving different operational boundaries**, and should remain
separate commands rather than merged into a single confusing binary mode:

1. **`agent-serve` (Process-isolated Stdio Bridge):**
   - Purpose: Designed for editor extension hosts (such as VS Code or Sublime) that spawn `kaioken agent-serve`
     as a child process and communicate strictly over standard input/output with newline-delimited JSON.
   - Lifetime: Bound to the parent editor process. Single repository context.
2. **`daemon` (Multi-workspace HTTP/SSE Service):**
   - Purpose: A persistent, background daemon process (`kaioken daemon --port 4100`) holding the index,
     wiki state, and background task queues across multiple workspaces. Thin GUI clients (Studio,
     web dashboards, browser tabs) connect over HTTP REST and SSE streams.
   - Lifetime: Runs continuously, independent of any single editor window.

## What done looks like

- [ ] Clear documentation in `apps/cli/README.md` explaining when to use `daemon` vs `agent-serve`.
- [ ] `daemon.ts` builds cleanly under `npm run typecheck` (`tsc --build --force`).
- [ ] Integration tests added in `apps/cli/test/daemon.test.ts` testing HTTP boot, authentication,
      workspace inspection, and SSE heartbeat.
- [ ] Working tree cleanly committed under Milestone M1-06.

## Steps

1. **Audit `daemon.ts` for Correctness:**
   - Verify bearer token generation and authentication middleware (`confinePath`, auth header checking).
   - Verify multi-workspace inspection doesn't leak memory in `workspaces` Map.
   - Verify SSE client disconnection handling cleans up `sseClients` Set.
2. **Add Integration Tests:**
   - Create `apps/cli/test/daemon.test.ts`.
   - Test starting `runDaemon` on port 0 (ephemeral), querying `/health`, and verifying 200 OK.
   - Test authorization failure with invalid bearer token (401/403).
3. **Verify Compatibility with `packages/serve`:**
   - Verify `packages/serve/src/index.ts` changes do not break existing static wiki server tests.
4. **Land In-Flight Work:**
   - Stage `main.ts`, `serve/src/index.ts`, and `daemon.ts` alongside new tests.
   - Run gates locally and confirm zero regressions.

## In scope

- `kaioken_v2/apps/cli/src/commands/daemon.ts`
- `kaioken_v2/apps/cli/src/commands/agent-serve.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/packages/serve/src/index.ts`
- `kaioken_v2/apps/cli/test/daemon.test.ts`

## Out of scope

- Merging `agent-serve` and `daemon` into a single command (decided as distinct).
- Rewriting daemon endpoints to GraphQL or gRPC.
- Building a web frontend for the daemon (Theia Studio is the GUI).

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification command:

```bash
node apps/cli/dist/bin.js daemon --port 0 --token test-token &
```

Querying `http://127.0.0.1:<port>/api/workspaces` with header `Authorization: Bearer test-token` returns valid JSON.

## Traps

| Trap | Guard |
|---|---|
| Attempting to combine stdio NDJSON and HTTP into one command | They serve incompatible communication channels. Stdio requires pristine stdout (no HTTP logs). Keep them as separate commands. |
| Daemon leaking file descriptors on SSE connections | Ensure `req.on('close')` removes the response object from `sseClients`. |
| Unbounded `eventBuffer` growth | Verify `daemon.ts:128` enforces `if (eventBuffer.length > 512) eventBuffer.shift();`. |

## Open questions

None. The code exists on disk and its architectural role is now defined.

## Session brief

```xml
<task>
In kaioken_v2/, consolidate and land the uncommitted daemon command work:

1. Review apps/cli/src/commands/daemon.ts (1,928 lines) against apps/cli/src/commands/agent-serve.ts:
   - Formally document the separation: agent-serve is for stdio-based editor child processes;
     daemon is for multi-workspace HTTP/SSE service hosting.
   - Check apps/cli/src/main.ts to ensure "daemon" is registered in USAGE and the command dispatch table.
2. Ensure packages/serve/src/index.ts export modifications are coherent and required by daemon.ts.
3. Write an integration test suite in apps/cli/test/daemon.test.ts:
   - Boot the daemon on an ephemeral port (port 0).
   - Test authentication: missing token returns 401, valid token returns 200 on /api/workspaces.
   - Test SSE connection subscription and ensure connection close cleans up client listeners.
4. Run full typechecking and test gates:
   npm run typecheck
   npm test
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Verify that apps/cli/test/daemon.test.ts passes and no other package tests fail.
</verification_loop>

<action_safety>
Do not delete daemon.ts or revert working tree modifications without review.
Do NOT run git add or git commit. Leave changes staged or uncommitted for the orchestrator.
</action_safety>

<structured_output_contract>
End with: (1) confirmation of the architectural distinction between agent-serve and daemon,
(2) test outcomes from apps/cli/test/daemon.test.ts, (3) confirmation of npm run typecheck passing,
(4) list of touched files.
</structured_output_contract>
```
