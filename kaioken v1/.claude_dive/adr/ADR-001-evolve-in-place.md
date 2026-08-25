# ADR-001: Evolve `cli/` in place — no rewrite

- **Status:** Accepted (L1) · carried forward unchanged 2026-08-24
- **Supersedes:** `archive/hermes_dive/adr/ADR-001`

## Context

The corpus analysed four agent codebases (Kaioken, hermes-agent, pi, opencode). "v2" could
mean evolving the existing Go binary, re-architecting toward Hermes' shape, or greenfield.
The logic audit found Kaioken's defects are almost all at the **seam** level (components
making assumptions about each other), not foundation level — "unusually well-written at the
statement level."

## Decision

Kaioken v2 is the current `cli/` evolved in place. Go single binary, existing package layout,
existing `.kaioken/` conventions preserved. v2 work = selected imports + debt closure + new
platform layer, all additive.

Where subsystems are duplicated or tangled, convergence happens by **extraction of the best
implementation behind an interface**, porting callers landing by landing — never by rewrite.
This is proven practice on master: `internal/retrieval/` was extracted out of prism with
tests (commit `444981f`), exactly this pattern — though only `internal/prism` has been
ported onto it so far; `internal/search` and `internal/research` are still separate stacks
(see `adr/ADR-005`).

## Alternatives considered

- **Re-architecture toward Hermes' narrow-waist shape:** rejected — Kaioken already has the
  narrow waist (~140-line explicit `Run` loop); Hermes is the one whose core grew to
  ~6,650 lines of state machine in a single function (`run_conversation`,
  `conversation_loop.py:1766`–EOF — corrected from an earlier "8,418-line function" figure
  in this corpus, which was the *file's* line count, not the function's).
- **Greenfield:** rejected — no corpus finding justifies discarding ~63k LOC of verified,
  tested behaviour; every identified problem has an in-place fix.

## Consequences

- Every roadmap item names the packages it touches; nothing lands as "restructure."
- Seam-level fixes get first-class priority because seams, not foundations, are where the
  risk lives.
- Corollary this corpus learned the hard way: "in place" also means *auditing what's already
  there* before proposing new work in the same file. Every eight-document generation that
  produced this plan proposed rebuilding at least one component that already existed
  (`agent/epoch.go`, `memory/reinforce.go`'s `PruneStale`, the model selector, the length-stop
  guard). Before any roadmap task is picked up, grep the target package for existing work.
