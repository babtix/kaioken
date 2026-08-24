# STOPGAP — land before any wave, before anything else in this plan

**This is not part of the roadmap. It is a precondition for the roadmap being safe to
execute at all.** Every other document in `.claude_dive/` assumes this lands first.

## The finding

Kaioken already writes model-generated skills to disk, unattended, with no approval, no
threat scan, no linter, no ledger, and no rollback.

`memory.Distill` ([learn.go:196](../cli/internal/memory/learn.go:196)) asks the model for a
skill body and writes it via `s.Save(repo)` at
[learn.go:269](../cli/internal/memory/learn.go:269). When it matches an existing skill it
overwrites the body in place. Three live call sites reach it:

- [tui.go:413](../cli/internal/tui/tui.go:413) and
  [tui.go:1914](../cli/internal/tui/tui.go:1914) — the TUI's session-end and `/learn` paths
- [handlers_chat.go:251](../cli/internal/daemon/handlers_chat.go:251) — the daemon's
  session-end path

Two ways to reach the unguarded write today:

1. **`memory.learn: 5`** or higher in config → automatic at every session end, no user
   action, gated only by `memory.Signals()` heuristics.
2. **`/learn` in the TUI** → passes `force=true`, which bypasses *both* the signal gate and
   the config threshold. **This works at default settings, right now.**

Every ADR in this set (`adr/ADR-004`, `adr/ADR-010`) — and both predecessor plans this set
was built from — treats gated autonomy as a **future capability**, sequenced behind a safety
foundation (skill directory contract → threat guard → linter → ledger → pruner). That
sequencing is correct. The premise that autonomy is not yet live is not. Building the safety
foundation on the roadmap's normal cadence (Wave 2, weeks out) leaves the unguarded path
reachable in the meantime.

## The fix

One change, landing before Wave 2 even starts, before the correctness track, before
anything:

**Gate the existing write path, not a new one.** In `memory.Distill` (or its caller,
`LearnSession`), require an explicit opt-in before `s.Save(repo)` executes:

- Default: the write is **skipped**, not silently dropped — log/surface that a skill
  proposal was generated and held (this is most of what the review-queue mechanism in
  ADR-004 needs anyway; building it here is not wasted work, it is Wave 2 pulled forward by
  one component).
- `force=true` (`/learn`) still generates the proposal but **no longer bypasses the gate** —
  it should request confirmation before writing, not skip confirmation entirely. If `/learn`
  is meant to be an explicit trust signal from the user, say so in the UI copy; do not let it
  double as a scan bypass.
- `memory.learn` threshold config continues to control whether the *signal* fires; it must
  never again be the sole gate on a *write*.

This is a small patch — the gate is one `if` before one `Save` call, plus a held-proposal
surface that Wave 2's review queue will eventually own properly. It is not a substitute for
Wave 2 (`adr/ADR-010`'s threat guard, linter, ledger, pruner still need to land in full) — it
is the difference between "unattended writes exist for N weeks while the real foundation is
built" and "unattended writes never existed in v2 at all."

## Gate

- Test: `Distill` with the gate unset produces a held proposal, zero disk writes to
  `skills/`.
- Test: `/learn` with the gate unset produces a held proposal, not a write — confirm the
  existing `force=true` fast-path in `learn.go` no longer reaches `Save` unconditionally.
- Manual: at default config (`memory.learn` unset), a full session that would previously have
  triggered `Distill` now produces no skill-directory mutation.

## Traceability

Raised in `docs/v2/00-reconciliation.md` (main reconciliation report, superseded by this
set — see `archive/docs/v2/`), §1, as the finding that reorders the plan. Confirmed
independently by direct source read; not found by any of the eight prior planning documents
in `archive/`.
