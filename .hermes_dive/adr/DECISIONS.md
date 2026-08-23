# DECISIONS — conflict resolutions and synthesis decisions (canonical)

Canonical successor to `doc_final_opencode/03-decisions-log.md`. Sections A–C
(conflict resolutions D1–D13, synthesis decisions N1–N8, rejected list) are
ADOPTED VERBATIM-IN-SUBSTANCE from that log after audit — none of its D1–D13
resolutions were overturned by verification (confirmed independently by both
RECONCILIATION passes and this one). This file records only what THIS audit
adds or changes. Read the predecessor log for the full D/N tables.

## D. What this audit changed vs the predecessors

| # | Finding | Evidence | Action |
|---|---|---|---|
| DA1 | Predecessors' verified baseline was `master @ 7be48f2`; master has since moved to `bd740fe` | `git log`: one new commit, version strings only ("unverified, pre-v2 checkpoint") | Baseline updated in README §1.3; no architecture impact |
| DA2 | All four phase-follow-up merge commits re-verified as merged (`a651bea`, `ae6a808`, `a867302`, `aa5e865`); no open fix branches exist (`git branch -a`) | git | Confirms hermes_res v1.1 baseline over doc_final's stale one |
| DA3 | Every file:line anchor cited by the roadmaps re-checked against source and CONFIRMED: bare-bool Approve (`tui.go:3073`, `delegate.go:103`), delegates MemoryDisabled (`delegate.go:156`), palette whitespace-close (`palette.go`), empty-200 fall-through (`agent.go:238`), thinking levels landed (`thinking.go:18`), Signals (`memory/learn.go:37`), textrank BM25 (`textrank.go:183`) | source inspection | Task-level roadmap may cite these anchors as verified |
| DA4 | Two deep-dive mechanisms were absorbed by NEITHER predecessor: (1) Hermes argument-repair sanitisation (`message_sanitization.py`, doc_agy hermes-in-depth §3.2); (2) dynamic provider cache-control tag placement (`turn_context.py:42-48`, same doc §3.1) | corpus grep: zero hits in both final sets | Adopted as N10 and N9 below |

## N. Synthesis decisions added by this audit

| # | Decision | Source inspiration | Where |
|---|---|---|---|
| N9 | Dynamic cache-control tag placement: provider-appropriate ephemeral cache tags at stable prompt boundaries, sequenced AFTER the composition module exists (tags need stable boundaries); Anthropic-style breakpoints where supported, harmless no-op elsewhere | Hermes `turn_context.py:42-48` via doc_agy hermes-in-depth §3.1 | README §6.4; WP stage |
| N10 | Argument-repair sanitisation joins the recovery checklist: repair malformed tool-call arguments defensively before dispatch (the mechanism behind Hermes' `message_sanitization.py`), table-tested like transform rules; pairs with the length-stop structural-failure guard | Hermes `message_sanitization.py` via doc_agy hermes-in-depth §3.2 | README §4; WP/W4 boundary |
| N11 | Documentation provenance rule going forward: any future planning document claiming "current baseline" MUST cite a commit SHA and date and be re-verified against `git log` before its plan is acted on — the recurring failure mode across this corpus (doc_final's stale W0, wrong commit `4073e44`; hermes_res v1's "linear chosen") is a process defect, not a knowledge defect | RECONCILIATION history + this audit's DA1–DA2 | Process rule for all v2 work |

## Inherited decision register (summary)

For quick lookup — full rationale lives in the predecessor log unless an ADR
above restates it:

- **D1–D13:** PTC child-process dual transport (D1); post-edit diagnostics in
  Phase 6 compiler-dry-run-first (D2); FIFO guard in Phase 1 (D3); reflection
  fork gated on `Signals()` not counters (D4); curator 30/90 configurable (D5);
  no silent-overwrite evolution, human review mandatory (D6); pure-Go session
  search (D7); Go 1.24 (D8); micro-compaction vs cache-warmth nuance recorded
  (D9); UndoEntry authoritative, tree snapshots needed (D10); ESTOP dropped
  then partially revived at daemon layer by L7 (D11); PI_KAIOKEN_ANALYSIS
  excluded as input (D12); approval enum 4–6 h (D13).
- **N1–N8:** frozen memory snapshot as code (N1); incremental transcript flush
  (N2, lands with P1); 2 KB error cap (N3); mutation verifier footer (N4);
  compound apply_patch (N5); fixed compaction template (N6); fork cancel ~2 s +
  whitelist sandbox (N7); turn leases deferred (N8).
