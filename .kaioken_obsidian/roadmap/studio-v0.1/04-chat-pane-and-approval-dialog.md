# STUDIO-04 · Chat pane, streaming transcript, and approval dialog

> Build the hero interaction surface: an agent chat transcript with collapsible tool-call cards,
> real-time streaming tokens, and an inline approval dialog enforcing the full safety protocol.

| Field | Value |
|---|---|
| **Status** | `blocked` (blocked by `02-agent-strategy-decision` and `cross-cutting/02-streaming-tool-results`) |
| **Size** | L |
| **Depends on** | `01-spike-and-stop`, `02-agent-strategy-decision`, `03-theme-and-status-bar`, `cross-cutting/02-streaming-tool-results` |
| **Blocks** | `06-package-once-unsigned`, M7 (Permissions & sandboxing GUI), done-criteria 3 & 4 |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/chat/`, `src/common/kaioken-protocol.ts` |
| **Risk** | High — complex state machine, streaming RPC, modal focus traps, and safety controls |
| **Gate-critical** | **Yes — Studio v0.1 success is defined by this surface** |

## Why this exists

The scope document ([`kaioken_v2/docs/studio-v0.1-scope.md:56-57`](../../kaioken_v2/docs/studio-v0.1-scope.md#L56-L57))
identifies the chat pane as *"the surface that has to feel good"*. An agentic IDE that feels sluggish,
obscures what tools are running, or renders long turns as a frozen spinner fails the core developer
experience.

Crucially, this leaf implements the **approval dialog**, which is not a mere UI detail but a
**critical safety control**. Cross-referencing `roadmap/m07-permissions-and-sandboxing/` and
`roadmap/m03-desktop-depth-pass/`, the approval dialog gates all mutating file writes, commands, and
deletions. If an agent can silently edit code or trick a user into accidental approval via modal
focus capture, the engine's entire safety model collapses. The approval interface must enforce strict
operational constraints: focus resting on Deny, single-keystroke shortcuts, and an unyielding
timeout.

## Current state

Verified against [`kaioken_v2/apps/cli/src/commands/chat.ts:34-60`](../../kaioken_v2/apps/cli/src/commands/chat.ts#L34-L60),
[`kaioken_v2/apps/cli/src/commands/agent-serve.ts:18-33`](../../kaioken_v2/apps/cli/src/commands/agent-serve.ts#L18-L33),
and [`kaioken_v2/docs/studio-design-brief.md:167-172`](../../kaioken_v2/docs/studio-design-brief.md#L167-L172):

| Fact | Evidence |
|---|---|
| Chat hooks protocol exists | `apps/cli/src/commands/chat.ts:34-60` defines `ChatHooks` with `approve`, `onOutcome`, `onProgress`, `onVerify`, and `signal` |
| Approval mechanics | In terminal mode, approval asks via readline. In `agent-serve.ts`, it emits an `approve` JSON event and blocks until `approve-reply` arrives |
| Tool streaming limitation | `cross-cutting/02-streaming-tool-results.md` notes that large tool outputs (like test runs) buffer before emitting; chat pane needs chunked streaming |
| Studio chat pane status | Intentionally unbuilt in `theia-extensions/kaioken/` pending resolution of `02-agent-strategy-decision` |
| Approval dialog specification | `studio-design-brief.md` §5 details: modal with full diff body, keycaps `Y`/`N`/`A`/`Esc`, armed amber glow, focus NEVER on Approve |

## The safety protocol (non-negotiable requirements)

The approval dialog must implement these four safety rules without compromise:

1. **FOCUS NEVER ON APPROVE:** When the approval modal opens, focus must default to the **Deny**
   button or the scrollable diff viewer. Focus must *never* land on the Approve button. A user
   pressing `Space` or `Enter` to dismiss a prompt must result in a safe denial, never an accidental
   file modification.
2. **Deterministic Hotkeys:**
   - `Y` — Approve this specific change.
   - `N` or `Esc` — Deny this change (leaves file byte-identical).
   - `A` — Approve all remaining changes for this turn only.
3. **Five-Minute Auto-Deny:** An unattended prompt automatically denies after 300 seconds (5 minutes).
   The modal dismisses, the tool call returns `isError: true` with `"auto-denied after 5 minutes"`,
   and the file remains completely untouched.
4. **Visual State Arming:** Only the approval dialog and the pending tool card are permitted to
   exhibit amber illumination (`--kai-amber`, `#ffaf00`). The rest of the shell dims.

## What done looks like

- [ ] A dedicated Chat pane opens via `Ctrl+Alt+C` or the activity bar icon.
- [ ] User prompts are submitted via a bottom composer containing the multiplier dial (×1–×10).
- [ ] Assistant responses stream in real time, token by token, with a live cursor tail.
- [ ] Tool calls render as structured dossiers (collapsible cards with name, arguments JSON, running
      spinner, execution time, and expandable output).
- [ ] When the agent invokes a file write or command, the application pauses and opens the Approval Dialog.
- [ ] The dialog displays a side-by-side or unified Monaco diff of the proposed change.
- [ ] Initial focus is verified to rest on the Deny button. Pressing `Enter` denies the change.
- [ ] Pressing `Y` approves the change; the file updates on disk and immediately reflects in the active Monaco editor tab.
- [ ] If left idle for 5 minutes, the dialog self-closes with a logged auto-denial.

## Steps

1. **Resolve Strategy Precondition:** Confirm resolution of `02-agent-strategy-decision`. If Option A (custom Chat pane), proceed with `ReactWidget`. If Option B (Theia AI), implement custom `ChatAgent` and override approval renderer. (Steps below assume Option A).
2. **Define RPC Streaming Protocol:** Extend `kaioken-protocol.ts` with WebSocket streaming channels:
   `onToken(delta)`, `onToolStart(id, name, args)`, `onToolProgress(id, chunk)`, `onToolEnd(id, result)`, and `onApprovalRequest(id, diff)`.
3. **Implement Backend Agent Runner:** In `kaioken-service-impl.ts`, adapt `runChat` with `ChatHooks` connecting to the RPC streaming callbacks.
4. **Construct Chat ReactWidget:**
   - Build `KaiokenChatWidget` subclassing `ReactWidget`.
   - Implement message transcript rendering user turns (blue), assistant text (JetBrains Mono), and tool dossiers (tan cards).
5. **Construct Approval Modal:**
   - Build `KaiokenApprovalDialog` with embedded Monaco Diff Editor.
   - Bind keyboard listeners for `Y`, `N`, `A`, `Esc`.
   - Explicitly autofocus the Deny button (`denyButton.focus()`).
   - Arm a 300,000ms countdown timer displaying remaining time; on timeout, invoke `deny()`.
6. **Integrate Multiplier Control:** Connect composer multiplier dial to run parameters, querying cost preview from `model.ts`.
7. **End-to-End Test:** Open a test repository in Studio, prompt `"add a comment to line 1 of README.md"`, verify diff rendering, focus placement, and editor update upon approval.

## In scope

- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/chat/` (Blueprint path `theia-extensions/kaioken/src/browser/chat/`)
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/dialogs/kaioken-approval-dialog.tsx`
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/common/kaioken-protocol.ts`
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-service-impl.ts`

## Out of scope

- Wiki browser pane — that is `05`.
- Extension marketplace panel — deferred past v0.1.
- Sandboxing container execution (Docker/bwrap) — that is milestone M7.
- Changes to `kaioken_v2/packages/agent`.

## Gates

From `ide_kaioken/kaioken_studio_theia/`:

```bash
yarn electron build
yarn electron start
```

Verification procedure:
1. Trigger an agent turn that modifies a file.
2. Verify that the approval modal appears with focus on "Deny".
3. Verify pressing `Enter` rejects the edit and file is untouched.
4. Trigger the turn again, press `Y`, verify edit applies and file updates in Monaco.
5. Trigger turn a third time, wait 5 minutes, verify auto-deny triggers.

## Traps

| Trap | Guard |
|---|---|
| Browser autofocus defaulting to the primary/first button | Primary button is usually "Approve". Code must explicitly call `.focus()` on the Deny button or diff editor container. |
| Buffering assistant text until the turn finishes | Hook `onProgress` / `onToken` directly to React component state so tokens stream immediately. A 30-second silent wait reads as a crash. |
| Memory leaks in WebSocket SSE listeners | Unregister RPC listeners in `dispose()` lifecycle method of `KaiokenChatWidget`. |
| Allowing approval bypass via command palette | Mutating backend methods must verify approval ID token signature before executing file write. |

## Open questions

1. **Prerequisite Decision:** Awaiting sign-off on `02-agent-strategy-decision.md` before finalizing whether `KaiokenChatWidget` runs standalone or inside Theia AI's layout.
   - *Status:* Blocks execution of this leaf.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia/, implement the Chat pane and the safety-critical Approval Dialog:

1. In theia-extensions/kaioken/src/common/kaioken-protocol.ts, add RPC interfaces for chat interaction:
   - sendMessage(prompt: string, multiplier: number): Promise<string>
   - onToken: Event<string>
   - onToolCall: Event<{ id: string; name: string; args: unknown }>
   - onToolResult: Event<{ id: string; result: unknown; isError: boolean }>
   - onApprovalRequired: Event<{ id: string; path: string; oldContent: string; newContent: string }>
   - resolveApproval(id: string, decision: 'approve' | 'deny' | 'approve_all'): Promise<void>

2. In theia-extensions/kaioken/src/node/kaioken-service-impl.ts, wire runChat from the engine via
   ChatHooks, bridging tokens and tool executions to the RPC channel.

3. In theia-extensions/kaioken/src/browser/chat/kaioken-chat-widget.tsx, build the ReactWidget transcript:
   - Render user messages in Kaioken blue (#87d7ff).
   - Render streaming assistant prose in JetBrains Mono with live cursor tail.
   - Render tool calls as collapsible cards (glyph, tool name, argument JSON, execution duration).
   - Multiplier control in the composer (x1 to x10) with cost preview.

4. In theia-extensions/kaioken/src/browser/dialogs/kaioken-approval-dialog.tsx, construct the Approval Dialog:
   - Embed Monaco Diff Editor showing old vs proposed content.
   - SAFETY RULE 1: Initial focus MUST land on the Deny button. Never on Approve.
   - SAFETY RULE 2: Keyboard shortcuts: 'Y' approve, 'N' deny, 'A' approve all, 'Esc' deny.
   - SAFETY RULE 3: 5-minute (300s) countdown timer. If expired, auto-deny and close dialog.
   - SAFETY RULE 4: Visual amber glow (--kai-amber) on the modal container; background dimmed.

5. Verify that approving a change writes to disk and immediately updates the open Monaco editor buffer.
</task>

<verification_loop>
Run from ide_kaioken/kaioken_studio_theia/:
  yarn electron build
  yarn electron start
Perform manual test:
1. Ask the agent to edit a file in a test repository.
2. Confirm the approval modal appears with focus on Deny. Press Enter -> confirm file unchanged.
3. Repeat, press 'Y' -> confirm file changed on disk and in Monaco editor.
4. Repeat, wait 5 minutes -> confirm auto-deny log and file unchanged.
</verification_loop>

<action_safety>
Do NOT bypass or soften any part of the safety protocol (focus on Deny, 5-min timeout, Y/N/A/Esc).
Do not edit files in kaioken_v2/. Do NOT run git add or git commit. Leave changes uncommitted in
the working tree.
</action_safety>

<structured_output_contract>
End with: (1) chat pane widget architecture summary, (2) proof of focus trap verification on Deny,
(3) timer implementation details for auto-deny, (4) verification log from the manual edit test.
</structured_output_contract>
```
