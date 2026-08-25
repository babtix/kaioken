# Kaioken v2 — reconciliation of the five design folders

Written 2026-08-23 on `docs/inspire-analysis`. Baseline: `master` @ `36dfcaf`.

**What this is.** `docs/` contains five independently-produced Kaioken v2 design folders —
`hermes_res/`, `doc_agy/`, `doc_final_opencode/`, `doc_her/`, `doc_open/` — written by
different agents from the same three vendored references (`inspire/hermes-agent`,
`inspire/opencode`, `inspire/pi`). They overlap, contradict each other, and contradict the
code. This document reconciles them into one set of verdicts.

**Method.** Five parallel audits, one per folder, each instructed to extract every proposal
and verify it by *opening the cited Go file*, not by grepping. ~190 proposals were extracted
and individually verdicted CONFIRMED / STALE / FALSE / PARTIAL. On top of that I ran an
independent sweep of the codebase and personally re-verified every finding that changes the
plan. Claims below marked **[v]** I checked myself; the rest carry their audit's citation.

**This report deliberately produces no architecture.** It establishes what is true. The
architecture and phase plan follow once the verdicts in §9 are approved.

> **See also [`01-addendum-dive-folders.md`](01-addendum-dive-folders.md).** Three further
> folders exist at repo root — `.hermes_dive/` (which declares itself canonical and supersedes
> `hermes_res/` + `doc_final_opencode/`), `.opencode_dive/`, and `.antigravity_dive/`. The
> addendum checks this report against that newer generation: §1, §4 and §7 below survive
> intact and are still unique, three items in §3 are closed upstream, and V-3 gains a better
> answer. Read the addendum before acting on §9.

---

## 1. The finding that reorders everything

**Kaioken already writes skills autonomously, with no guard of any kind.** **[v]**

`memory.Distill` ([learn.go:196](../../cli/internal/memory/learn.go:196)) asks the model for a
skill body and writes it to disk at [learn.go:269](../../cli/internal/memory/learn.go:269) via
`s.Save(repo)`. There is no approval prompt, no threat scan, no linter, no ledger entry and no
rollback record. When it matches an existing skill it overwrites the body in place.

It is wired live from three call sites — [tui.go:413](../../cli/internal/tui/tui.go:413),
[tui.go:1914](../../cli/internal/tui/tui.go:1914), and
[handlers_chat.go:251](../../cli/internal/daemon/handlers_chat.go:251) — and gated only by:

```go
func (c *Config) LearnAtSessionEnd() bool { return !c.Memory.Disable && c.LearnThreshold() >= 5 }
```

Two paths reach the write today:

- **`memory.learn: 5`** in config — automatic, at every session end, no user action.
- **`/learn` in the TUI** — passes `force=true`, which bypasses *both* the `Signals()` gate and
  the config gate. **This works at default settings, right now.**

Every one of the five folders builds its plan on the opposite premise. `hermes_res` ADR-010
and `doc_final_opencode` T4/W2 both state a hard ordering invariant — *skill directory
contract → threat guard → linter → ledger → pruner, all before any feature that writes
skills, no exceptions, no reordering*. `doc_final_opencode` §10 says outright "the gate is a
policy point, not missing machinery."

The ordering discipline is right. The premise is wrong. **W2 is not a gate standing in front
of a future capability — it is remediation standing behind a shipped one.** That inverts its
position in both roadmaps: it is not phase 4 of 6, it is the thing that should land first,
and the one-line stopgap (refuse the unreviewed write path until the guard exists) should
land before anything else at all.

Only one of the five audits found this. No folder did.

---

## 2. Trust calibration

Every folder shares one failure mode: **they read the reference agents carefully and the
target codebase carelessly.** Citations into `inspire/` are near-flawless across all five.
Citations into `cli/` are where the errors live — and every error points the same direction,
inflating Kaioken's gaps and therefore its effort estimates.

| Folder | Reference citations | Kaioken claims | Keep |
|---|---|---|---|
| `hermes_res/` | Exact. `code_execution_tool.py:27/:53-56/:1357` all correct to the line; `gateway/run.py` = 31,299 lines ✔ | Verified against **`git log`, not source** — its 8 commit hashes all resolve, but it misses everything a commit log can't show | Structure, ADR-009 verbatim, ADR-010's ordering invariant, the git-verified baseline |
| `doc_final_opencode/` | **9 of 9 exact**, including into a 31k-line file | Baseline 5 commits stale; names `4073e44` (a desktop-tabs commit) as the audit-phase merge; calls 4 merged branches "open" | **`03-decisions-log.md`** — the single most reusable artifact in all five folders |
| `doc_agy/` | Best index in the repo, ~93% line accuracy across 40+ checks | 2 fabricated Go blocks, 2 fabricated Python blocks, a cited file that doesn't exist (`agent/bound.go`), wrong spill path in every particular, Go version wrong in 7 places | Its `inspire/` citation index; 4 original safety ideas (§7 below) |
| `doc_her/` | 17 of 18 verified, several verbatim to the docstring | Under-reports capability *exactly where under-reporting generates a proposal* | The `ApplyReminders` cache defect it found by accident |
| `doc_open/` | **18 of 18 exact** | **Zero line numbers on the Kaioken half**; its own appendix admits it checked `AGENTS.md`, not source | The Footprint Ladder as a governance rule; "ledger is telemetry, not a gate" |

**On `doc_agy/source-verification-report.md`** — the folder that claims to be the verifier.
Its `inspire/` line references are the most reliable artifact in this repo. But it proves
absence by opening *one* file per item and never widening the search, which produced three
false gaps and one inflated estimate. Its own file manifest shows it never opened
`permission.go`, `internal/verify`, or the `tui.go` ranges containing the model picker. Its
closing verdict — *"EXCEPTIONALLY SOUND AND FULLY VERIFIED / No Platform Blockers / Proceed
directly with Phase 1"* — is not supported by its own method. Score: **7.5/10 as a citation
index, unusable as a gap analysis.** If the other folders trusted it, they inherited four
false gaps from it.

---

## 3. Already built — delete from every backlog

Work proposed by one or more folders that is **already in the tree**. This is roughly a full
wave of re-proposed work.

| # | Proposed as new | Actually at | Proposed by |
|---|---|---|---|
| 1 | `finish_reason == length` mid-tool-call guard | [stream.go:281-289](../../cli/internal/llm/stream.go:281), with the same rationale in comments | hermes_res, doc_final_opencode *(tagged `[NEW]`)*, doc_agy |
| 2 | Searchable model selector (0.5d) | [tui.go:325-328](../../cli/internal/tui/tui.go:325) `SetFilteringEnabled(true)`; `setModel` already persists as default | all three large folders + backlog item 19 |
| 3 | Wiki staleness in `knowledgeSummary` / `read_knowledge` | [knowledge.go:200-202](../../cli/internal/agent/knowledge.go:200) and `:230-232`, with tests | hermes_res, doc_final_opencode |
| 4 | Memory dedup before append | [memory.go:182-215](../../cli/internal/memory/memory.go:182) — `isDuplicateFact`, jaccard ≥ 0.8, no embedding call | doc_final_opencode |
| 5 | PRISM memo-cache singleflight | [retrieve.go:248](../../cli/internal/prism/retrieve.go:248), commit `965b4ca` | doc_final_opencode |
| 6 | `BeforeProviderRequest` hook | [events/types.go:36](../../cli/internal/agent/events/types.go:36), emitted [agent.go:186-189](../../cli/internal/agent/agent.go:186), tested | doc_final_opencode *(tagged `[OPEN]`)* |
| 7 | `chatWithRetry` | [retry.go:63](../../cli/internal/agent/retry.go:63) | doc_final_opencode *(tagged `[OPEN]`)* |
| 8 | Deterministic pre-call prune | [prune.go](../../cli/internal/agent/prune.go), driven from [compact.go:288](../../cli/internal/agent/compact.go:288) | doc_final_opencode |
| 9 | Chained (not stacked) summaries | [compact.go:378-380](../../cli/internal/agent/compact.go:378) already folds the prior summary in | hermes_res, doc_final_opencode |
| 10 | Daemon handler partitioning "from day one" | Already 13 `handlers_*.go` files | hermes_res, doc_final_opencode |
| 11 | `.gitattributes`, `-race` in CI | `d76d6c8`, `b8c578a` | doc_final_opencode (its whole W0) |
| 12 | Four audit-phase branches "open" | All merged: `a651bea`, `ae6a808`, `a867302`, `aa5e865` **[v]** | doc_final_opencode |
| 13 | Skills as per-skill directories | [skills.go:75-77](../../cli/internal/skills/skills.go:75) — `Dir(repo)/name/SKILL.md` already | hermes_res, doc_final_opencode, doc_agy |
| 14 | AllowSession / AllowAlways *mechanism* (est. 4–6h) | [permission.go:41-108](../../cli/internal/agent/permission.go:41) — `Rule`, `Ruleset.Evaluate`, consulted at `tools.go:1085`. Only the keybinding and config persistence are missing | doc_agy (none of the folders opened `permission.go`) |
| 15 | Hook deadlines | [ext/hooks.go:33](../../cli/internal/ext/hooks.go:33) — 5s timeout, fail-open, for the tier that runs untrusted code | doc_agy, hermes_res |
| 16 | Bounded tool output / 2 KB error cap | [tool_store.go:31-33](../../cli/internal/agent/tool_store.go:31) — 1500 lines / 64 KB, direction-aware, spills to `.kaioken/tool-output/` | doc_her |
| 17 | Build/test command detection for diagnostics | `internal/verify` `Detect`/`Gate`, wired at `tui.go:2179` | doc_agy (scoped as greenfield) |
| 18 | Extract `internal/retrieval` | Done in `444981f` — **step 1 of 3** **[v]** | hermes_res, doc_final_opencode (both present all three steps as pending) |
| 19 | Retain partial prose on interrupt | [tui.go:860-877](../../cli/internal/tui/tui.go:860) `stopCurrent` → `flushLive` | doc_agy |
| 20 | Sessions are linear / should stay linear | **False.** Sessions are already trees: [session.go:51-65](../../cli/internal/session/session.go:51) `ParentID`/`ForkedAt`, plus `tree.go`, `fork.go` | `hermes_res` §6 asserts "linear chosen"; correctly caught by `doc_final_opencode` R1 |

Item 20 is the dangerous one: adopting `hermes_res` uncritically would encode a "linear
sessions" decision that justifies deleting shipping `tree.go`/`fork.go` code.

---

## 4. Built but unwired — the phantom tier

My own sweep: **11 of 273 exported top-level functions have zero non-test callers.** **[v]**
They cluster into whole subsystems that are written, sometimes tested, sometimes exposed in
config — and never invoked.

| Subsystem | Where | State |
|---|---|---|
| **Context epoch / cache-stable prompting** | [epoch.go](../../cli/internal/agent/epoch.go) + [context.go:88](../../cli/internal/agent/context.go:88) — `ContextEpoch`, `InitializeEpoch`, `Reconcile`, `BuildMidConversationMessage` | **Zero callers, zero tests.** Sha256 per-source snapshots; emits `<system_context_update>` instead of mutating the cached prefix |
| **Skill lifecycle pruner** | [reinforce.go:127](../../cli/internal/memory/reinforce.go:127) `PruneStale` | Called only by its own tests. Already honours a never-hard-delete invariant and exempts `OriginHuman` |
| **Skill cap** | [config.go:212](../../cli/internal/config/config.go:212) `MaxSkills` | A documented YAML knob that **nothing reads** |
| **Per-turn learning** | [config.go:230](../../cli/internal/config/config.go:230) `LearnPerTurn` | No caller |
| **Aside channel** | [aside.go:40](../../cli/internal/agent/aside.go:40) `AsideBody` | Tests only. `ROADMAP.md` M1 already names this as in-flight work to land |
| Runtime tool registry | [tool_registry.go:44](../../cli/internal/agent/tool_registry.go:44) `RegisterTool`/`UnregisterTool` | **Not dead** — `lookupRegistered` and `registeredSchemas` are live at `tools.go:386` and `:277`. A working seam with no registrants |
| Minor | `hub.ValidatePath`, `prism.BuildContext`, `scan.LoadFlags`, `agent.NewRuleset`, `reportpdf.WriteSaved` | No production callers |

**Why this dominates the architecture question.** The single largest item in both competing
architectures — `hermes_res` ADR-003 and `doc_final_opencode` FOC-18, each calling
cache-stable layered prompting "the flagship import" — is **~60–70% already written and
sitting dead in `epoch.go`.** Both folders propose building a *new* prompt-composition
module. Neither opened the file. Doing as they specify would duplicate it.

This matches `ROADMAP.md`'s own diagnosis of the project, written before any of these
folders: *"A lot of routes exist but aren't fully wired."*

---

## 5. Real gaps, confirmed against source

The work that survives verification. Grouped, not yet sequenced.

**Correctness (small, high value)**
- User messages are summarised away by compaction — [compact.go:323-363](../../cli/internal/agent/compact.go:323). Every folder ranks this highest value-per-hour; all are right.
- Empty-200 silent success — [openrouter.go:708-712](../../cli/internal/llm/openrouter.go:708) → falls through to `return history, nil`.
- No FIFO/device/socket guard in `readFile` — [tools.go:557-570](../../cli/internal/agent/tools.go:557).
- `events.Bus.Emit` has no `recover()` and no deadline — [bus.go:67-81](../../cli/internal/agent/events/bus.go:67). (The *extension* tier is already guarded; this is the in-process bus.)

**Provider layer**
- No `internal/llm/transform.go` — quirk handling is scattered.
- Retry has no jitter, no streak detection, no cost-aware budget shrink.

**Knowledge layer**
- `internal/search` and `internal/research` still run separate retrieval stacks — 2 of 3 remaining **[v]**. `search` has no relevance gate, so `read_knowledge` returns the least-bad chunk.
- No verify/provenance generalisation to skills and memory.
- No shared artifact metadata schema (skills and wiki each carry most fields under different names; memory and sessions carry none).

**Skills & learning**
- No threat guard, no linter, no ledger, no `.archive/` transitions, no consolidate command.
- No async/cancellable reflection fork. Note `memory.Signals()` **is live** **[v]** — called by `Distill` at [learn.go:199](../../cli/internal/memory/learn.go:199). Moving it per-turn is a smaller change than "wire dead code."

**Platform**
- No cron/scheduler/jobs; no ESTOP dispatch gate; no durable delegation records; no `Environment` interface; no Docker; no `execute_code`; no `apply_patch`; no verifier footer; no post-edit diagnostics; no git-tree snapshot undo; no interrupt-and-*redirect*.

**TUI**
- No `$EDITOR`, input history, `!cmd` interpolation, paste chips, or argument/path completion.

---

## 6. Disputes between folders, settled by code

| Dispute | Verdict |
|---|---|
| Sessions linear or tree? | **Tree.** `hermes_res` §6 is wrong; `doc_final_opencode` R1 is right and correctly cited |
| Go 1.24 or 1.26? | **1.26** ([go.mod:3](../../cli/go.mod:3)) **[v]**. `doc_final_opencode` D8 *and* `hermes_res` RECONCILIATION both ruled 1.24 — the latter by trusting stale `AGENTS.md` prose over the authoritative file. Only `doc_agy`'s verification report got it right |
| 2 KB tool-error cap — already present, or to build? | **Neither.** 64 KB *output* bounding exists; no error-specific cap exists. `hermes_res` asserts both positions in two different files |
| PTC: child process + socket, or embedded sandbox? | **Neither as written** — see §8 |
| ESTOP: drop it, or gate new dispatch? | **Gate new dispatch only.** Both folders converged here independently; in-flight work is never killed |
| Micro-compaction? | **Reject** — unanimous, and correctly argued |
| SQLite anywhere? | **Never.** `hermes_res` ADR-009 is the strongest single document across all five folders and should be adopted verbatim |
| Session search — new BM25 stack? | **No.** `internal/search` already has BM25 + JSON index + corpus fingerprint and indexes `KindWiki`/`KindCard`/`KindSkill`. Sessions are a *missing Kind*, not a missing engine. Building a fresh stack would make it the **fourth** — while ADR-005 consolidates three |

---

## 7. Bugs found in passing, in no existing backlog

1. **Unguarded autonomous skill authoring** — §1. **[v]**
2. **Failed sessions reinforce as successes.** [session.go:41](../../cli/internal/memory/session.go:41) hardcodes `ReinforceFromSession(..., true)` — the `clean` argument — while the comment directly above says reinforcement runs "for a clean session." Nothing ever checks. The learning loop is fed a corrupted success signal. **[v]**
3. **`ApplyReminders` breaks the prompt cache.** [reminders.go:95-103](../../cli/internal/agent/reminders.go:95) strips reminders from *every* historical user message, rewriting bytes that `applyCacheBreakpoints` marked. Real, but bounded — one break per message, and the broad strip is deliberate (steering moves the last-user position). **[v]**
4. **Aux-model spend escapes the budget hard stop.** `Budget.Check` reads `a.Client.SpendUSD()` only, while compaction runs on `routedClient("compact")` ([compact.go:304](../../cli/internal/agent/compact.go:304)) with fresh counters. Not just invisible on the bill — it escapes the guard.
5. **Non-streaming path ignores `finish_reason`.** The length guard exists only in `stream.go`; `openrouter.go:700-713` parses `FinishReason` and never reads it. Reachable via `Agent.NoStream`.
6. **The TUI still runs its own compaction ladder.** [tui.go:1278-1296](../../cli/internal/tui/tui.go:1278) calls `ShouldCompact` → `Prune` → `Compact` immediately before `Run`, which now does the same internally. Logic-audit item 1.1 landed the agent half and never removed the front-end copy.

---

## 8. Portability landmines

- **PTC is the big one.** Both architectures specify a child process with AF_UNIX/loopback-TCP dual transport. Neither mentions that [ext/wasm.go](../../cli/internal/ext/wasm.go) already gives Kaioken a **pure-Go, CGO-free, socket-less, filesystem-less sandbox** on wazero v1.12.0 **[v]** — whose own header states *"wazero has no socket support at all, so 'no network' is a property of the runtime."* But that cuts both ways: the same property makes `doc_agy`'s alternative (embed WASM for PTC) **unimplementable as written** — a script making N tool callbacks needs a socket or a persistent instance, and the one-shot stdio ABI offers neither. This needs a real decision, not an inherited one.
- **PTC also breaks the single-binary promise** if the stub is python/bash/node, which is what every folder specifies.
- **Cron "file-locked (Hermes' proven pattern)"** imports `fcntl.flock` — POSIX-only. Go has no portable `flock`. Needs `LockFileEx` or an atomic-rename lease. The folder that makes Windows first-class imported a POSIX primitive by name.
- **Docker on Windows** is a named pipe, not `/var/run/docker.sock` — the same AF_UNIX assumption ADR-006 was careful about, unguarded in ADR-007.
- **`go build -o /dev/null`** (proposed for dry-run diagnostics) is POSIX-only; `go vet ./...` is the portable choice.
- **A background reflection goroutine must not touch stdout** — Bubble Tea owns it. All writes must route through the event channel.

---

## 9. Verdicts requiring your approval

Nothing below is acted on until you say so. These are the decisions that determine the
architecture document.

**V-1 · Sequencing.** Skill-safety remediation moves to the front, ahead of TUI ergonomics
and provider work, because autonomy already ships (§1). Proposed stopgap first: gate the
unreviewed write path in `Distill` behind an explicit opt-in, landing *before* the guard is
built.

**V-2 · Phantom tier policy.** Each unwired subsystem in §4 gets an explicit *wire it* or
*delete it* verdict, and neither architecture's proposal to rebuild `epoch.go` survives.
My recommendation: wire `epoch.go` and `PruneStale`, wire or delete `MaxSkills` (a config
knob that silently does nothing is worse than no knob), delete `LearnPerTurn`.

**V-3 · PTC.** Three options — child process + dual transport (as both folders specify, with
the runtime-dependency cost stated); extend the wazero ABI to support callbacks (larger than
either folder thinks); or drop PTC from v2 entirely. §8 argues nobody has actually costed
this.

**V-4 · What anchors what.** Proposed: `hermes_res` supplies structure, ADR-009 verbatim, and
ADR-010's ordering invariant; `doc_final_opencode` supplies `03-decisions-log.md` and its
per-stage falsifiable gates; **both baselines are discarded** and re-derived from source;
ADR-003 and ADR-006 are rewritten against the code before anything is scheduled.

**V-5 · Relationship to `ROADMAP.md`.** None of the five folders mentions it — yet it is a
live 12-month plan that *already schedules* this work (M7 sandboxing → M8 background workers
→ M9 local models, Q3 2027), with a stated review-capacity budget of ~one feature per week
and an explicit "deliberately not on this roadmap" list. Does v2 **replace** that roadmap,
**slot into** its Q3, or **supersede** it as a separate track? This is the biggest unresolved
question in the set and no folder addresses it.

**V-6 · Session search.** Confirm it extends `internal/search` with a sessions `Kind` rather
than building a new stack (§6).

**V-7 · Scope realism.** The five folders together propose ~190 items. `ROADMAP.md` budgets
one substantial feature per week. Even after deleting §3 and resolving §4, the surviving set
is multiple quarters of work. The architecture document should carry an explicit cut line.

---

## Appendix — per-folder disposition

| Folder | Disposition |
|---|---|
| `hermes_res/` | **Skeleton, with two ADRs quarantined.** Adopt ADR-009 verbatim; keep ADR-010's ordering invariant (re-scoped — 2 of 5 prerequisites are partly built); ADR-001/007/008-cron are low-risk. ADR-002 (daemon-as-hub) is a *direction*, not a plan — its consequences section is far too thin for a change that rewires session ownership across TUI, daemon, RPC and desktop. **ADR-003 and ADR-006 must not anchor anything until rewritten against source.** |
| `doc_final_opencode/` | **Decisions, not plan.** Keep `03-decisions-log.md` and the per-stage gates. Discard the wave plan — anchored to a repo state five commits stale, to a wrong baseline commit, and to ≥8 shipped capabilities. |
| `doc_agy/` | **Citation index only.** Plus four original ideas worth carrying: the file-mutation verifier footer; compiler-dry-runs-over-LSP; "curator takeover" as a named failure mode; read-before-write as a *tool-layer* invariant. Discard its confidence and its WASM-PTC design. |
| `doc_her/` | **Reference for Hermes behaviour.** Its one durable contribution to Kaioken is the `ApplyReminders` cache defect, which is a better version of its own headline proposal. |
| `doc_open/` | **Two governance imports:** the Footprint Ladder as a rubric with a default answer of *no* (Kaioken's built-in tool count is drifting upward), and "the ledger is telemetry, not a gate." Two of its six proposals target the dead code in §4. |
