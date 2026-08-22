# inspire/ execution plan — phases

Turns [`inspire-backlog.md`](inspire-backlog.md) into branch-per-phase work, following the
same convention as [`logic-audit-and-phases.md`](logic-audit-and-phases.md).

Written 2026-08-22. Nothing here is started.

## Ordering logic

The phases are not in backlog-rank order, because two constraints override raw value:

1. **Safety precedes autonomy.** The skill threat guard, linter, and audit ledger (phase 4)
   must land *before* anything that lets Kaioken write its own skills (phase 5). Enabling
   autonomous authoring first would mean the agent generates unscanned, unreversible
   content.
2. **Cheap correctness first.** Phase 1 is a day of work that removes a hang-class bug and a
   silent instruction-loss bug. There is no reason to sequence that behind anything.

Phases 1–3 are independent of each other and could run in parallel across branches. Phase 5
depends on phase 4. Phase 6 depends on nothing but is the largest.

---

## Phase 1 — correctness and safety quick wins

**Branch:** `fix/inspire-phase1-correctness` · **Estimate:** ~1.5 days · **Items:** 1, 3, 5, 8, 13

The whole phase is small, self-contained fixes with no architectural risk.

- **Item 1 — FIFO / device read guard** (`agent/tools.go` `readFile`). Add a `Mode()` check
  after the existing `os.Stat`, alongside the `IsDir` branch. Refuse device, named-pipe, and
  socket paths with a structured error.
- **Item 5 — never summarise user messages** (`agent/compact.go:323`). Change
  `splitForCompaction` so user turns in `head` are pulled out and re-injected verbatim
  beside the summary. *This is the highest-value item in the entire backlog per hour spent.*
- **Item 8 — empty-response circuit breaker** (`internal/llm`). Track consecutive
  zero-output completions keyed on (model, provider, finish_reason); treat two as
  deterministic and fail over instead of retrying.
- **Item 13 — hook deadlines** (`agent/events`). Wrap handler invocation in
  `context.WithTimeout` plus `recover()`. Observer hooks fail open; guard hooks fail closed.
- **Item 3 — ESTOP sentinel**. A file check in the agent loop and background workers.

**Gate:** `go test ./...` clean, plus a new test that a named pipe returns an error rather
than blocking, and one that a compaction cycle preserves user-message text verbatim.

---

## Phase 2 — TUI ergonomics

**Branch:** `feat/inspire-phase2-tui` · **Estimate:** ~3 days · **Items:** 2, 4, 6, 7, 9, 17

Pure `internal/tui` work, no agent-core coupling. Highest daily-friction return.

- **Item 7 — input history recall** is the anchor; it changes Up/Down semantics, so do it
  first and move viewport scrolling to PgUp/PgDn at the line boundary.
- **Item 4 — approval quick-keys** should reuse the existing rule types in
  `agent/permission.go` rather than inventing a parallel notion of "session" scope.
- **Items 2, 6, 9** are independent and can land in any order.
- **Item 17 — argument and path completion** is the largest piece; `palette.go:56`'s
  close-on-whitespace has to become a state machine before anything else can be added.

**Gate:** `go test ./...`, plus manual TUI verification — the existing tests do not cover
key handling well enough to trust alone.

---

## Phase 3 — provider robustness

**Branch:** `fix/inspire-phase3-providers` · **Estimate:** ~3 days · **Items:** 11, 14, 19

- **Item 11 — provider transform layer** (`llm/transform.go`, new). Build it as a list of
  independently testable rules over `map[string]any`, not a monolith: nullable-union
  collapse, tool-ID sanitisation, empty-text coercion, Gemini schema subsetting,
  output-only field stripping on replay. Each rule gets a table test.
- **Item 14 — retry hardening**. Port the five opencode fixes into `llm/retry.go`.
- **Item 19 — thinking levels and model cycling**. pi's implementation is the reference.

**Gate:** `go test ./...` under `-race`. The transform rules must have table tests with real
malformed payloads, not synthetic ones.

---

## Phase 4 — skill safety foundation

**Branch:** `feat/inspire-phase4-skill-safety` · **Estimate:** ~4 days · **Items:** 10, 12, 15, 18

**This phase is a prerequisite for phase 5 and should not be skipped or reordered.** It is
the machinery that makes autonomous skill authoring reversible and auditable.

- **Item 10 — multi-file skill layout** first, since the guard and ledger both need to know
  what a skill can contain. `skills.Path` becomes a directory contract rather than a single
  file path.
- **Item 12 — threat guard and linter**. Static regex scanning for credential exfiltration,
  prompt injection, and destructive commands, plus frontmatter and convention linting.
- **Item 18 — audit ledger and rollback**. Append-only JSONL with actor provenance and
  sha256 content-addressed blobs.
- **Item 15 — lifecycle pruner**. Non-destructive active → stale → archived transitions.

**Gate:** `go test ./...`, plus a test that a known-malicious skill fixture is rejected and
a test that a ledger rollback restores exact prior content.

---

## Phase 5 — the learning loop

**Branch:** `feat/inspire-phase5-learning` · **Estimate:** ~1 week · **Items:** 16, 23, 27, 28
**Depends on:** phase 4

The differentiating capability, and the reason phase 4 exists.

- **Item 16 — FTS5 session search** first; it is independently valuable and the rest builds
  on better recall.
- **Item 23 — background reflection fork**. Gate on the existing `memory.Signals()`
  heuristics so it fires on real corrections rather than on a turn counter. Preserve the
  prompt-cache snapshot; cancel within a couple of seconds when a new user message arrives.
- **Item 27 — consolidation** as an explicit `kaioken skills consolidate` command, never an
  unattended loop.
- **Item 28 — learning timeline** last; it visualises what the earlier items produce.

**Gate:** `go test ./...` under `-race` — this phase introduces real concurrency around
shared files. Verify the background fork cannot write while a foreground turn is mutating
the same skill.

---

## Phase 6 — deep capability

**Branch:** `feat/inspire-phase6-capability` · **Estimate:** ~2 weeks · **Items:** 21, 22, 24, 25, 26

Independent of phases 4–5 and separable into its own branches if it gets unwieldy. Each item
here is nearly a project.

- **Item 21 — active interrupt-and-redirect.** Split the turn context from the provider HTTP
  request context. **Strip chain-of-thought before replaying partial output** — this is not
  optional; serialising partial CoT trips provider reasoning-injection classifiers.
- **Item 22 — programmatic tool calling.** Build on `internal/rpc`. Treat the child process
  as untrusted: it gets the tool surface, not the filesystem.
- **Item 24 — post-edit diagnostics.** Start with `go vet` / `tsc --noEmit` dry runs rather
  than a full LSP manager; most of the value, a fraction of the cost. Bound and sanitise the
  output before it reaches the model.
- **Item 25 — git-snapshot undo.** Note again that `agent/epoch.go` is prompt-cache
  baselining, not undo.
- **Item 26 — live tool tree** last, as polish.

**Gate:** `go test ./...` under `-race`. Item 21 needs an explicit test that a redirect
preserves completed tool-call results and produces valid role alternation.

---

## Summary

| Phase | Branch | Items | Estimate | Depends on |
|---|---|---|---|---|
| 1 | `fix/inspire-phase1-correctness` | 1, 3, 5, 8, 13 | ~1.5d | — |
| 2 | `feat/inspire-phase2-tui` | 2, 4, 6, 7, 9, 17 | ~3d | — |
| 3 | `fix/inspire-phase3-providers` | 11, 14, 19 | ~3d | — |
| 4 | `feat/inspire-phase4-skill-safety` | 10, 12, 15, 18 | ~4d | — |
| 5 | `feat/inspire-phase5-learning` | 16, 23, 27, 28 | ~1w | phase 4 |
| 6 | `feat/inspire-phase6-capability` | 21, 22, 24, 25, 26 | ~2w | — |

Roughly five to six weeks of sequential work; phases 1–4 are about two weeks and carry most
of the value-per-day.

**If only one phase ever ships, make it phase 1** — a day and a half that removes a hang and
stops user instructions from being silently paraphrased away in long sessions.
