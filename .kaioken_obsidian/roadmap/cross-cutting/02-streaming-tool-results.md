# CROSS-02 · Implement streaming tool results for long-running commands

> Pipe large outputs — test runs, compilation passes, and subagent tool invocations — incrementally
> to the UI instead of buffering the full result in memory until process exit.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | `studio-v0.1/04-chat-pane-and-approval-dialog.md`, Milestone M8 (Background workers & subagent monitor) |
| **Touches** | `kaioken_v2/packages/agent/src/gate.ts`, `apps/cli/src/agent-host.ts`, `apps/cli/src/commands/chat.ts` |
| **Risk** | Medium — touches process execution runners and streaming event hooks |
| **Gate-critical** | **Yes — blocks Studio Chat Pane and M8 Subagent Monitor** |

## Why this exists

Currently, when the verification gate runs (`npm run build`, `npm test`) or when an agent executes
a shell command, the process execution runner buffers all `stdout` and `stderr` in memory until the
subprocess exits. Only upon completion is the buffered string parsed, truncated into a tail, and
returned to the caller.

On a large repository, running a test suite or typecheck can take 30 to 90 seconds. Buffering causes
two severe user experience and architectural defects:
1. **Studio Chat Pane Freezes:** In the Studio UI (`studio-v0.1/04-chat-pane-and-approval-dialog.md`),
   the tool card sits on a static "running" spinner for over a minute with zero feedback. This reads
   to the user as a crash or infinite hang.
2. **Milestone M8 Subagent Monitor Blindness:** Milestone M8 introduces long-running background
   workers. Without incremental output piping, the subagent monitor cannot observe progress or abort
   a runaway test early.

This leaf establishes incremental chunk-level streaming for command runners, unblocking both Studio
and M8.

## Current state

Verified against [`kaioken_v2/packages/agent/src/gate.ts:31-49`](../../kaioken_v2/packages/agent/src/gate.ts#L31-L49),
[`kaioken_v2/apps/cli/src/commands/chat.ts:52-60`](../../kaioken_v2/apps/cli/src/commands/chat.ts#L52-L60),
and [`kaioken_v2/apps/cli/src/agent-host.ts:17`](../../kaioken_v2/apps/cli/src/agent-host.ts#L17):

| Fact | Evidence |
|---|---|
| CommandRunner is buffered | `packages/agent/src/gate.ts:47-49` defines `CommandRunner.run(...) => Promise<RunOutcome>`, returning only after exit |
| RunOutcome collects string | `packages/agent/src/gate.ts:31-37` defines `RunOutcome` with static `stdout: string`, `stderr: string` |
| ChatHooks has token streaming only | `apps/cli/src/commands/chat.ts:52-60` provides `onProgress` for model tokens, but no streaming callback for active tool execution output |
| Studio blocked | `studio-v0.1/04-chat-pane-and-approval-dialog.md` lists `CROSS-02` as an explicit blocker |
| M8 blocked | `roadmap/README.md:89` notes M8 background workers require live task streaming |

## What done looks like

- [ ] `CommandRunner` in `packages/agent/src/gate.ts` supports an optional streaming callback:
      `onChunk?: (chunk: string, stream: "stdout" | "stderr") => void`.
- [ ] `nodeCommandRunner` in `apps/cli/src/agent-host.ts` wires child process `stdout.on('data')` and
      `stderr.on('data')` directly to the `onChunk` handler.
- [ ] `ChatHooks` in `apps/cli/src/commands/chat.ts` gains `onToolOutput?: (id: string, chunk: string) => void`.
- [ ] In the Studio chat pane and TUI, running a test suite displays lines of compiler and test
      output in real time as they are emitted by the subprocess.
- [ ] Bounded buffer safety: memory usage is capped; the final `RunOutcome` retains only the last
      16KB/tail of output to prevent memory exhaustion on verbose logs.

## Steps

1. **Enhance Gate Process Contracts:**
   - In `packages/agent/src/gate.ts`, update `CommandRunner` options to accept
     `onChunk?: (chunk: string, stream: 'stdout' | 'stderr') => void`.
   - Ensure existing tests pass without modification when `onChunk` is omitted.
2. **Implement Incremental Spawner:**
   - In `apps/cli/src/agent-host.ts`, update `nodeCommandRunner` using `child_process.spawn`.
   - Attach chunk listeners on `child.stdout` and `child.stderr` that forward UTF-8 text to `onChunk`.
3. **Extend ChatHooks:**
   - In `apps/cli/src/commands/chat.ts`, add `onToolOutput` to `ChatHooks`.
   - Pass this hook into the execution tools runner.
4. **Wire to Theia RPC in Studio:**
   - In `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-service-impl.ts`
     (Blueprint path `theia-extensions/kaioken/src/node/kaioken-service-impl.ts`),
     forward `onToolOutput` chunks to the frontend WebSocket RPC.
5. **Characterisation Testing:**
   - Add unit test in `packages/agent/test/gate.test.ts` proving `onChunk` fires multiple times
     before `run()` resolves.

## In scope

- `kaioken_v2/packages/agent/src/gate.ts`
- `kaioken_v2/apps/cli/src/agent-host.ts`
- `kaioken_v2/apps/cli/src/commands/chat.ts`
- `kaioken_v2/packages/agent/test/`

## Out of scope

- Front-end React widget styling in Studio — that is `studio-v0.1/04`.
- TUI terminal rendering changes — that is `apps/tui`.
- Websocket reconnection protocols.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification test:
Run `node apps/cli/dist/bin.js chat "run tests" --root .` with a streaming logger hook attached. Verify lines print incrementally during test execution rather than in a single terminal burst at the end.

## Traps

| Trap | Guard |
|---|---|
| Unbounded memory consumption on huge test outputs | Maintain a rolling ring buffer (e.g. 100KB) for the final result while streaming chunks immediately to observers. |
| Splitting multi-byte UTF-8 characters across chunk boundaries | Use a `StringDecoder` (`node:string_decoder`) on stdout/stderr stream chunks to prevent emitting corrupted character fragments. |
| Breaking backwards compatibility of `CommandRunner` | Make `onChunk` strictly optional so test stubs in `packages/agent/test/gate.test.ts` do not break. |

## Open questions

None. The subprocess streaming pattern using Node's `child_process` and `StringDecoder` is well understood.

## Session brief

```xml
<task>
In kaioken_v2/, implement streaming tool results for process execution and verification gates:

1. In packages/agent/src/gate.ts:
   - Extend CommandRunner options to include:
     onChunk?: (chunk: string, stream: "stdout" | "stderr") => void;
   - Ensure the GateCommand and GateResult interfaces remain backward-compatible.

2. In apps/cli/src/agent-host.ts:
   - In nodeCommandRunner, use child_process.spawn with StringDecoder ('utf8').
   - Whenever child.stdout or child.stderr emits a data buffer, decode it and invoke options.onChunk.
   - Maintain a bounded buffer (16KB tail) for the returned RunOutcome.stdout/stderr so memory is capped.

3. In apps/cli/src/commands/chat.ts:
   - Add onToolOutput?: (toolCallId: string, chunk: string) => void to ChatHooks.
   - Forward process chunk events to onToolOutput during gate verification and mutating tool runs.

4. Add a unit test in packages/agent/test/ verifying that a mock CommandRunner streaming chunks invokes
   onChunk incrementally before resolving.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm all 406+ offline tests continue to pass with zero regressions.
</verification_loop>

<action_safety>
Do not touch unrelated packages. Preserve the offline determinism of packages/agent.
Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed in gate.ts and agent-host.ts, (2) unit test outcomes with pasted vitest
counts, (3) confirmation of StringDecoder usage for multi-byte UTF-8 safety, (4) verification that
Studio Chat and M8 blockers are cleared.
</structured_output_contract>
```
