# M3-06 · Map error copy and recovery actions per failure code

> Map every engine and provider failure code to a human-readable explanation paired with a concrete,
> clickable remediation action in the Studio UI.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-carry-over-audit`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio Chat and Notification UX |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/errors/` |
| **Risk** | Low. User-facing presentation layer mapping structured error codes |
| **Gate-critical** | **No** |

## Why this exists

In v1, `.kaioken_v1/ROADMAP.md:94` established a crucial usability standard: **"Empty states + error
copy for every `ApiError.code`. Every failure maps to a human sentence and a next action."**

AI developer environments fail in myriad ways: provider rate limits, invalid API keys, context window
overflows, malformed model JSON, git lock collisions, and network timeouts. In a naive implementation,
these failures dump stack traces, raw HTTP status codes (`401`, `429`, `502`), or unhandled promise
rejections into the chat transcript.

This breaks the vibe-coding experience. A user should never have to decipher an unformatted stack
trace to realize their API credits expired. Every failure emitted by the engine must be caught and
rendered as a structured remediation card containing: (1) what happened in plain English, (2) the
exact error code, and (3) a clickable button to resolve the issue immediately.

## Current state

Verified against the engine and daemon codebase.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:94` ("Every failure maps to a human sentence and a next action") |
| Daemon error helper | `kaioken_v2/apps/cli/src/commands/daemon.ts:726-728` defines `sendError(res, code, message, status, detail)` |
| Model retry handling | `kaioken_v2/packages/model/src/retry.ts:16-45` classifies retryable errors (`isRetryable`, status 429, 503, 504) |
| Model extract failure | `kaioken_v2/packages/model/src/index.ts:119` throws `Error("model reply contained no parseable JSON")` |
| Verification diagnostics | `kaioken_v2/apps/cli/src/commands/verify.ts` captures build/test exit codes and outputs |

## What done looks like

- [ ] All 10 standard engine and provider error codes are registered in a typed error registry.
- [ ] Every error code maps to a plain-English explanation, the error code identifier, and at least one actionable recovery button.
- [ ] The ErrorCard component renders cleanly in the Chat transcript when an agent turn or tool execution fails.
- [ ] Clicking action buttons (e.g. `[Open Settings]`, `[Re-scan Repository]`, `[Retry]`) dispatches the corresponding Theia command.
- [ ] Empty states for the wiki tree and card views display actionable guidance rather than blank containers.

## Error taxonomy and remediation mapping

| Error Code | Plain English Explanation | Primary Next Action | Secondary Next Action |
|---|---|---|---|
| `AUTH_KEY_MISSING` | "No API key configured for {provider}." | `[ Open Settings ]` (opens API key config) | `[ Use Free Tier Model ]` |
| `AUTH_KEY_INVALID` | "The API key for {provider} was rejected by the endpoint." | `[ Update Key ]` | `[ Test Connection ]` |
| `RATE_LIMIT_EXCEEDED` | "{provider} returned a rate limit (HTTP 429). The system will back off automatically." | `[ Wait & Retry (Countdown) ]` | `[ Switch Provider ]` |
| `CONTEXT_EXCEEDED` | "The task context exceeded the model's window limit ({limit} tokens)." | `[ Lower Multiplier to x1 ]` | `[ Prune Chat History ]` |
| `UNPARSEABLE_MODEL_REPLY` | "The model returned unstructured prose instead of valid JSON." | `[ Retry with Critique Pass ]` | `[ View Raw Reply ]` |
| `STALE_SCAN_DRIFT` | "Repository files moved since the last scan. Documentation hashes may be invalid." | `[ Re-scan Repository ]` | `[ Ignore & Continue ]` |
| `PATCH_CONFLICT` | "The target file changed on disk while the agent was working." | `[ Reload File & Re-plan ]` | `[ View Disk Diff ]` |
| `GIT_DIRTY_TREE` | "Cannot perform automated git branch operation with uncommitted changes." | `[ Stash Changes ]` | `[ Open SCM View ]` |
| `NETWORK_TIMEOUT` | "Request to {provider} timed out after {timeout} seconds." | `[ Retry Call ]` | `[ Check Network ]` |
| `LOCAL_MODEL_OFFLINE` | "Could not connect to local model runner (Ollama / LM Studio) on {url}." | `[ Start Ollama ]` | `[ Switch to Cloud Provider ]` |

## Visual layout of error cards

```
+-------------------------------------------------------------------------+
| [!] Authentication Required                                             |
+-------------------------------------------------------------------------+
| OpenRouter rejected the request because your API key is missing.        |
| Error: AUTH_KEY_MISSING (HTTP 401)                                      |
|                                                                         |
| Next actions:                                                           |
| [ Configure API Key in Settings ]        [ Switch to Free Model (M3) ]  |
+-------------------------------------------------------------------------+
```

## Steps

1. **Author Error Registry:**
   - In `theia-extensions/kaioken/src/browser/errors/error-registry.ts`, define the `EngineError` interface:
     ```typescript
     export interface FormattedError {
       code: string;
       title: string;
       explanation: string;
       detail?: string;
       actions: Array<{ label: string; actionId: string; primary?: boolean }>;
     }
     ```
2. **Implement Error Formatter:**
   - Map raw errors (from exceptions, RPC rejections, and daemon codes) to `FormattedError` entries.
3. **Build ErrorCard Component:**
   - In the Chat transcript and notification services, render the structured card rather than raw error text.
4. **Wire Action Handlers:**
   - Connect action buttons to Theia command IDs (e.g. `kaioken.open-settings`, `kaioken.retry-turn`, `kaioken.rescan`).
5. **Handle Empty States:**
   - When wiki tree, cards, or search return zero items, render friendly guidance explaining how to generate them (e.g., *"No cards found. Run `cards x3` to generate knowledge cards"*).

## In scope

- Error mapping taxonomy in Studio frontend.
- Error card presentation in Chat pane and notification toasts.
- Action button command dispatch.

## Out of scope

- Modifying underlying HTTP error codes emitted by remote LLM APIs.
- Auto-purchasing API credits or managing third-party billing.

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Verify error mapping tests: author unit tests verifying that all 10 standard error codes produce a
non-empty title, explanation, and at least one actionable button.

## Traps

| Trap | Guard |
|---|---|
| Swallowing the underlying technical error | Always display the underlying `code` and raw message in an expandable "Details" accordion for debugging |
| Offering action buttons that do nothing | Every action button must be wired to a real Theia command or handler |
| Catching errors globally and suppressing UI updates | The Chat transcript must record the error card in context, not just flash a transient toast |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and implement the error copy and remediation action system
for Kaioken Studio.

Requirements from roadmap/m03-desktop-depth-pass/06-error-copy-per-failure-code.md:
1. Create theia-extensions/kaioken/src/browser/errors/error-registry.ts mapping all engine failure codes
   (AUTH_KEY_MISSING, RATE_LIMIT_EXCEEDED, CONTEXT_EXCEEDED, UNPARSEABLE_MODEL_REPLY, PATCH_CONFLICT,
   LOCAL_MODEL_OFFLINE, etc.) to formatted explanations.
2. Ensure every error mapping includes:
   - A plain-English summary of what happened.
   - The technical error code.
   - At least one actionable button (e.g. [Open Settings], [Re-scan], [Retry], [Lower Multiplier]).
3. Build the ErrorCard React/Theia component rendered in the Chat pane transcript upon tool or
   model failure.
4. Wire button clicks to corresponding Theia commands.
5. Provide friendly empty states for the Wiki browser and Card browser when no artifacts exist.
</task>

<verification_loop>
Verify that feeding mock errors (e.g. 401 Unauthorized, 429 Rate Limit) into the error formatter
produces the correct human copy and action buttons.
Run yarn build in kaioken_studio_theia to confirm clean compilation.
</verification_loop>

<missing_context_gating>
Do not invent generic error handlers that catch-all into "An unknown error occurred". Every known
engine error must have a specific entry in the error registry.
</missing_context_gating>

<action_safety>
Modify only theia-extensions/kaioken/src/browser/errors/ and related UI components. Do not modify
core engine packages. Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) error taxonomy and codes mapped, (2) ErrorCard component details, (3) command action
wiring, (4) build verification outcome.
</structured_output_contract>
```
