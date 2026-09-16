# M8-04 · Subagent monitor

> Expose live subagent state, intermediate reasoning streams, and incremental tool execution progress over daemon Server-Sent Events and the CLI.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | **`M7` (Permissions & Sandboxing) — HARD GATE**, `01-daemon-hosted-long-running-tasks`, `roadmap/cross-cutting/streaming-tool-results` |
| **Blocks** | `M10` (Studio live subagent inspector) |
| **Touches** | `apps/cli/src/commands/daemon.ts`, `apps/cli/src/subagent-tracker.ts`, `apps/cli/test/subagent-monitor.test.ts` |
| **Risk** | Medium. Real-time event throughput must not saturate process I/O or drop messages |
| **Gate-critical** | No — observability and progress monitoring |

> [!IMPORTANT]
> **GATE PREREQUISITE:** This leaf is strictly gated behind Milestone M7. Subagents running in the background must operate within isolated git worktrees (`M7-02`) under enforced resource ceilings (`M7-05`).

## Why this exists

Operating rule 1 states that review is the bottleneck. In a complex unattended task, an orchestrator agent frequently spawns specialized subagents (such as a test writer, a code reviewer, or a refactoring agent). If these background workers operate as black boxes, the developer is left staring at a spinning cursor for 20 minutes with zero visibility into whether the agents are making progress, stuck in a loop, or hallucinating.

The subagent monitor provides real-time observability. By emitting structured lifecycle events (state changes, reasoning deltas, tool calls, and streaming output) over the daemon's Server-Sent Events (SSE) bus, a developer can run `kaioken daemon monitor` from another terminal—or open the Studio dashboard—and observe the live hierarchy of active workers. This leaf directly depends on the cross-cutting enabler **Streaming tool results** (`roadmap/cross-cutting/`), ensuring that long-running tool outputs stream line-by-line rather than buffering silently.

## Current state

Verified in `kaioken_v2/apps/cli/` and `roadmap/README.md`.

| Fact | Evidence | Notes |
|---|---|---|
| SSE broadcaster exists in daemon | `kaioken_v2/apps/cli/src/commands/daemon.ts:115-125` | `broadcast(type, data)` writes formatted SSE events to connected HTTP clients |
| Token streaming hooks in chat loop | `kaioken_v2/apps/cli/src/commands/chat.ts:60-66` | `ChatHooks` defines `onText`, `onThinking`, and `onTool` |
| Cross-cutting dependency: streaming tool results | `roadmap/README.md` §5 | Enabler: *Pipe large outputs incrementally instead of buffering. Needed by the Studio chat pane.* |
| Subagents lack hierarchical tracking | `kaioken_v2/apps/cli/src/agent-host.ts:251-275` | Single session instance; no subagent registry, parent-child tracking, or status aggregation exists |
| Daemon monitor command missing | `kaioken_v2/apps/cli/src/main.ts:88` | `daemon` command lacks an attached live terminal monitor viewer |

`UNVERIFIED:` whether terminal ANSI escape rendering in `apps/tui` can share the daemon SSE feed without race conditions on Windows standard handles.

## What done looks like

- [ ] New module `apps/cli/src/subagent-tracker.ts` defining:
  - `SubagentState`: `id`, `parentId`, `role`, `status` (`"idle" | "reasoning" | "calling_tool" | "verifying" | "done" | "failed"`), `tokens`, `currentTool`.
  - `SubagentTracker`: maintains tree of active agents and dispatches updates.
- [ ] SSE stream endpoints in daemon:
  - `GET /api/runs/:id/subagents`: returns current subagent tree.
  - `GET /api/events`: broadcasts `subagent_spawn`, `subagent_state`, `subagent_reasoning`, `subagent_tool_chunk`, and `subagent_finish`.
- [ ] CLI streaming monitor command:
  - `kaioken daemon monitor [run-id]`: live curses/ANSI terminal dashboard displaying active subagent cards, active tool name, elapsed runtime, and recent thinking stream.
- [ ] Cross-cutting alignment: tool execution stdout/stderr streams incrementally through the monitor rather than waiting for command exit.

## Steps

1. **Implement Subagent Hierarchy Tracker (`apps/cli/src/subagent-tracker.ts`):**
   - Track agent parent/child relationships.
   - Record start timestamp, cumulative input/output tokens, and active state.
   - Provide subscription hooks for streaming text and thinking deltas.
2. **Integrate with Daemon SSE Bus (`apps/cli/src/commands/daemon.ts`):**
   - Attach `SubagentTracker` to each active `RunRecord`.
   - Forward subagent events to connected SSE clients.
   - Buffer recent events (last 100 events) for new clients connecting mid-run.
3. **Connect Tool Streaming (Cross-Cutting Enabler):**
   - Update `NodeExecutionEnv` in `agent-host.ts` to stream tool output chunks to `SubagentTracker` as stdout/stderr arrives.
4. **Build CLI Monitor Subcommand:**
   - In `apps/cli/src/commands/daemon.ts`, add `runDaemonMonitor(runId, flags)`.
   - Connects to daemon SSE endpoint via `http.request`.
   - Renders cleanly formatted terminal status boxes showing active subagents, current operation, and live reasoning.
5. **Testing (`apps/cli/test/subagent-monitor.test.ts`):**
   - Test subagent tree aggregation.
   - Test SSE serialization and reconnection buffering.
   - Test tool chunk streaming.

## In scope

- `kaioken_v2/apps/cli/src/subagent-tracker.ts`
- `kaioken_v2/apps/cli/src/commands/daemon.ts`
- `kaioken_v2/apps/cli/test/subagent-monitor.test.ts`

## Out of scope

- Web frontend GUI dashboard (belongs to Studio v0.1).
- Distributed multi-node subagent clustering (refused non-goal).
- Modifying tree-sitter or index packages.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run apps/cli/test/subagent-monitor.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Flooding SSE clients with high-frequency token deltas | Throttle token updates (e.g. batch every 50ms) to prevent event loop starvation |
| Buffering entire tool outputs before streaming | Wire directly to child process `stdout.on("data")` to enable true incremental streaming |
| Terminal flicker during CLI monitor repainting | Use clean ANSI line overwriting or alternate screen buffer rather than full screen clear |
| Subagents surviving after parent run cancellation | Killing a run must recursively terminate all child subagent processes and streams |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/, implement a real-time subagent monitor tracking live subagent state, intermediate reasoning streams, and incremental tool execution progress over the daemon SSE bus and CLI.

PRECONDITION: Milestone M7 must be complete. All background workers must execute inside isolated worktrees. Cross-reference roadmap/cross-cutting/ for streaming tool results.

Current state:
- apps/cli/src/commands/daemon.ts lines 115-125 has a basic SSE broadcast() mechanism, but only tracks monolithic runs without subagent hierarchy.
- ChatHooks in apps/cli/src/commands/chat.ts exposes onText, onThinking, onTool, but does not track subagent trees.

1. Implement kaioken_v2/apps/cli/src/subagent-tracker.ts:
   - Define interface SubagentState with id, parentId, role, status ("idle" | "reasoning" | "calling_tool" | "verifying" | "done" | "failed"), currentTool?: { name: string; argsSummary: string; startedAt: number }, tokens: { input: number; output: number }, recentThinking: string.
   - Implement class SubagentTracker:
     - registerSubagent(id: string, role: string, parentId?: string): void
     - updateStatus(id: string, status: SubagentState["status"], details?: Record<string, unknown>): void
     - appendThinking(id: string, delta: string): void
     - setToolStart(id: string, name: string, args: unknown): void
     - setToolChunk(id: string, chunk: string): void
     - setToolResult(id: string, isError: boolean): void
     - getSnapshot(): SubagentState[]
2. In kaioken_v2/apps/cli/src/commands/daemon.ts:
   - Attach SubagentTracker to active RunRecords.
   - Broadcast events: "subagent_state", "subagent_thinking", "subagent_tool_chunk", "subagent_done".
   - Add endpoint GET /api/runs/:id/subagents returning current snapshot.
   - Add CLI subcommand `kaioken daemon monitor <runId>` that connects to daemon SSE and renders a clean terminal status box showing subagents, active tool, and recent thinking stream.
3. Write unit tests in apps/cli/test/subagent-monitor.test.ts verifying subagent lifecycle events and SSE payload integrity.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run apps/cli/test/subagent-monitor.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only apps/cli/src/subagent-tracker.ts, apps/cli/src/commands/daemon.ts, and apps/cli/test/subagent-monitor.test.ts.
</verification_loop>

<missing_context_gating>
Do not build a web browser interface. The monitor must be accessible via daemon HTTP/SSE endpoints and the CLI terminal monitor command.
</missing_context_gating>

<action_safety>
Scope strictly to apps/cli/. Do not modify packages/agent or packages/gitops. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of subagent tracker and streaming monitor implementation.
2. Exact files touched in apps/cli/.
3. Vitest test results and counts.
4. Verification that streaming tool results are emitted incrementally.
</structured_output_contract>
```
