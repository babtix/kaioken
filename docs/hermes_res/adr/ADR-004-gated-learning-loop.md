# ADR-004: Learning loop with gated autonomy

- **Status:** Accepted (D3)
- **Date:** 2026-08-22 · v1.1

## Context

Options ranged from full closed-loop autonomy (Hermes-style) to conservative
(nudges and ledger only, no autonomous writing). The corpus constraint:
threat guard, linter, and audit ledger MUST land before anything can write
skills autonomously (`docs/inspire-phases.md` phase 4 → phase 5 dependency).

## Decision

Build the full machinery; start with the autonomous-write switch OFF.

Always-on components:
- mid-turn memory nudges (heuristic-gated)
- background reflection fork gated on `memory.Signals()` — fires on real
  corrections and error recovery, NOT raw counters (doc_final D4 rationale);
  preserves the cache snapshot; cancelled within ~2 s of new user input;
  sandbox whitelist = `memory` + skill-mutation tools only; patch-over-rewrite
  editing policy (doc_final N7)
- threat guard + linter scanning on every skill mutation
- append-only JSONL ledger with sha256 content-addressed blobs
  (ledger failure never blocks mutation — telemetry, not gate)
- deterministic curator lifecycle active→stale(30d)→archived(90d), thresholds
  configurable, pinned/bundled exempt

Approval-gated:
- skill synthesis proposals queue for human review via TUI/daemon API
- promotion to autonomous writes = config flip (`skills.autonomous_writes`)
  after an operator-reviewed track record — a policy point, not missing code.
  Promotion evidence = clean scans + usage reinforcement + user acceptance,
  never self-judged success.

Explicit-command-only:
- `kaioken skills consolidate` (never unattended)

## Design influences from the research papers

The reactive loop is biased ("self-congratulation problem" — the executing LLM
judging its own success). The reflective layer therefore keys on OBJECTIVE
signals recorded in the ledger: execution traces, verify-pass failures, user
rejections. HITL checkpoints stay in the pipeline by default. GEPA/DSPy outer-
loop optimisation stays out of runtime scope entirely for v2: adopting the
gates without the optimizer gets the safety at none of the risk (doc_final D6).

## Consequences

- Wave ordering invariant: guard/linter/ledger/pruner ship before reflection
  fork or any skill-writing feature. No exceptions, no reordering.
- `-race` testing mandatory once background forks share files with foreground
  turns; the fork must not write while a foreground turn mutates the same skill.
