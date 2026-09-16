# GAP-03 · Chat session persistence and resume

> A chat session is not persisted; the transcript lives only in process memory, meaning conversations
> cannot be resumed after CLI exit. Wire `packages/session` storage into `runChat` to provide `--resume`.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | Studio v0.1 session recovery, Milestone M8 (Long-running background sessions) |
| **Touches** | `kaioken_v2/packages/session/`, `kaioken_v2/apps/cli/src/commands/chat.ts`, `apps/cli/src/main.ts` |
| **Risk** | Low — storage primitives already exist in `packages/session` |
| **Gate-critical** | No |

## Why this exists

Quoted directly from [`kaioken_v2/README.md:394-395`](../../kaioken_v2/README.md#L394-L395):

> *A chat session is not persisted. The transcript lives as long as the process, so there is no
> `--resume` and no session store yet.*

When a developer engages in a multi-turn conversation with `kaioken chat`, exiting the CLI or closing
the terminal completely discards the conversation context. If a subsequent command is needed, the
user must start over, re-sending the prompt and paying the model cost to reconstruct prior reasoning.

Crucially, the building blocks for session persistence are **already implemented** in
`packages/session` (`SavedSession`, `saveSession`, `loadSession`, `listSessions`, branching tree
history, and undo journals). However, `apps/cli/src/commands/chat.ts` was never wired to consume them:
it maintains an in-memory `AgentSession` and never writes `.kaioken/sessions/<id>.json`. This leaf
bridges `packages/session` into `chat.ts`, delivering `--resume` and persistent session management.

## Current state

Verified against [`kaioken_v2/packages/session/src/storage.ts:1-42`](../../kaioken_v2/packages/session/src/storage.ts#L1-L42)
and [`kaioken_v2/apps/cli/src/commands/chat.ts:139-160`](../../kaioken_v2/apps/cli/src/commands/chat.ts#L139-L160):

| Fact | Evidence |
|---|---|
| Storage primitives exist | `packages/session/src/storage.ts` exports `SavedSession`, `saveSession()`, `loadSession()`, `listSessions()` storing JSON under `.kaioken/sessions/` |
| Chat command does not persist | `apps/cli/src/commands/chat.ts` never imports or calls `saveSession` or `loadSession`; search for `saveSession` in `chat.ts` returns 0 hits |
| No `--resume` flag | `apps/cli/src/main.ts` lacks a `--resume` flag in its CLI options table |
| Daemon implements session list | `apps/cli/src/commands/daemon.ts:15` imports `packages/session` to list sessions for the GUI, but the CLI chat command cannot resume them |

## What done looks like

- [ ] Every interactive or multi-turn `kaioken chat` session generates a persistent session ID
      (e.g. `ses_1a2b3c4d`) and automatically saves to `.kaioken/sessions/<id>.json` after each turn.
- [ ] CLI supports `--resume [id]`:
      - If an ID is provided, resumes that specific conversation history.
      - If `--resume` is passed without an ID, resumes the most recently updated session.
- [ ] Running `kaioken chat --list` displays past sessions with timestamp, turn count, model, and
      derived title.
- [ ] Resumed conversations retain full tool call history and knowledge cache, allowing follow-up
      questions without repeating initial context.
- [ ] In Studio v0.1, previous sessions are reloadable in the chat transcript.

## Steps

1. **Add CLI Flags for Session Management:**
   - In `apps/cli/src/main.ts`, add `--resume [id]` and `--sessions` / `--list-sessions` to `Flags`.
2. **Wire Session Storage into `runChat`:**
   - In `apps/cli/src/commands/chat.ts`:
     - If `--resume` is passed, invoke `loadSession(root, sessionId)`.
     - Hydrate `ChatHooks.initialMessages` and `ChatSessionCache` with prior messages and model spec.
     - If starting a new session, call `generateSessionId()` and record session metadata.
     - In the agent loop's turn-completion hook (`onOutcome`), invoke `saveSession(root, updatedSession)`.
3. **Handle Branching and Compact:**
   - Use `packages/session/src/tree.ts` to record a `SessionParent` if a user resumes and branches
     an older turn.
4. **Implement Session Listing Command:**
   - Implement `kaioken chat --sessions` rendering a formatted table of existing saved sessions.
5. **Characterisation Tests:**
   - Add unit test in `apps/cli/test/chat.test.ts` verifying that turn 1 saves to disk and turn 2
     with `--resume` successfully loads turn 1's history.

## In scope

- `kaioken_v2/apps/cli/src/commands/chat.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/packages/session/`
- `kaioken_v2/apps/cli/test/`

## Out of scope

- Encrypted session storage (plain JSON in `.kaioken/sessions/` is the v2 contract).
- Multi-user real-time session synchronization (refused non-goal).
- Remote cloud backup of session transcripts.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification test:

```bash
node apps/cli/dist/bin.js chat "remember the secret word is pinecone" --root .
node apps/cli/dist/bin.js chat "what was the secret word?" --resume --root .
```

The second invocation must answer "pinecone" without re-stating the initial prompt.

## Traps

| Trap | Guard |
|---|---|
| Re-inventing session storage from scratch | `packages/session/src/storage.ts` is already fully implemented and tested. Do not write a new storage layer; wire the existing one. |
| Corrupting `.kaioken/sessions/` on abrupt process SIGINT | Save session state atomically (write to temporary file and rename) to prevent partial JSON truncation on Ctrl+C. |
| Saving massive tool payloads in transcripts | Large tool results should be truncated in saved session JSON while preserving message semantics, preventing multi-megabyte session files. |

## Open questions

None. The storage primitives exist in `packages/session`.

## Session brief

```xml
<task>
In kaioken_v2/, close Gap G-3 by connecting packages/session to apps/cli/src/commands/chat.ts:

1. In apps/cli/src/main.ts:
   - Add "resume?: string" to the Flags interface.
   - Support --resume [id] and --sessions in the CLI parser.

2. In apps/cli/src/commands/chat.ts:
   - Import { loadSession, saveSession, generateSessionId, listSessions } from "@kaioken/session".
   - If flags.resume is set:
     - Load session from .kaioken/sessions/<id>.json (or the latest session if id is empty).
     - Restore prior messages into the agent loop.
   - If flags.sessions is set:
     - Print the list of saved sessions (id, date, model, title, turn count) and exit 0.
   - During the interactive loop, after each completed turn, call saveSession() to persist
     the transcript, turn count, and timestamp.

3. Write a test in apps/cli/test/chat-session.test.ts verifying that a session is saved to
   .kaioken/sessions/ and that resuming it restores context.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Test resume manually:
  node apps/cli/dist/bin.js chat --sessions --root .
Confirm it lists sessions stored in .kaioken/sessions/.
</verification_loop>

<action_safety>
Do not modify packages/session unless fixing an unhandled edge case. Scope strictly to wiring
apps/cli/src/commands/chat.ts. Do NOT run git add or git commit. Leave changes uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) details of CLI flag additions, (2) how session loading and saving was integrated into
runChat, (3) test suite execution numbers, (4) confirmation that the --resume workflow functions.
</structured_output_contract>
```
