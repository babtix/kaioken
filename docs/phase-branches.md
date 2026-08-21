# Phase branches

Tracks which git branch carries each phase of [logic-audit-and-phases.md](logic-audit-and-phases.md),
so work stays inside that plan instead of drifting. Update this table whenever a phase
branch is opened, merged, or a phase's scope changes.

Each open branch has a handoff plan in [phase-plans/](phase-plans/) containing a
paste-ready prompt for starting that work in a fresh session.

| Phase | Branch | Status | Plan | Scope |
|---|---|---|---|---|
| 1 — Agent coding system | `fix/phase1-agent-logic` | **merged to master** (`4073e44`) | — | §1.1–1.4: compaction inside `Run`, `derive()`, `Chainable` newline bypass, stream validation |
| 1 — leftovers | `fix/phase1-followups` | open, empty | [plan](phase-plans/phase1-followups.md) | §1.5: step budget consumed by steering; `normalizeToLF` mangling mixed line endings |
| 2 — Deep research | (folded into `fix/phase1-agent-logic`, merged) | **merged to master** (`4073e44`) | — | §2.1–2.4: supervisor dedup, escalation grounding, resume query plan, worker evidence cap |
| 2 — leftovers | `fix/phase2-followups` | open, empty | [plan](phase-plans/phase2-followups.md) | §2.5: worker loop has no cancellation check |
| 3 — Knowledge engine | `fix/phase3-knowledge-engine` | open, empty | [plan](phase-plans/phase3-knowledge-engine.md) | §3.1–3.4: shared `internal/retrieval` extraction, PRISM memo cache TOCTOU, knowledge staleness signal, memory write dedup |
| 4 — Cross-cutting | `fix/phase4-cross-cutting` | open, empty | [plan](phase-plans/phase4-cross-cutting.md) | §4: `.gitattributes`, `-race` in CI, concurrent checkpoint temp collision. **`RunState.Checkpoint` atomicity is already correct — don't "fix" it.** `tui.go` split deferred. |

## Recommended order

The audit doc's own ordering is 1 → 2 → 3 → 4, and phases 1–2 are done. For what's left,
**start with Phase 4**, out of numerical order:

1. **`fix/phase4-cross-cutting`** — `.gitattributes` first. Without it, Windows rewrites
   LF→CRLF on every file git touches, so `gofmt -l` flags every file in
   `internal/research` and real drift stays invisible underneath. Landing it later means
   every Phase 3 diff gets reviewed through that noise. `-race` in CI belongs here too,
   before Phase 3 touches the concurrency-heavy retrieval paths.
2. **`fix/phase1-followups` / `fix/phase2-followups`** — three small scoped items that
   close out phases 1–2 properly. §1.5b (`normalizeToLF`) is easier after `.gitattributes`
   lands.
3. **`fix/phase3-knowledge-engine`** — the big one. Meant to span multiple sessions; its
   plan splits §3.1 into three separate landings.

## Notes for future sessions

- `TestPrismImportAndQuery` in `cli/internal/daemon` fails on this machine for an
  environmental reason: Ollama runs but `nomic-embed-text` isn't pulled. Known
  non-regression — don't chase it. Fix with `ollama pull nomic-embed-text` if a fully
  green suite is wanted.
- The `better-harness` branch is stale and superseded by `master` (67 commits behind,
  everything unique to it already landed). It was deliberately kept, not deleted. Don't
  merge it.
