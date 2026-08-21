# Phase branches

Tracks which git branch carries each phase of [logic-audit-and-phases.md](logic-audit-and-phases.md),
so work stays inside that plan instead of drifting. Update this table whenever a phase
branch is opened, merged, or a phase's scope changes.

| Phase | Branch | Status | Scope |
|---|---|---|---|
| 1 — Agent coding system | `fix/phase1-agent-logic` | **merged to master** (`4073e44`) | §1.1–1.4: compaction inside `Run`, `derive()`, `Chainable` newline bypass, stream validation |
| 1 — leftovers | `fix/phase1-followups` | open, empty | §1.5: step budget consumed by steering; `normalizeToLF` mangling mixed line endings |
| 2 — Deep research | (folded into `fix/phase1-agent-logic`, merged) | **merged to master** (`4073e44`) | §2.1–2.4: supervisor dedup, escalation grounding, resume query plan, worker evidence cap |
| 2 — leftovers | `fix/phase2-followups` | open, empty | §2.5: worker loop has no cancellation check |
| 3 — Knowledge engine | `fix/phase3-knowledge-engine` | open, empty | §3.1–3.4: shared `internal/retrieval` extraction, PRISM memo cache TOCTOU, knowledge staleness signal, memory write dedup |
| 4 — Cross-cutting | `fix/phase4-cross-cutting` | open, empty | §4: `-race` in CI, `.gitattributes`, `RunState.Checkpoint` atomicity, `tui.go` size — lands alongside 1–3, not strictly after |

Suggested order per the audit doc: 1 → 2 → 3 → 4. Phases 1 and 2 are done; pick up
`fix/phase3-knowledge-engine` next, or clear the phase 1/2 leftovers first since they're
small and already scoped.
