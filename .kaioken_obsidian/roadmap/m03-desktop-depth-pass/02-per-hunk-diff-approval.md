# M3-02 · Specify structured per-hunk diff approval

> Specify the side-by-side per-hunk diff review interface for Kaioken Studio, fulfilling the desktop's
> primary design justification with strict approval safety rails.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-carry-over-audit`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio v0.1 Chat & Agent Pane completion |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/chat/` |
| **Risk** | High. This is the primary human-in-the-loop safety boundary preventing unintended file modifications |
| **Gate-critical** | **Yes — P0 for Studio UI** |

## Why this exists

In the original v1 roadmap, structured per-hunk diff approval was designated **"the single reason the
desktop exists over the TUI"** (`.kaioken_v1/ROADMAP.md:90`).

In a terminal environment (`apps/tui`), reviewing an AI agent's multi-file refactor is clumsy: diffs
scroll past the buffer, hunks cannot easily be accepted individually, and users frequently default
to an unexamined whole-file "approve all" out of fatigue. The desktop GUI exists to provide surgical
control: side-by-side Monaco diff viewing, syntax highlighting, and per-hunk accept/reject toggles.
If an agent proposes four good helper functions and one destructive rewrite, the user must be able
to accept the four and reject the one.

## Current state

Verified against repository specifications.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:90` ("Side-by-side, syntax highlighted, accept/reject per hunk") |
| Studio v0.1 scope commitment | `kaioken_v2/docs/studio-v0.1-scope.md:64-65` ("Approval dialog honouring the full safety protocol: focus never on Approve, Y/N/A/Esc, five-minute auto-deny") |
| Free Monaco diff viewer in Theia | `studio-v0.1-scope.md:67-69` ("Monaco editor + diffs inherited free from Theia — build nothing") |
| Daemon approval structure | `kaioken_v2/apps/cli/src/commands/daemon.ts:100-109` defines `ApprovalRequest` with `diff: { path, old_content, new_content }` and `timer` |
| Agent edit tools | `packages/agent` generates tool calls (`apply_patch` or `edit_file`) that trigger the approval gate |

`UNVERIFIED:` whether partial hunk rejection requires re-synthesizing a unified patch or invoking
the model with an error response detailing rejected line ranges.

## What done looks like

- [ ] When an agent executes a file modification tool (`edit_file`, `apply_patch`), execution pauses and renders a diff review widget in the Chat pane.
- [ ] Diffs are displayed in Monaco's side-by-side editor with syntax highlighting matched to file extension.
- [ ] Each diff hunk carries discrete controls: `[Accept Hunk]` and `[Reject Hunk]`.
- [ ] Safety protocol rules are enforced:
  1. **Focus:** Initial focus is NEVER on "Approve" or "Accept All". Focus defaults to the diff viewer or "Reject".
  2. **Keyboard shortcuts:**
     - `Y` or `Enter` (when focused on hunk): Accept active hunk.
     - `N`: Reject active hunk.
     - `A`: Accept all remaining hunks in the file.
     - `Esc`: Deny the entire tool call.
  3. **Auto-deny timer:** An active countdown timer (default 5 minutes, 300s) is visible. When it expires, the request automatically resolves as `deny` with reason `Approval timed out after 300s`.
- [ ] Partial approval execution:
  - If some hunks are accepted and others rejected, the accepted hunks are applied to disk atomically.
  - A structured observation is returned to the agent loop: `"Applied hunks 1, 3. Hunk 2 was rejected by the user. Please inspect the remaining task."`
- [ ] File changes appear immediately in the active Monaco editor tab upon approval.

## Interface and interaction design

```
+-------------------------------------------------------------------------+
| Tool Call: edit_file (src/indexer.ts)              Auto-deny in: 04:32   |
+-------------------------------------------------------------------------+
| Original: Line 45-52                 | Proposed: Line 45-56             |
| 45  function parseQuery(q: string) { | 45  function parseQuery(q: string|
| 46    return q.trim();               | 46    if (!q) return null;       |
| 47  }                                | 47    return q.trim();           |
|                                      | 48  }                            |
| [Hunk 1 of 2]   [ Reject (N) ]   [ Accept Hunk (Y) ]                    |
+-------------------------------------------------------------------------+
| [Hunk 2 of 2]   [ Reject (N) ]   [ Accept Hunk (Y) ]                    |
+-------------------------------------------------------------------------+
| Actions: [ Deny All (Esc) ]                   [ Accept All Remaining (A)]|
+-------------------------------------------------------------------------+
```

## Steps

1. **Review Theia DiffEditorWidget:**
   - Use Theia's existing Monaco diff editor contribution rather than embedding a third-party diff viewer.
2. **Implement ApprovalDialog / Inline Review Card:**
   - Build `DiffApprovalWidget` under `theia-extensions/kaioken/src/browser/chat/`.
   - Wire keyboard bindings: `Y`, `N`, `A`, `Esc`.
3. **Implement the 5-minute Auto-Deny Countdown:**
   - Start a 300-second countdown in the widget header.
   - On expiry, emit `approvalDecision({ id, decision: "deny", reason: "timeout" })`.
4. **Implement Hunk Splitting & Application:**
   - Parse the unified diff into individual hunks (`diff` package or custom parser).
   - Allow user to toggle accepted state per hunk.
   - On submission, apply accepted patches to disk via Node filesystem in-process.
5. **Update Agent Transcript:**
   - Mark the tool call card as `Approved (partial)` or `Approved (full)` in the transcript stream.

## In scope

- Specification and implementation of per-hunk diff review in Kaioken Studio.
- Keyboard navigation and auto-deny safety protocol.
- Partial patch application logic.

## Out of scope

- Terminal UI diff approval (TUI uses full-patch approval prompts).
- External GUI diff utilities (e.g. Beyond Compare, Meld).

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Verify that the approval widget compiles without type errors and obeys the 5-minute auto-deny timeout.

## Traps

| Trap | Guard |
|---|---|
| Setting autofocus to "Approve All" | Destroys the safety boundary. A user hitting Enter or Space in the chat window would inadvertently approve arbitrary code |
| Leaving an approval open indefinitely | Background autonomous runs hang forever. The 5-minute auto-deny prevents orphaned background processes |
| Applying rejected hunks anyway | Verify that patch synthesis strictly omits rejected hunks before writing to disk |
| Re-inventing syntax highlighting | Monaco already provides tokenization and syntax themes. Reuse Theia's editor services |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and build the structured per-hunk diff approval interface
for the Kaioken Studio Chat pane.

Requirements from roadmap/m03-desktop-depth-pass/02-per-hunk-diff-approval.md:
1. When an agent proposes file modifications, display the diff using Monaco's side-by-side diff
   capabilities within the chat message stream.
2. Render discrete [Accept Hunk] and [Reject Hunk] buttons for each diff hunk.
3. Enforce the full safety protocol (studio-v0.1-scope.md §2):
   - Initial focus must NEVER be on Approve.
   - Keyboard shortcuts: Y (accept hunk), N (reject hunk), A (accept all remaining), Esc (deny all).
   - 5-minute auto-deny: countdown timer visible in header; automatically resolves as 'deny' at 0s.
4. If hunks are selectively approved, synthesize and write only the approved changes to disk, and
   return an observation to the agent noting which hunks were rejected.
5. Ensure the active editor tab updates immediately upon file modification.
</task>

<verification_loop>
Verify that DiffApprovalWidget handles single-hunk, multi-hunk, and multi-file diffs.
Verify that pressing Space or Enter immediately upon dialog appearance does NOT trigger approval.
Verify that the 5-minute timeout triggers auto-deny.
Run yarn build in kaioken_studio_theia to ensure clean compilation.
</verification_loop>

<missing_context_gating>
Do not build custom diff parsing engines from scratch if diff / diff-match-patch or Monaco's internal
hunk representations are accessible via Theia editor services.
</missing_context_gating>

<action_safety>
Modify only Studio frontend extension code under theia-extensions/kaioken/. Do not touch engine
packages. Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) UI components created for diff approval, (2) keyboard shortcuts and safety focus
behavior, (3) auto-deny timer implementation, (4) compilation and test status.
</structured_output_contract>
```
