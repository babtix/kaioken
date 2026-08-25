# Memory & Learning — Design

Kaioken's skills are derived from **static analysis** of the repo, never from
**what happened**. This subsystem closes that gap: the agent records what it
learned (memory), recalls past sessions (digests), and distills experience into
skills that patch — not replace — the generated set.

The loop lives in `internal/memory` (not the TUI) because both the TUI and the
daemon need it; today `skills.Run` is already called from three places.

## The five pieces

### 1. Project + user memory (`memory.go`)
- `.kaioken/MEMORY.md` — agent-written project facts, **committed**, team-shared.
  A new `contextSource` ("memory") injected into the system prompt, hard-capped.
  Two caps: the **prompt cap** (`MaxMemoryBytes`, ~3200 bytes ≈ 800 tokens) is
  what the system prompt may carry; the **file cap** (`MaxMemoryFileBytes`,
  ~4800 bytes) is what may live on disk. The file is allowed a little more than
  the prompt so truncation shows a marker rather than the file sitting exactly
  at the limit. The cap is the feature: at the limit the agent must merge or
  evict, not append.
- `~/.kaioken/USER.md` — personal, cross-repo, never committed. Reachable via
  `remember(scope=user)`, which writes a trusted fixed path (not an
  agent-supplied one), so it is safe despite living outside the repo.
- `remember` tool: appends a dated bullet, or (with `rewrite`) replaces the
  whole file. Refuses a naive append past the file cap, returning guidance to
  `rewrite`. **Approval-gated** like other writes — a memory write is exactly
  where poisoning is caught, and the preview shows the fact being recorded.
  `AutoApprove` skips it for users who want speed.

### 2. Session digests + `recall` (`digest.go`)
- No SQLite (cgo on Windows; heavy dep for a few hundred sessions). At session
  close, write `.kaioken/sessions/<id>.digest.md` (goal, files touched,
  outcome, gotchas) via one LLM call reusing the summarizer pattern.
- `recall` tool scans digests, cheap substring match, returns top-N. Full
  transcript only on demand. Revisit indexing when digest scan gets slow.

### 3. Distillation gate (`learn.go`)
Fires at natural boundaries: **session end** (×5+), **per turn** (×10, Hermes-
style), and explicit **`/learn`** (always, forces past the gate). The
compaction epoch is covered by the per-turn tier rather than a separate hook:
the compaction summary is preserved in the transcript, so a subsequent session-
end or per-turn distill captures it without a surprise mid-session cost.

Gated by cheap local heuristics computed from the transcript with no LLM,
before any model call:
- ≥N tool calls in one task
- a failed `run_command` followed by a passing one (error recovery — strongest)
- a user message that reads as a correction right after an agent action
- edits touching ≥2 files in a repeated pattern

If a signal fires, the runner summarizes what happened, then either writes a
**new** skill (`Origin: learned`) or **patches** an existing one.

### 4. Patch over rewrite (`learn.go`)
Match against existing skills via `skills.List()` + cheap token-overlap on the
description. A patch is a surgical append ("## Lessons learned") or an
`edit_file`-style step revision, reusing `agent.DiffHunks` machinery for
previews. The output cites files (`Sources[]`) so it expires on git diff.

### 5. Reinforcement / decay (`reinforce.go`)
- `UseCount`, `LastUsed`, `Sessions[]` provenance on every skill.
- A skill opened (via `read_knowledge`) in a session that ended cleanly is
  reinforced; one never opened in N sessions is flagged for pruning.
- `PruneStale` flags (never auto-deletes — git-reviewable). The skills catalog
  is relevance-ranked by `UseCount` so the `catalogMaxEntries` budget favors
  proven skills over alphabetical noise.

## Risks and mitigations

- **Self-poisoning**: learned skills cite `Sources[]` (expire on diff), the
  "code wins over docs" line is preserved, and every write is a reviewable git
  diff — the real defense, which Hermes has no equivalent of.
- **Prompt injection into memory**: memory writes derive from the agent's
  conclusions about *its own actions*, never verbatim from tool output. The
  distillation prompt is fed the transcript of actions, not raw file contents.
- **Catalog budget**: skills sorted by `UseCount` desc before the 60-entry cap.
- **Where the loop lives**: `internal/memory`, called from TUI + daemon.

## Multiplier mapping

The wiki ×N multiplier already controls depth. It maps onto learning
aggressiveness with the same knob (`config.Memory.Learn`, default 1):
- ×1 — explicit `/learn` only (default)
- ×5 — also at session end
- ×10 — also per-turn (Hermes-style)

## Sequencing (each shippable alone)

1. `MEMORY.md` + `remember` — 80% of the felt improvement for 20% of the machinery.
2. Session digests + `recall`.
3. Distillation gate writing **new** skills only.
4. Patching existing skills.
5. Reinforcement / decay.

## File map

```
internal/memory/
  doc.go         — package documentation (this design's rationale)
  memory.go      — MEMORY.md / USER.md load / render / remember
  digest.go      — session digest write + scan
  learn.go       — heuristics + distillation runner
  session.go     — LearnSession: the shared session-end entry point
  reinforce.go   — UseCount tracking + decay
  *_test.go      — pure-logic coverage (no network)
```

## Integration points

- `agent/context.go` — a `memory` context source renders project + user memory
  into the system prompt (after project instructions, before standing notes).
- `agent/tools.go` — `remember` (write, approval-gated) and `recall` (read-only)
  tools, hidden when `MemoryDisabled`.
- `agent/knowledge.go` — the skills catalog is sorted by `UseCount` desc so the
  `catalogMaxEntries` prompt budget favors proven skills.
- `skills/skills.go` — `Origin`, `UseCount`, `LastUsed`, `Sessions` provenance.
- `config/config.go` — `Memory{Learn, Disable, MaxSkills}` block with
  `LearnAtSessionEnd` (×5) and `LearnPerTurn` (×10) predicates.
- `tui/tui.go` — `/learn` command, `closeSession` (new/quit) non-blocking learn.
- `daemon/handlers_chat.go` — background `LearnSession` after a run finishes.
