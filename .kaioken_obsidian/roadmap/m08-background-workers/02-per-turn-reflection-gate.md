# M8-02 · Per-turn reflection gate

> Evaluate tool execution signals (error recovery, user corrections, repeated edit failures) after each conversational turn instead of only at session end.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | **`M7` (Permissions & Sandboxing) — HARD GATE**, `01-daemon-hosted-long-running-tasks` |
| **Blocks** | `03-surgical-skill-patching`, `M10` |
| **Touches** | `packages/session/src/signals.ts`, `packages/session/src/index.ts`, `packages/session/test/signals.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | Medium. Over-eager reflection interventions can derail a model that was already recovering naturally |
| **Gate-critical** | Yes — prevents unbounded failure loops in unattended background runs |

> [!IMPORTANT]
> **GATE PREREQUISITE:** This leaf is strictly gated behind Milestone M7. Unattended execution and turn-level reflection gates are only safe to run within the sandboxed environment (worktree isolation `M7-02`, permissions `M7-03`, ceilings `M7-05`).

## Why this exists

Operating rule 1 states that review is the bottleneck. In an unattended background execution, a developer cannot step in to point out that the model has failed three times in a row to apply a diff or is repeatedly invoking a broken compiler command. 

Today, signal extraction in `packages/session/src/signals.ts` evaluates tool events **only once at session end**, primarily to decide if the session should be distilled into a skill. For background workers, this is too late: an unattended agent that gets trapped in an edit-fail-retry spiral will exhaust its turn ceiling without making progress. By evaluating tool signals *after each turn*, the runtime can catch error spirals, detect repeated failure loops, and inject targeted reflective prompts to force a tactical reassessment before the task fails.

## Current state

Verified in `kaioken_v2/packages/session/` and `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Signal types defined | `kaioken_v2/packages/session/src/signals.ts:14` | `export type Signal = "error_recovery" | "correction" | "multi_file" | "many_tools"` |
| Signals computed over complete session history | `kaioken_v2/packages/session/src/signals.ts:36-80` | `sessionSignals(events)` iterates full event array; invoked by `learn.ts` after session concludes |
| Tool failure heuristics exist | `kaioken_v2/packages/session/src/signals.ts:92-101` | `looksLikeToolError(result)` checks exit codes, "error:", "user declined" |
| Agent host only triggers callbacks | `kaioken_v2/apps/cli/src/agent-host.ts:234-235` | `onToolResult(name, isError)` notifies listeners; does not inspect turn trends or intervene |
| Zero mid-run reflection intervention | `kaioken_v2/packages/session/src/index.ts:1-12` | No per-turn anomaly detector or prompt injector exists |

`UNVERIFIED:` whether injecting a system/user intervention message during an active Pi agent session resets prompt caching on providers that enforce rigid turn alternations.

## What done looks like

- [ ] New functions in `packages/session/src/signals.ts`:
  - `evaluateTurnSignals(recentEvents: readonly ConversationEvent[]): TurnReflection`
  - Detection of:
    - Repeated edit failures on the same file path (2+ consecutive failures).
    - Bash command failure spirals (2+ consecutive non-zero exit codes).
    - Oscillating file changes (repeatedly reverting earlier changes).
- [ ] `TurnReflection` reports actionable status:
  - `{ status: "nominal" }`
  - `{ status: "spiral_detected", pattern: "repeated_edit_failure", suggestion: string }`
  - `{ status: "recovery_successful", signal: "error_recovery" }`
- [ ] Integration in `apps/cli/src/agent-host.ts`:
  - At the end of each assistant turn, if a spiral is detected during an unattended background run, the runner injects a high-priority correction message:
    > *"Tool execution warning: you have failed consecutive edits on `path/to/file.ts`. Stop attempting blind diffs. Use `read_file` to view the exact current lines, verify your indentation, and plan your change before retrying."*
- [ ] Comprehensive unit tests in `packages/session/test/signals.test.ts` testing spiral detection and clean turn progression.

## Steps

1. **Implement Per-Turn Signal Evaluation (`packages/session/src/signals.ts`):**
   - Define interface `TurnReflection`:
     ```ts
     export type AnomalyPattern = "repeated_edit_failure" | "command_failure_spiral" | "oscillating_edits";
     export interface TurnReflection {
       healthy: boolean;
       anomaly?: { pattern: AnomalyPattern; target?: string; message: string };
       signals: Signal[];
     }
     ```
   - Implement `evaluateTurnSignals(window: readonly ConversationEvent[]): TurnReflection`:
     - Inspect the last 6 conversation events (last 1-2 turns).
     - Track failed `edit` / `write` calls targeting the same path.
     - Track failed `bash` calls with non-zero exit status.
     - Return appropriate anomaly warning if threshold (2 consecutive failures) is reached.
2. **Re-export and Document in `packages/session/src/index.ts`:**
   - Export `evaluateTurnSignals`, `TurnReflection`, `AnomalyPattern`.
3. **Wire Turn Reflection into `apps/cli/src/agent-host.ts`:**
   - In `AgentSession`, after each assistant turn completes:
     - Run `evaluateTurnSignals` on recent session events.
     - If an anomaly is flagged and session mode is `"unattended"`:
       - Append an automated reflective intervention message into the message history.
       - Log reflection event to M7-06 audit log (`reflection_intervention`).
4. **Unit and Integration Tests (`packages/session/test/signals.test.ts`):**
   - Test healthy turn sequences produce `{ healthy: true }`.
   - Test two failed edits on `src/index.ts` trigger `repeated_edit_failure`.
   - Test two failed shell commands trigger `command_failure_spiral`.
   - Verify that successful recovery after a failure clears the anomaly and records `error_recovery`.

## In scope

- `kaioken_v2/packages/session/src/signals.ts`
- `kaioken_v2/packages/session/src/index.ts`
- `kaioken_v2/packages/session/test/signals.test.ts`
- Wiring turn reflection in `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- Global skill proposal generation (that is `learn.ts` and M8-03).
- Persistent session storage on disk (Known Gap G-3).
- Modifying M7 permission policies.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/session/test/signals.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Triggering reflection warnings on the first transient error | Require at least 2 consecutive failures on the same operation before flagging an anomaly |
| Hallucinating recovery when a command fails silently | Check both `isError` flag and `looksLikeToolError` output text |
| Infinite reflection loops | Limit automated reflection interventions to at most 2 per run; if spiral persists, trigger M7-05 ceiling abort |
| Intervening during interactive user chats | Restrict automatic mid-run prompt injections to `mode: "unattended"` background runs |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/session/src/signals.ts, implement per-turn tool signal evaluation to catch error spirals, command failures, and repeated edit defects during unattended agent runs.

PRECONDITION: Milestone M7 must be complete. Unattended background runs must be protected by M7 worktree isolation and resource ceilings.

Current state:
- packages/session/src/signals.ts calculates sessionSignals(events) across the entire conversation only at session completion.
- When an agent encounters repeated edit or command failures mid-run, no reflection or intervention occurs until the turn ceiling is exhausted.

1. In kaioken_v2/packages/session/src/signals.ts:
   - Define interface TurnReflection with fields: healthy: boolean, anomaly?: { pattern: "repeated_edit_failure" | "command_failure_spiral" | "oscillating_edits", target?: string, message: string }, signals: Signal[].
   - Implement evaluateTurnSignals(recentEvents: readonly ConversationEvent[]): TurnReflection:
     - Scans the trailing window of events.
     - Flags repeated_edit_failure if the last 2 tool events are failed edits on the same file.
     - Flags command_failure_spiral if the last 2 tool events are failed shell commands.
     - Detects error_recovery if a previous tool failure was followed by a successful tool result.
2. Re-export TurnReflection and evaluateTurnSignals from packages/session/src/index.ts.
3. In kaioken_v2/apps/cli/src/agent-host.ts:
   - Call evaluateTurnSignals after each turn in unattended mode.
   - If an anomaly is detected, inject a corrective intervention message instructing the agent to pause, re-read the file with read_file, and verify syntax before repeating the failing tool call.
   - Limit interventions to at most 2 per session to avoid intervention loops.
4. Add unit tests in kaioken_v2/packages/session/test/signals.test.ts testing single failure (no anomaly), two consecutive edit failures (triggers anomaly), two shell failures, and clean recovery.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/session/test/signals.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/session/src/signals.ts, packages/session/src/index.ts, packages/session/test/signals.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not change the signature of existing sessionSignals(events) function in packages/session/src/signals.ts as packages/skillgen depends on it. Add evaluateTurnSignals alongside it.
</missing_context_gating>

<action_safety>
Scope strictly to packages/session/ and agent-host.ts. Do not modify packages/skillgen or packages/gitops. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of per-turn reflection logic and anomaly patterns.
2. Exact files touched.
3. Vitest test results and counts.
4. Confirmation of backwards compatibility for sessionSignals().
</structured_output_contract>
```
