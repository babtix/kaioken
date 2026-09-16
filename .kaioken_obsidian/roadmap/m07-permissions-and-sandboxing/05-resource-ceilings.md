# M7-05 · Hard resource ceilings

> Implement non-negotiable hard stops on autonomous runs: maximum turns, maximum spend, and maximum wall-clock time, failing closed when model cost accounting is unavailable.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-audit-current-autonomy-surface` |
| **Blocks** | `M8-01` (daemon-hosted long-running tasks), `M8` background worker queue |
| **Touches** | `packages/agent/src/ceilings.ts`, `packages/agent/src/index.ts`, `packages/agent/test/ceilings.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | Medium. Must terminate runs cleanly without corrupting open streams or leaving orphaned child processes |
| **Gate-critical** | **Yes — prevents runaway spend and infinite agent loops in background tasks** |

## Why this exists

Operating rule 1 notes that generation is cheap while review is expensive. In an autonomous, unattended setting, an agent that gets stuck in an error-recovery loop or begins an unbounded file-editing spiral will happily churn through hundreds of API calls, consuming millions of tokens and racking up massive API bills overnight.

The source plan is emphatic: **these are hard stops, not prompts asking nicely**. Soft guidance injected into the context window ("you have two turns left, please wrap up") is routinely ignored or rationalized away by modern models. When a ceiling is hit, the runtime driver must pull the plug immediately: abort the model stream, terminate active tool child processes, snapshot the partial worktree, and report the cutoff. Furthermore, per known gap **G-4**, model token accounting is frequently inaccurate or unavailable on certain providers; a spend ceiling must **fail closed**, refusing to spend blind when it cannot reliably meter costs.

## Current state

Verified in `kaioken_v2/apps/cli/` and `kaioken_v2/packages/model/`.

| Fact | Evidence | Notes |
|---|---|---|
| Agent loop runs without turn limit | `kaioken_v2/apps/cli/src/agent-host.ts:251-277` | `new agentRuntime.Agent(...)` has no configured turn bounds; runs until assistant stops or aborts |
| Gate timeout exists only post-session | `kaioken_v2/packages/agent/src/gate.ts:72` | `DEFAULT_TIMEOUT_MS = 10 * 60 * 1000` applies only to the verify gate script execution |
| Cost accounting is approximate or missing (Gap G-4) | `kaioken_v2/apps/cli/src/model.ts:200-204` | Synthesized models warn: *"Token and cost figures may be wrong."* |
| Provider usage reporting varies | `kaioken_v2/apps/cli/src/model.ts:47-75` | `completeSimple` receives tokens, but cost conversion depends on static catalogs |
| Zero runtime ceiling enforcement | `kaioken_v2/packages/agent/src/index.ts:1-22` | No ceiling, quota, or budget monitor exists in `@kaioken/agent` |

`UNVERIFIED:` whether `@earendil-works/pi-agent-core` exposes an internal per-turn callback between iteration steps or requires wrapping the `streamFn` / event subscription.

## What done looks like

- [ ] New module `packages/agent/src/ceilings.ts` defining:
  - `ResourceCeilingConfig`: `{ maxTurns?: number; maxSpendUsd?: number; maxWallClockMs?: number }`.
  - `ResourceUsageTracker`: tracks active turns, elapsed wall-clock milliseconds, token usage, and calculated spend in USD.
  - `CeilingBreach`: structured termination signal (`"max_turns" | "max_spend" | "max_wall_clock" | "accounting_unavailable"`).
- [ ] **Fail-closed spend safety (Gap G-4)**:
  - If a run configures `maxSpendUsd`, but the active provider/model does not report token accounting or cost metadata, the runner **fails closed**: it refuses to start unless a conservative fallback turn ceiling is accepted, or aborts immediately.
  - When token counts are reported but token pricing is unknown, the tracker uses conservative maximum pricing brackets ($15/M tokens) rather than assuming $0.
- [ ] Hard abort mechanism in `apps/cli/src/agent-host.ts`:
  - When a ceiling trips, the tracker fires an abort signal that calls `agent.abort()`, kills any running child process in `executionTools`, and transitions session state to `terminated_ceiling`.
- [ ] Unit tests in `packages/agent/test/ceilings.test.ts` validating:
  - Abort on turn N.
  - Abort on wall-clock expiry.
  - Abort on spend limit reached.
  - Fail-closed behavior on missing token metrics.

## Steps

1. **Implement `packages/agent/src/ceilings.ts`:**
   - Define types and interfaces for resource budgets and usage snapshots.
   - Implement `ResourceCeilingTracker`:
     - Constructor takes `ResourceCeilingConfig` and model pricing info.
     - Method `recordTurn()`: increments turn count; checks `maxTurns`.
     - Method `recordTokens(inputTokens: number, outputTokens: number)`: updates token sums and estimated spend; checks `maxSpendUsd`.
     - Method `checkWallClock()`: checks `Date.now() - startTime >= maxWallClockMs`.
     - Method `checkBudget()`: returns `{ ok: true }` or `{ ok: false, breach: CeilingBreach, reason: string }`.
2. **Implement Fail-Closed Policy for Gap G-4:**
   - Add verification check: `isAccountingAvailable(modelSpec: string): boolean`.
   - If `maxSpendUsd` is specified and `!isAccountingAvailable`:
     - If no explicit `maxTurns` is configured, assign a hard-clamped fallback (e.g. 10 turns) and log a warning, OR fail the run if strict mode is active.
     - Never allow an unmetered model to run indefinitely under a spend cap.
3. **Integrate Tracker into `apps/cli/src/agent-host.ts`:**
   - In `createSession`, instantiate `ResourceCeilingTracker`.
   - On each message turn and tool execution:
     - Check `tracker.checkBudget()`.
     - If budget breached: invoke `agent.abort()`, mark session outcome as breached, and append failure explanation to assistant messages.
   - Set a wall-clock timer (`setTimeout`) linked to the session's `AbortController` for unconditional cutoff.
4. **Unit and Integration Testing:**
   - Test turn limit trips exactly at `maxTurns`.
   - Test wall-clock timeout cancels active stream.
   - Test spend accumulation with standard pricing and synthetic model fallbacks.
   - Re-export from `packages/agent/src/index.ts`.

## In scope

- `kaioken_v2/packages/agent/src/ceilings.ts`
- `kaioken_v2/packages/agent/src/index.ts`
- `kaioken_v2/packages/agent/test/ceilings.test.ts`
- Wiring abort and timeout handling into `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- UI cost counters or multiplier preview widgets in Studio (Studio v0.1 scope).
- Payment processing or token purchase integration.
- Persisting historical spend across multiple sessions into a database.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific package test verification:

```bash
npx vitest run packages/agent/test/ceilings.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Relying on prompt injection for resource bounds | Hard kill at the session driver level via `agent.abort()` and process signals |
| Failing open when token accounting is unavailable (Gap G-4) | When cost metrics are unverified, calculate with conservative worst-case pricing or clamp to hard turn ceilings |
| Hanging child processes after agent loop abort | Store active child process references in `NodeExecutionEnv` and send `SIGTERM`/`SIGKILL` on abort |
| Wall-clock timer drift during long tool execution | Use absolute timestamp comparisons (`Date.now() >= deadline`) checked before every turn and tool call |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement hard resource ceilings (max turns, max spend, max wall-clock) for agent sessions, enforcing hard stops at the driver layer and failing closed on spend when model cost accounting is unavailable (Gap G-4).

Current state:
- apps/cli/src/agent-host.ts lines 251-277 drives the agent loop without turn or cost limits.
- apps/cli/src/model.ts lines 200-204 documents Gap G-4: synthesized models have approximate or unavailable token/cost figures.
- No resource tracking or ceiling enforcement exists in packages/agent/.

1. Implement kaioken_v2/packages/agent/src/ceilings.ts:
   - Define interface ResourceCeilingConfig:
     { maxTurns?: number; maxSpendUsd?: number; maxWallClockMs?: number; strictAccounting?: boolean }
   - Define interface UsageSnapshot:
     { turns: number; inputTokens: number; outputTokens: number; estimatedSpendUsd: number; elapsedMs: number }
   - Define class ResourceCeilingTracker:
     - constructor(config: ResourceCeilingConfig, pricing?: { inputPerMillion: number; outputPerMillion: number; isEstimated?: boolean })
     - start(): void (records startTime)
     - recordTurn(): void (increments turns, throws or returns breach if turns > maxTurns)
     - recordTokens(input: number, output: number): void (updates tokens, calculates spend)
     - checkCeilings(): { ok: true } | { ok: false; breach: "turns" | "spend" | "wall_clock" | "unmetered"; reason: string }
     - Handle Gap G-4: if maxSpendUsd is set, but pricing.isEstimated is true or pricing is unavailable:
       - If strictAccounting is true: reject with "Cannot enforce spend ceiling: model accounting unavailable (Gap G-4)".
       - Otherwise: clamp effective maxTurns to Math.min(configuredMaxTurns ?? 10, 10) and calculate with conservative worst-case rates ($15/M tokens).
2. Re-export ceilings types and tracker from kaioken_v2/packages/agent/src/index.ts.
3. Wire into kaioken_v2/apps/cli/src/agent-host.ts:
   - Update SessionOptions to accept `ceilings?: ResourceCeilingConfig` and optional pricing metadata.
   - In createSession:
     - Check tracker before each turn and inside event subscriber for message_end / message_update.
     - When checkCeilings returns ok: false, immediately invoke agent.abort(), cancel any active wall-clock timer, and surface the termination reason.
     - Ensure NodeExecutionEnv child processes receive SIGTERM/SIGKILL if abort is triggered.
4. Add unit tests in kaioken_v2/packages/agent/test/ceilings.test.ts:
   - Test exact turn termination.
   - Test wall-clock timeout trigger.
   - Test spend limit breach.
   - Test fail-closed behavior when cost figures are marked unavailable.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/agent/test/ceilings.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/agent/src/ceilings.ts, packages/agent/src/index.ts, packages/agent/test/ceilings.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not make spend ceilings soft or prompt-driven. The abort must be programmatic via agent.abort() and tracked in session state.
</missing_context_gating>

<action_safety>
Scope strictly to packages/agent/src/ceilings.ts, index re-exports, tests, and agent-host.ts ceiling integration. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of ceiling tracker implementation and fail-closed handling for Gap G-4.
2. Exact files touched.
3. Vitest test results and counts.
4. Confirmation that ceiling breach triggers hard abort rather than prompt hints.
</structured_output_contract>
```
