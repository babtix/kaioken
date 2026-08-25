# 05 — Backlog Cross-Check (items #1–#28 across all sets)

Source of numbering: `docs/inspire-backlog.md` (28 items, adversarially verified 2026-08-22). Homes below from `hermes_res/roadmap.md` v1.1, cross-checked against `doc_final/02-roadmap.md` and `inspire-phases.md`.

## Coverage matrix

| # | Item | Tier | Roadmap home | Cross-set agreement | Status check @ HEAD |
|---|---|---|---|---|---|
| 1 | FIFO/device read guard | 1 | W1 | all sets: phase 1 → W1 | OPEN ✓ (no Mode() check, tools.go:562) |
| 2 | Double-tap empty Enter | 1 | W1 | agree | OPEN |
| 3 | ESTOP sentinel | 1 | Deferred → P2 ESTOP-analog | chain: backlog drop → D11 drop → L7/ADR-008 revival at daemon layer | n/a (no dispatchers exist) |
| 4 | Approval quick-keys / enum | 1 | W1 (P3 prerequisite) | agree; 4–6h correction propagated everywhere | OPEN ✓ (`Approve … bool` tui.go:3073, delegate.go:103) |
| 5 | Never summarise user messages | 1 | W1 anchor | agree; "highest value-per-hour" everywhere | OPEN ✓ (compact.go:323 sends whole head) |
| 6 | `$EDITOR` composition + Windows fallback | 1 | W1 | agree | OPEN |
| 7 | Input history recall | 1 | W1 | agree | OPEN |
| 8 | Empty-response silent success | 1 | **W0′** (live bug) | agree; upgraded to live-bug by adversarial pass | OPEN ✓ (agent.go:237 `return history, nil`) |
| 9 | Inline shell interpolation | 1 | W1 | agree | OPEN |
| 10 | Multi-file skill layout | 1 | W2 first | agree (ADR-010 order) | OPEN ✓ (skills.Path single SKILL.md) |
| 11 | Provider transform layer | 2 | WP | R2 fix adopted by both final sets | OPEN ✓ (no llm/transform.go) |
| 12 | Skill threat guard + linter | 2 | W2 second | agree | OPEN ✓ (Parse = YAML only) |
| 13 | Hook deadlines fail-open/closed | 1 | W1 | agree | OPEN ✓ (bus.go Emit sync, no timeout/recover) |
| 14 | Retry hardening | 2 | **W0′** with rest of #8 | agree ("both layers together") | OPEN ✓ (llm/retry.go 62 lines; agent/retry.go) |
| 15 | Skill lifecycle pruner | 2 | W2 fourth | agree | OPEN |
| 16 | Session search (textrank, no SQLite) | 2 | W3 own branch | inspire-phases decoupled it; roadmap re-couples temporally — see 04-R2 | OPEN ✓ (Recall substring scan digest.go:114) |
| 17 | Argument/path completion | 2 | W1 (palette state machine first) | agree | OPEN |
| 18 | Skill audit ledger + rollback | 2 | W2 third | agree (ADR-010 order) | OPEN |
| 19 | Model selector UI (thinking levels done) | 2 | WP 0.5d | agree; correction verified | PARTIAL ✓ (thinking.go:18 landed; selector absent) |
| 20 | Paste collapse chips | 2 | W1 | doc_final caught omission; adopted v1.1 | OPEN |
| 21 | Active interrupt-and-redirect | 3 | W4 | agree; CoT-strip non-negotiable everywhere | OPEN |
| 22 | Programmatic tool calling | 3 | P3 | agree on transport; child language undecided — see 03/06 | OPEN ✓ (internal/rpc exists w/ tests) |
| 23 | Background reflection fork | 3 | W3 (after W2, invariant) | agree; Signals-gating resolved D4 | OPEN ✓ (Signals exists learn.go:37; Distill session-end only) |
| 24 | Post-edit diagnostics | 3 | W4 (compiler dry-run first) | D2 resolution consistent | OPEN |
| 25 | Git-snapshot undo | 3 | W4 via Environment snapshots | agree textually; coupling concern flagged (04-R6) | OPEN ✓ (UndoEntry per-file only; epoch.go is cache baselining, confirmed) |
| 26 | Live tool tree | 3 | W4 last | agree (no DOM accordion) | OPEN |
| 27 | Skill consolidation | 3 | W3 explicit command (W4 fallback mention) | agree; double-home note below | OPEN |
| 28 | Learning timeline view | 3 | W3/W4 boundary | same as #27 | OPEN |

## Results

- **Coverage: complete.** All 28 items have exactly one primary home. No orphans.
- **Double-homes:** #27/#28 appear in both W4 ("if not consumed by W3") and W3. The priority wording resolves ownership (W3 owns them), but a reader implementing W4 first could pull them forward — harmless but worth one clarifying sentence.
- **Estimate integrity:** carried estimates match the backlog rows I compared (8:3h, 14:1d, 19:0.5d, 22:2–3d…). No silent estimate inflation.
- **Correction propagation check:** all five adversarial corrections (22 Windows transport, 19 thinking-levels-done, 16 no-SQLite, 3 ESTOP defer, 4 enum blast radius) are consistently reflected in every later document that cites them.
- **Audit cross-references:** every logic-audit finding (§1.1–§4.3) is now merged and correctly marked LANDED by hermes_res; doc_final's stale claims are the ones RECONCILIATION lists, all confirmed wrong-as-claimed in my log.

## Items in the corpus *outside* the backlog numbering

These have no #N and therefore no roadmap home unless noted:
- Cache-stable prompt layering + CI byte-equality test (architecture §5.3) → implicitly W-somewhere; the roadmap never schedules the prompt-composition module explicitly. It's v2's flagship import — it deserves a named stage (recommendation: fold into W1 or its own small stage before P1).
- Incremental transcript flush N2 → assigned to P1 ✓ explicit.
- Frozen memory snapshot N1, verifier footer N4, compound apply_patch N5, compaction template N6 → architecture assigns subsystems but no wave names them (N5 is "optional" in W4). Acceptable, but the flagship §5.3 module is the one that shouldn't float unowned.
