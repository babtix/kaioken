# ADR-009: Pure-Go storage — no SQLite, ever

- **Status:** Accepted (constraint, not preference) · carried forward, adopted verbatim
- **Supersedes:** `archive/hermes_dive/adr/ADR-009`

Across every audit in this corpus's history, this is the single most consistently correct
document. No corrections needed.

## Context

Hermes uses SQLite + FTS5 for session state/search. Kaioken compiles `CGO_ENABLED=0` and must
keep it — `mattn/go-sqlite3` needs a C toolchain and breaks single-binary cross-compilation;
`modernc.org/sqlite` adds a large transpiled tree. Kaioken already has pure-Go BM25 in
`internal/textrank` ([textrank.go:182-185](../../cli/internal/textrank/textrank.go:182)),
shared by `internal/search`, `internal/prism`, and the extracted `internal/retrieval` (via
`internal/prism`; `internal/retrieval` does not import `textrank` directly today).

## Decision

All state remains pure Go: markdown/YAML artifacts + JSONL + JSON indexes under `.kaioken/`,
plus `state.json`. Session search indexes transcripts with textrank-BM25 as a new `Kind` on
the existing `internal/search` index (see `adr/ADR-005` — not a new stack). Borrow Hermes'
*retrieval design* (ranked hits, lineage dedup, ±5-message anchored hydration) without its
storage; results respect fork lineage (`ParentID`/`ForkedAt` trees in `internal/session`).

## Consequences

- Any future proposal touching SQLite is auto-rejected at design review.
- If BM25 relevance ever proves insufficient, the escape hatch is a pure-Go vector index —
  not a SQL dependency.
- CI note: `-race` needs cgo → ubuntu-only in CI (`ci.yml:11,23-27`); this does NOT reopen cgo
  dependencies in product builds. `go-starlark` (`adr/ADR-006`) is the one new dependency this
  plan adds, and it is pure Go.
