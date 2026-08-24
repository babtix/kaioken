# SUPERSEDED — what this set replaces, and where the originals went

Nothing was deleted. Every prior document is preserved under `archive/`, at its original
relative path. This file says which of them are **superseded** (do not act on them), which
remain **live inputs** (still authoritative for their own subject), and where each is now.

## Lineage

```
docs/doc_agy/ ─┐
docs/doc_her/ ─┤
docs/doc_open/ ┼─► docs/hermes_res/ ────┐
               │   docs/doc_final_opencode/ ─┴─► .hermes_dive/ ──┐
               │                                                  ├─► .claude_dive/  (this set)
               └─────────────────────► .opencode_dive/ ──────────┤
                                       .antigravity_dive/ ────────┘
```

Five folders were reconciled into two; two were superseded by one; one audited the whole
corpus; a third synthesis ran in parallel. This set is the first to be built from an
independent read of `cli/` rather than from its predecessors' claims about `cli/` — see
`AUDIT.md` §1.

## Superseded — do not act on these

| Original | Now at | Superseded by | Why |
|---|---|---|---|
| `.hermes_dive/README.md` | `archive/hermes_dive/README.md` | `ARCHITECTURE.md` | Skeleton inherited; every "current state" claim re-derived from source |
| `.hermes_dive/roadmap.md` | `archive/hermes_dive/roadmap.md` | `ROADMAP.md` | W2 resequenced; W1-k redirected from a new module to wiring `epoch.go`; WP-b (model selector) deleted as already built; ~20 stale items removed |
| `.hermes_dive/adr/ADR-001…010` | `archive/hermes_dive/adr/` | `adr/ADR-001…010` | ADR-003 and ADR-006 fully rewritten; ADR-002 and ADR-007 corrected; rest inherited |
| `.hermes_dive/adr/DECISIONS.md` | `archive/hermes_dive/adr/DECISIONS.md` | `DECISIONS.md` | D8 (Go 1.24) struck; DV-1…DV-10 added |
| `.hermes_dive/AUDIT.md` | `archive/hermes_dive/AUDIT.md` | `AUDIT.md` | Its method was document-vs-document; this one is document-vs-source |
| `.hermes_dive/SUPERSEDED.md` | `archive/hermes_dive/SUPERSEDED.md` | this file | Chain extended |
| `docs/hermes_res/**` | `archive/docs/hermes_res/` | `ARCHITECTURE.md`, `adr/` | Already superseded by `.hermes_dive`; additionally, its "sessions are linear" claim is false and its RECONCILIATION entrenched the Go-version error |
| `docs/doc_final_opencode/**` | `archive/docs/doc_final_opencode/` | `DECISIONS.md` | Decisions log preserved in substance; its wave plan was anchored to a stale baseline and a wrong commit |
| `docs/v2/00-reconciliation.md` | `archive/docs/v2/` | this set | Its §9 verdicts are resolved in `DECISIONS.md` DV-1…DV-10 |
| `docs/v2/01-addendum-dive-folders.md` | `archive/docs/v2/` | this set | Its V-8/V-9/V-10 are resolved in `DECISIONS.md` |
| `.antigravity_dive/**` | `archive/antigravity_dive/` | this set | Not incorporated. It propagated the Go-version error further, asserting 1.24 "matches root go.mod" — there is no root `go.mod` |

## Live inputs — still authoritative for their own subject

These are **not** superseded. This plan cites them and does not replace them.

| Document | Now at | Still authoritative for |
|---|---|---|
| Root `ROADMAP.md` | *(unmoved, repo root)* | **The 12-month plan this set slots into.** Owns M2 distribution, M5 tree-sitter, M10–M12 reach and the March-2027 license decision — none of which this corpus covers. See `ROADMAP.md` §2 |
| `docs/inspire-backlog.md` | `archive/docs/inspire-backlog.md` | The #N item numbers used throughout this set, and the per-item source evidence behind them |
| `docs/logic-audit-and-phases.md` | `archive/docs/logic-audit-and-phases.md` | The audit §N references. **Its status header is stale** — it says phases 3 and 4 are open; all four merged |
| `docs/inspire-phases.md` | `archive/docs/inspire-phases.md` | The phase→wave mapping in `ROADMAP.md` §6 |
| `.opencode_dive/**` | `archive/opencode_dive/` | **The strongest predecessor audit.** Four of its findings are adopted directly — see `AUDIT.md` §4. Its `02-code-verification-log.md` remains a useful independent check |
| `docs/hermes-map.md`, `opencode-map.md`, `pi-opencode-deep-dive.md` | `archive/docs/` | Reference-agent maps; unaffected by this reconciliation |
| `docs/phase-branches.md` | `archive/docs/phase-branches.md` | **Stale** — lists four merged branches as open. First reader trap in the tree |

## Known-stale artifacts outside this set

Flagged for correction; none are `cli/` work:

- **Root `AGENTS.md:33`** — says "Go 1.24.2". Actual: **1.26**. This is the line that caused a
  three-generation documentation error (`AUDIT.md` §3.7).
- **Root `AGENTS.md`** layout section — describes a root-level `opencode/` repo. Actual
  locations are `.reference/opencode/` (pinned) and `inspire/opencode/`.
- **`docs/logic-audit-and-phases.md`** status header and **`docs/phase-branches.md`** — both
  still describe merged branches as open.
- **`PI_KAIOKEN_ANALYSIS.md`** — gap table stale; excluded as an input by D12 and still
  excluded.
