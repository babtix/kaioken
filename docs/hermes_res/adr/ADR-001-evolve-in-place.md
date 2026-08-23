# ADR-001: Evolve `cli/` in place — no rewrite

- **Status:** Accepted (D1)
- **Date:** 2026-08-22 · v1.1

## Context

The corpus analysed four agent codebases (Kaioken, hermes-agent, pi, opencode).
A "v2" could mean evolving the existing Go binary, re-architecting toward
Hermes' shape, or starting greenfield. The logic audit found Kaioken's defects
are almost all at the **seam** level (components making assumptions about each
other), not foundation level: "unusually well-written at the statement level."

## Decision

Kaioken v2 is the current `cli/` codebase evolved in place. Go single binary,
existing package layout, existing `.kaioken/` conventions are preserved. v2
work = selected imports + debt closure + new platform layer, all additive.

Where subsystems are duplicated or tangled, convergence happens by **extraction
of the best implementation behind an interface**, porting callers landing by
landing — never by rewrite (principle 10; proven by the already-landed
`internal/retrieval` extraction out of prism).

## Alternatives considered

- **Structural re-architecture toward Hermes' narrow-waist shape:** rejected —
  Kaioken already has the narrow waist (the ~140-line explicit `Run` loop);
  it's Hermes whose core grew to 8,418 lines of state machine.
- **Greenfield:** rejected — no corpus finding justifies discarding ~63k LOC of
  verified, tested behaviour; every identified problem has an in-place fix.

## Consequences

- Every roadmap item must name the packages it touches; nothing lands as
  "restructure."
- Seam-level fixes get first-class priority because seams, not foundations,
  are where the risk lives.
