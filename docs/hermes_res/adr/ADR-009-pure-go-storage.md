# ADR-009: Pure-Go storage — no SQLite, ever

- **Status:** Accepted (constraint, not preference)
- **Date:** 2026-08-22 · v1.1

## Context

Hermes uses SQLite + FTS5 for session state and search. The adversarial
verification pass on the backlog (item 16) established the constraint: Kaioken
compiles `CGO_ENABLED=0` and must keep it — `mattn/go-sqlite3` needs a C
toolchain and breaks single-binary cross-compilation; `modernc.org/sqlite`
adds a large transpiled tree. Kaioken already has pure-Go BM25 in
`internal/textrank` (`textrank.go:183`, verified present), shared by
`internal/search`, `internal/prism`, and the extracted `internal/retrieval`.

## Decision

All state remains pure Go: markdown/YAML artifacts + JSONL + JSON indexes
under `.kaioken/`, plus `state.json`. Session search (#16) indexes transcripts
with textrank-BM25 + a JSON index. Borrow Hermes' *retrieval design* (ranked
hits, lineage dedup, ±5-message anchored hydration) without its storage;
results must respect fork lineage (`ParentID`/`ForkedAt` trees in
`internal/session`).

## Consequences

- Any future proposal touching SQLite is auto-rejected at design review.
- If BM25 relevance ever proves insufficient, the escape hatch is embedding a
  pure-Go vector index — not a SQL dependency.
- CI note: `-race` needs cgo and therefore runs ubuntu-only in CI; that does
  NOT reopen the door to cgo dependencies in the product build.
