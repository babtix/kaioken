# M3-04 · Specify the quit guard with active runs

> Intercept window close and application termination events in Kaioken Studio when background runs
> are active, preventing accidental loss of in-flight wiki and agent tasks.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-carry-over-audit`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio packaging and distribution |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/lifecycle/` |
| **Risk** | Low to Medium. A buggy quit guard can trap the user in an uncloseable window |
| **Gate-critical** | **Yes** |

## Why this exists

In v1, `.kaioken_v1/ROADMAP.md:92` was emphatic: **"Losing a wiki run on window close destroys trust
permanently."**

A deep documentation run (`kaioken wiki x3` or `plan x5`) is an investment: it can spend several
dollars in API credits and run for five to ten minutes, orchestrating dozens of model calls, outlines,
chapter drafting, and verifier critique passes. If an inadvertent click on the window close button
(`X`), an accidental `Alt+F4`, or an OS shutdown signal instantly kills the process, all intermediate
reasoning and unwritten chapter buffers are destroyed.

The quit guard provides a non-negotiable safety net: whenever in-flight tasks are running, window
closure is intercepted, presenting the user with an explicit warning, the current progress state,
and an opportunity to cancel.

## Current state

Verified against repository records.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:92` ("Quit-with-active-runs guard") |
| Studio status bar tracks runs | `kaioken_v2/docs/studio-v0.1-scope.md:62` (status bar displays "active run count") |
| Daemon run registry | `kaioken_v2/apps/cli/src/commands/daemon.ts:80-91` tracks `RunRecord` with status `"running"`, `progress`, and `cancel` callback |
| In-process execution | In-process Theia architecture means Electron window close terminates engine threads directly |

`UNVERIFIED:` whether Electron's `app.on('before-quit')` handler requires custom IPC bridging from
Theia's browser process to prevent premature process exit.

## What done looks like

- [ ] Window close events (`beforeunload` in DOM / `close` event on Electron `BrowserWindow`) are intercepted.
- [ ] If `activeRunsCount === 0`: the window closes immediately with zero friction.
- [ ] If `activeRunsCount > 0`:
  - The close action is cancelled/halted.
  - A modal confirmation dialog is rendered:
    ```
    +--------------------------------------------------------------------+
    | Active Tasks in Progress                                          |
    +--------------------------------------------------------------------+
    | Wiki generation is currently running:                              |
    | - Chapter 4 of 8: "Packages and Dependencies" (42% complete)      |
    |                                                                    |
    | Quitting now will abort the run. In-flight tokens and uncommitted  |
    | chapters will be lost.                                             |
    |                                                                    |
    |                     [ Keep Running (Esc) ]   [ Abort and Quit ]    |
    +--------------------------------------------------------------------+
    ```
  - **Focus:** Focus defaults to `[ Keep Running ]`. Pressing `Esc` or `Enter` keeps the application open.
  - Clicking `[ Abort and Quit ]`:
    1. Triggers `AbortController.abort()` on all active runs.
    2. Flushes any completed chapters or safe artifacts to disk.
    3. Destroys the window and allows process exit.
- [ ] Operating system force-close / SIGKILL behavior is documented honestly as unavoidable.

## Steps

1. **Implement Run Tracker Service:**
   - In `theia-extensions/kaioken/src/browser/lifecycle/run-tracker.ts`, maintain an observable set of active run IDs and their descriptions (e.g. `Wiki run x3 (Chapter 4/8)`).
2. **Hook Theia / Electron Window Close Event:**
   - Use Theia's `FrontendApplicationContribution` lifecycle method `onWillStop()` or hook the browser window `beforeunload` event.
   - For Electron: in the main process, handle `browserWindow.on('close', (e) => { ... })`.
3. **Render Confirmation Dialog:**
   - If active runs exist, call Theia's `MessageService` or render a custom modal dialog detailing the running jobs.
4. **Implement Graceful Abort:**
   - If user confirms exit:
     - Invoke abort hooks for all active engine jobs.
     - Allow 2000ms for child processes / file writes to close cleanly.
     - Resume shutdown (`window.close()` with guard bypassed).

## In scope

- Theia browser/frontend lifecycle interception.
- Electron window close event guard in Kaioken Studio.
- Abort propagation to engine jobs.

## Out of scope

- Intercepting OS kernel `SIGKILL` / task manager end-process (un-interceptable).
- Resuming interrupted runs across process restarts (persisting resume state is Gap G-3).

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Manual test in developer mode:
1. Trigger a mock long-running task.
2. Attempt to close the window.
3. Verify that the confirmation modal appears and that pressing Escape dismisses it without closing the app.

## Traps

| Trap | Guard |
|---|---|
| Trapping the user permanently | If an active run crashes without clearing its running state, the user could be stuck unable to quit. Include an explicit "Force Quit" option |
| Defaulting focus to "Abort and Quit" | Accidental keypresses must not abort the run. Focus must always default to "Keep Running" |
| Aborting without signaling the engine | Closing without triggering `AbortController.abort()` leaves orphaned file locks or partial `.tmp` files in `.kaioken/` |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and build the quit guard with active runs for Kaioken Studio.

Requirements from roadmap/m03-desktop-depth-pass/04-quit-with-active-runs-guard.md:
1. Track active background tasks (wiki generation, agent runs, card generation) in a central
   lifecycle run-tracker.
2. Intercept window close (Electron `close` event / `beforeunload`):
   - If zero runs are active, permit instant close.
   - If any run is active, block close and display a confirmation modal.
3. Modal requirements:
   - State clearly which tasks are running and their current progress.
   - Warn that quitting will abort the task and discard in-flight generation.
   - Default focus must be on "Keep Running".
   - Pressing Escape or clicking "Keep Running" cancels the close request.
4. If "Abort and Quit" is clicked, invoke abort controllers on all active tasks, flush pending
   writes, and proceed with clean shutdown.
</task>

<verification_loop>
Verify that triggering close with an active mock task renders the confirmation dialog.
Verify that Escape keeps the window open.
Verify that confirming quit triggers cancellation and cleanly exits.
Run yarn build in kaioken_studio_theia to ensure clean compilation.
</verification_loop>

<missing_context_gating>
Do not implement a persistent session resume store here (chat session persistence is Gap G-3).
Focus strictly on intercepting window close and graceful abort.
</missing_context_gating>

<action_safety>
Modify only theia-extensions/kaioken/src/browser/lifecycle/ components. Do not modify core engine
packages. Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) lifecycle hook mechanism used in Theia/Electron, (2) dialog layout and default focus
behavior, (3) graceful abort sequence, (4) build verification result.
</structured_output_contract>
```
