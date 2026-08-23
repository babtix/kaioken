# ADR-004: Learning loop with gated autonomy

- **Status:** Accepted (L3) · re-verified 2026-08-23 (`memory.Signals` anchor:
  `internal/memory/learn.go:37`)
- **Supersedes:** `docs/hermes_res/adr/ADR-004`

## Context

Options ranged from full closed-loop autonomy (Hermes-style) to conservative
(nudges + ledger only). Corpus constraint: threat guard, linter, and audit
ledger MUST land before anything can write skills autonomously
(`inspire-phases.md` phase 4 → phase 5 dependency).

## Decision

Build the full machinery; ship with the autonomous-write switch OFF.

Always-on components:
- mid-turn memory nudges (heuristic-gated)
- background reflection fork gated on `memory.Signals()` — fires on real
  corrections and error recovery, NOT raw counters (counters demoted to
  ceiling fallbacks; resolves the [BA]/[GLM] ≥5-calls vs [ARCH]
  10-iteration conflict); preserves the cache snapshot; cancelled within ~2 s
  of new user input (N7); sandbox whitelist = `memory` + skill-mutation tools;
  patch-over-rewrite editing policy
- threat guard + linter scan on every skill mutation
- append-only JSONL ledger with sha256 content-addressed blobs (ledger failure
  never blocks mutation — telemetry, not gate)
- deterministic curator lifecycle active→stale(30 d)→archived(90 d),
  thresholds configurable, pinned/bundled exempt (D5: defaults 30/90 per
  backlog item 15; [ARCH]'s 14/30 were example values)

Approval-gated:
- skill synthesis proposals queue for human review via TUI/daemon API
- promotion = config flip (`skills.autonomous_writes`) after an
  operator-reviewed track record — a policy point, not missing code.
  Evidence = clean scans + usage reinforcement + user acceptance, never
  self-judged success ("self-congratulation problem", the corpus's strongest
  documented failure mode).

Explicit-command-only:
- `kaioken skills consolidate` (never unattended)

## Research grounding

The reactive loop is biased; the reflective layer keys on OBJECTIVE ledger
signals (traces, verify failures, user rejections). HITL checkpoints stay by
default. GEPA/DSPy outer-loop optimisation stays out of runtime scope for v2 —
adopting the gates without the optimizer gets the safety at none of the risk
(D6). D6 also rules: no evolutionary artifact ever silently overwrites; human
review mandatory.

## Consequences

- Wave ordering invariant: guard/linter/ledger/pruner before reflection fork
  or any skill-writing feature. No exceptions (ADR-010).
- `-race` testing mandatory once background forks share files with foreground
  turns; the fork must not write while a foreground turn mutates the same
  skill.
