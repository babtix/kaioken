# M7-06 · Replayable autonomous audit log

> Record an append-only, replayable audit trail of every tool invocation, argument, permission evaluation, and outcome during unattended runs.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `03-tool-permission-policy`, `04-run-command-allow-deny-list` |
| **Blocks** | `M8-01` (daemon-hosted long-running tasks), `M8-04` (subagent monitor) |
| **Touches** | `packages/agent/src/audit.ts`, `packages/agent/src/index.ts`, `packages/agent/test/audit.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | Low. Append-only I/O; failure to log must not silently corrupt or crash the run |
| **Gate-critical** | No — observability and accountability layer |

## Why this exists

Operating rule 1 reminds us that review is the ultimate bottleneck. When a developer wakes up to inspect the results of an unattended refactor or a background worker run, reviewing the final git diff alone is insufficient. The developer needs to know: *what commands did the agent run? What files did it read? Were any permissions denied? Did it hit any retries or errors?*

The public feature board (`website/src/data/roadmap.ts` category 08 Collaboration) lists an "Activity feed: Persistent team-visible log of all agent actions". While the multi-user collaboration category is a refused non-goal until real users exist (README §7), the single-user **audit log** is a non-negotiable safety invariant. It provides a local, append-only, machine-readable JSON Lines log of every action taken by an unattended run, replayable post-mortem.

## Current state

Verified in `kaioken_v2/apps/cli/` and `kaioken_v2/packages/session/`.

| Fact | Evidence | Notes |
|---|---|---|
| Transcript lives only in process memory | `kaioken_v2/apps/cli/src/commands/chat.ts:228-232` | Sessions are ephemeral; no persistent audit trail is written to disk (Known Gap G-3) |
| Daemon maintains in-memory run logs | `kaioken_v2/apps/cli/src/commands/daemon.ts:80-91` | `RunRecord.log?: string[]` held in RAM; lost if daemon process restarts |
| Tool events are broadcast to callbacks | `kaioken_v2/apps/cli/src/agent-host.ts:233-235` | `onTool(name, args)` and `onToolResult(name, isError)` exist on `SessionOptions` |
| Zero persistent audit logger | `kaioken_v2/packages/agent/src/index.ts:1-22` | No structured audit logging module exists in `@kaioken/agent` |
| Collaboration features are refused non-goals | `roadmap/README.md` §7 | Multi-user activity feeds and team sync are rejected; local single-tenant audit log is in scope |

`UNVERIFIED:` whether very large tool outputs (e.g. 50KB `read_file` results) require truncation in the audit log to prevent disk ballooning during long unattended runs.

## What done looks like

- [ ] New module `packages/agent/src/audit.ts` defining:
  - `AuditEvent`: typed union representing `"run_start" | "tool_call" | "tool_result" | "permission_decision" | "ceiling_check" | "run_complete" | "run_abort"`.
  - `AuditLogger`: append-only JSONL writer writing to `.kaioken/audit/<run-id>.jsonl`.
  - `replayAudit(logPath: string): Promise<AuditEvent[]>`: utility to parse and reconstruct past runs.
- [ ] Safe logging behavior:
  - Secrets and credentials detected by `packages/scan` patterns are scrubbed before writing to disk.
  - Large tool outputs are truncated to a safe ceiling (e.g. 4KB snippet + byte count).
  - Disk write errors fail gracefully (warning logged to stderr) rather than terminating the agent run.
- [ ] Integration in `apps/cli/src/agent-host.ts`:
  - `createSession` initializes `AuditLogger` when running in unattended or daemon modes.
  - Interceptors record every tool call before and after execution with timestamps and duration in milliseconds.
- [ ] Unit tests in `packages/agent/test/audit.test.ts` verifying log generation, structured serialization, and replay capabilities.

## Steps

1. **Define Audit Event Schema (`packages/agent/src/audit.ts`):**
   - Base fields: `id`, `runId`, `seq`, `timestamp`, `type`.
   - Event subtypes:
     - `RunStartEvent`: `mode`, `root`, `modelSpec`, `options`.
     - `ToolCallEvent`: `toolName`, `args` (redacted), `mode`.
     - `ToolResultEvent`: `toolName`, `isError`, `durationMs`, `outputSummary`.
     - `PermissionEvent`: `toolName`, `decision` (`"allow" | "deny" | "ask"`), `reason`.
     - `RunEndEvent`: `status` (`"completed" | "aborted" | "failed"`), `totalTurns`, `totalMs`, `spendEstimate`.
2. **Implement `AuditLogger`:**
   - Write to `.kaioken/audit/<run-id>.jsonl` using append-only file streams (`node:fs/promises`).
   - Create parent directory `.kaioken/audit` if not present.
   - Implement `scrubSecrets(obj: unknown): unknown` matching high-entropy tokens and API key patterns.
   - Implement `readAudit(runId: string, root: string): Promise<AuditEvent[]>`.
3. **Wire into Agent Host (`apps/cli/src/agent-host.ts`):**
   - Connect logger to `onTool`, `onToolResult`, and `beforeToolCall`.
   - Record permission evaluations from M7-03 and command filter verdicts from M7-04.
   - Flush audit log on run completion or error.
4. **Unit and Integration Tests:**
   - Test sequence ordering: events have monotonically increasing sequence numbers and valid ISO timestamps.
   - Test secret scrubbing (ensure mock API keys are masked as `***REDACTED***`).
   - Test replay function reconstructs exact chronology.
   - Re-export audit tools from `packages/agent/src/index.ts`.

## In scope

- `kaioken_v2/packages/agent/src/audit.ts`
- `kaioken_v2/packages/agent/src/index.ts`
- `kaioken_v2/packages/agent/test/audit.test.ts`
- Audit hook wiring in `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- Multi-user "activity feed" web UI (refused non-goal per README §7).
- Centralized cloud telemetry or remote server streaming.
- TUI interactive log viewer (belongs to TUI milestone).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/agent/test/audit.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Logging plaintext API keys or credentials | Run all arguments through credential scrubbing regexes before serializing to `.kaioken/audit/` |
| Audit logging I/O errors crashing an autonomous run | Wrap append file operations in try/catch and emit a fallback warning to stderr |
| Monolithic log files growing unbounded across sessions | Store separate files per run: `.kaioken/audit/<run-id>.jsonl` rather than a single global file |
| Conflating local audit logging with multi-user collaboration | Scope strictly to local single-tenant JSONL files; reject network sync and team feeds |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement a local, append-only, replayable audit logger in packages/agent/ to record every tool call, argument, permission evaluation, and outcome during unattended agent runs.

Current state:
- apps/cli/src/agent-host.ts lines 233-235 defines onTool and onToolResult callbacks, but does not persist events to disk.
- Chat sessions are ephemeral (Gap G-3); no record of unattended tool operations survives process exit.
- Note that while the public feature board (website/src/data/roadmap.ts) mentions an "activity feed" under Collaboration, the collaboration category is a refused non-goal (README §7). This leaf is strictly the single-user, local safety audit log.

1. Implement kaioken_v2/packages/agent/src/audit.ts:
   - Define interface AuditEvent with common fields: seq: number, timestamp: string, runId: string, type: string.
   - Define event types: "run_start", "tool_call", "tool_result", "permission_decision", "run_finish".
   - Implement class AuditLogger:
     - constructor(options: { root: string; runId: string; enabled?: boolean })
     - log(event: Omit<AuditEvent, "seq" | "timestamp" | "runId">): Promise<void>
     - Appends one-line JSON strings to .kaioken/audit/<runId>.jsonl.
     - Implements scrubSecrets() to mask authorization headers, API keys, and private keys.
     - Truncates large string payloads over 4096 characters with "[...truncated...]".
     - Catches I/O errors and prints to stderr rather than crashing the calling process.
   - Implement readAuditLog(root: string, runId: string): Promise<AuditEvent[]>.
2. Re-export audit logger and types from kaioken_v2/packages/agent/src/index.ts.
3. Wire AuditLogger into kaioken_v2/apps/cli/src/agent-host.ts:
   - Instantiate AuditLogger in createSession when mode is "unattended" or "daemon".
   - Record beforeToolCall permission decisions, tool start, and toolResult.
   - Record session completion or abort with final outcome.
4. Add unit tests in kaioken_v2/packages/agent/test/audit.test.ts:
   - Verify events are appended in strict chronological order with monotonic sequence numbers.
   - Verify secret redaction removes API keys.
   - Verify readAuditLog parses written JSONL back into typed event objects.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/agent/test/audit.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/agent/src/audit.ts, packages/agent/src/index.ts, packages/agent/test/audit.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not build cloud telemetry, remote websockets, or team collaboration features. Scope strictly to local JSONL files under .kaioken/audit/.
</missing_context_gating>

<action_safety>
Scope strictly to packages/agent/src/audit.ts and agent-host.ts audit wiring. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of audit log format and scrubbed fields.
2. Exact files created and modified.
3. Vitest test results with pasted counts.
4. Verification that multi-user collaboration remains excluded.
</structured_output_contract>
```
