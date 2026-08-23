# SUPERSEDED — read `.hermes_dive/` instead

**Date:** 2026-08-23. The canonical Kaioken v2 planning set now lives in
`.hermes_dive/`. The two sets below are superseded as PLANNING DOCUMENTS.
They are NOT deleted: they remain the auditable research record — the
verification work, conflict logs, and per-item citations they contain are the
provenance behind the canonical set, and `AUDIT.md` references them by path.

## Status of superseded documents

| Path | Old role | Now |
|---|---|---|
| `docs/hermes_res/kaioken-v2-architecture.md` | Final target architecture (v1.1) | Superseded by `.hermes_dive/README.md`; its verified baseline §9.1 is updated in README §1.3 (bd740fe) |
| `docs/hermes_res/adr/ADR-001…010` | Decision records | Superseded by `.hermes_dive/adr/ADR-001…010` (same numbering, same substance, re-verified) |
| `docs/hermes_res/roadmap.md` | Wave plan | Superseded by `.hermes_dive/roadmap.md` (W0′/WP/W1 expanded to task level) |
| `docs/hermes_res/RECONCILIATION.md` | Verification record vs doc_final | Still-valid history; findings absorbed into `.hermes_dive/AUDIT.md` and `adr/DECISIONS.md` |
| `docs/doc_final_opencode/README.md` + `01-architecture.md` | Parallel final architecture | Superseded by `.hermes_dive/README.md`; unique content (L-table framing, tenet table T7/T8 emphasis, composed-doctrine enforcement wording) retained there |
| `docs/doc_final_opencode/02-roadmap.md` | Unified wave plan | Superseded by `.hermes_dive/roadmap.md`; per-stage gates carried forward |
| `docs/doc_final_opencode/03-decisions-log.md` | Conflict resolutions D1–D13 + N1–N8 + rejected list | **Still the detailed rationale source** for D/N decisions; register summarised in `.hermes_dive/adr/DECISIONS.md`, which adds N9–N11 |

Not affected (still authoritative for what they cover): everything under
`docs/doc_agy/`, `docs/doc_her/`, `docs/doc_open/` (research deep dives),
`docs/inspire-backlog.md` + `inspire-phases.md` (verified item backlog),
`docs/logic-audit-and-phases.md` + `phase-plans/` (audit record),
`docs/hermes-map.md`, `docs/opencode-map.md`, `docs/pi-opencode-deep-dive.md`
(source maps).

## Reading order for Kaioken v2 going forward

1. `.hermes_dive/README.md` — identity, locks, principles, subsystem specs
2. `.hermes_dive/roadmap.md` — start here to build (W0′ first)
3. `.hermes_dive/adr/` — the why behind each decision
4. `.hermes_dive/AUDIT.md` — what was verified and what changed vs the old sets
5. Old sets only when you need the full decision rationale trail
   (`doc_final_opencode/03-decisions-log.md`) or verification history
   (`hermes_res/RECONCILIATION.md`)

## Rule going forward (decision N11)

Any document claiming a "current baseline" must cite a commit SHA and date,
and must be re-verified against `git log` before its plan is acted upon.
