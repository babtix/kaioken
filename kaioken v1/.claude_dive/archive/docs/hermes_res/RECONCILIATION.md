# RECONCILIATION — hermes_res vs doc_final, with code verification

**Date:** 2026-08-22 (v1.1 revision of this set)
**What happened:** the same "final Kaioken v2 architecture" task produced two
deliverable sets — this one (`hermes_res/`) and a parallel one (`doc_final/`,
4 files). The operator asked for a read, comparison, and critique of
`doc_final`, and for this set to be updated so building can start. Every
disputed claim below was checked against `git log` / actual source on
`master`, not against either document set.

---

## 1. Verification results (claims checked against the repo)

| Claim | Source | Verdict |
|---|---|---|
| Sessions are JSONL **trees** (`ParentID`/`ForkedAt`, `Entries`+`Leaf`, `syncTree`, fork support) — my §6 said "linear chosen" | doc_final R1 | **CORRECT.** Verified at `cli/internal/session/session.go:51-65`, `tree.go`, `fork.go`. My error; fixed in §6 |
| Transform layer (#11) was unplaced in my roadmap waves | doc_final R2 | **CORRECT.** My roadmap never assigned #11. Fixed: new WP stage |
| Audit phases 3 & 4 still have **open branches**; `.gitattributes`, `-race` CI, audit residuals (§1.5 steering budget, `normalizeToLF`, §2.5 worker cancellation) still to do | doc_final baseline + its W0 | **STALE / WRONG.** All four follow-up branches are merged to master (2026-08-22 17:48): `a651bea` (steering budget `48f3c7d`, mixed endings `0bca280`), `ae6a808` (worker cancellation + tests), `a867302` (knowledge engine), `aa5e865` (`.gitattributes`, CI `-race` job, runstate hardening) |
| Audit phases 1–2 landed "at `4073e44`" | doc_final baseline | **WRONG COMMIT.** `4073e44` is a desktop UI feature (VS Code-style tabs). Actual merge commits: `a651bea`, `ae6a808`, `a867302`, `aa5e865` (+ earlier phase 1–2 merges) |
| "All 28 backlog items CONFIRMED" by the verification report | doc_final README | **OVERSTATED.** The report itself counts 433/511 quotes verified with 5 corrections applied; "confirmed after correction" ≠ blanket confirmation |
| Unified-knowledge groundwork not started | both sets (implicitly) | **PARTIALLY STALE.** `internal/retrieval/` already exists on master (extracted chunk/grader/lexical/variants + tests out of prism), `wiki/staleness.go` landed, prism memo-cache TOCTOU fixed via singleflight (`retrieve.go:8,248`), memory write-dedup landed (`memory.go` +102 lines with tests) |
| Paste collapse (#20) belongs in the ergonomics wave | doc_final | **CORRECT.** Backlog Tier 2 item; my roadmap had omitted it |
| Go 1.24 (not the outlier "1.26") | doc_final D8 | **CONFIRMED** against root/cli AGENTS.md toolchain notes |
| "~26% cheaper review forks" cache figure | doc_final D9 | Plausible per its cited source; **not independently verifiable here** — kept out of this set |

## 2. Critique of doc_final

**Strengths (real):**
- The conflict-resolution log (D1–D13) is genuinely good practice — resolving
  every inter-source contradiction with citations beats leaving them implicit.
  Its resolutions match the evidence everywhere I checked (PTC child-process +
  dual transport; Signals-based fork gating; 30/90 configurable curator days;
  pure-Go search; approval enum 4–6 h).
- NEW decisions N1–N8 are concrete and buildable (frozen memory snapshot as a
  code rule; incremental in-turn transcript flush; 2 KB error cap; mutation
  verifier footer; compound `apply_patch`; fixed compaction template; 2 s fork
  cancel window + whitelist sandbox; lease deferral). All adopted here.
- It caught two real defects in my v1 (R1 sessions format, R2 missing WP
  placement) plus the omitted item #20. Credit where due.
- Tenets T7 (extraction-not-rewrite) and T8 (never hard-delete learned
  artifacts) deserve to be first-class principles. Adopted as principles 9–10.

**Weaknesses found:**
1. **Stale baseline, and it propagates.** Its "current baseline" and W0 were
   written against pre-merge state; four branches it calls open are merged,
   and most of its W0 checklist is already done. A reader starting today would
   redo finished work. This set now carries the git-verified baseline instead.
2. **Wrong commit citation** (`4073e44` for the audit merges) — the exact
   class of unverifiable-inherited-figure error the corpus's own measurement
   discipline warns about.
3. **Overstated verification language** in its README ("all 28 CONFIRMED").
4. Self-describes as "reconciled with the parallel proposal," which makes part
   of its content derivative rather than independent — fine, but then its
   residual value is mostly the conflict log and N1–N8, which are adopted.

## 3. Adopted into this set

- R1 fix (§6 sessions = JSONL trees) and R2 fix (new **WP** provider stage
  before W4, so PTC stubs emit transformed schemas).
- N1 frozen-memory-snapshot-as-code (§5.3), N2 incremental transcript flush
  (assigned to P1, where the daemon becomes persistence owner), N3 2 KB cap
  (already present), N4 verifier footer + N5 compound `apply_patch` (§4.B),
  N6 compaction template + small-model warning (§5.2/ADR-003), N7 fork
  whitelist + 2 s window (§4.G, already partially present), N8 turn-lease
  deferral (roadmap deferred list).
- Principles 9 (never hard-delete learned artifacts) and 10 (extraction, not
  rewrite) — from T8/T7.
- Item #20 paste collapse in the ergonomics wave.
- Its success-criteria section (tightened) and deferred-list additions
  (async background-delegation queue, Ralph goal loops, Lean verification).
- Length-stop stream guard (fail in-flight tool calls structurally when
  `stop_reason==length`) — surfaced via its pi reference.

## 4. Diverged / rejected

- **Its baseline & W0:** replaced with the git-verified state; W0 shrinks to
  the two live provider bugs (#8, #14) ≈ 1.5 d.
- **Format merger:** kept this set's narrative ADRs; recorded the conflict-log
  content here instead of merging styles. `doc_final/03` remains a valid
  alternate entry point for decision lookup.
- **Tenet-table restructuring:** substance absorbed; kept prose principles.
- Nothing in its D1–D13 resolutions was overturned — they were verified and
  where absent already matched this set.

## 5. Where to start building

See `roadmap.md` v1.1: **W0′ = item #8 (empty-response silent-success) then
#14 (retry hardening, both layers together)** — the only correctness debt
actually still open. Everything else in the old W0 is on master.
