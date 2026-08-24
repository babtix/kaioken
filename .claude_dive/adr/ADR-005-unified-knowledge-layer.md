# ADR-005: Unified knowledge layer

- **Status:** Accepted (L6) · re-verified 2026-08-24 — extraction confirmed 1 of 3 steps done
- **Supersedes:** `archive/hermes_dive/adr/ADR-005`

## Context

The knowledge engine (wiki/cards/PRISM verify+provenance pass) is Kaioken's sole unique
capability per every comparison pass in this corpus. L6 offered scopes; the logic audit
independently found three parallel retrieval stacks that must unify regardless (finding 3.1).

## Baseline (verified 2026-08-24)

Extraction started, **not** finished, and the remaining scope is larger than the predecessor
ADR stated: `internal/retrieval/` exists (chunk/grader/lexical/variants + tests, commit
`444981f`), prism memo-cache TOCTOU closed via singleflight (`965b4ca`), `wiki/staleness.go`
landed (`0c2c489`), memory write-dedup landed. But `internal/retrieval` has exactly **one**
importer repo-wide — `internal/prism`. `internal/search`
([index.go:16](../../cli/internal/search/index.go:16)) still imports raw `internal/textrank`
directly and has no relevance gate, so `read_knowledge` and the daemon docs search still
return the least-bad chunk with nothing equivalent to PRISM's `SourceFound: false`.
`internal/research` is a wholly separate third stack with its own `Chunk`, own
`keywordScore` ([evidence.go:212](../../cli/internal/research/evidence.go:212)), own
`rankChunks`, own lexicon — imports neither `retrieval` nor `textrank`. This ADR directs
**continuation of step 1 of 3**, not a mostly-finished cleanup: port `search` onto
`internal/retrieval` (drop-in; preserve index shape and fingerprint), fold `research/corpus`
last.

**Session search is a fourth Kind on the existing search index, not a new stack.**
`internal/search` already ships BM25 + a JSON index + a corpus fingerprint
([corpus.go:1-8](../../cli/internal/search/corpus.go:1)) indexing `KindWiki`/`KindCard`/
`KindSkill`. The predecessor plan proposed building session search as a fresh
textrank-BM25 + JSON index stack on its own branch, unaware this would make it a *fourth*
parallel stack while ADR-005's whole point is consolidating three into one. Correct scope:
add `KindSession` to the existing index.

## Decision

Merge direction: `.kaioken/` knowledge, skills, memory become one layer with shared
machinery:

- **One retrieval stack** on `internal/textrank`'s pure-Go BM25 (`textrank.go:183`, verified
  present); PRISM remains a first-class MODE.
- **Shared artifact metadata:** `{source_provenance, created_at, last_verified_at,
  freshness_state}`. Note skills and wiki already carry most of these fields under different
  names (`skills.go:34-56` — `Sources`, `GeneratedAt`, `Model`, `Origin`, `UseCount`,
  `LastUsed`, `Sessions`; `wiki/provenance.go`). Memory and sessions carry none. The
  unification is a naming/interface job for two tenants, a from-scratch job for two others —
  scope the task accordingly, and design the schema once, up front, before Wave 2 lands the
  skills ledger, or Wave 3 re-fragments the layer it exists to unify.
- **Shared lifecycle:** active→stale(30 d)→archived(90 d), configurable, non-destructive into
  `.archive/`, pinned/bundled exempt. One mechanism generalises items 15/27 across skills AND
  cards. Wires `PruneStale` (see `adr/ADR-004`); does not reimplement it.
- **Shared trust mechanism:** wiki verify pass generalises — generated skills and distilled
  memory cite evidence. Staleness honesty everywhere: commit distance surfaced in
  `knowledgeSummary` and `read_knowledge` — **already done, both places**
  ([knowledge.go:200-202](../../cli/internal/agent/knowledge.go:200) and `:230-232`, with
  tests). Nothing to build here; verify coverage stays current as the layer grows.
- **Shared ledger:** one JSONL audit trail, sha256 blobs, exact rollback; failure never blocks
  mutation.

## Consequences

- Memory dedup (audit 3.4) and staleness surfacing (3.3) are landed — verify coverage rather
  than rebuild; the outstanding work is genuinely the search/corpus porting plus
  metadata/lifecycle unification, and it is two of three steps, not one.
- Session search joins the same stack as a new `Kind`, reinforcing the no-SQLite rule
  (`adr/ADR-009`) and respecting fork lineage in results.
