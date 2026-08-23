# ADR-005: Unified knowledge layer

- **Status:** Accepted (L6) · re-verified 2026-08-23 — extraction confirmed
  STARTED on master
- **Supersedes:** `docs/hermes_res/adr/ADR-005`

## Context

The knowledge engine (wiki/cards/PRISM verify+provenance pass) is Kaioken's
sole unique capability per both comparison passes. L6 offered scopes; the
logic audit independently found three parallel retrieval stacks that must
unify regardless (finding 3.1).

## Baseline (git-verified 2026-08-23)

Extraction STARTED: `internal/retrieval/` exists (chunk/grader/lexical/
variants + tests, commit `444981f`), prism memo-cache TOCTOU closed via
singleflight (`965b4ca`), `wiki/staleness.go` landed (`0c2c489`), memory
write-dedup landed (+tests). This ADR directs CONTINUATION, not initiation:
port `search` onto `internal/retrieval` (drop-in; preserve index shape and
fingerprint), fold `research/corpus` last.

## Decision

Merge direction: `.kaioken/` knowledge, skills, memory become one layer with
shared machinery:

- **One retrieval stack** on `internal/textrank`'s pure-Go BM25
  (`textrank.go:183`, verified present); PRISM remains a first-class MODE.
- **Shared artifact metadata:** `{source_provenance, created_at,
  last_verified_at, freshness_state}`.
- **Shared lifecycle:** active→stale(30 d)→archived(90 d), configurable,
  non-destructive into `.archive/`, pinned/bundled exempt. One mechanism
  generalises items 15/27 across skills AND cards.
- **Shared trust mechanism:** wiki verify pass generalises — generated skills
  and distilled memory cite evidence. Staleness honesty everywhere: commit
  distance surfaced in `knowledgeSummary` and `read_knowledge`.
- **Shared ledger:** one JSONL audit trail, sha256 blobs, exact rollback;
  failure never blocks mutation.

## Consequences

- Memory dedup (audit 3.4) and staleness surfacing (3.3) already landed —
  verify coverage rather than rebuild; remaining work is search/corpus porting
  plus metadata/lifecycle unification.
- Session search (#16) joins the same stack (BM25 + JSON index), reinforcing
  the no-SQLite rule (ADR-009) and respecting fork lineage in results.
