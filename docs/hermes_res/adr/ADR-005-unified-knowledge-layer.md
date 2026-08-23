# ADR-005: Unified knowledge layer

- **Status:** Accepted (D6)
- **Date:** 2026-08-22 · v1.1

## Context

The knowledge engine (wiki/cards/PRISM verify+provenance pass) is Kaioken's
sole unique capability per both comparison passes. D6 offered: double down as
product core, keep as peer subsystem, or merge knowledge + skills + memory
into ONE layer. The logic audit independently found three parallel retrieval
stacks that must unify regardless (finding 3.1).

## Baseline update (v1.1, git-verified)

Extraction has STARTED on master: `internal/retrieval/` exists (chunk,
grader, lexical, variants — extracted from prism with tests), prism's
memo-cache TOCTOU is closed via singleflight (`retrieve.go:248`),
`wiki/staleness.go` landed, memory write-dedup landed (`memory.go`). This ADR
therefore directs *continuation*, not initiation: port `search` onto
`internal/retrieval` (drop-in; preserve index shape/fingerprint), fold
`research/corpus` last.

## Decision

Merge direction: `.kaioken/` knowledge, skills, and memory become one layer
with shared machinery:

- **One retrieval stack** on `internal/textrank`'s pure-Go BM25 primitive;
  PRISM remains a first-class retrieval MODE over it.
- **Shared artifact metadata:** every tenant artifact carries
  `{source_provenance, created_at, last_verified_at, freshness_state}`.
- **Shared lifecycle:** active → stale(30d) → archived(90d) (configurable),
  non-destructive into `.archive/`, honouring pinned/bundled marks. One
  mechanism generalises backlog items 15/27 across skills AND cards.
- **Shared trust mechanism:** the wiki verify pass generalises — generated
  skills and distilled memory cite their evidence. Staleness honesty
  everywhere: commit distance surfaced in `knowledgeSummary` and
  `read_knowledge`.
- **Shared ledger:** all mutations append to one JSONL audit trail with sha256
  content-addressed blobs for exact rollback. Ledger failure never blocks a
  mutation — telemetry, not gate.

## Consequences

- Memory dedup (audit 3.4) and staleness surfacing (3.3) are already landed —
  verify coverage rather than rebuild; remaining work is search/corpus porting
  plus metadata/lifecycle unification.
- Session search (#16) joins the same stack (BM25 + JSON index), reinforcing
  the no-SQLite rule (ADR-009) and respecting fork lineage in results.
