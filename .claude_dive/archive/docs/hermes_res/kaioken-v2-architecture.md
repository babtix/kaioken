# Kaioken v2 — Final Target Architecture

**Date:** 2026-08-22 · **Rev:** v1.1 — reconciled with the parallel `doc_final/`
set and re-verified against `git log`/source on master. Corrections made and
adoptions taken are recorded in [`RECONCILIATION.md`](RECONCILIATION.md);
the authoritative current-baseline is §9.1 here and the roadmap's W0′.
**Status:** Proposed (planning Q&A completed with operator; 8 scoping decisions locked — see §1.2)
**Corpus basis:** 20 documents across `doc_agy/`, `doc_her/`, `doc_open/`, `docs/`, and `~/Documents/reserch` (full source map in §9)

---

## 0. This document set

| File | What it contains |
|---|---|
| `kaioken-v2-architecture.md` | **This file.** The definitive target architecture: identity, principles, subsystem-by-subsystem spec, context-management doctrine, non-goals |
| `adr/ADR-001…010.md` | Decision records: what was decided, why, what was rejected, consequences |
| `roadmap.md` | Execution waves reconciled against the **git-verified baseline** — what is already merged vs what remains |
| `RECONCILIATION.md` | Verification record vs the parallel proposal (`doc_final/`) — what its critique got right, what was stale |

Read this file first; the ADRs when you want the *why* behind a specific choice; the roadmap when you start building.

---

## 1. Identity and mandate

### 1.1 One-paragraph identity

Kaioken v2 remains a **single static Go binary** (`cli/`) that pairs a small,
deterministic agent core with a **verified, provenance-tracked knowledge layer** —
and evolves it into a **platform**: a daemon-as-hub runtime that owns sessions,
jobs, and delegation records, serving thin-client frontends (terminal TUI, desktop
sidecar, future messaging surfaces). It adopts Hermes' *disciplines* (cache-stable
prompting, audited skill lifecycle, bounded everything) without adopting Hermes'
*shape* (god-files, Python runtime, life-scoped conversations). Its differentiator
stays what no reference agent has: precomputed, freshness-tracked knowledge with a
verify/provenance pass — now extended to govern skills and memory too.

The corpus verdict this builds on (`doc_her/hermes-deep-dive-and-kaioken-comparison.md` §6):
> Hermes asks "how should a personal agent that lives with you for months behave?"
> Kaioken asks "how should a coding assistant for a repository behave?" — v2 keeps
> Kaioken's answer and adds the platform surface around it deliberately, not by drift.

### 1.2 Locked planning decisions

| # | Question | Decision |
|---|---|---|
| D1 | Relation to current `cli/` | **Evolve in place.** No rewrite; Go single binary preserved |
| D2 | Product trajectory | **Full platform trajectory** — architecture leaves room for multi-surface delivery |
| D3 | Learning loop | **Gated autonomy** — full machinery built; autonomous skill-writing approval-gated until trust earned; safety guard + linter + ledger land first |
| D4 | Context doctrine | **All three doctrines clarified individually, then composed** (see §5) |
| D5 | Topology | **Daemon-as-hub** — daemon owns agent instances/sessions; TUI, desktop, future gateway are thin clients |
| D6 | Knowledge engine role | **Merge direction** — `.kaioken/` knowledge + skills + memory become ONE unified knowledge layer with shared freshness/lifecycle machinery |
| D7 | Platform capabilities in scope | **In:** PTC sandbox, execution-environment abstraction, cron-in-daemon. **Out (named non-goal):** gateway adapter skeletons |
| D8 | Deliverable shape | Doc set: this master + ADRs + roadmap, cross-linked |

---

## 2. Design principles

These are the load-bearing invariants. Every later decision traces to one.

1. **Narrow waist, capability at the edges.** The agent loop stays a small explicit
   machine (~140-line `Agent.Run` heritage). New capability descends a ladder:
   extend an existing tool → CLI command + skill → service-gated tool → plugin →
   MCP → core tool (last resort). Never loop complexity. (Hermes' 8,418-line
   `run_conversation` is the cautionary tale.)
2. **Prompt cache is sacred.** The model-facing prefix is byte-stable within a
   session; volatile content is confined to designated layers; nothing mutates a
   cached prefix mid-turn (§5.3).
3. **Reduce before send.** Context reduction happens pre-call, because overflow is
   unrecoverable after send (§5.1). Deterministic and free before LLM-driven.
4. **Bounded everything at boundaries.** Tool errors capped at dispatch (Hermes'
   2 KB cap), streaming output accumulated and clipped, hook handlers under
   deadlines, background forks under cancellation handshakes.
5. **Safety precedes autonomy.** Threat guard, linter, and append-only audit ledger
   exist before any autonomous authoring is enabled (ADR-004/ADR-010).
6. **Knowledge is verified or it doesn't ship.** Generated artifacts (wiki, cards,
   skills, distilled memory) carry provenance and freshness metadata; the verify
   pass is the trust backbone of the whole knowledge layer (§4.F).
7. **Single binary, no C toolchain.** `CGO_ENABLED=0` forever; no SQLite; pure-Go
   storage and ranking primitives (ADR-009). Windows is a first-class target
   (TCP-loopback PTC transport, `$EDITOR` fallback chains, CRLF normalisation).
8. **Legible state.** All durable state lives as inspectable markdown/YAML/JSONL
   under `.kaioken/` plus `state.json` — git-diffable, hand-editable, no opaque DB.
9. **Never hard-delete learned artifacts.** Archival-only transitions,
   append-only ledger, content-addressed rollback. Autonomous actors prune by
   moving to `.archive/`, never by removing history. *(adopted from doc_final T8)*
10. **Extraction, not rewrite.** Duplicated subsystems converge by extracting the
    best implementation behind an interface and porting callers landing by
    landing — the audit's own remedy, codified. *(adopted from doc_final T7)*

---

## 3. System overview

```
                        ┌──────────────────────────────────────────┐
                        │              FRONTENDS                   │
                        │  TUI (Bubble Tea)   Desktop (sidecar)    │
                        │  one-shot `run`     future: adapters*    │
                        └───────┬──────────────────────┬───────────┘
                                │ local HTTP + SSE     │ sidecar spawn
                        ┌───────▼──────────────────────▼───────────┐
                        │            DAEMON (the hub)              │
                        │  sessions · runs · approval broker       │
                        │  cron scheduler · delegation records     │
                        │  event bus (SSE fan-out)                 │
                        └───────┬──────────────────────────────────┘
                                │ owns N agent instances
┌───────────────────────────────▼──────────────────────────────────────────┐
│                         AGENT CORE (narrow waist)                        │
│  Run loop: prologue → provider call → tool exec → recovery → finalize    │
│  steering/follow-up queues · step budget · unbilled-steering ceiling      │
├──────────────┬───────────────┬──────────────────┬────────────────────────┤
│ CONTEXT      │ TOOLS         │ PROVIDER LAYER   │ EXECUTION ENVIRONMENTS │
│ mgr (§5)     │ registry,     │ transform rules, │ local proc, Docker     │
│              │ approvals,    │ retry hardening, │ (interface, ADR-007)   │
│              │ PTC sandbox   │ usage accounting │                        │
└──────────────┴───────────────┴──────────────────┴────────────────────────┘
                                │ reads/writes
                        ┌───────▼──────────────────────────────────┐
                        │     UNIFIED KNOWLEDGE LAYER (§4.F)       │
                        │  retrieval stack (one, shared)           │
                        │  wiki · cards · skills · memory          │
                        │  lifecycle: fresh→stale→archived         │
                        │  verify + provenance + audit ledger      │
                        └──────────────────────────────────────────┘
```

\* Gateway adapters are an explicit v2 non-goal (D7); the daemon's event bus and
session ownership are shaped so they attach later without re-architecture.

Dependency rule (unchanged from cli/AGENTS.md): cmd/tui → agent/wiki/llm →
utilities; config cross-cutting. Agent policy never imports tui; frontends speak
`agent.UI`.

---

## 4. Subsystem specifications

Each subsystem: current state → v2 target → which corpus imports land where.

### A. Core agent loop

**Now (git-verified):** ~140-line explicit `Run` loop with steering/follow-up
queues, step budget, pre-call compaction *inside* runs (audit fix landed),
budget stop, steering no longer consumes step budget (`48f3c7d`). Standing-
permission newline bypass fixed, malformed-stream tool calls fixed, sub-agent
`derive()` fixed (with delegates running `MemoryDisabled=true`,
`delegate.go:156`).

**v2:**
- Keep the explicit-loop shape. Add **active interrupt-and-redirect** (backlog #21):
  cancel the provider stream alone, keep completed tool calls, replay partial prose
  as scaffolded context — requires splitting the turn context from the provider HTTP
  context. **Strip chain-of-thought before replay** (non-negotiable; partial-CoT
  replay trips reasoning-injection classifiers).
- Turn structure formalised into prologue / loop / finalize phases mirroring Hermes'
  separation, but kept small: prologue = reminder injection + cache-boundary check;
  finalize = persist + distill-signal evaluation.
- Recovery paths stay enumerated and testable (retry ladder, budget stop, steering
  refund, empty-response breaker §4.E) — a checklist, not a state-machine sprawl.
- **Length-stopped streams fail structurally** (adopted via doc_final's pi
  reference): a tool call truncated mid-arguments by `stop_reason==length` is
  reported as a failed call, never parsed into a malformed mutation.
- **Crash-safe incremental transcript flush during the turn** (doc_final N2),
  landing with P1 when the daemon becomes persistence owner.

### B. Tool system

**Now:** ~10 core tools + extension registry + MCP; sequential `runToolCalls` with
per-tool approval returning a **bare bool**; `verifyUnchanged` on edits;
multi-hunk `editmatch.go` with byte-exact line-ending preservation outside the
edited span (`0bca280`).

**v2:**
- **Approval enum** (backlog #4): `AllowOnce / AllowSession / AllowAlways / Deny`
  across every implementor of `agent.UI`; quick-keys `s`/`a` at the prompt. Keeps
  the shell-operator-aware ruleset engine (existing Kaioken strength) as the
  policy substrate. Prerequisite for PTC's rich per-call verdicts.
- **Bounded errors:** tool-error bodies capped at 2 KB at the dispatch boundary
  (Hermes import).
- **File-mutation verifier footer** (doc_final N4): when a turn ends with writes
  that failed unsuperseded, append an advisory footer so the model knows the
  workspace diverges from what it believes.
- **Compound `apply_patch`** (doc_final N5): multi-file add/update/delete in one
  call, complementing (not replacing) single-file `edit_file`.
- **Footprint ladder adopted** (principle 1): new core tools are the last resort.
- **Multi-file skill layout** (backlog #10): a skill is a directory contract —
  `SKILL.md` + optional `references/ templates/ scripts/` loaded on demand.
  Prerequisite for the guard/linter/ledger (Wave 2).
- **PTC sandbox** (backlog #22, ADR-006): an `execute_code` tool generates a stub
  exposing enabled tools as functions to a child script; child is treated as
  **untrusted — it gets the tool surface, not the filesystem or credentials**.
  Transport: AF_UNIX on POSIX, loopback TCP on an ephemeral port on Windows
  (Hermes' `_use_tcp_rpc` pattern; its "disabled on Windows" docstring is stale —
  lines 53–56/1357 are authoritative). Builds on existing `internal/rpc`; the
  protocol carries request IDs (fixing the class of bug that forced Hermes' stub
  to use a `_call_lock`). Collapses N exploration round-trips into one
  zero-context-cost turn.

### C. Provider layer

**Now:** `chatWithRetry` over one client abstraction; OpenRouter usage accounting
(strong even when providers omit usage data); two retry layers (transport
`internal/llm/retry.go`, per-turn `internal/agent/retry.go`); thinking levels
built (`internal/llm/thinking.go:18`); USD budget guard; routed role models.

**v2:**
- **Transform layer** (backlog #11): `llm/transform.go` as independently testable
  rules over `map[string]any` — nullable-union collapse, tool-ID sanitisation to
  `[A-Za-z0-9_-]`, empty-text coercion, Gemini schema subsetting, output-only field
  stripping on replay. Each rule gets a table test with real malformed payloads.
- **Retry hardening** (backlog #14): port opencode's five fixes (unknown finish
  reasons, raw network finish errors, network error variants, capacity stream
  errors, caps-with-jitter). Land together with the **empty-response silent-success
  fix** (backlog #8 — still live: an empty 200 reaches `return history, nil`)
  plus streak detection keyed on (model, provider, finish_reason) and retry-budget
  shrink when estimated input cost is high. Both retry layers change together.
- **Cost visibility:** OpenRouter accounting extended to aux-model calls
  (compaction, reflection) so reduction/learning overhead is visible.
- Note carried from corpus: if compaction is ever driven by a small model, expect
  prompt mis-following (opencode retuned theirs for DeepSeek-class models) — pick
  the aux model deliberately (see §5.2/N6).

### D. Execution environments

**Now:** direct `proc_unix.go` / `proc_windows.go`.

**v2 (ADR-007):** extract an `Environment` interface (start/exec/stream/teardown +
snapshot semantics); local process remains the default implementation; add **Docker**
as second backend. Adopt Hermes' distinction between connection-level failures
(retry makes sense) and ordinary command failure (don't retry blindly). The
interface leaves SSH/remote/serverless attachable later without loop changes —
but no other backends are built in v2. Git-snapshot undo (#25) plugs into the
snapshot semantics.

### E. Daemon-as-hub platform layer

**Now:** HTTP daemon with run management (`Runs.Cancel`), desktop-sidecar ready;
TUI embeds the agent directly.

**v2 (ADR-002, D5):**
- The daemon becomes the **single owner of agent instances, sessions, and runs**.
  The TUI attaches as a thin client (local HTTP + SSE event bus), auto-spawning
  the daemon on a localhost socket when none is running — one binary, hub
  ownership, no dual-mode seam.
- **Cron scheduler inside the daemon** (D7): 60-second tick, file-locked (Hermes'
  proven pattern); jobs persisted as `jobs.json`; delivery targets resolved
  against connected surfaces; scheduled deliveries land in dedicated sessions so
  main-transcript role alternation stays intact (Hermes pattern). An ESTOP analog
  gates *new* dispatches at this layer only — in-flight work is never killed
  (matches backlog item 3's adversarial re-scope).
- **Durable delegation records:** dispatch/completion persisted so a restarted
  desktop app recovers subagent results.
- **Gateway skeleton deferred:** define the `PlatformAdapter` interface (deliver /
  receive / ack) and stop there. No adapters ship in v2 (D2/D7).
- God-file discipline enforced from day one: daemon handlers stay partitioned by
  concern (runs, jobs, events, approvals) — `gateway/run.py` at 31.3k lines is
  the counter-example to design against.

### F. Unified knowledge layer (D6 — the differentiator)

**Now (git-verified):** extraction has STARTED on master —
`internal/retrieval/` exists (chunk/grader/lexical/variants extracted out of
prism, with tests), prism memo-cache TOCTOU closed via singleflight
(`retrieve.go:248`), `wiki/staleness.go` landed (commit-distance staleness),
memory write-dedup landed (`memory.go`). Remaining: `search` and
`research/corpus` still run their own stacks; skills never retire; memory
distills only at session end.

**v2 target — one layer, four tenants:**

```
.kaioken/
  wiki/  cards/        ← knowledge engine (verify pass + provenance, incremental git updates)
  skills/              ← directory-contract skills, lifecycle states
  memory/              ← MEMORY.md / USER.md equivalents, deduped writes
  sessions/            ← transcripts + BM25 JSON index (search)
  ledger/              ← append-only JSONL mutation log + sha256 blob snapshots
```

- **One retrieval stack (finish the extraction).** Port `search` onto
  `internal/retrieval` (drop-in; preserve index shape/fingerprint), fold
  `research/corpus` last. Quality fixes land once. PRISM agentic retrieval stays
  a first-class *mode* over that stack.
- **Shared lifecycle machinery.** Every tenant artifact carries
  `{source_provenance, created_at, last_verified_at, freshness_state}`. States:
  `active → stale (30d unused) → archived (90d)` (configurable thresholds),
  honouring pinned/bundled marks. Non-destructive transitions into `.archive/`
  (principle 9). One mechanism generalises backlog items 15/27 across skills AND
  knowledge cards.
- **Verify/provenance generalised:** the wiki verify pass becomes the layer-wide
  trust mechanism — generated skills and distilled memory get citations back to
  session evidence or wiki pages, making the learning loop auditable.
  Staleness honesty everywhere: commit-distance surfaced in `knowledgeSummary`
  and `read_knowledge`.
- **Session search** (backlog #16): BM25 over transcripts via `internal/textrank`
  + JSON index — **never SQLite/FTS5** (ADR-009). Borrow Hermes' retrieval design:
  ranked hits, lineage dedup, ±5-message anchored hydration.
- **Background reflection fork** (§G): post-turn goroutine gated on existing
  `memory.Signals()` heuristics.

### G. Learning loop — gated autonomy (D3, ADR-004/ADR-010)

Machinery built in full; the *autonomous write* switch starts off.

```
 signals ──► memory nudge (mid-turn, heuristic-gated)      [always on]
 corrections ─► background reflection fork (async, cancellable) [always on]
 complex-task trace ─► skill SYNTHESIS PROPOSAL             [approval-gated]
                    ─► threat guard + linter scan           [always, before accept]
                    ─► audit ledger entry + sha256 blob     [always]
 curator (deterministic, no LLM): active→stale→archived     [scheduled/on-update]
 consolidation: `kaioken skills consolidate`                [explicit cmd only]
```

- **Gate mechanics:** proposed skills land in a review queue surfaced through TUI
  and daemon API; a config flip (`skills.autonomous_writes: true`) promotes
  proposals to auto-apply *only after* the operator has reviewed a track record —
  the gate is a policy point, not missing machinery.
- **Ordering invariant:** threat guard (#12), linter, ledger (#18) and lifecycle
  pruner (#15) ship in Wave 2; the reflection fork (#23) and anything that writes
  skills ships after. This mirrors `docs/inspire-phases.md` phase 4 → 5 dependency,
  retained without exception.
- **Reflection fork specifics:** gated on `memory.Signals()` heuristics (real
  corrections, error recovery — not raw counters); preserves the prompt-cache
  snapshot; cancelled within ~2 s of new user input; sandbox whitelist =
  `memory` + skill-mutation tools only; patch-over-rewrite editing policy.
  Reflective judgement keys on objective ledger signals (traces, verify failures,
  user rejections), never the executing model's own success claims (the corpus's
  "self-congratulation problem").
- **Curator** stays a deterministic state machine; consolidation (#27) is an
  explicit command, never an unattended loop.
- **From the research papers** (`~/Documents/reserch`):
  - *Beyond Autonomy*'s dual-layer model is adopted consciously: the reactive
    procedural loop is biased, so the reflective layer relies on objective
    signals rather than self-judged success.
  - Harness engineering validated: everything learnable is a legible,
    git-diffable file — principle 8 is the same bet.
  - GEPA/DSPy genetic prompt evolution is catalogued as a **future outer loop**
    (offline, PR-based, human-reviewed) — explicitly out of v2 runtime scope; it
    needs an eval harness Kaioken doesn't have yet (doc_final D6 rationale,
    adopted).
  - The French MLOps report's pipeline shape (data sources → update triggers →
    validation gate → monitoring → HITL checkpoints) is reflected in the gate
    mechanics; its HITL emphasis supports keeping the approval gate default-on.

### H. Frontends (TUI)

Ergonomics wave (all verified items): double-tap-empty-Enter drain (#2),
approval quick-keys (#4 via the enum), `$EDITOR` composition with Windows
fallback chain `$VISUAL → $EDITOR → code --wait → notepad.exe` + CRLF
normalisation (#6), input history recall (#7), inline `!cmd` and `{!...}`
interpolation (#9), argument/path completion behind a palette state machine (#17),
searchable model selector (#19, 0.5 d), paste-collapse chips (#20). Deep
capability: live tool tree (#26 — visual structure and metrics only, no DOM-style
accordion) and learning timeline (#28, after the loop exists to visualise).
Under L5 the TUI gains daemon spawn/health-check/reconnect lifecycle.

---

## 5. Context management — the three doctrines, clarified and composed

Per D4, each doctrine is stated on its own terms first.

### 5.1 Doctrine 1 — Deterministic pre-call prune (Kaioken; KEEP, primary)

**Mechanism:** before every provider call, drop/tombstone provably dead weight
(superseded tool outputs, old reminders, prunable spans) with zero LLM cost.
Tombstones, not mutation — history stays replayable (pi/opencode lesson).

**Why it wins:** it is free, deterministic, inspectable, and it acts *before* the
request — "reduce while failure is still hypothetical." Hermes' own docs concede
its retry-then-compress alternative pays real tokens and latency to discover
overflow that was predictable.

**v2 role:** first reduction stage, always on.

### 5.2 Doctrine 2 — Threshold LLM compaction with hard guards (Kaioken; KEEP)

**Mechanism:** when estimated context crosses threshold, split head/tail at
user-message boundaries, summarise head with the aux model, continue the run
(post-audit this happens *inside* runs). Three imported hard guards:
**never summarise user messages** — user turns are pulled from the head and
re-injected verbatim beside the summary (backlog #5, highest value-per-hour item
in the corpus; instructions and negative constraints are unreconstructable once
paraphrased); **chained summaries, not stacked ones** (summarise the
summary-plus-recent-tail, don't accrete layers); **fixed summary template with
cumulative reconciliation** (doc_final N6, opencode-derived) so summaries stay
mechanically comparable across generations.

**v2 role:** second stage, only when prune can't hold the window. Compaction
prompt chosen/tested against small aux models deliberately.

### 5.3 Doctrine 3 — Cache-stable layered prompting (Hermes; ADOPT — the flagship import)

**Mechanism:** the system prompt is assembled once per session in a strict
layer order — stable identity/tools/rules first, volatile content (timestamps,
reminders) last — and is then **byte-stable** for the session's life. Anything
that would mutate the cached prefix (tool-list changes, MCP refresh, skill
installs) is deferred to the next turn's prologue boundary. Hermes enforces
byte-stability mechanically: a rebuilt prefix is only adopted if it literally
matches the stored bytes.

**Code-level rule (not convention):** memory enters prompts ONLY as a frozen
session-start snapshot (doc_final N1); per-turn `<system-reminder>` blocks ride
exclusively in the volatile tail. Toolset membership frozen at session start.

**Why v2 needs it:** Kaioken regenerates reminders per turn today; every reorder or
regeneration invalidates the provider prefix cache and re-bills full input on
OpenRouter. Layering stable→volatile and freezing the tool list mid-session is the
highest-leverage cost fix available (doc_her transfer list #1).

**v2 mechanics:** a prompt-composition module owns layer assembly; enforcement
test asserts byte-equality of the stable prefix across turns in CI.

### 5.4 Evaluated and rejected as default: continuous micro-compaction (Hermes)

Stated fully, per D4: micro-compaction absorbs one exchange per turn into a running
summary, keeping context near-constant during marathon sessions. Hermes accepts two
costs: it invalidates the prompt cache *every turn* (defeating doctrine 3), and it
adds 2–35 s auxiliary-model latency per turn. The corpus explicitly lists it
"deliberately not recommended," and Hermes' own docs concede the trade-off. Its one
genuinely good idea — user messages are never compacted — is already captured in
§5.2. **Verdict:** rejected for v2's default path; revisit only for a future
gateway scenario with months-long conversations where turn latency is invisible.
(Recorded nuance, doc_final D9: Hermes' *background review forks* DO inherit
byte-exact prefixes and get cheaper for it — that principle carries into our
reflection fork.)

### 5.5 Composition order in v2

```
turn prologue:   cache-boundary check → apply queued structural changes
                 → inject reminders ONLY into volatile tail
                 (memory itself: frozen session-start snapshot)
pre-call:        1. deterministic prune (tombstones)          [free, always]
                 2. threshold compaction if still over      [aux LLM, guarded]
send:            stable prefix + volatile tail (byte-checked in CI)
backstop:        overflow replay handling (existing)
```

Full rationale in ADR-003.

---

## 6. State and data layout

- `.kaioken/` tree as in §4.F — markdown/YAML artifacts, JSONL ledger, JSON indexes.
- `state.json` for runtime bookkeeping; daemon adds `jobs.json` (cron definitions)
  and `delegations/` records.
- Sessions: **JSONL trees** — the v2 format already on master records
  `ParentID`/`ForkedAt` lineage with `Entries` (full tree) + `Leaf` (active tip),
  maintained by `syncTree`; fork support lives in `fork.go`. *(Corrected in v1.1 —
  v1 wrongly said "linear chosen"; see RECONCILIATION.md.)* Session search must
  respect lineage (dedupe hits across a fork's ancestry).
- Transcripts flush incrementally during the turn (crash-safe), not only at
  finalize (lands with P1).
- Workspace rollback (#25): tree snapshots via the Environment interface's
  snapshot semantics; per-file `UndoEntry` stays the fast path (it covers
  write/edit paths only — which is exactly why tree snapshots are needed).
- Turn leases for genuinely multi-client shared sessions: deferred until the
  desktop sidecar needs them.
- Everything git-diffable; nothing opaque. Ledger blobs are content-addressed
  sha256, giving exact rollback for any knowledge-layer mutation.

## 7. Cross-cutting constraints

- **Windows first-class:** PTC TCP-loopback transport; `$EDITOR` fallback chain;
  CRLF normalisation on editor read-back; no AF_UNIX assumptions anywhere new.
- **Build hygiene:** `CGO_ENABLED=0`, `go test ./...` green. `-race` runs in CI
  on ubuntu only (needs cgo + C toolchain; stock Windows dev boxes can't build
  it) — any wave introducing concurrency treats the CI `-race` job as its gate.
- **Concurrency discipline:** goroutines + channels + `context.Context`
  cancellation; every background goroutine has a cancellation handshake with a
  deadline (reflection fork: ~2 s); hooks wrapped in `context.WithTimeout` +
  `recover()` — observers fail open, guards fail closed (backlog #13).
- **Cost visibility:** OpenRouter usage accounting extended to cover aux-model
  calls (compaction, reflection) so the learning loop's overhead is visible.

## 8. Explicit non-goals (v2)

| Rejected | Reason |
|---|---|
| Rewrite / language change / greenfield | D1; corpus shows seams, not foundations, were the problem |
| Continuous micro-compaction as default | §5.4 — defeats caching, adds per-turn latency |
| Gateway adapters (Telegram etc.) | D7 — interface only; platform shape ready instead |
| SQLite / FTS5 storage | Breaks `CGO_ENABLED=0` single-binary cross-compilation (ADR-009) |
| Effect-TS-style service graph, part-based message model, per-model prompt files, 30+ provider ports | Wrong ecosystem; Go idiom is interfaces + small structs |
| Honcho dialectic user modelling | Remote SaaS, wrong shape for local-first binary |
| MoA multi-advisor orchestration, voice/TTS/wake words | Not selected; complexity outranks value at this stage |
| GEPA/DSPy runtime self-optimisation | Future offline outer loop, human-reviewed PRs only; needs an eval harness first |
| ESTOP killing in-flight work | Violates the never-kill contract; gate new dispatches instead |
| Fast-echo stdout, Yoga flexbox, Nano Stores | Corrupt/duplicate Bubble Tea's Elm loop |
| Recursive Pydantic-style sanitisers | Moot with Go struct tags |
| Background delegation with async completion queue | Deferred until desktop scenario demands it; durable records land first |
| Ralph-style goal loops, Lean verification interleaving | Research-grade; incompatible with "no unattended loops" until trust machinery proven |
| Turn leases for shared sessions | Deferred until desktop sidecar shares sessions |

## 9. Corpus basis and confidence

| Source | Contribution |
|---|---|
| `docs/inspire-backlog.md` (28 items, adversarially verified 2026-08-22) | Item numbering used throughout; effort estimates; corrections table |
| `docs/inspire-phases.md` + `docs/phase-plans/` | Wave sequencing, gates, branch conventions |
| `docs/logic-audit-and-phases.md` | Original debt list — now largely MERGED (§9.1); unified-retrieval finding upgraded to D6 foundation |
| `doc_her/hermes-deep-dive-and-kaioken-comparison.md` (newest pass) | Verdict framing, transfer lists, §3/§5 mechanism details |
| `doc_agy/*` (first pass + 41k verification report, 433/511 quotes verified) | Self-improvement internals, PTC transport truth, permission-flow detail |
| `doc_open/HERMES_VS_KAIOKEN_ANALYSIS.md` (independent pass) | Two-invariants reading corroborating principles 2–3 |
| `~/Documents/reserch/*` (4 papers) | Dual-layer learning model, self-congratulation risk, GEPA/DSPy catalogue, HITL/MLOps pipeline shape |
| `doc_final/*` (parallel synthesis) | Conflict resolutions D1–D13 (verified, adopted), NEW decisions N1–N8 (adopted), corrections R1/R2 (applied); stale baseline items rejected — see RECONCILIATION.md |

Confidence notes: all Hermes mechanism claims inherit the corpus's adversarial
verification (every claim carries `file:line`; discrepancies flagged there are not
repeated here). Where the two comparison passes disagree on emphasis (e.g., whether
micro-compaction or prune is "better"), this document takes the verified-numbers
pass (`doc_her`) plus the explicit "not recommended" ruling in the backlog. Every
"current state" claim in this revision was checked against `git log`/source on
master rather than inherited from any document.

### 9.1 Verified current baseline (2026-08-23, `master` @ `7be48f2`)

Established by direct inspection, superseding both document sets' baseline claims:

- **Merged:** logic-audit phases 1–2 AND follow-ups for phases 1–4 — steering
  step-budget fix (`48f3c7d`), mixed-line-ending edit safety (`0bca280`),
  worker cancellation (+tests, `ae6a808`), research supervisor/grounding/resume/
  evidence fixes, `.gitattributes` (LF enforcement), CI `-race` job (ubuntu),
  research runstate hardening (`aa5e865`), knowledge-engine wave:
  `internal/retrieval/` package extracted (chunk/grader/lexical/variants +
  tests), prism memo-cache singleflight fix, `wiki/staleness.go`,
  memory write-dedup (`a867302`).
- **Still open (live bugs/gaps):** empty-response silent success (#8), provider
  transform layer (#11), retry hardening (#14) — i.e. W0′ + WP below.
- **Environmental:** `TestPrismImportAndQuery` fails without a local Ollama
  model present — non-regression, ignore in gates.
