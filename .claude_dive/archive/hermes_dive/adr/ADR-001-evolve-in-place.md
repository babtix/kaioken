# ADR-001: Evolve `cli/` in place — no rewrite

- **Status:** Accepted (L1) · re-verified 2026-08-23 on `master @ bd740fe`
- **Supersedes:** `docs/hermes_res/adr/ADR-001` (content carried forward)

## Context

The corpus analysed four agent codebases (Kaioken, hermes-agent, pi,
opencode). "v2" could mean evolving the existing Go binary, re-architecting
toward Hermes' shape, or greenfield. The logic audit found Kaioken's defects
are almost all at the **seam** level (components making assumptions about each
other), not foundation level — "unusually well-written at the statement level."

## Decision

Kaioken v2 is the current `cli/` evolved in place. Go single binary, existing
package layout, existing `.kaioken/` conventions preserved. v2 work = selected
imports + debt closure + new platform layer, all additive.

Where subsystems are duplicated or tangled, convergence happens by **extraction
of the best implementation behind an interface**, porting callers landing by
landing — never by rewrite. This is now proven practice on master:
`internal/retrieval/` was extracted out of prism with tests (commit `444981f`),
exactly this pattern.

## Alternatives considered

- **Re-architecture toward Hermes' narrow-waist shape:** rejected — Kaioken
  already has the narrow waist (~140-line explicit `Run` loop); Hermes is the
  one whose core grew to 8,418 lines of state machine.
- **Greenfield:** rejected — no corpus finding justifies discarding ~63k LOC of
  verified, tested behaviour; every identified problem has an in-place fix.

## Consequences

- Every roadmap item names the packages it touches; nothing lands as
  "restructure."
- Seam-level fixes get first-class priority because seams, not foundations,
  are where the risk lives.
