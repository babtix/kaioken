# Kaioken v2 — Decisions Log & Rejected Ideas

> Every documented conflict between the research sources is resolved here with
> a rationale, so the architecture in [01-architecture.md](01-architecture.md)
> and the plan in [02-roadmap.md](02-roadmap.md) contain no unresolved
> contradictions. Sources are cited by file.

## A. Conflicts resolved

| # | Conflict | Sources | Decision | Rationale |
|---|---|---|---|---|
| D1 | **Programmatic tool calling architecture**: embedded Starlark/WASM sandbox vs Hermes-style child process + IPC | `doc_agy/hermes-in-depth` suggests Starlark/WASM; `doc_agy/ai-coding-agent` and `source-verification-report` blueprint subprocess (`exec_code.go`) | **Child process with dual transport** — AF_UNIX on POSIX, loopback TCP ephemeral-port on Windows; child gets the tool surface, not the filesystem; aggressive env scrubbing | Verification proved the "disabled on Windows" claim was a stale docstring (`code_execution_tool.py:1357` sets `_use_tcp_rpc = _IS_WINDOWS`). Dual transport maps directly onto Go's `net.Listen`; reuses `internal/rpc`; keeps sandboxing honest (process boundary > embedded interpreter sharing our memory). |
| D2 | **Post-edit diagnostics priority**: P1 vs Phase 6 | `hermes-in-depth` ranks P1; `ai-coding-agent` + verification place item 24 at 3–4d in Phase 6 | **Phase 6 (S7)**, but implemented compiler-dry-run-first (`go vet`, `tsc --noEmit`) with gopls later | Full LSP manager is nearly a project; dry-run diagnostics capture most of the value at a fraction of cost (`inspire-phases.md` item 24 note agrees). Not pulled into S1 because S1's items are all ≤1d correctness fixes with different risk profiles. |
| D3 | **FIFO/device read-guard priority**: P2 vs Phase 1 | `hermes-in-depth` says P2; backlog item 1 + audit say Phase 1, 1–2h | **Phase 1 (S1)** | Trivial diff removing a hang class of failure; nothing justifies deferring it. |
| D4 | **Skill-autonomy trigger**: ≥5 tool calls vs 3 successful repetitions vs 10-iteration nudge counter | reserch files disagree ([BA]/[GLM] ≥5 calls; [DRR] flags 3-reps as its own assumption; [ARCH] 10-iteration fork nudge) | **Gate the reflection fork on existing `memory.Signals()` heuristics** (error recovery, user corrections); counters demoted to ceiling fallbacks | Backlog item 23 already specifies this and it is strictly better evidence than any raw count: corrections are what make durable lessons worth persisting. Also resolves the [DRR]-flagged conflict by not choosing between counts at all. |
| D5 | **Curator day thresholds**: stale/archive 30/90d vs 14/30d examples | [BA]/[GLM] 30/90; [ARCH] 14/30 as configurable examples | **Defaults 30/90, configurable** | Matches backlog item 15's stated transitions; the 14/30 numbers were explicitly example values in [ARCH]. |
| D6 | **How optimized learned artifacts reach production**: silent overwrite vs human-approved PRs | [ARCH] diagram shows direct overwrite; [BA]/[GLM]: never modifies main codebase directly, mandatory human review | **For v2: no evolutionary outer loop at all.** Autonomous skill writes are threat-scanned, ledgered, patch-based, optionally human-approved (`skills.write_approval`); promotion evidence = clean scan + usage reinforcement, never self-judged success | The "self-congratulation problem" ([BA]) is the strongest documented failure mode in the entire corpus. GEPA-style optimization needs an eval suite Kaioken doesn't have; adopting the gates without the optimizer gets the safety at none of the risk. |
| D7 | **Session-search storage**: SQLite FTS5 (as Hermes does) vs pure Go | original item said FTS5; adversarial pass corrected it | **Pure-Go BM25 on `internal/textrank` + JSON index** | `mattn/go-sqlite3` breaks `CGO_ENABLED=0`; `modernc.org/sqlite` drags a large transpiled tree. T4 is a hard constraint. |
| D8 | **Go version**: verification report header "1.26" vs everywhere else 1.24 | `source-verification-report` vs workspace AGENTS.md/go.mod era docs | **Go 1.24** | Single outlier; matches the actual toolchain. |
| D9 | **Hermes caching portrayal**: cache-thrashing (micro-compaction each turn) vs cache-warmth engineering (~26% cheaper review forks) | `hermes-in-depth` vs `hermes-self-improvement` | Both true, scope-dependent: main loop micro-compacts (rejected for Kaioken), background review fork inherits byte-exact prefixes (adopted as principle for our reflection fork) | Recorded so nobody "simplifies" T2 based on half the evidence. |
| D10 | **Kaioken rollback today**: "working-tree diffs/git drafts" vs per-file UndoEntry only | `opencode-in-depth` matrix vs verification item 25 | **Per-file UndoEntry is authoritative** (write/edit paths only, blind to `run_command`) — which is exactly why git-tree snapshots (item 25) are needed | Verification did the byte-level check. |
| D11 | **ESTOP sentinel** | originally phase-1 item 3 | **Dropped** (already decided in backlog; carried here so it isn't resurrected) | Hermes' contract is "in-flight work NEVER killed"; it pauses dispatchers Kaioken doesn't have; a stat in the inner loop duplicates `ctx.Done()`. Revisit only if cron/background delegation (unscheduled list) lands. |
| D12 | **PI_KAIOKEN_ANALYSIS.md gap table** | `logic-audit-and-phases.md`: "stale, do not use as input" | Excluded as input; its still-open residues adjudicated individually in roadmap §Unscheduled | Eight of ten Aug-1 recommendations since implemented; the doc predates major landings. |
| D13 | **Approval quick-keys effort**: 2–4h vs 4–6h | backlog correction | **4–6h** — `Approve bool` → enum touches every `agent.UI` implementor | Verified against `tui.go:3073`, `delegate.go:103`. |

## B. Decisions introduced by this synthesis (NEW)

| # | Decision | Source inspiration |
|---|---|---|
| N1 | Frozen-memory-snapshot semantics become code-level rules in `context.go` (memory enters prompt only at session start), not conventions | doc_open ranking #6; Hermes `prompt_caching.py` rationale |
| N2 | Crash-safe incremental transcript flush during the turn (currently after-turn only) | doc_open ranking #2; Hermes SessionDB per-turn appends |
| N3 | Model-facing tool-error bodies capped ~2 KB at dispatch boundary | Hermes 2,048-char cap (doc_her) |
| N4 | File-mutation verifier footer when some writes failed unsuperseded this turn | Hermes advisory footer (doc_agy survey) |
| N5 | Compound multi-file `apply_patch` complements (not replaces) `edit_file` | opencode apply_patch (doc_agy) |
| N6 | Compaction summary uses opencode's fixed template with cumulative reconciliation; expect small-model mis-following and retune if compaction is ever driven by a cheap model | opencode compaction + their DeepSeek retune commit (backlog notes) |
| N7 | Reflection-fork cancel window ~2 s; whitelist sandbox = `memory` + skill-mutation tools only | Hermes review-worker machinery (reserch [ARCH], backlog item 23) |
| N8 | Turn leases deferred (see roadmap Unscheduled) until desktop sidecar shares sessions | doc_open ranking #1 |

## C. Explicitly rejected

Carried forward from `inspire-backlog.md` "Deliberately not recommended",
plus new entries:

- **Continuous micro-compaction** — invalidates the prompt cache every turn,
  adds 2–35 s auxiliary latency; prune-then-compact wins.
- **Effect-TS-style monadic service graphs** — idiomatic-Go killer; steep
  friction documented in `opencode-in-depth`.
- **SQLite/FTS5 anywhere** — breaks `CGO_ENABLED=0` single-binary story (T4).
- **Honcho dialectic user modeling** — remote SaaS, OAuth device flows;
  wrong shape for local-first.
- **Fast-echo stdout bypass / Yoga flexbox / Nano Stores** — React-latency
  workarounds that would corrupt Bubble Tea's buffer or duplicate the Elm loop.
- **Recursive Pydantic-style sanitisers** — moot with Go struct tags.
- **opencode part-based message model; per-model prompt *files*; 30+ provider
  ports** — cost without payoff at Kaioken's scale.
- **GEPA/DSPy evolutionary prompt/skill optimizer** — deferred with D6; no eval
  harness exists to gate it.
- **Lean-formal-verification interleaving, Ralph goal loops** — fascinating
  research ([BA]); incompatible with "no unattended loops" until S5/S6 trust
  machinery is proven.
- **Collapsible DOM-style accordion for the live tool tree** — adopt visual
  structure + metrics only (item 26 note).
- **React/Ink-over-Node-IPC UI layering** — Bubble Tea same-process model is a
  measured advantage, not a stylistic one.

## D. Reconciliation with the parallel proposal (`hermes_res/`)

The same task was given to a second architect; its output
(`hermes_res/kaioken-v2-architecture.md` + 10 ADRs + roadmap) recorded eight
scoping decisions locked in planning Q&A with the operator. Those locks are
**adopted as authoritative operator intent**; its ADR numbering (ADR-001…010)
is cross-referenced rather than duplicated here.

### Adopted operator locks (its §1.2 → our L1–L8)

| Lock | Decision | Effect on this doc set |
|---|---|---|
| L1 | Evolve `cli/` in place, no rewrite | Matches T7/ADR-001; nothing changes |
| L2 | Full platform trajectory | Architecture §3/§11 reshaped around it |
| L3 | Gated autonomy — machinery complete, switch OFF | §10 gate mechanics made concrete (`skills.autonomous_writes`, review queue) |
| L4 | Three context doctrines clarified then composed | §6 rewritten to the composed order + CI byte-equality enforcement |
| L5 | Daemon-as-hub topology | NEW §11; component map restructured |
| L6 | Unified knowledge layer (wiki+skills+memory+sessions) | §9 upgraded from "related subsystems" to one layer w/ shared metadata/lifecycle/trust/ledger |
| L7 | In-scope: PTC sandbox, execution environments, cron-in-daemon; out: gateway adapters | NEW §5.2 (Environment interface + Docker); P2 cron stage added; `PlatformAdapter` interface-only |
| L8 | Deliverable = master doc + ADRs + roadmap | This set + cross-links to hermes_res |

### Corrections applied to `hermes_res`

| # | Its claim | Reality | Evidence |
|---|---|---|---|
| R1 | "Sessions: JSONL transcripts (pi-style trees considered, **linear chosen** for simplicity)" (§6) | Sessions are already **tree-structured**: v2 JSONL format with `ParentID`/`ForkedAt` lineage, `Entries`+`Leaf`, maintained by `syncTree`; fork support exists | `cli/internal/session/session.go:51-65`, `tree.go`, `fork.go` (+tests) |
| R2 | Provider transform layer (#11) unplaced in its waves | Placed explicitly as stage **WP**, sequenced before W4 so PTC stubs emit transformed schemas | backlog item 11 (1–2d, independent) |

### Superseded decisions in this log

- **D11 (ESTOP dropped)** — partially superseded by lock L7/ADR-008: an ESTOP
  *analog* now gates NEW dispatches at the daemon layer only (P2). The inner-
  loop stat remains rejected; in-flight work is still never killed.
- **Roadmap "Unscheduled: cron"** — superseded; cron-in-daemon is now stage P2.
  Dedicated-session delivery semantics retained from doc_open ranking #5.

### Kept different (both valid)

- **Format:** this set keeps a tabular conflict log; hermes_res uses narrative
  ADRs. Cross-referenced, not merged — use either entry point.
- **Session-search placement:** ours W3-on-own-branch ≡ theirs Wave 3 note;
  identical after reconciliation.
- **Unique content preserved on our side:** conflict table D1–D13 with source
  citations; NEW decisions N1–N8 (frozen-snapshot-as-code, incremental turn
  flush, 2 KB error cap, verifier footer, compound apply_patch, compaction
  template, lease deferral); residual pi-roadmap adjudication; per-stage gates
  carried into the wave plan. Unique on theirs: daemon-as-hub detail,
  execution-environment taxonomy, request-ID PTC protocol lesson, aux-model
  cost visibility — all incorporated above.

## E. Traceability

Every numbered item in [02-roadmap.md](02-roadmap.md) maps 1:1 to a verified
row in `docs/inspire-backlog.md` or a section of
`docs/logic-audit-and-phases.md`. Nothing in this folder introduces work items
that were not verified against source by the adversarial pass described in
`docs/inspire-backlog.md` §Verification (433/511 quotes mechanically confirmed;
one real attribution error found and fixed there).
