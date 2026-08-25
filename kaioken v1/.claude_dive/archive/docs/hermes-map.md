# hermes-agent → Kaioken map

A read of [NousResearch/hermes-agent](https://github.com/NousResearch/hermes-agent) —
a Python agent with a self-improving skill loop — mapped onto Kaioken's Go implementation.

Written 2026-08-22 against the vendored checkout in `inspire/hermes-agent/`. Three
subsystem passes (learning loop, agent internals, TUI) were run as read-only agents; every
Kaioken-side claim below was then re-verified by hand against `cli/`. Where a claim was not
verified it says so.

Companion documents: [`inspire-backlog.md`](inspire-backlog.md) ranks everything found here
plus the pi/opencode delta; [`inspire-phases.md`](inspire-phases.md) turns that into
branch-per-phase work.

## Where things live

| hermes | what it is | Kaioken counterpart |
|---|---|---|
| `agent/curator.py`, `learning_*.py` | the closed learning loop | no counterpart |
| `agent/background_review.py` | post-turn reflection fork | `internal/memory` `Distill` (session end only) |
| `agent/memory_manager.py`, `tools/memory_tool.py` | memory store | `internal/memory` |
| `tools/session_search_tool.py` | FTS5 cross-session recall | `internal/memory/digest.go` `Recall` |
| `tools/skills_guard.py`, `skill_linter.py` | skill safety/lint | no counterpart |
| `tools/skill_ledger.py` | mutation ledger + rollback | no counterpart |
| `agent/*_adapter.py`, `gemini_schema.py` | provider normalisation | `internal/llm` (partial) |
| `agent/lsp/` | post-edit diagnostics | no counterpart |
| `tools/code_execution_tool.py` | programmatic tool calling | no counterpart |
| `agent/context_compressor.py` | micro-compaction | `internal/agent/compact.go` + `prune.go` |
| `ui-tui/` (TypeScript + Ink) | the TUI | `internal/tui` (Go + Bubble Tea) |

The TUI comparison is the one where architecture matters more than features: hermes runs
React reconciliation over Yoga flexbox in Node; Kaioken is Elm-architecture Bubble Tea in
Go. Several hermes TUI mechanisms exist purely to work around React's render latency and
are actively harmful to port — see "Deliberately not recommended" below.

## Where Kaioken is already ahead

Recording these matters as much as the gaps: they are the places a future reader might
otherwise "fix" something that is already better.

### Compaction strategy — `compact.go` + `prune.go` beats micro-compaction

hermes compresses continuously: after each turn it sends the oldest un-absorbed exchange
plus a running summary to an auxiliary model. Its own `docs/micro-compaction.md` admits the
cost — the provider prompt-cache prefix is invalidated **every turn**, each turn takes an
extra 2–35s of auxiliary latency, and detail degrades into summary prematurely.

Kaioken's two-stage approach is strictly better for a coding agent: `Prune` first replaces
stale tool outputs with one-line stubs at **zero model cost and zero latency**, and only
when that is insufficient does `Compact` run an episodic batch summarisation. The cache
survives the turns in between.

*Borrow only the "never summarise user messages" rule (see the backlog) and summary
defragmentation. Do not adopt continuous compaction.*

### Tool output bounding — `tool_store.go` is equivalent

`BoundOutput` already caps at 1500 lines / 64KB, tail-truncates command output,
head-truncates file reads, spills the full text to `.kaioken/tool-output/`, and hands the
model a pointer. hermes does the same thing with different constants. Nothing to port.

### Memory store — `internal/memory` already bounded and deduped

hermes' `MemoryStore` keeps a frozen system-prompt snapshot for prefix-cache stability and
writes to disk live. Kaioken already has bounded memory files (`MaxMemoryBytes`,
`MaxMemoryFileBytes`), refusal on overflow, and Jaccard-similarity dedup on write
(`isDuplicateFact`). Equivalent, and Kaioken's injection path avoids hermes'
`StreamingContextScrubber` complexity entirely by rendering into the system prompt instead
of splicing tagged fences into user turns.

### Token accounting under missing provider usage

Worth recording because pi shipped a bug here that Kaioken does not have. pi issue #8328:
threshold auto-compaction was skipped entirely when a provider omitted streaming usage,
because the code returned early instead of falling back to a size estimate.

Kaioken's `ContextTracker.Estimate` (`ctxtrack.go:94`) handles both halves correctly — a nil
receiver or absent usage falls back to `llm.EstimateTokens` with `measured=false`, and it
fingerprints the conversation prefix to detect *stale* usage. That fingerprint solves the
post-compaction staleness case structurally, where pi used a timestamp comparison. No
change needed.

## What hermes has that Kaioken does not

Full detail, effort, and verdicts are in [`inspire-backlog.md`](inspire-backlog.md). The
short version, by subsystem:

### The learning loop

This is hermes' genuine differentiator and Kaioken has no equivalent. It is a closed loop:

1. **Creation** — after every `_skill_nudge_interval` (default 10) tool-calling iterations,
   `turn_finalizer.py` spawns a detached background fork of the agent with a skill-review
   prompt. It hunts for user corrections ("stop doing X"), workflow fixes, and non-trivial
   debugging workarounds, then writes a skill via the `skill_manage` tool.
2. **Improvement** — the same fork patches existing `SKILL.md` bodies with newly observed
   pitfalls rather than leaving corrections in transient memory.
3. **Consolidation** — a weekly curator run clusters narrow skills into umbrella skills and
   archives the absorbed siblings, which is how they stop an autonomous writer from
   generating hundreds of micro-skills.
4. **Safety** — provenance tags (`created_by="agent"`), an append-only ledger with
   content-addressed blob snapshots for per-mutation rollback, a 50+ pattern static threat
   scanner, and an authoring linter.

The nudge mechanism is smarter than it sounds: it runs **after** the response is sent (zero
latency cost), the live session keeps a frozen prompt snapshot so writes never invalidate
the cache mid-session, it exits immediately with "Nothing to save." when there is nothing,
and an incoming user message cancels it within 2 seconds.

Kaioken has the raw materials — `memory.Signals()` already detects correction signals, and
`memory.Distill()` already synthesises — but only runs at session end.

### Agent internals

- **Provider transform layer.** Nullable-union collapsing, tool-ID regex sanitisation,
  empty-text-block coercion, Gemini schema subsetting, Harmony control-token neutralisation.
  This is Kaioken's long-standing open gap (`llm/transform.go` does not exist).
- **Post-edit LSP diagnostics.** Baseline snapshot before edit, fresh diagnostics after,
  delta only, sanitised and bounded into a `<diagnostics>` block. Kaioken's other
  long-standing open gap.
- **Programmatic tool calling.** An `execute_code` tool starts a local RPC server and
  generates a client module; the model writes a script that calls `read_file`,
  `search_files`, `patch` etc. over IPC. Intermediate results stay in the child process —
  only final stdout enters context. Collapses a ten-turn exploration into one turn.
- **FIFO / device read guard.** Refuses `/dev/*`, FIFOs, sockets, and character devices
  before reading. Kaioken checks path containment and binary content but not `Mode()` bits,
  so a read of a named pipe hangs until timeout.
- **Empty-response circuit breaker.** Two consecutive zero-output completions from the same
  (model, provider, finish_reason) are treated as a deterministic refusal — stop retrying,
  fail over. Retry budget also shrinks when estimated input cost is high.
- **Hook deadlines.** Observer hooks fail open on timeout; guard hooks fail closed.
- **ESTOP sentinel.** A file-based pause honoured by every loop and background task, letting
  in-flight work finish cleanly across daemon and CLI processes.

### TUI

Ranked by value against Bubble Tea portability, the ones that survive the framework
mismatch: input-history recall on Up/Down, `$EDITOR` composition (a natural fit for
`tea.ExecProcess`), inline shell interpolation (`{!git diff}` spliced into the prompt),
approval quick-keys that escalate to session/always in one keystroke, double-tap Enter to
drain or interrupt, argument and filesystem path completion, and — the most valuable and
most expensive — active-turn interrupt-and-redirect.

That last one is worth stating precisely, because Kaioken has something adjacent that is
*not* the same thing. hermes distinguishes three mechanisms:

| mechanism | trigger | behaviour |
|---|---|---|
| hard interrupt | Ctrl+C | cancel turn, discard in-flight work |
| steering | `/steer <text>` | queue text, applied after the current tool batch |
| active redirect | submit while the model is generating | cancel only the provider HTTP stream, keep completed tool calls, salvage the partial prose into a scaffolded replay, pivot in place |

Kaioken has the first two (`Agent.Steer()` queues; Ctrl+C cancels the whole context) but not
the third. The subtlety that makes it work is stripping raw chain-of-thought before
replaying partial output — serialising incomplete CoT into history trips reasoning-injection
classifiers and can brick a session.

## Deliberately not recommended

- **Continuous micro-compaction** — see "already ahead" above.
- **Honcho dialectic user modelling** — a remote SaaS dependency with OAuth device flows and
  multi-user identity resolution, built for chat gateways. Kaioken is a local-first single
  binary; flat-file `USER.md` is simpler, faster, and private.
- **Fast-echo direct stdout bypass** (`fastAppendEffect`) — exists solely to dodge React
  reconciliation latency. In Bubble Tea it would corrupt the screen buffer and desynchronise
  the cursor. Actively harmful.
- **Yoga flexbox engine, Nano Stores** — React-shaped state and layout machinery with no
  purpose in the Elm architecture.
- **The 7 terminal backends** (Docker, SSH, Singularity, Modal, Daytona, Vercel Sandbox) and
  the multi-platform gateway (Telegram, Discord, Slack, WhatsApp, Signal) — out of scope by
  decision, not by merit.
- **Recursive Pydantic sanitisers** — Go's struct tags make the whole category unnecessary.

## Files worth reading first

If you only read five things in `inspire/hermes-agent/`:

1. `docs/micro-compaction.md` — states its own trade-offs honestly; the clearest writing in
   the repo.
2. `agent/background_review.py` — the learning loop's spine.
3. `tools/code_execution_tool.py` — programmatic tool calling.
4. `tools/skills_guard.py` — what a safety layer for self-written skills looks like.
5. `docs/rfcs/2026-07-plugin-architecture-lessons-pi-opencode.md` — hermes' own read of pi
   and opencode, including the fail-open/fail-closed hook distinction.
