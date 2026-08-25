# AUDIT — verification record behind the canonical set

**Date:** 2026-08-23 · Auditor: deep-dive pass ordered by operator (audit
first, then synthesis). Method: git log inspection + direct source checks on
`master @ bd740fe`, then full reads of both final sets and all eight deep-dive
documents, claim-by-claim against the repo.

## 1. Ground truth established

| Check | Result |
|---|---|
| master HEAD | `bd740fe` "chore(version): bump to 1.3.4 (unverified, pre-v2 checkpoint)" — version strings only, no code delta |
| Docs' claimed baseline `7be48f2` | Still an ancestor; all four follow-up merge commits (`a651bea`, `ae6a808`, `a867302`, `aa5e865`) verified merged 2026-08-22 17:48 |
| Open branches | NONE. `fix/phase1-agent-logic` fully contained in master; only local branch vs origin docs branch exists |
| Working tree | Only `cli/.kaioken/` generated-knowledge files modified (agent-managed, not source) |
| Session trees | CONFIRMED: `internal/session/{session,tree,fork}.go` + tests |
| Retrieval extraction | CONFIRMED: `internal/retrieval/{chunk,grader,lexical,variants}.go` + tests |
| Staleness + dedup + singleflight | CONFIRMED: `internal/wiki/staleness.go` (+test), `memory_test.go` dedup tests, singleflight commit `965b4ca` |

## 2. File:line anchor verification (roadmap inputs)

Every anchor cited by either predecessor's roadmap was re-checked:

| Anchor | Claim | Verdict |
|---|---|---|
| `tui.go:3073`, `delegate.go:103` | `Approve` returns bare bool | CONFIRMED (both sites) |
| `delegate.go:156` | delegates run `MemoryDisabled = true` | CONFIRMED |
| `palette.go` ~line 56 | palette closes on whitespace (no arg completion) | CONFIRMED (`ContainsAny(val, " \t\n") → return`) |
| `agent.go:238` | empty 200 falls through to `return history, nil` | CONFIRMED (final-answer branch reachable with empty content) |
| `thinking.go:18` | thinking levels landed | CONFIRMED (`ThinkingLevels{off,low,medium,high}`) |
| `memory/learn.go:37` | `Signals()` heuristics exist | CONFIRMED |
| `textrank.go:183` | pure-Go BM25 present | CONFIRMED |
| `session.go:51-65` region | JSONL tree format | CONFIRMED via package layout + tests |

## 3. Claim ledger across the two final sets

| Claim family | hermes_res | doc_final_opencode | Audit verdict |
|---|---|---|---|
| Sessions are JSONL trees | corrected in v1.1 (R1 adopted) | original correct | CLOSED — canonical states trees |
| Transform layer placement | WP added (R2 adopted) | original correct | CLOSED — WP stage |
| Baseline freshness | v1.1 git-verified @ 7be48f2 | STALE (pre-merge W0, wrong commit `4073e44`) | hermes_res baseline wins; updated to bd740fe |
| "All 28 backlog items CONFIRMED" | flagged as overstated | README wording | CLOSED — canonical uses precise figure (433/511 quotes mechanically confirmed, 5 corrections applied) |
| D1–D13 conflict resolutions | adopted | authored | NONE overturned — re-verified spot checks agree |
| N1–N8 synthesis decisions | adopted | authored | All retained; placement per hermes_res (N2→P1 etc.) |
| Operator locks L1–L8 | authored (operator Q&A) | adopted as L1–L8 | Re-affirmed FROZEN by operator 2026-08-23 |
| Wave structure & ordering invariant | three-track | three-track (reconciled) | IDENTICAL after reconciliation — no conflict remains |
| Success criteria & deferred lists | tightened version | original + additions | Merged; identical substance |

Residual disagreements between the two sets: none found beyond presentation
format (narrative ADRs vs tabular log), which this set resolves by keeping
both entry points (README narrative + DECISIONS register).

## 4. Unabsorbed corpus content (the actual new findings)

Grep-audited every deep-dive mechanism against both final sets:

1. **Dynamic cache-control tag placement** (`doc_agy/hermes-in-depth §3.1`,
   Hermes `turn_context.py:42-48`) — absent from both sets → adopted as **N9**
   (README §6.4, sequenced into WP after composition module).
2. **Argument-repair sanitisation** (`doc_agy/hermes-in-depth §3.2`,
   Hermes `message_sanitization.py`) — absent from both sets → adopted as
   **N10** (recovery checklist, pairs with length-stop guard).
3. **Process rule** distilled from the reconciliation history itself → **N11**
   (baseline claims must cite SHA+date and be re-verified before action).

Everything else surfaced by the dives (footprint ladder, empty-response
guard design incl. its internal ephemerality flags, PTC transport matrix,
env scrubbing, curator thresholds, fixed compaction template, output
accumulator, edit engine lineage, snapshot engine, read-before-write
invariant, prefix-parity review forks, dual-cadence triggers, suppression
rules, multi-file skill topology) was already absorbed by at least one final
set — verified by targeted grep before concluding.

## 5. What the canonical set changes relative to each predecessor

- Inherits hermes_res as primary skeleton (it is the more current, git-verified,
  operator-Q&A'd set).
- Inherits doc_final's unique substance already cross-adopted by hermes_res
  v1.1 (N1–N8 placements, T7/T8 principles, #20 paste collapse, success
  criteria, deferred list); keeps its tabular decisions log alive via
  `adr/DECISIONS.md`.
- Adds N9/N10/N11 (§4 above).
- Expands W0′/WP/W1 to task level with file targets anchored at verified
  locations (see `roadmap.md`).
- Updates baseline to `bd740fe`; records DA1–DA4 audit deltas.
