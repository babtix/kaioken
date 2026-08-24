# ADR-004: Learning loop with gated autonomy

- **Status:** Accepted (L3) · **rewritten 2026-08-24 — premise corrected, see below**
- **Supersedes:** `archive/hermes_dive/adr/ADR-004`

## What changed in this revision, and why it matters

Every predecessor document — this one included — wrote this ADR assuming autonomous skill
authoring is a **future capability**, gated behind a safety foundation not yet built. That is
false. `memory.Distill` ([learn.go:196-278](../../cli/internal/memory/learn.go:196)) already
asks the model for a skill body and writes it to disk at
[learn.go:269](../../cli/internal/memory/learn.go:269), with no approval, no threat scan, no
linter, no ledger, no rollback, overwriting an existing skill in place on a match. It is
wired live from three call sites (TUI session-end, TUI `/learn`, daemon session-end) and
reachable today at default config via `memory.learn: 5` or via `/learn`, whose `force=true`
bypasses every gate that exists. **See `../00-STOPGAP.md` — that fix lands before anything in
this ADR, independent of wave scheduling.**

This changes what the ADR is *for*. It is not designing a switch to build and leave off. It
is describing the safety foundation that a shipping capability is currently missing, plus the
policy layer that turns "temporarily disabled by a one-line gate" into "properly reviewed and
re-enabled by design."

## Context

Options ranged from full closed-loop autonomy (Hermes-style) to conservative (nudges + ledger
only). Corpus constraint, now doubly true: threat guard, linter, and audit ledger must land
before anything can write skills — because something already does.

## Decision

Build the full machinery. The autonomous-write path stays gated by the stopgap until this
machinery lands, then re-enabled deliberately, config-controlled, never silently.

Always-on components:
- mid-turn memory nudges (heuristic-gated)
- background reflection fork gated on `memory.Signals()`
  ([learn.go:37](../../cli/internal/memory/learn.go:37)) — this function is **not** dead
  code, contrary to one predecessor document's claim; it is called today by `Distill` at
  [learn.go:199](../../cli/internal/memory/learn.go:199). Moving its evaluation to per-turn
  cadence is wiring an existing gate onto a new trigger point, not building a gate from
  scratch — smaller scope than previously estimated. Fires on real corrections and error
  recovery, NOT raw counters; preserves the cache snapshot; cancelled within ~2 s of new user
  input (N7); sandbox whitelist = `memory` + skill-mutation tools; patch-over-rewrite editing
  policy (`Distill` currently replaces the body wholesale — this needs to change alongside
  the fork, not after it)
- threat guard + linter scan on every skill mutation — including the ones the stopgap
  currently holds
- append-only JSONL ledger with sha256 content-addressed blobs (ledger failure never blocks
  mutation — telemetry, not gate)
- deterministic curator lifecycle active→stale(30 d)→archived(90 d), thresholds configurable,
  pinned/bundled exempt (defaults 30/90 per backlog item 15). Note
  [reinforce.go:127](../../cli/internal/memory/reinforce.go:127) `PruneStale` already
  implements the query side of this — never-hard-delete invariant, `OriginHuman` exemption —
  with **zero callers**. The curator wires this function to a schedule; it does not
  reimplement it. Separately, `config.MaxSkills`
  ([config.go:212](../../cli/internal/config/config.go:212)) is a documented YAML knob that
  nothing reads today — decide explicitly whether the curator reads it or it gets deleted;
  a knob that silently does nothing is worse than no knob.

Approval-gated:
- skill synthesis proposals queue for human review via TUI/daemon API — this queue is exactly
  what the stopgap's "held proposal" surface becomes once built properly
- promotion = config flip (`skills.autonomous_writes`) after an operator-reviewed track
  record. Evidence = clean scans + usage reinforcement + user acceptance, never self-judged
  success ("self-congratulation problem," the corpus's strongest documented failure mode)

Explicit-command-only:
- `kaioken skills consolidate` (never unattended)

## Two bugs found in the learning loop's existing code, in scope for this wave

1. **Failed sessions reinforce as successes.**
   [session.go:41](../../cli/internal/memory/session.go:41) hardcodes
   `ReinforceFromSession(..., true)` — the `clean` argument — while the comment directly
   above states reinforcement runs "for a clean session." Nothing ever checks. A session that
   ended in failure or was aborted reinforces its skills as though it succeeded. Fix
   alongside the gate work in this wave; it corrupts the exact signal the curator and the
   reflection fork both depend on.
2. **Non-streaming path ignores `finish_reason == length`.** The length-stop structural-fail
   guard exists only in `stream.go`; `openrouter.go:700-713` parses `FinishReason` and never
   reads it, and that path is reachable via `Agent.NoStream`. Not learning-loop-specific, but
   surfaces here because a truncated tool call feeding into a distillation pass is exactly the
   kind of malformed input the threat guard needs to be robust against.

## Research grounding

The reactive loop is biased; the reflective layer keys on OBJECTIVE ledger signals (traces,
verify failures, user rejections). HITL checkpoints stay by default. GEPA/DSPy outer-loop
optimisation stays out of runtime scope for v2 — adopting the gates without the optimizer
gets the safety at none of the risk. No evolutionary artifact ever silently overwrites; human
review mandatory.

## Consequences

- Wave ordering invariant: guard/linter/ledger/pruner before the reflection fork or any
  skill-writing feature ships *re-enabled*. The stopgap means "before" no longer has a gap in
  it — see `adr/ADR-010`.
- `-race` testing mandatory once background forks share files with foreground turns; the fork
  must not write while a foreground turn mutates the same skill.
- The stopgap's held-proposal surface is not throwaway work — build it once, as the review
  queue this ADR needs anyway.
