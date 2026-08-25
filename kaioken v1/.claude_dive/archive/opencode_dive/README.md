# .opencode_dive — Kaioken v2 Corpus Deep Dive

**Date:** 2026-08-23 · **Analyst:** ox-alpha (opencode)
**Verified against:** `master` code state @ HEAD `36dfcaf` (branch `docs/inspire-analysis`; HEAD adds **docs only** — `cli/` is byte-identical to the docs' baseline `7be48f2`, so every baseline claim in the corpus was checkable at current HEAD without drift).

## Scope (locked with operator before starting)

| Setting | Choice |
|---|---|
| Corpus | Everything: `docs/hermes_res/`, `doc_final_opencode/`, `doc_agy/`, `doc_her/`, `doc_open/`, root `docs/*.md`, `phase-plans/`, + external `~/Documents/reserch/` (4 files, readable) |
| Goal | **Comparison matrix** across all document sets (not a re-merge) |
| Authority | `hermes_res` v1.1 wins conflicts |
| Verification | Full — load-bearing claims checked vs `cli/` @ HEAD and vendored reference sources (`inspire/hermes-agent`, `.reference/opencode` @ `7534d23`, `inspire/opencode`, `inspire/pi`) |
| ADRs | All 10 audited individually |
| Roadmap / backlog | Validate existing only; cross-check all 28 #N items |
| Labels | VERIFIED / VERIFIED-EXACT / STALE / WRONG / UNVERIFIABLE, with file:line evidence |

## Reading order

| File | Contents |
|---|---|
| [01-comparison-matrix.md](01-comparison-matrix.md) | The main deliverable. Per-set strengths/weaknesses, cross-set conflict table, convergence analysis, unique contributions |
| [02-code-verification-log.md](02-code-verification-log.md) | ~40 claims checked against source. Includes 5 findings that correct or drift from what the corpus asserts about itself |
| [03-adr-audit.md](03-adr-audit.md) | ADR-001…010 individually audited: verdicts, gaps, unstated risks |
| [04-roadmap-validation.md](04-roadmap-validation.md) | Wave plan validated; sequencing problems flagged (no rewrite) |
| [05-backlog-crosscheck.md](05-backlog-crosscheck.md) | All 28 items mapped to roadmap homes; coverage complete; double-homes flagged |
| [06-open-questions.md](06-open-questions.md) | DECISION NEEDED items with recommendations — including the one genuine hole in ADR-006 (PTC child language) |

## Headline verdicts

1. **The two final proposal sets are no longer competitors.** After both reconciliation passes they agree on ~95% of substance. `hermes_res` v1.1 is strictly newer-in-evidence; `doc_final`'s residual value is its conflict log (D1–D13), NEW decisions N1–N8 (all adopted into hermes_res), and per-stage gates.
2. **The git-verified baseline in hermes_res is accurate.** Every "LANDED" claim I checked is real on master (retrieval extraction, singleflight, staleness, memory dedup, steering budget fix, mixed-endings fix, worker cancellation, runstate hardening, CI `-race`). The three "still open" provider bugs (#8, #11, #14) are genuinely still open — I confirmed each in source.
3. **One self-inflicted error survived both reconciliations:** the Go version. `go.mod` says `go 1.26`; toolchain is go1.26.5. doc_final's D8 "correction" (1.24) and RECONCILIATION's "CONFIRMED" stamp propagated a stale AGENTS.md line over actual project files — exactly the failure class the corpus's own discipline warns about.
4. **ADR-006 has one real hole:** it specifies transport (verified against Hermes source — lines 27/59/1357 check out) but never names **what language the child script runs**. This is the single biggest unresolved design decision in v2. See 06-open-questions.md.
5. **Two high-value pi/opencode recommendations were silently dropped** between the Aug-1 deep dive and the backlog: hybrid token accounting ("the most valuable single change in this document") and nested `AGENTS.md` lazy-load. Neither has a backlog row or roadmap home. Flagged for an adopt/reject decision.
