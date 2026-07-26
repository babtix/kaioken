# opencode → Kaioken map

Kaioken's chat-agent half is modeled on [opencode](https://github.com/anomalyco/opencode)
(MIT). A read-only copy of its three relevant packages lives in `.reference/opencode/`
— gitignored, pinned at `7534d23`, see [`.reference/README.md`](../.reference/README.md).

This file records what each side calls the same idea, what has been ported, and what
is left. It is a working map, not a spec: when you read something in `.reference/`
that changes the picture, edit this.

**Read their source, write our Go.** opencode is TypeScript on Effect with a
service/layer architecture that has no business in a Go codebase. What transfers is
the *design decision* — where a threshold sits, what a boundary protects, why an
order of operations is the way it is. Every port below is a reimplementation.

---

## Where things live

| Concept | opencode | Kaioken |
|---|---|---|
| Agent definitions / permissions | `packages/opencode/src/agent/agent.ts` | [`internal/agent/mode.go`](../cli/internal/agent/mode.go) |
| Sub-agent permission derivation | `agent/subagent-permissions.ts` | `mode.go` (`PermissionsFor`) |
| Sub-agent spawning | `tool/task.ts` | [`internal/agent/task.go`](../cli/internal/agent/task.go) |
| Tool schemas + dispatch | `tool/registry.ts`, `tool/*.ts` | [`internal/agent/tools.go`](../cli/internal/agent/tools.go) |
| Turn loop | `session/processor.ts`, `session/llm.ts` | [`internal/agent/agent.go`](../cli/internal/agent/agent.go) (`Run`) |
| Overflow detection | `session/overflow.ts` | [`internal/agent/compact.go`](../cli/internal/agent/compact.go) (`Usable`, `ShouldCompact`) |
| Compaction | `session/compaction.ts` | `compact.go` (`Compact`) |
| Tool-output pruning | `session/compaction.ts` (`prune`) | [`internal/agent/prune.go`](../cli/internal/agent/prune.go) |
| Token estimation | `core/src/util/token.ts` | [`internal/llm/tokens.go`](../cli/internal/llm/tokens.go) |
| Mid-turn reminders | `session/reminders.ts` | [`internal/agent/reminders.go`](../cli/internal/agent/reminders.go) |
| System prompt assembly | `session/system.ts` | [`internal/agent/context.go`](../cli/internal/agent/context.go) (`SystemPrompt`) |
| Per-model prompts | `session/prompt/*.txt` | [`internal/agent/prompts.go`](../cli/internal/agent/prompts.go) |
| Context source registry | `core/src/system-context/registry.ts` | `context.go` (`contextSources`) |
| Session todo list | `session/todo.ts` | [`internal/agent/todo.go`](../cli/internal/agent/todo.go) |
| Retry pacing | `session/retry.ts` | [`internal/llm/retry.go`](../cli/internal/llm/retry.go) |
| Session persistence | `session/session.ts`, `session/schema.ts` | [`internal/session/session.go`](../cli/internal/session/session.go) |
| Skills | `tool/skill.ts` | [`internal/skills/`](../cli/internal/skills/) |
| Undo / revert | `session/revert.ts` | `tools.go` (`UndoEntry`, `Restore`) |
| TUI shell | `packages/tui/src/app.tsx` | [`internal/tui/tui.go`](../cli/internal/tui/tui.go) |
| TUI screens | `tui/src/routes/{home,session}/` | `tui.go` (Bubble Tea `Update`/`View`) |
| Approval prompt | `tui/src/routes/session/permission.tsx` | `tui.go` (`showApproval`) + `UI.Approve` |
| Command palette | `tui/src/component/command-palette.tsx` | [`internal/tui/palette.go`](../cli/internal/tui/palette.go) |
| Provider registry | `packages/llm/src/providers/*.ts` | [`internal/llm/openrouter.go`](../cli/internal/llm/openrouter.go) (`Providers`), [`internal/llm/anthropic.go`](../cli/internal/llm/anthropic.go) |

Structural note: opencode splits into a **server** (`packages/opencode`) and a
**client TUI** (`packages/tui`) talking over an SDK, so the TUI is a thin renderer.
Kaioken has the same split available — [`internal/daemon`](../cli/internal/daemon/)
serves HTTP for the desktop app — but the TUI calls `internal/agent` directly
in-process. That is why anything touching the turn loop must land in
`internal/agent`, not `internal/tui`: it is the only layer both front-ends share.

---

## Ported

### Agents → modes
Their `build` / `plan` / `general` / `explore` agents are Kaioken's `Mode`, with
`PermissionsFor` standing in for their permission rulesets. Same four names, same
read-only/full-access split.

### Sub-agent delegation → the `task` tool
`tool/task.ts` reimplemented as `runTask` in `task.go`. Confirmed against theirs:

- **Depth limit of 1.** They default `subagent_depth` to 1 and deny the child the
  `task` permission; we gate on `Agent.Depth` and withhold the tool. Same number,
  arrived at independently.
- **`description` + `prompt` parameters**, description being a 3–6 word label.
- **The result is the sub-agent's last text output** — their
  `result.parts.findLast(p => p.type === "text")`, our `lastAssistantText`.
- **Output is delimited.** Their `renderOutput` wraps it in `<task id state>`
  tags; we wrap in `<task_result agent="…">`. This is not decoration — an
  undelimited report reads exactly like the parent's own reasoning, and a model
  that loses the boundary starts presenting a delegate's guesses as verified fact.
- **The user does not see the report**, so the parent is told to relay it.

Deliberately not taken: background/async sub-agents (`background=true`) — they
gate it behind `OPENCODE_EXPERIMENTAL_BACKGROUND_SUBAGENTS` and it needs a job
system Kaioken has no equivalent of. Also skipped: `task_id` resumption.

### Context reduction
Three things came from reading `overflow.ts` and `compaction.ts`, two of which
**corrected code that had already shipped**:

1. **Trigger on reserved headroom, not a fixed ratio.** Their `usable()` is
   `context − reserved`, where reserved is the space the reply needs. Kaioken had
   a flat 70%. On a 200k-token model that stranded ~50k tokens that were never
   going to be needed. `Usable(model, replyCeiling)` now reserves
   `max(replyCeiling, window/10)` — the reply, plus a tenth of the window to
   absorb estimator error, since we count characters where they count real tokens.

2. **Clamp the preserved tail.** Their `preserveRecentBudget` is
   `min(8000, max(2000, usable × 0.25))`. Kaioken had the same 0.25 ratio and no
   clamp — so on a million-token window the "recent tail" would have been 250k
   tokens and compaction would have shrunk almost nothing. Now clamped to
   `[2000, 8000]`.

3. **Prune before you summarize.** The one that mattered most. Most of a coding
   session's context is not conversation, it is old tool output. Their `prune`
   walks backwards, protects the newest ~40k tokens of tool results and the last
   two turns, and erases the bodies of everything older — keeping the messages,
   their order, and their tool-call pairing intact, so the history stays valid.
   No model call. `prune.go` does this, and `Compact` now only runs when pruning
   was not enough.

Their split-at-user-message rule for compaction (`turns()` in `compaction.ts`)
independently matches ours, and for the same reason: cutting between an
assistant's tool calls and the tool replies answering them yields a history the
provider rejects.

### Provider registry
Kaioken's `llm.Providers` map only ever spoke one dialect — OpenAI-compatible
`/chat/completions` with `Authorization: Bearer`. Reading
`packages/llm/src/providers/*.ts` surfaced two providers that dialect cannot
reach at all and are common enough to be worth the extra path:

- **Anthropic** (`providers/anthropic.ts`) has no OpenAI-compatible endpoint —
  `x-api-key` auth, a native Messages API with a top-level `system` field and
  typed content blocks instead of a plain string. `anthropic.go` is the
  translation layer: `toAnthropicMessages`/`fromAnthropicResponse` convert
  Kaioken's flat `Message` history both ways, including the streaming SSE
  shape (`message_start`/`content_block_delta`/…, distinct from OpenAI's
  `choices[].delta`). The one real fidelity trade: Anthropic's `messages`
  array only accepts `user`/`assistant` roles, so every `system`-role message
  — the initial prompt, and any mid-conversation reminder or mode-switch
  marker `agent/reminders.go` injects — folds into the single top-level
  `system` string instead of riding next to the turn it governs.
- **Azure OpenAI** and **Cloudflare Workers AI** are account-scoped (a
  resource name / account ID baked into the URL, per `providers/azure.ts` and
  `providers/cloudflare.ts`) and use `api-key` instead of `Authorization:
  Bearer` for Azure. `Provider.RequiresBaseURL` makes `NewForProvider` refuse
  to build a client until the workspace's `base_url` override supplies the
  real endpoint, rather than silently sending requests to a relative path.
- **Google** reaches Gemini through its own OpenAI-compatibility endpoint
  rather than the native `protocols/gemini.ts` route opencode uses — same
  bearer auth and chat-completions shape as every other provider already in
  the registry, so no new protocol was worth adding for it.

Deliberately not ported: **Amazon Bedrock** (`providers/amazon-bedrock.ts`)
needs AWS SigV4 request signing, a different trust model than a pasted API
key; **GitHub Copilot** (`providers/github-copilot.ts`) needs an OAuth
device-code exchange, not a static key; **Cloudflare AI Gateway** layers a
second, separate auth header on top of the upstream provider's own. None fit
the one-key-per-provider model every other entry in `Providers` assumes —
worth adding if a workspace-level credential story (OAuth tokens, signed
requests) ever gets built, not before.

---

## The rest of the backlog, now closed

### Reminders recomputed per turn — `reminders.go`
Kaioken's `injectContextUpdate` appended a system message **once**, at the moment
of a mode switch, and it then drifted up the transcript and went stale. Reminders
are now recomputed before every turn in `Run` and attached to the *latest user
message*, with the previous turn's copy stripped first so nothing accumulates.

The plan→build transition is now named explicitly, which Kaioken dropped
entirely: a model that spent ten turns forbidden from editing keeps producing
plans, having learned the shape of the conversation better than the one line
announcing the switch.

Placed in `Run` rather than a front-end so the TUI and daemon cannot disagree
about which constraints the model was told.

### Per-model guidance — `prompts.go`
Deliberately **not** a full prompt per family. opencode ships six complete
prompts; Kaioken keeps one base and appends a few sentences naming the failure
that family actually has — GPT inferring file contents from a path, Claude
narrating instead of acting, weak/free models emitting malformed tool calls.
Nearly all the benefit, none of the six-way sync burden. Only add an entry for a
mistake observed in practice: a guess costs tokens on every turn.

### Context source registry — `context.go`
`SystemPrompt` is now a list of contributors (identity, tools, mode, model,
knowledge, guidelines, notes) rather than one function with conditionals, each
skipped cleanly when it has nothing to say.

Building it surfaced a real bug: **`config.Notes` was documented as "steering
instructions injected verbatim into every LLM prompt" and honored by `generate`,
`plan` and `skills` — but the chat agent never read it.** The user's standing
instructions were silently ignored in chat. They are now a source, rendered last
so they are the final word.

### Todo list — `todo.go`
Stateless by design: every call carries the complete list and the tool renders
it and hands it back. Nothing is stored on the agent or on disk, so the
displayed list and the model's idea of the list cannot drift — a bug that stays
invisible until the user is reading a checklist the model stopped believing in.
Validates one `in_progress` item at a time, and is withheld from sub-agents.

### Retry pacing — `internal/llm/retry.go`
Kaioken used a fixed ladder (3s, 10s, 25s) and ignored `Retry-After` completely,
so a provider asking for 60s had every attempt rejected and the turn failed —
when waiting once would have worked. The header now wins; the ladder is the
fallback for failures that arrive without advice. Honors both `Retry-After`
(seconds or HTTP date) and the `retry-after-ms` extension, capped at 90s.

Applied to **both** retry loops. `stream.go` had its own copy, and streaming is
the TUI's default path — fixing only `rawChat` would have left the real chat
path untouched.

---

## Bugs this surfaced in Kaioken

Four, none of them opencode's fault — reading a mature implementation of the same
problem is just an effective way to notice what your own version gets wrong.

1. **`config.Notes` was ignored by the chat agent.** Documented as "injected
   verbatim into every LLM prompt", honored by `generate`/`plan`/`skills`, and
   silently dropped in chat. The user's standing instructions did nothing.
2. **The compaction tail budget was unclamped** — 25% of a million-token window
   is 250k tokens preserved, so compaction ran and freed almost nothing.
3. **`Retry-After` was never read**, in either retry loop. A provider asking for
   60s had all three fixed backoffs rejected and the turn failed.
4. **Context management disabled itself on small models.** When a model's window
   equals its reply ceiling (gpt-4 is 8k either way), the reserve consumed the
   whole window and `Usable` returned 0, which reads as "never reduce". Caught by
   a test, not by inspection.

## Files worth reading first

```
.reference/opencode/packages/opencode/src/
  tool/task.ts                    sub-agent spawning, depth limit, result shape
  tool/task.txt                   the tool description prompt — worth comparing wording
  session/overflow.ts             34 lines; the whole overflow policy
  session/compaction.ts           compaction + prune; the prune loop is ~line 243
  session/reminders.ts            per-turn reminder injection
  agent/subagent-permissions.ts   27 lines; how a child's permissions are derived
  agent/prompt/explore.txt        the read-only explorer's system prompt
```
