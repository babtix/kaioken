# M8-05 · OS completion notifications

> Send native desktop notifications and terminal alerts when an unattended background run completes, fails, or requests human intervention.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | **`M7` (Permissions & Sandboxing) — HARD GATE**, `01-daemon-hosted-long-running-tasks` |
| **Blocks** | Milestone M8 completion |
| **Touches** | `apps/cli/src/notify.ts`, `apps/cli/src/commands/daemon.ts`, `apps/cli/src/commands/chat.ts`, `apps/cli/test/notify.test.ts` |
| **Risk** | Low. Notifications are fire-and-forget; failure to dispatch must never affect run exit code |
| **Gate-critical** | No — user experience and alert feedback |

> [!IMPORTANT]
> **GATE PREREQUISITE:** This leaf is strictly gated behind Milestone M7. Notifications alert on unattended background worker activity, which can only be safely executed under M7 sandboxing (`M7-02`, `M7-03`, `M7-05`).

## Why this exists

Operating rule 1 specifies that review is the ultimate bottleneck. When a developer queues a long-running refactor or wiki generation and switches context to another project or walks away from their desk, they should not have to manually poll the terminal or check process status to know when it is ready.

Native OS notifications close the loop. When a background run completes, fails on a gate check, or hits an interactive question requiring human input, the system sends an immediate desktop alert. If running in a headless environment or over an SSH terminal, it falls back cleanly to terminal escape sequences (OSC 777 or standard ASCII bell `\u0007`) without breaking or hanging the calling process.

## Current state

Verified in `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Daemon tracks run completion state | `kaioken_v2/apps/cli/src/commands/daemon.ts:80-91` | `RunRecord.status` transitions to `"completed"` or `"failed"` |
| Terminal commands exit silently on completion | `kaioken_v2/apps/cli/src/commands/chat.ts:240-275` | Interactive chat loops exit with status code; no notification dispatch occurs |
| Cross-platform OS diversity in repository | Windows host (`powershell`), macOS, Linux target | Notification dispatch must handle differences between Windows toast, macOS Notification Center, and Linux `notify-send` |
| Zero notification module in CLI | `kaioken_v2/apps/cli/src/` | No desktop notification helper exists today in `apps/cli` |

`UNVERIFIED:` whether Windows PowerShell toast notifications require administrative registration on locked-down Windows enterprise machines.

## What done looks like

- [ ] New module `apps/cli/src/notify.ts` exporting:
  - `sendNotification(options: NotificationOptions): Promise<void>`
  - Cross-platform support:
    - macOS: `osascript -e 'display notification ... with title "Kaioken"'`
    - Windows: PowerShell toast command via `powershell -NoProfile -Command ...`
    - Linux: `notify-send "Kaioken" "..."`
    - Headless / terminal fallback: emits ASCII bell `\u0007` or OSC 777 notification sequence.
- [ ] Safe execution invariants:
  - Non-blocking: executes asynchronously with a 3-second timeout.
  - Fail-safe: catches all execution errors; never throws or alters process exit codes.
  - Opt-out: respects `--no-notify` flag and `.kaioken/config.json` setting `{"notifications": false}`.
- [ ] Daemon integration: fires when background runs (`RunRecord`) reach terminal states (`completed`, `failed`).
- [ ] CLI integration: fires on `kaioken chat` or `kaioken update` when `--notify` is enabled or run duration exceeds 60 seconds.

## Steps

1. **Implement `apps/cli/src/notify.ts`:**
   - Define interface `NotificationOptions`: `{ title: string; message: string; sound?: boolean; runId?: string }`.
   - Implement platform detection (`process.platform`):
     - `darwin`: spawn `osascript`.
     - `win32`: spawn `powershell.exe` with toast snippet.
     - `linux`: spawn `notify-send`.
   - Add terminal escape fallback: write `\x1b]777;notify;${title};${message}\x1b\\` and `\u0007` to `process.stderr`.
   - Enforce 3000ms execution timeout using `execFile` signal.
2. **Wire into Daemon Run Completion (`apps/cli/src/commands/daemon.ts`):**
   - When a run finishes:
     - Title: `Kaioken Task Completed` (or `Failed`).
     - Message: `Run ${runId} finished in ${duration}s. Review diff: git diff main...${branch}`.
     - Invoke `sendNotification`.
3. **Wire into CLI Options (`apps/cli/src/main.ts`):**
   - Add flag `--notify` / `--no-notify`.
4. **Unit and Mock Testing (`apps/cli/test/notify.test.ts`):**
   - Mock `child_process.execFile` and verify correct platform arguments are passed for darwin, win32, and linux.
   - Verify timeout and error suppression (throwing mock command does not reject `sendNotification`).

## In scope

- `kaioken_v2/apps/cli/src/notify.ts`
- `kaioken_v2/apps/cli/src/commands/daemon.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/apps/cli/test/notify.test.ts`

## Out of scope

- External mobile push notifications or email/SMS alerting.
- Third-party chat bots (Slack/Discord bots are explicitly refused non-goals per README §7).
- Native C++ Node addon bindings.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run apps/cli/test/notify.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Notification failure crashing the background daemon | Wrap all OS dispatch logic in try/catch and suppress errors; notifications are strictly best-effort |
| Hanging background processes due to stuck PowerShell or osascript calls | Set a strict 3000ms timeout on notification child processes |
| Notification spam on incremental turn steps | Notify ONLY on terminal states (`completed`, `failed`) or when explicit human approval is blocked |
| Audio alerts firing in silent CI environments | Check `process.env.CI` and disable sound/desktop alerts in CI pipelines |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/, implement cross-platform OS desktop notifications and terminal alerts for completed background tasks and long-running agent runs.

PRECONDITION: Milestone M7 must be complete. Background worker runs must execute within sandboxed worktrees.

Current state:
- apps/cli/src/commands/daemon.ts tracks completed runs, but provides no desktop alerting.
- When an unattended run completes, the user must manually poll status to know it is finished.

1. Implement kaioken_v2/apps/cli/src/notify.ts:
   - Define interface NotificationOptions with title: string, message: string, sound?: boolean.
   - Implement sendNotification(options: NotificationOptions): Promise<void>:
     - Check if process.env.CI is true or notifications disabled; if so, return immediately.
     - On macOS (darwin): call osascript -e 'display notification "<message>" with title "<title>"'.
     - On Windows (win32): call powershell.exe with balloon/toast notification script.
     - On Linux: call notify-send "<title>" "<message>".
     - Always emit terminal bell \u0007 and OSC 777 escape sequence to process.stderr as fallback.
     - Enforce a 3000ms timeout on spawned notification processes.
     - Catch and suppress all errors — sendNotification must never throw or reject.
2. In kaioken_v2/apps/cli/src/commands/daemon.ts:
   - When a RunRecord transitions to "completed" or "failed", call sendNotification with run outcome and diff review instructions.
3. In kaioken_v2/apps/cli/src/main.ts:
   - Support --notify and --no-notify flags.
4. Add unit tests in kaioken_v2/apps/cli/test/notify.test.ts:
   - Mock platform calls and verify command arguments for win32, darwin, and linux.
   - Verify graceful failure handling when child processes fail or time out.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run apps/cli/test/notify.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only apps/cli/src/notify.ts, apps/cli/src/commands/daemon.ts, apps/cli/src/main.ts, and apps/cli/test/notify.test.ts.
</verification_loop>

<missing_context_gating>
Do not add heavy native binary npm packages. Implement notifications using standard platform child_process commands (osascript, powershell, notify-send).
</missing_context_gating>

<action_safety>
Scope strictly to apps/cli/. Do not modify packages/agent or packages/gitops. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of cross-platform notification dispatch implementation.
2. Exact files touched in apps/cli/.
3. Vitest test results and counts.
4. Confirmation that notification errors never interrupt run execution.
</structured_output_contract>
```
