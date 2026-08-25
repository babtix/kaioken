# DECISIONS — conflict resolutions and synthesis decisions (canonical)

Successor to `archive/hermes_dive/adr/DECISIONS.md`, which itself succeeded
`archive/docs/doc_final_opencode/03-decisions-log.md`. D1–D13 and N1–N11 are inherited
unchanged (none overturned by any of the three verification passes run against this corpus).
This file adds the decisions that resolve the seven open verdicts raised in
`archive/docs/v2/00-reconciliation.md` §9, plus the corrections carried into the ADRs.

## Inherited: D1–D13 (conflict resolutions, unchanged)

PTC child-process dual transport (D1, refined by V-3 below — see DV-3); post-edit diagnostics
in Phase 6 compiler-dry-run-first (D2); FIFO guard in Phase 1 (D3); reflection fork gated on
`Signals()` not counters (D4); curator 30/90 configurable (D5); no silent-overwrite evolution,
human review mandatory (D6); pure-Go session search (D7); ~~Go 1.24~~ **corrected — see
DV-Go-Version below, this entry was wrong** (D8); micro-compaction vs cache-warmth nuance
recorded (D9); UndoEntry authoritative, tree snapshots needed (D10); ESTOP dropped then
partially revived at daemon layer by L7 (D11); PI_KAIOKEN_ANALYSIS excluded as input (D12);
approval enum 4–6 h (D13).

## Inherited: N1–N11 (synthesis decisions, unchanged except where noted)

Frozen memory snapshot as code (N1); incremental transcript flush (N2, lands with P1); 2 KB
error cap (N3); mutation verifier footer (N4); compound apply_patch (N5); fixed compaction
template (N6); fork cancel ~2 s + whitelist sandbox (N7); turn leases deferred (N8); dynamic
cache-control tag placement (N9, **citation corrected** — see `adr/ADR-003`, was
`turn_context.py:42-48`, an import block; real source is `prompt_caching.py:385`); argument-
repair sanitisation (N10); documentation provenance rule (N11, **the rule this file itself
violated once already** — DECISIONS.md carried "Go 1.24" forward as D8 on the same day a
sibling audit proved it wrong, and it stayed wrong through one more generation of documents
after that. See DV-10 below for the mechanical fix.)

## DV — Decisions resolving the reconciliation's open verdicts

| # | Verdict resolved | Decision | Where |
|---|---|---|---|
| DV-1 | V-1, sequencing | The stopgap (`00-STOPGAP.md`) lands before any wave, not as part of Wave 2. Wave 2 remains the full, permanent foundation; the stopgap is the minimum patch that makes the gap between "plan says autonomy is gated" and "binary already writes skills unattended" not exist for the weeks Wave 2 takes to build. | `00-STOPGAP.md`, `adr/ADR-004`, `adr/ADR-010` |
| DV-2 | V-2, phantom tier | `epoch.go` is wired, not rebuilt (`adr/ADR-003`). `PruneStale` is wired as the curator's query layer, not reimplemented (`adr/ADR-004`, `adr/ADR-010`). `config.MaxSkills` gets an explicit call in the same task that wires the curator — either it becomes the pruner's cap or it is deleted; it does not stay a silently-ignored knob. `LearnPerTurn` (`config.go:230`) has no caller and no design intent behind it in this corpus — delete it in the same commit that touches `config.go` for the curator work, rather than carrying it forward. `internal/agent/tool_registry.go`'s `RegisterTool`/`UnregisterTool` are a working, wired seam (`registeredSchemas` is live at `tools.go:277`, `lookupRegistered` at `tools.go:386`) with no current registrants — no action needed; it is not phantom, it is unused capacity. | `ROADMAP.md` W1/W2 tasks |
| DV-3 | V-3, PTC child runtime | Superseded and closed: `kaioken`-as-child running generated Starlark via `go-starlark`, embedded, pure Go. Resolves the "D1 says child process, but never says what it runs" gap that survived three prior document generations unaddressed. | `adr/ADR-006` |
| DV-4 | V-4, what anchors what | `archive/hermes_dive/` supplies the skeleton (ADR structure, component map, subsystem breakdown) — it is the most current and most thoroughly cross-referenced of the eight prior documents. `archive/docs/doc_final_opencode/03-decisions-log.md`'s tabular decision-log format is preserved here rather than folded into narrative ADRs, because the tabular format made cross-document disputes (Go version, session format, baseline commit) auditable in a way narrative text did not. **Both predecessors' git baselines are discarded and re-derived** — every "current state" claim in every ADR in `adr/` was checked directly against source during this rewrite, not inherited from either predecessor's verification pass. `adr/ADR-003` and `adr/ADR-006` are the two that needed full rewrites, not patches — both are marked as such in their own files. | This document set |
| DV-5 | V-5, relationship to root `ROADMAP.md` | **Slots in, does not replace.** Root `ROADMAP.md` is a live 12-month plan (Aug 2026–Jul 2027, v1.3.1→v2.0) with a stated review-capacity budget (~1 substantial feature/week, solo vibe coding) and its own operating discipline (green build precondition, one package per session, characterization tests before refactors, release train every two weeks). None of the eight documents that fed this plan mention it. This plan's waves map onto `ROADMAP.md`'s quarters rather than running as a parallel, competing timeline — see `ROADMAP.md` §"Mapping onto the root roadmap" in this folder. The one deliberate override: the stopgap (DV-1) does not wait for its assigned quarter, because it closes a live gap rather than building a new capability on the root roadmap's stated cadence. | `ROADMAP.md` |
| DV-6 | V-6, session search | Confirmed: extends `internal/search` with a `KindSession`, not a new stack. See `adr/ADR-005`, `adr/ADR-009`. | `adr/ADR-005` |
| DV-7 | V-7, scope realism | Given the root roadmap's ~1 feature/week budget, this plan's waves carry an explicit **committed vs candidate** split in `ROADMAP.md` rather than a flat backlog. Only work mapped into the current and next root-roadmap quarter is committed; everything else is candidate, re-evaluated at the next quarterly checkpoint (root `ROADMAP.md` already runs this checkpoint ritual — this plan uses it rather than inventing a second one). | `ROADMAP.md` |
| DV-8 | (folds into DV-2/DV-3/DV-Go-Version) | The three specific `archive/hermes_dive/` corrections identified in `archive/docs/v2/01-addendum-dive-folders.md` V-8 are applied: ADR-003's false "(existing)" backstop claim removed and the real gap scheduled; ADR-003's Consequences rewritten against `epoch.go`; the Go version fixed everywhere in this document set. | `adr/ADR-003`, this file |
| DV-9 | V-9, dropped pi/opencode recommendations | Both adopted. **Hybrid token accounting** (~60 lines; anchor compaction triggers on provider-reported usage, estimate only the uncommitted tail) — into W0′/W1, cheap and correctness-adjacent. **Nested `AGENTS.md` lazy-load** — into W4, monorepo-convention visibility. If either is later rejected during implementation, record the rejection in this file rather than letting it silently re-drop, which is what happened to both between the Aug-1 deep dive and every backlog since. | `ROADMAP.md` W1, W4 |
| DV-Go-Version | Corrects D8 | **Go 1.26** ([go.mod:3](../cli/go.mod:3)), not 1.24. D8's original reasoning — "matches root AGENTS.md" — cited a stale line in a prose document over the authoritative `go.mod`. This was independently caught, then re-broken, across three successive document generations (`doc_final_opencode` D8 → `hermes_res` RECONCILIATION "CONFIRMED" → `.hermes_dive` DECISIONS.md carried it forward the same day a sibling audit proved it wrong). Fixed here; root `AGENTS.md:33` needs the same fix outside this plan. | This document, root `AGENTS.md` (out of scope for `cli/` work, flagged for separate correction) |
| DV-10 | Enforce N11 mechanically | N11's provenance rule was violated inside the very document that adopted it, twice, because it was an editorial norm, not a check. Recommendation for whenever this plan reaches tooling maturity: a lint step (or a `-check` mode on any planning doc, mirroring `status -check`'s CI drift gate) that fails if a document's cited baseline SHA is not an ancestor of the branch it is read against — the same instinct as `adr/ADR-003`'s CI byte-equality test, applied to documentation instead of prompts. Not scheduled as a wave task; recorded so it isn't lost again. | Process note, no code task yet |
