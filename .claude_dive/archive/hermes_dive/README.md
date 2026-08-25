# Kaioken v2 — Final Target Architecture (canonical)

**Date:** 2026-08-23 · **Rev:** 1.0 (this set supersedes `docs/hermes_res/` and
`docs/doc_final_opencode/` — see `SUPERSEDED.md`)
**Status:** Canonical. Built by audit-first synthesis: every load-bearing claim
in the two predecessor sets was re-verified against `git log` and source on
`master @ bd740fe` before adoption.
**Corpus basis:** 20 documents across `doc_agy/`, `doc_her/`, `doc_open/`,
`docs/`, and `~/Documents/reserch` — same corpus as both predecessors, plus one
new commit (`bd740fe`, version bump only, no code delta).
**Provenance of content:** ~95% inherited from the two reconciled predecessor
sets (which already adopted each other's corrections); new value here =
(a) re-verification on a moved baseline, (b) three NEW decisions (N9–N11)
surfaced from unabsorbed deep-dive mechanisms, (c) task-level expansion of the
near-term waves, (d) one canonical entry point instead of two.

---

## 0. This document set

| File | What it contains |
|---|---|
| `README.md` | **This file.** Identity, locks, tenets, subsystem specs, context doctrine, state layout, constraints, non-goals |
| `adr/ADR-001 … ADR-010` | Decision records: what was decided, why, what was rejected, consequences |
| `roadmap.md` | Three-track wave plan; W0′ / WP / W1 expanded to task level with verified file targets |
| `SUPERSEDED.md` | Supersedence record for `docs/hermes_res/` + `docs/doc_final_opencode/`, with per-file redirect map |

Read this file first; the ADRs when you want the *why* behind a choice; the
roadmap when you start building.

---

## 1. Identity and mandate

### 1.1 One-paragraph identity

Kaioken v2 remains a **single static Go binary** (`cli/`) that pairs a small,
deterministic agent core with a **verified, provenance-tracked knowledge layer** —
and evolves into a **platform**: a daemon-as-hub runtime that owns sessions,
jobs, and delegation records, serving thin-client frontends (terminal TUI,
desktop sidecar, future messaging surfaces). It adopts Hermes' *disciplines*
(cache-stable prompting, audited skill lifecycle, bounded everything) without
adopting Hermes' *shape* (god-files, Python runtime, life-scoped conversations).
Its differentiator stays what no reference agent has: precomputed,
freshness-tracked knowledge with a verify/provenance pass — now extended to
govern skills and memory too. The corpus verdict this builds on
(`doc_her §6`): *Hermes asks "how should a personal agent that lives with you
for months behave?" Kaioken asks "how should a coding assistant for a repository
behave?" — v2 keeps Kaioken's answer and adds the platform surface around it
deliberately, not by drift.*

### 1.2 Operator locks (frozen — L1–L8)

Re-affirmed frozen by the operator on 2026-08-23. These are constraints, not
proposals; no document in this set may contradict them.

| Lock | Decision | Where implemented |
|---|---|---|
| L1 | Evolve `cli/` in place — no rewrite | Everything additive; seam fixes outrank restructuring (ADR-001) |
| L2 | Full platform trajectory | Daemon-as-hub shape (§8), gateway-ready but adapter-free |
| L3 | Gated autonomy: full machinery built, autonomous-write switch ships OFF | §9, ADR-004 |
| L4 | Context doctrines clarified individually, then composed | §6, ADR-03 |
| L5 | Daemon-as-hub topology is core v2 scope | §8, ADR-002 |
| L6 | Unified knowledge layer (wiki/cards/skills/memory/sessions) | §7, ADR-005 |
| L7 | In scope: PTC sandbox, execution environments, cron-in-daemon. Out: gateway adapters | §8, ADRs-006/007/008 |
| L8 | Deliverable = master doc + decision records + roadmap | This doc set |

### 1.3 Verified current baseline (2026-08-23, `master @ bd740fe`)

Established by direct inspection during THIS audit, superseding all prior
baseline claims (the predecessors' baseline was `7be48f2`):

- **New since the predecessor docs:** only `bd740fe` — version strings bumped
  to 1.3.4, explicitly marked "unverified, pre-v2 checkpoint". No code delta;
  confirms v2 planning is the live concern. Working tree has local modifications
  in `cli/.kaioken/` (agent-generated knowledge, not source).
- **LANDED (merged 2026-08-22, verified via git log + source):** logic-audit
  phases 1–2 and ALL follow-ups for phases 1–4 — compaction inside `Run`,
  `Agent.derive()` with delegates at `MemoryDisabled=true`
  (`delegate.go:156`), steering step-budget fix (`48f3c7d`), mixed-line-ending
  edit safety (`0bca280`), worker cancellation (`ae6a808`), `.gitattributes`,
  CI `-race` job, runstate hardening (`aa5e865`); AND the knowledge-engine wave:
  `internal/retrieval/` extracted (chunk/grader/lexical/variants + tests),
  prism memo-cache singleflight fix, `wiki/staleness.go`, memory write-dedup
  (`a867302`). All four phase branches fully merged; no open fix branches exist.
- **Still open (the entire remaining correctness debt):** #8 empty-response
  silent success (verified live at `agent.go:238`: empty 200 →
  `return history, nil`), #11 provider transform layer, #14 retry hardening.
  No inspire-phase branch (phases 1–6) has been started.
- **Environmental:** `TestPrismImportAndQuery` fails without a local Ollama
  model — non-regression; ignore in gates.

---

## 2. Design principles

Load-bearing invariants; every later decision traces to one. P1–P8 are
Hermes/corpus-derived (as in hermes_res); **P9–P10 were doc_final's unique
contribution (T8/T7)** and are retained as first-class:

1. **Narrow waist, capability at the edges.** The agent loop stays a small
   explicit machine (~140-line `Agent.Run` heritage). New capability descends a
   ladder: extend an existing tool → CLI command + skill → service-gated tool →
   plugin → MCP → core tool (last resort). Never loop complexity. (Hermes'
   8,418-line `run_conversation` is the cautionary tale.)
2. **Prompt cache is sacred.** The model-facing prefix is byte-stable within a
   session; volatile content confined to designated layers; nothing mutates a
   cached prefix mid-turn (§6.3). Enforcement is mechanical: rebuilt prefixes
   adopted only on literal byte-match, asserted by a CI test.
3. **Reduce before send.** Context reduction happens pre-call — overflow is
   unrecoverable after send. Deterministic and free before LLM-driven.
4. **Bounded everything at boundaries.** Tool errors capped at dispatch (2 KB),
   streaming output accumulated and clipped, hooks under deadlines, background
   forks under cancellation handshakes (~2 s), FIFO/device/socket read guards.
5. **Safety precedes autonomy.** Threat guard, linter, ledger, lifecycle pruner
   land before any autonomous authoring is enabled (ADR-010). No exceptions.
6. **Knowledge is verified or it doesn't ship.** Generated artifacts carry
   provenance + freshness metadata; the verify pass is the trust backbone.
   Honesty over confidence: stale knowledge says so in-band.
7. **Single binary, no C toolchain.** `CGO_ENABLED=0` forever; no SQLite ever
   (ADR-009); pure-Go storage/ranking primitives; Windows first-class
   (TCP-loopback PTC transport, `$EDITOR` fallback chain, CRLF normalisation).
8. **Legible state.** Durable state as markdown/YAML/JSONL under `.kaioken/` +
   `state.json` — git-diffable, hand-editable, no opaque DB.
9. **Never hard-delete learned artifacts.** Archival-only transitions,
   append-only ledger, content-addressed rollback.
10. **Extraction, not rewrite.** Duplicated subsystems converge by extracting
    the best implementation behind an interface, porting callers landing by
    landing (proven by the landed `internal/retrieval` extraction).

---

## 3. Component map

```
                ┌────────────────────────────────────────────┐
                │               FRONTENDS                    │
                │   TUI (thin client)   Desktop (sidecar)    │
                │   headless run -json  future adapters*     │
                └──────┬───────────────────────┬─────────────┘
                       │ local HTTP + SSE      │ sidecar spawn
                ┌──────▼───────────────────────▼─────────────┐
                │         DAEMON — the hub (L5)              │
                │  sessions · runs · approval broker         │
                │  cron scheduler · delegation records       │
                │  event bus (SSE fan-out)                   │
                └──────┬─────────────────────────────────────┘
                       │ owns N agent instances
┌──────────────────────▼───────────────────────────────────────────┐
│                    AGENT CORE (narrow waist)                     │
│ Run: prologue → provider call → tool exec → recovery → finalize  │
│ steering/follow-up queues · step budget · unbilled ceiling       │
├─────────────┬──────────────┬───────────────┬─────────────────────┤
│ CONTEXT     │ TOOLS        │ PROVIDER      │ EXECUTION ENVS      │
│ mgr (§6)    │ registry,    │ transform,    │ local proc, Docker  │
│             │ approvals,   │ retry, budget │ (interface, ADR-007)│
│             │ PTC sandbox  │ routed models │                     │
└─────────────┴──────────────┴───────────────┴─────────────────────┘
                       │ reads/writes
                ┌──────▼─────────────────────────────────────┐
                │   UNIFIED KNOWLEDGE LAYER (§7, L6)         │
                │   ONE retrieval stack · shared lifecycle   │
                │   wiki·cards·skills·memory·sessions        │
                │   verify+provenance · audit ledger         │
                └────────────────────────────────────────────┘
```

\* Gateway adapters: explicit v2 non-goal (L7); the event bus and session
ownership are shaped so they attach later additively.

Dependency rule (unchanged from cli/AGENTS.md): cmd/tui → agent/wiki/llm →
utilities; config cross-cutting. Agent policy never imports tui; frontends
speak `agent.UI`.

---

## 4. Agent core

**Now (git-verified):** ~140-line explicit `Run` loop; steering/follow-up
queues; step budget with unbilled-steering semantics (steering no longer
consumes budget, `48f3c7d`); pre-call compaction inside runs; budget stop;
sub-agent `derive()` fixed incl. delegates `MemoryDisabled=true`
(`delegate.go:156`).

**v2 target:**

- Keep the explicit-loop shape. Add **active interrupt-and-redirect** (#21):
  cancel the provider stream alone, keep completed tool calls, replay partial
  prose as scaffolded context — requires splitting turn ctx from provider HTTP
  ctx. **Strip chain-of-thought before replay — non-negotiable** (partial-CoT
  replay trips reasoning-injection classifiers).
- Turn structure formalised into prologue / loop / finalize phases, kept small:
  prologue = cache-boundary check + reminder injection into volatile tail;
  finalize = persist + distill-signal evaluation.
- Recovery paths stay enumerated and testable — a checklist, not state-machine
  sprawl: retry ladder, budget stop, steering refund, empty-response breaker
  (#8), length-stop structural failure.
- **Length-stopped streams fail structurally** (via pi guard): a tool call
  truncated mid-arguments by `stop_reason==length` is reported as a failed
  call, never parsed into a malformed mutation.
- **Crash-safe incremental transcript flush during the turn** (N2), landing
  with P1 when the daemon becomes persistence owner.
- **Argument-repair sanitisation** (NEW N10, §5.4) joins the recovery checklist.

---

## 5. Tools & execution environments

### 5.1 Tool surface

- **Approval enum v2** (#4, 4–6 h — corrected estimate): `Approve` returns a
  bare bool today at `tui.go:3073` (`uiAdapter`) and `delegate.go:103`
  (`delegateUI`); becomes `AllowOnce / AllowSession / AllowAlways / Deny`
  across every `agent.UI` implementor; quick-keys `s`/`a`. Keeps the
  shell-operator-aware ruleset engine as policy substrate. Prerequisite for
  PTC's rich per-call verdicts.
- **Defensive file ops**: FIFO/device/socket guard in `readFile` (#1);
  BOM/mode-preserving edit pipeline stays; `$EDITOR` CRLF normalisation.
- **Compound `apply_patch`** (N5): multi-file add/update/delete in one call;
  complements, never replaces, `edit_file`.
- **Bounded outputs** (spill store landed) + error bodies ≤ 2 KB at dispatch
  (N3); file-mutation verifier footer when some writes failed unsuperseded (N4).
- **Multi-file skill layout** (#10): skill = directory contract (`SKILL.md` +
  `references/ templates/ scripts/` loaded on demand). Prerequisite for
  Wave 2's guard/linter/ledger.
- **PTC sandbox** (#22, ADR-006): `execute_code` generates a stub exposing
  sandbox-allowed enabled tools as functions to a child script; child is
  UNTRUSTED — tool surface, NOT filesystem or credentials; env scrubbing at
  spawn; per-call authorization still applies. Dual transport AF_UNIX /
  loopback-TCP ephemeral port (the "disabled on Windows" docstring is stale —
  `_use_tcp_rpc = _IS_WINDOWS` at `code_execution_tool.py:1357` is
  authoritative). Builds on existing `internal/rpc`; protocol carries request
  IDs (fixing the class of bug that forced Hermes' stub into a `_call_lock`).
  Collapses N exploration round-trips into one zero-context-cost turn.

### 5.2 Execution environments (ADR-007)

Extract an `Environment` interface over today's `proc_unix.go` /
`proc_windows.go`: start / exec / stream / teardown, with snapshot semantics
for undo integration. Local process remains default; exactly one additional
backend in v2: **Docker**. Adopt Hermes' error taxonomy: connection-level
failures (`EnvironmentConnectionError` class) are retryable; ordinary command
failures are not. SSH/remote/serverless attach later without loop changes —
none built in v2. Git-snapshot undo (#25) plugs into snapshot semantics.

---

## 6. Context management — three doctrines, composed (L4)

1. **Deterministic pre-call prune (primary; always on).** Tombstone dead weight
   (superseded tool outputs, old reminders) before every call — free,
   deterministic, history replayable.
2. **Threshold LLM compaction with hard guards (second stage).** Only when
   prune can't hold the window: head/tail split at user-message boundaries
   (placement inside `Run` LANDED), aux-model summary, **never summarise user
   messages** — extract from head and re-inject verbatim (#5; highest
   value-per-hour item in the corpus), **chained summaries not stacked**, fixed
   template with cumulative reconciliation (N6, opencode-derived). Compaction
   prompt chosen/tested against small aux models deliberately.
3. **Cache-stable layered prompting (flagship import from Hermes).**
   Prompt-composition module owns layer assembly: stable identity/tools/rules
   first, volatile content last; byte-stable for the session's life; toolset
   membership frozen at session start; anything mutating the prefix (MCP
   refresh, skill installs) deferred to next prologue boundary. Memory enters
   prompts ONLY as a frozen session-start snapshot — a code-level rule in the
   composition module (N1), not a convention; per-turn `<system-reminder>`
   blocks ride exclusively in the volatile tail. Enforcement: CI test asserts
   stable-prefix byte-equality across turns.
   *Evaluated and rejected as default:* continuous micro-compaction — defeats
   the cache every turn, adds 2–35 s aux latency; its one good idea (never
   compact user messages) already captured in doctrine 2. Revisit only for
   months-long gateway conversations if they materialise. Recorded nuance:
   Hermes' background review forks DO inherit byte-exact prefixes — that
   pattern carries into our reflection fork.

Send composition: `stable prefix + volatile tail`; overflow replay handling as
backstop.

### 6.4 NEW N9 — Dynamic cache-control tag placement (provider layer)

The deep dives surfaced one mechanism neither predecessor absorbed:
Hermes places ephemeral provider cache-control tags at strategic message
boundaries (system prompt, tool definitions, recent turns) so provider-side
prefix caches actually engage (`agent/turn_context.py:42-48`). Kaioken's
layered prompt makes segments cacheable, but nothing tags them per-provider.
v2: after the composition module exists (W1), add provider-appropriate cache
tagging in the transform layer (WP) — Anthropic-style explicit breakpoints
where supported; harmless no-op where not. Sequenced after composition because
tags must point at stable boundaries that only doctrine 3 creates.

### 6.5 Rejected alternatives (context)

Continuous micro-compaction (above). Retry-then-compress (Hermes' own docs
concede it pays real tokens/latency to discover predictable overflow).
Stacked summaries (opencode lesson: chained-only).

---

## 7. Unified knowledge layer (L6 — the differentiator)

**Now (git-verified):** extraction STARTED on master — `internal/retrieval/`
exists with tests; prism memo-cache TOCTOU closed via singleflight;
`wiki/staleness.go` landed; memory write-dedup landed. Remaining: `search` and
`research/corpus` still run their own stacks; skills never retire; memory
distills only at session end.

**Target — one layer, multiple tenants (wiki · cards · skills · memory ·
sessions):**

```
.kaioken/
  wiki/  cards/        ← knowledge engine (verify pass + provenance)
  skills/              ← directory-contract skills, lifecycle states
  memory/              ← distilled facts, deduped writes
  sessions/            ← JSONL trees + BM25 JSON index
  ledger/              ← append-only JSONL mutation log + sha256 blobs
```

- **One retrieval stack — finish the extraction, don't restart it.** Port
  `search` onto `internal/retrieval` (drop-in; preserve index shape and
  fingerprint), fold `research/corpus` last. Quality fixes land once. PRISM
  agentic retrieval remains a first-class MODE over the stack.
- **Shared artifact metadata:** `{source_provenance, created_at,
  last_verified_at, freshness_state}` on every tenant artifact.
- **Shared lifecycle:** `active → stale(30 d unused) → archived(90 d)`
  (configurable; pinned/bundled exempt), non-destructive into `.archive/`.
  One mechanism generalises backlog items 15/27 across skills AND cards.
- **Verify/provenance generalised:** the wiki verify pass becomes layer-wide
  trust — generated skills and distilled memory cite their evidence (session
  transcripts, wiki pages). Staleness honesty everywhere: commit distance
  surfaced in `knowledgeSummary` and `read_knowledge`.
- **Memory hygiene:** dedup-before-append (landed) + capacity reads as
  "redundant", not "full".
- **One shared ledger:** all mutations append to one JSONL trail with sha256
  content-addressed blobs, exact rollback. Ledger failure never blocks a
  mutation — telemetry, not gate.
- **Session search** (#16): textrank-BM25 + JSON index; ranked hits, lineage
  dedupe across fork ancestry, ±5-message anchored hydration. Borrow Hermes'
  retrieval design; never its SQLite storage (ADR-009).

---

## 8. Platform layer — daemon-as-hub (L2/L5/L7)

- The HTTP daemon becomes the **single owner of agent instances, sessions,
  runs, jobs, and delegation records**; TUI/desktop/headless are thin clients
  over local HTTP + SSE. Zero-setup UX preserved: TUI auto-spawns the daemon on
  a localhost socket when none is running — one binary, hub ownership. Kills
  the dual-mode seam the logic audit warns about.
- **Cron scheduler in-daemon** (P2): 60-second tick, file-locked; jobs as
  `jobs.json`; delivery targets resolved against connected surfaces;
  scheduled deliveries land in DEDICATED sessions so main-transcript role
  alternation stays intact.
- **ESTOP analog gates NEW dispatches at this layer only** — in-flight work is
  NEVER killed (matches backlog item 3's adversarial re-scope; supersedes
  D11's "dropped").
- **Durable delegation records** persist dispatch/completion so a restarted
  desktop recovers subagent results.
- **Gateway boundary:** define `PlatformAdapter` interface (deliver/receive/
  ack) and stop — no adapters ship in v2.
- **God-file discipline day one:** daemon handlers partitioned runs/jobs/
  events/approvals; file-size budget enforced in review (Hermes'
  `gateway/run.py` at 31.3k lines is the counter-example).
- Transcript persistence moves to the daemon at P1, including incremental
  crash-safe flush (kill -9 mid-turn loses at most the current stream chunk).

---

## 9. Learning loop — gated autonomy (L3; ADRs 004/010)

```
signals ──► memory nudge (mid-turn, heuristic-gated)          [always on]
corrections ► background reflection fork (async, cancellable ~2 s) [always on]
complex-task trace ─► skill SYNTHESIS PROPOSAL                [approval-gated]
        proposals ─► threat guard + linter scan               [always, before accept]
                 ─► shared ledger entry + sha256 blob          [always]
curator (deterministic, no LLM): active→stale→archived         [scheduled/on-update]
consolidation: `kaioken skills consolidate`                    [explicit cmd only]
```

- **Foundation first (hard invariant):** #10 multi-file layout → #12 threat
  guard (+linter) → #18 ledger → #15 lifecycle pruner ship BEFORE any feature
  that writes skills. No reordering regardless of individual readiness.
- **Reflection fork (#23):** gated on `memory.Signals()`
  (`learn.go:37`) heuristics — real corrections and error recovery, not raw
  counters (counters demoted to ceiling fallbacks, resolving the [BA]/[GLM] vs
  [ARCH] trigger conflict); preserves the cache snapshot; cancelled within
  ~2 s of new user input; sandbox whitelist = `memory` + skill-mutation tools
  only; patch-over-rewrite editing policy.
- **Gate mechanics:** proposals land in a review queue surfaced via TUI and
  daemon API; config flip `skills.autonomous_writes: true` promotes to
  auto-apply ONLY after an operator-reviewed track record — the gate is a
  policy point, not missing machinery. Promotion evidence = clean scans +
  usage reinforcement + user acceptance, NEVER self-judged success (the
  corpus's "self-congratulation problem" is the strongest documented failure
  mode in the entire research set).
- **Curator** deterministic; consolidation explicit command only; timeline
  (#28) visualises after the loop exists.
- **Out of runtime scope:** GEPA/DSPy evolutionary optimization — future
  offline outer loop (PR-based, human-reviewed); needs an eval harness
  Kaioken doesn't have. Adopting the gates without the optimizer gets the
  safety at none of the risk.

---

## 10. Surfaces (TUI)

Ergonomics wave: double-tap-empty-Enter drain (#2), approval quick-keys (#4),
`$EDITOR` composition with Windows fallback chain `$VISUAL → $EDITOR →
code --wait → notepad.exe` + CRLF normalisation (#6), input history recall
(#7), inline `!cmd` / `{!...}` interpolation (#9), paste-collapse chips (#20),
argument/path completion behind a palette state machine FIRST (#17 — today the
palette closes on whitespace at `palette.go`), searchable model selector (#19,
0.5 d — thinking levels already landed at `thinking.go:18`). Deep capability:
live tool tree (#26, visual structure + metrics only — no DOM accordion) and
learning timeline (#28, last). Under L5 the TUI gains daemon
spawn/health-check/reconnect lifecycle. Headless/rpc/MCP/ext shapes unchanged;
inherit everything via T10 (one policy owner per concern).

---

## 11. State and data layout

- `.kaioken/` tree per §7; `state.json` runtime bookkeeping; daemon adds
  `jobs.json` + `delegations/` records.
- Sessions stay **JSONL trees** (`ParentID`/`ForkedAt`, `Entries`+`Leaf`,
  `syncTree`, `fork.go` — v1 of hermes_res wrongly said "linear chosen";
  corrected in its v1.1 and preserved here). Session search respects lineage.
- Transcripts flush incrementally during turns from P1 onward.
- Workspace rollback (#25): tree snapshots via Environment snapshot semantics;
  per-file `UndoEntry` remains the fast path (covers write/edit only — which
  is exactly why tree snapshots are needed; verified authoritative in D10).
- Turn leases: deferred until the desktop sidecar shares sessions (N8).
- Everything git-diffable; ledger blobs sha256 content-addressed.

---

## 12. Cross-cutting constraints

- **Windows first-class:** TCP-loopback transports, `$EDITOR` fallback chain,
  CRLF handling, no new AF_UNIX assumptions; Windows behaviour is
  integration-tested, never assumed (stale-docstring incident is the lesson).
- **Build hygiene:** `CGO_ENABLED=0`; `go test ./...` green; CI `-race` runs
  ubuntu-only (needs cgo) — any wave introducing concurrency treats the
  `-race` job as its gate. That does NOT reopen cgo dependencies in product
  builds (ADR-009).
- **Concurrency discipline:** goroutines + channels + `context.Context`;
  every background goroutine has a cancellation handshake with deadline;
  hooks wrapped in timeout + recover — observers fail open, guards fail
  closed (#13).
- **Cost visibility:** OpenRouter usage accounting extended to aux-model calls
  (compaction, reflection) so reduction/learning overhead is visible.

---

## 13. Explicit non-goals (v2)

| Rejected | Reason |
|---|---|
| Rewrite / language change / greenfield | L1; seams, not foundations, were the problem |
| Continuous micro-compaction as default | Defeats caching; adds per-turn latency (§6) |
| Gateway adapters (Telegram etc.) | L7 — `PlatformAdapter` interface only |
| SQLite / FTS5 anywhere | Breaks `CGO_ENABLED=0` single-binary story (ADR-009) |
| Effect-TS service graph, part-based message model, per-model prompt files, 30+ provider ports | Wrong ecosystem; Go idiom is interfaces + small structs |
| Honcho dialectic user modelling | Remote SaaS; wrong shape for local-first |
| MoA orchestration, voice/TTS/wake words | Complexity outranks value now |
| GEPA/DSPy runtime self-optimisation | Future offline outer loop; needs eval harness first |
| ESTOP killing in-flight work | Violates never-kill contract; gate new dispatches instead |
| Fast-echo stdout, Yoga flexbox, Nano Stores | Corrupt/duplicate Bubble Tea's Elm loop |
| Recursive Pydantic-style sanitisers | Moot with Go struct tags |
| Background delegation async completion queue | Deferred; durable delegation records land first |
| Ralph goal loops, Lean verification interleaving | Research-grade; incompatible with "no unattended loops" until trust machinery proven |
| Turn leases for shared sessions | Deferred until desktop sidecar shares sessions |

---

## 14. Corpus basis, confidence, and provenance

| Source | Contribution |
|---|---|
| `docs/inspire-backlog.md` (28 items, adversarially verified; 433/511 quotes mechanically confirmed, 5 corrections) | Item numbering, efforts, file targets — all re-anchored against master source in THIS audit |
| `docs/inspire-phases.md` + `docs/phase-plans/` | Wave sequencing, gates, ordering invariant |
| `docs/logic-audit-and-phases.md` | Original debt list — now largely MERGED (§1.3) |
| `doc_her/*`, `doc_agy/*` (incl. 1016-line verification report) | Hermes internals incl. self-improvement loop; PTC transport truth; per-item verification with `file:line` citations |
| `doc_open/*` | Independent comparison; borrowables ranking (leases, mid-turn persistence, curator, delegation, cron-in-dedicated-sessions, frozen-snapshot-as-code) |
| `~/Documents/reserch/*` (4 papers) | Dual-layer learning model, self-congratulation risk, GEPA catalogue, HITL pipeline shape |
| `hermes_res/` + `doc_final_opencode/` | Both reconciled predecessor sets — substance inherited wholesale where verification passed; their residual disagreements resolved in `AUDIT.md` |

Confidence notes: every "current state" claim above was checked against git
log/source on master during this audit rather than inherited. All Hermes
mechanism claims inherit the corpus's adversarial verification (claims carry
`file:line`; flagged discrepancies are not repeated here). Where the two
comparison passes disagreed on emphasis (micro-compaction vs prune), this set
follows the verified-numbers pass (`doc_her`) plus the backlog's explicit
"not recommended" ruling.
