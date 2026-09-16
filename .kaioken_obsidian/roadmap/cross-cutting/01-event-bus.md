# CROSS-01 · Re-assess the typed event bus under Theia RPC and TUI

> Re-evaluate whether a standalone typed event bus package is genuinely needed now that the Go v1
> `chan tea.Msg` pattern is dead, Theia provides JSON-RPC over WebSockets, and `apps/tui` uses `@earendil-works/pi-tui`.

| Field | Value |
|---|---|
| **Status** | `ready` (assessment brief; reflects honest uncertainty regarding real architectural need) |
| **Size** | S |
| **Depends on** | `roadmap/cross-cutting/04-daemon-mode-consolidation.md` |
| **Blocks** | Studio v0.1 event piping, M8 subagent event distribution |
| **Touches** | Documentation and potential new package (`packages/events` or retired as superseded) |
| **Risk** | Low — preventing unnecessary code generation |
| **Gate-critical** | No |

## Why this exists

In the v1 Go codebase, the application relied heavily on `chan tea.Msg` channels from Bubble Tea to
pass UI messages, progress ticks, and asynchronous tool completions across goroutines. When planning
the v2 transition, the roadmap proposed replacing this with a global, typed event bus that the GUI,
CLI, and daemon would all subscribe to.

However, that framing was anchored in Go idioms that no longer exist. In the TypeScript rewrite:
- The Theia desktop shell (`ide_kaioken/kaioken_studio_theia/`) uses native Theia RPC (`RpcConnectionHandler`) and InversifyJS event emitters over a WebSocket.
- The daemon (`apps/cli/src/commands/daemon.ts`) broadcasts server-sent events (SSE) over HTTP.
- `apps/cli/src/commands/chat.ts` uses direct callback hooks (`ChatHooks`).
- `apps/tui` runs on `@earendil-works/pi-tui`.

Building a heavy, generalised event bus package without verifying that these independent transport
layers actually need one risks adding architectural ceremony that solves a problem already answered
by standard async patterns. This leaf exists to conduct an honest reassessment rather than blindly
building what v1 envisioned.

## Current state

Verified against [`kaioken_v2/apps/cli/src/commands/chat.ts:34-60`](../../kaioken_v2/apps/cli/src/commands/chat.ts#L34-L60),
[`kaioken_v2/apps/cli/src/commands/daemon.ts:112-138`](../../kaioken_v2/apps/cli/src/commands/daemon.ts#L112-L138),
and [`roadmap/README.md:113`](../README.md#L113):

| Fact | Evidence |
|---|---|
| v1 translation note | `roadmap/README.md:113` specifies: "`chan tea.Msg` -> event bus: TUI at `apps/tui`, re-assess need" |
| CLI chat hooks model | `apps/cli/src/commands/chat.ts:34-60` defines `ChatHooks` with direct callback functions (`approve`, `onProgress`, `onToken`, `onOutcome`, `onVerify`) |
| Daemon event model | `apps/cli/src/commands/daemon.ts:120-138` implements `broadcast(type, data)` pushing to an in-memory `eventBuffer` (size 512) and writing SSE frames |
| Studio RPC model | Theia extensions communicate via `@theia/core/lib/common/messaging` JSON-RPC over WebSocket |
| No shared event bus package | No `packages/event` or `packages/bus` exists in `kaioken_v2/packages/` |

## What done looks like

- [ ] A written assessment documenting the event consumption requirements of all three consumers:
  1. CLI / TUI (`apps/cli`, `apps/tui`).
  2. Theia Studio (`ide_kaioken/kaioken_studio_theia`).
  3. Daemon / Server (`apps/cli/src/commands/daemon.ts`).
- [ ] Determination whether:
  - **Verdict A (Build):** A lightweight `@kaioken/events` package (typed TypeScript `EventEmitter` or RxJS-style observable) is needed for decoupling.
  - **Verdict B (Supersede):** The requirement is declared superseded; point-to-point typed callbacks (`ChatHooks`) and protocol-specific bridges (SSE in daemon, RPC in Theia) are strictly sufficient.
- [ ] If Verdict B is chosen, `roadmap/README.md` is updated to mark the event bus superseded rather than open.

## Steps

1. **Audit Consumer Call Sites:**
   - Inspect `apps/tui/src/app.ts` to see how terminal UI events are processed.
   - Inspect `theia-extensions/kaioken/src/browser/` to see how Theia widgets listen for backend state changes.
   - Inspect `daemon.ts` SSE broadcast subscribers.
2. **Evaluate Coupling Trade-offs:**
   - Would a unified event bus allow `packages/agent` to emit events without knowing whether it is running under CLI, TUI, or Theia?
   - Does introducing a bus package complicate the clean `ChatHooks` object currently passed into `runChat`?
3. **Draft Recommendation:**
   - Formulate clear recommendation (A or B) with evidence.
4. **Record Architecture Decision:**
   - Update this leaf and sibling roadmap documents.

## In scope

- Analysis of event patterns in `kaioken_v2/packages/agent`, `apps/cli`, `apps/tui`, and `theia-extensions/kaioken`.

## Out of scope

- Writing a complex reactive event bus framework before the assessment is approved.
- Altering the RPC protocol between Theia and Kaioken.

## Gates

This is an architectural audit leaf. The gate is a written evaluation committed to the repository that decides whether to build `@kaioken/events` or mark the enabler superseded.

## Traps

| Trap | Guard |
|---|---|
| Re-implementing Go channels in TypeScript | TypeScript is single-threaded async event-loop based. Do not build channel emulation queues where async iterables or EventEmitters suffice. |
| Building a bus that introduces circular dependencies | Any shared event emitter must live in a leaf package (e.g. `@kaioken/events`) or inside `@kaioken/agent`, not intertwined across apps and engine. |

## Open questions

1. Does any consumer require event subscription from outside its process without using HTTP/SSE or Theia RPC? If not, a separate package is unnecessary.

## Session brief

```xml
<task>
Perform an architectural assessment of the "Event Bus" cross-cutting enabler:

1. Examine the three live consumers in this repository:
   - CLI/TUI: kaioken_v2/apps/cli/src/commands/chat.ts (lines 34-60, ChatHooks) and apps/tui/src/
   - Daemon: kaioken_v2/apps/cli/src/commands/daemon.ts (lines 120-138, broadcast/SSE)
   - Studio: ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/common/kaioken-protocol.ts
2. Evaluate whether the v1 goal ("replace chan tea.Msg with a typed event bus") is still a real
   architectural requirement in v2, or whether it was superseded by TypeScript callbacks and RPC.
3. Compare two options:
   - Option A: Create a typed event bus package (packages/events) defining domain events (TokenEvent,
     ToolCallEvent, ApprovalEvent, FileScanEvent) that all frontends import.
   - Option B: Declare the event bus SUPERSEDED. Retain ChatHooks for in-process embedding, SSE for
     daemon HTTP clients, and RpcConnectionHandler for Theia.
4. Document the recommendation with concrete trade-offs.
</task>

<verification_loop>
Verify that all citations to chat.ts, daemon.ts, and kaioken-protocol.ts match real lines in the
working tree. Ensure the recommendation directly addresses operating rule 1 (simplicity for solo
maintainer).
</verification_loop>

<action_safety>
Do not write or delete engine code. This is an assessment and decision session. Do NOT run git add
or git commit.
</action_safety>

<structured_output_contract>
End with: (1) observed event mechanics across the three consumers, (2) evaluation of Option A vs
Option B, (3) final recommendation (Build or Supersede), (4) exact documentation updates required.
</structured_output_contract>
```
