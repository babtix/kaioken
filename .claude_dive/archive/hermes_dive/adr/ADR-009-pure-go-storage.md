# ADR-009: Pure-Go storage — no SQLite, ever

- **Status:** Accepted (constraint, not preference) · re-verified 2026-08-23
  (`internal/textrank/textrank.go:183` anchor confirmed present)
- **Supersedes:** `docs/hermes_res/adr/ADR-009`

## Context

Hermes uses SQLite + FTS5 for session state/search. Adversarial verification
(backlog item 16) established: Kaioken compiles `CGO_ENABLED=0` and must keep
it — `mattn/go-sqlite3` needs a C toolchain and breaks single-binary
cross-compilation; `modernc.org/sqlite` adds a large transpiled tree. Kaioken
already has pure-Go BM25 in `internal/textrank`, shared by `internal/search`,
`internal/prism`, and the extracted `internal/retrieval`.

## Decision

All state remains pure Go: markdown/YAML artifacts + JSONL + JSON indexes
under `.kaioken/`, plus `state.json`. Session search (#16) indexes transcripts
with textrank-BM25 + a JSON index. Borrow Hermes' *retrieval design* (ranked
hits, lineage dedup, ±5-message anchored hydration) without its storage;
results respect fork lineage (`ParentID`/`ForkedAt` trees in
`internal/session`).

## Consequences

- Any future proposal touching SQLite is auto-rejected at design review.
- If BM25 relevance ever proves insufficient, the escape hatch is a pure-Go
  vector index — not a SQL dependency (doc_final T5 wording adopted).
- CI note: `-race` needs cgo → ubuntu-only in CI; does NOT reopen cgo
  dependencies in product builds.
