# AUDIT — verification record behind the canonical set

**Date:** 2026-08-24 · **Baseline:** `master @ bd740fe`, `cli/` byte-identical to `7be48f2`
and `36dfcaf`.

## 1. Method, and why it differs from every predecessor

Nine planning documents preceded this set. Each verified its **sources** — the vendored
reference agents in `inspire/` — meticulously, and its **target** — `cli/` — barely. The
citation record makes the pattern unmistakable:

| Set | Citations into `inspire/` | Citations into `cli/` |
|---|---|---|
| `doc_open` | 18 of 18 exact | **zero line numbers**; its own appendix admits it checked `AGENTS.md`, not source |
| `doc_her` | 17 of 18 exact | under-reports capability precisely where under-reporting generates a proposal |
| `doc_agy` | ~93% line accuracy across 40+ checks | 2 fabricated Go blocks, 2 fabricated Python blocks, a cited file that does not exist |
| `doc_final_opencode` | 9 of 9 exact | baseline 5 commits stale; wrong baseline commit; 4 merged branches called open |
| `hermes_res` | exact | verified against **`git log`, not source** |
| `hermes_dive` | inherited | **grep-audited documents against documents** (its own §4) |
| `opencode_dive` | exact | ~40 real source checks — the one predecessor that broke the pattern |

`hermes_dive/AUDIT.md` §2 states it re-checked *"every anchor cited by either predecessor's
roadmap."* That method can only re-confirm what was already cited; it cannot discover code
nobody pointed at. Its §3 therefore concluded *"Residual disagreements between the two sets:
none found"* — but two documents sharing a blind spot agreeing with each other is not
verification.

**This set's method:** five parallel per-folder audits, each required to open the cited file
rather than grep it, producing ~190 individually-verdicted proposals; **plus an independent
sweep of the codebase that started from the code, not from any document's claims.** That sweep
is what found the phantom tier, and it is the only reason §3 below exists.

## 2. Ground truth

| Check | Result |
|---|---|
| `master` HEAD | `bd740fe` — version strings only, no code delta |
| Baseline drift | `git diff 7be48f2..36dfcaf` = docs only. `cli/` identical across all three |
| Open branches | **None.** All four logic-audit phase branches merged 2026-08-22 |
| Go toolchain | **1.26** (`cli/go.mod:3`). There is no root `go.mod` |
| Scale | 421 Go files, ~95k LOC incl. tests, 47 internal packages |
| Largest packages | agent 10.9k · daemon 10.1k · research 9.7k · tui 9.3k · prism 5.4k |
| Smallest package the plan expands 4× | **`internal/skills` — 901 LOC, 3 files** |
| Sessions | JSONL **trees** — `session.go:51-65`, `tree.go`, `fork.go`, with tests |
| Retrieval unification | **1 of 3 done.** `internal/retrieval` exists; PRISM is its only importer; `search` still on raw `textrank`; `research` a wholly separate third stack |

## 3. Findings no predecessor had

Each was found by reading code that no planning document cited, and each was re-verified
directly before being written into an ADR.

**3.1 · Autonomous skill authoring already ships, unguarded.** `memory.Distill` writes
model-generated skill bodies to disk at [learn.go:269](../cli/internal/memory/learn.go:269) —
no approval, scan, linter, ledger or rollback; overwriting in place on a match. Three live call
sites. `/learn` passes `force=true`, bypassing both the signal gate and the config threshold, at
default settings. **This inverts the W2 ordering in every predecessor plan** — W2 is remediation
behind a shipped capability, not a gate in front of a future one. → `00-STOPGAP.md`, DV-1.

**3.2 · The phantom tier.** 11 of 273 exported top-level functions have zero non-test callers.
They cluster into whole subsystems that are written, sometimes tested, sometimes exposed in
config, and never invoked:

- **`agent/epoch.go` + `InitializeEpoch`** — `ContextEpoch`, per-source sha256 snapshots,
  `Reconcile()`, `BuildMidConversationMessage()`. Zero callers, **zero tests**. This is ~65% of
  the "flagship import" that ADR-003 proposed building from scratch in *both* predecessor
  architectures. → ADR-003 rewritten, DV-2.
- **`memory.PruneStale`** — the lifecycle pruner of backlog item #15, already implementing
  never-hard-delete and human-exempt staleness. Called only by its own tests. → W2 wires it.
- **`config.MaxSkills`** — a documented YAML knob **nothing reads**.
- **`config.LearnPerTurn`** — no caller, no design intent in the corpus. → delete.
- **`agent.AsideBody`** — tests only; root `ROADMAP.md` M1 already names it as in-flight work.
- *Not* phantom: `RegisterTool`/`UnregisterTool` are a **live seam** (`registeredSchemas` at
  `tools.go:277`, `lookupRegistered` at `:386`) with no registrants. No action.

**3.3 · ADR-003's backstop does not exist.** Step 5 claimed "overflow replay handling
(existing)". [agent.go:159-163](../cli/internal/agent/agent.go:159) says the opposite, as the
*design rationale* the ADR borrowed for doctrine 1. Marked "(existing)", so no wave scheduled
it — a real gap hidden by a false claim of completeness. → ADR-003 §"What changed".

**3.4 · N9 rests on a fabricated citation and is largely stale.** The predecessor cited
`turn_context.py:42-48`. Verified: that range is an **import block**, and `cache_plan` appears
**0 times** in the file; the real function is `prompt_caching.py:385`. The error originated in
`doc_agy` (flagged there as F-4) and was inherited unchecked. Substance also largely ships —
[anthropic.go:73](../cli/internal/llm/anthropic.go:73)/`:86` already emit ephemeral
cache-control at the two boundaries N9 names. → ADR-003 N9 note, WP-b re-scoped to ~2 h.

**3.5 · Four more live defects, in no predecessor backlog.**

| Defect | Evidence | Home |
|---|---|---|
| Failed sessions reinforce as successes — `clean=true` hardcoded while the comment above says "for a clean session" | [session.go:41](../cli/internal/memory/session.go:41) | W2-e |
| `ApplyReminders` rewrites every historical user message, breaking marked cache bytes | [reminders.go:95-103](../cli/internal/agent/reminders.go:95) | W1-l |
| Aux-model spend escapes the budget **hard stop**, not merely the display | `Budget.Check` vs `routedClient("compact")` (`compact.go:304`) | W1-m |
| TUI still runs a duplicate compaction ladder ahead of `Run` — audit §1.1 landed the agent half only | [tui.go:1278-1296](../cli/internal/tui/tui.go:1278) | W1-n |
| Non-streaming path parses `FinishReason` and never reads it; reachable via `Agent.NoStream` | `openrouter.go:700-713` | W0′-c |

**3.6 · ~20 proposed items are already built.** Roughly a full wave of re-proposed work,
including the searchable model selector the predecessor roadmap budgeted 0.5 d for. Full table
with evidence: `ROADMAP.md` §4.

**3.7 · The Go version, three generations deep.** `doc_final_opencode` D8 "corrected" 1.26 →
1.24 citing stale `AGENTS.md` prose over `go.mod`; `hermes_res` RECONCILIATION stamped it
CONFIRMED; `hermes_dive/DECISIONS.md` carried it forward **on the same day** its sibling
`opencode_dive` proved it wrong; `antigravity_dive` then asserted it "matches root go.mod",
which does not exist. → DV-Go-Version.

## 4. What `opencode_dive` contributed, and is credited for

It broke the document-against-document pattern and reached §3.7 independently. Four of its
findings are adopted rather than re-derived:

1. **The PTC child-runtime hole** — ADR-006 fixed transport and trust but never named what the
   child *runs*. Its recommendation (spawn `kaioken` itself, generated Starlark, embedded
   pure-Go interpreter) is adopted wholesale. → ADR-006 rewritten, DV-3.
2. **The snapshot-concept collision** — runtime state vs repo state conflated in ADR-007.
   → ADR-007 correction.
3. **P1's untestable gate** — it required a desktop sidecar that is plan-only. → ADR-002
   re-scopes to a headless client.
4. **Two silently dropped recommendations** — hybrid token accounting and nested `AGENTS.md`
   lazy-load, with no backlog row since the Aug-1 dive. → DV-9, W1-o and W4.

## 5. What this audit did not verify

- **Root-roadmap territory this corpus never touched:** M2 distribution (goreleaser, cosign,
  installers), M5 tree-sitter codemap, M10–M12 reach, and the **license decision due March
  2027**. Absent from all nine documents; flagged in `ROADMAP.md` §2, not resolved here.
- **`desktop/`, `website/`, `registry-web/`** — out of scope; `cli/` only.
- **The four external research papers** cited secondhand by predecessors; not present in-repo.
- **Hermes internals beyond spot checks** — `doc_her` and `doc_open` verified 17/18 and 18/18
  respectively; their mutual consistency is taken as sufficient.
- **Effort estimates** are inherited, not re-derived, except where a finding changed the scope
  (W1-d shrinks — the ruleset engine exists; W1-k shrinks — `epoch.go` exists; WP-b shrinks to
  ~2 h; the model selector drops to zero).
