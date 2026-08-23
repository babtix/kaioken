# Kaioken v2 — Target Architecture

> Revised 2026-08-22 after reconciliation with the parallel operator-planned
> proposal in [`../hermes_res/`](../hermes_res/) — same task, same corpus,
> plus eight scoping decisions locked in planning Q&A with the operator
> (its §1.2). Those locks are adopted here as **L1–L8**; one factual claim of
> theirs is corrected (see decisions log E). Sources and status legend:
> [README.md](README.md). Statuses: **LANDED** / **OPEN** / **NEW**.

---

## 1. Identity and mandate

Kaioken v2 remains a **single static Go binary** (`cli/`) that pairs a small,
deterministic agent core with a **verified, provenance-tracked knowledge
layer** — now evolving deliberately into a **platform**: a daemon-as-hub
runtime that owns sessions, jobs, and delegation records, serving thin-client
frontends (terminal TUI, desktop sidecar, future messaging surfaces). It
adopts Hermes' *disciplines* (cache-stable prompting, audited skill lifecycle,
bounded everything) without adopting Hermes' *shape* (god-files, Python
runtime, life-scoped conversations). The differentiator stays what no
reference agent has: precomputed, freshness-tracked knowledge with a
verify/provenance pass — extended by L5/L6 to govern skills and memory too.

### Operator-locked scoping decisions (from hermes_res §1.2)

| Lock | Decision | Consequence here |
|---|---|---|
| L1 | Evolve `cli/` in place — no rewrite | Everything is additive; seam fixes outrank restructuring |
| L2 | Full platform trajectory | Daemon-as-hub shape (§11), gateway-ready but adapter-free |
| L3 | Gated autonomy for learning | Full machinery built; autonomous-write switch ships OFF (§10) |
| L4 | Context doctrines clarified individually, then composed | §6 adopts the composed order incl. enforcement test |
| L5 | Daemon-as-hub topology | §11 platform layer is core v2 scope, not optional |
| L6 | Unified knowledge layer | wiki/cards/skills/memory/sessions merge machinery (§9) |
| L7 | In: PTC sandbox, execution-environment abstraction, cron-in-daemon. Out: gateway adapters | §5, §11; non-goals updated |
| L8 | Deliverable = master doc + decision records + roadmap | doc_final set + cross-reference to hermes_res ADRs |

## 2. Design tenets

Each tenet is traceable to research or to an operator lock; violations fail review.

| # | Tenet | Origin |
|---|---|---|
| T1 | **Narrow waist; capability descends a ladder**: extend existing tool → CLI command + skill → service-gated tool → plugin/wasm/MCP extension → new core tool (last resort). Every core tool schema ships on every API call. | Hermes "Footprint Ladder"; hermes_res principle 1 |
| T2 | **Prompt cache is sacred**: byte-stable system prompt per session via layered composition (stable→volatile); tool list frozen mid-session; memory enters prompts as frozen session-start snapshots; structural changes apply only at turn-prologue boundaries. | Hermes discipline + doc_her transfer #1 |
| T3 | **Reduce before send**: context reduction happens pre-call — overflow is unrecoverable after send; deterministic and free before LLM-driven. | hermes_res principle 3 (doc_her reverse-transfer) |
| T4 | **Safety precedes autonomy**: threat guard + linter + ledger + lifecycle pruner land before any autonomous authoring can be enabled. | inspire-phases ordering; ADR-010 invariant |
| T5 | **Pure Go, no CGO, no SQLite — ever**: retrieval is TextRank/BM25 (+optional embeddings); escape hatch if BM25 ever insufficient is a pure-Go vector index, not SQL. | backlog item 16 verification; ADR-009 |
| T6 | **Bounded everything at boundaries**: output caps + spill pointers; error bodies ≤ ~2 KB at dispatch; FIFO/device/socket read guards; truncation-guard on length-stopped streams; hook deadlines; fork cancellation handshakes. | five-pillar survey; pi guard; items 1/8/13 |
| T7 | **Extraction, not rewrite** — duplicated subsystems converge by extracting the best implementation behind an interface, porting callers landing-by-landing. | audit §3.1 doctrine; ADR-001 |
| T8 | **Never hard-delete learned artifacts**: archival-only transitions, append-only ledger, content-addressed rollback. | reserch curator invariant; item 18 |
| T9 | **Learned behavior is gated, not trusted**: objective signals (traces, verify failures, user rejections in the ledger) — never self-judged success ("self-congratulation problem"). | reserch [BA]; ADR-004 |
| T10 | **One policy owner per concern**: agent policy lives in the agent (compaction inside `Run`); front-ends inherit. | audit §1.1 fix, codified |
| T11 | **Honesty over confidence**: stale knowledge, ungrounded findings, degraded retrieval say so in-band; every generated artifact carries provenance. | PRISM flags; phase3 §3.3; hermes_res principle 6 |
| T12 | **Legible state**: durable state lives as inspectable markdown/YAML/JSONL under `.kaioken/` + `state.json` — git-diffable, hand-editable, no opaque DB. | hermes_res principle 8 |

## 3. Component map (target)

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
│             │ approvals,   │ retry, budget │ (interface, §5.4)   │
│             │ PTC sandbox  │ routed models │                     │
└─────────────┴──────────────┴───────────────┴─────────────────────┘
                       │ reads/writes
                ┌──────▼─────────────────────────────────────┐
                │   UNIFIED KNOWLEDGE LAYER (§9, L6)         │
                │   ONE retrieval stack · shared lifecycle   │
                │   wiki·cards·skills·memory·sessions        │
                │   verify+provenance · audit ledger         │
                └────────────────────────────────────────────┘
```

\* Gateway adapters are an explicit v2 non-goal (L7); the daemon's event bus
and session ownership are shaped so they attach later additively.

Dependency rule: cmd/tui → agent/wiki/llm → utilities; config cross-cutting.
T10: agent policy never imports tui; front-ends speak `agent.UI`.

## 4. Agent core (the loop)

### 4.1 Turn lifecycle (v2)

```
submit ──► slash? ──► dispatch
   │ else
   ▼
busy? → Steer() (unbilled, drains after tool batch, anti-flood ceiling 4×MaxSteps)
   ▼
prologue: apply queued structural changes (tool-list/skill installs) →
          reminders/memory injected ONLY into volatile tail            [T2]
pre-call:
  ShouldCompact ladder inside Run (prune→compact at user boundaries)   [LANDED]
  BudgetGuard.Check (USD warn/hard)                                    [LANDED]
  BeforeProviderRequest hook (deadlines, fail-open/closed)             [OPEN item 13]
  chatWithRetry                                                        [OPEN item 14]
     ├─ transform rules applied                                        [OPEN item 11]
     ├─ empty-200 → error + streak breaker (model,provider,finish_reason) [OPEN item 8]
     └─ stop_reason==length mid-tool-call → structurally fail calls     [NEW, pi guard]
runToolCalls:
  read-only parallel; mutating solo; every call answered on cancel     [LANDED]
  approval enum AllowOnce/Session/Always/Deny                          [OPEN item 4]
  after edit_file: bounded <diagnostics> delta                         [OPEN item 24]
drain steering/follow-ups; loop to final answer
persist transcript incrementally during turn                           [NEW N2]
```

### 4.2 Decisions baked in

- **Context policy in `Run`, not front-ends** — LANDED (audit 1.1); under L5
  this also means the daemon inherits it identically.
- **Never summarize user messages** (item 5): user turns extracted from the
  compaction head and re-injected verbatim. Highest value-per-hour item in
  the corpus.
- **Chained summaries, not stacked ones**: summarize summary-plus-recent-tail;
  never accrete layers (opencode lesson).
- **Active interrupt-and-redirect** (item 21): split turn context from provider
  HTTP context; cancel stream alone; keep completed tool results; replay
  partial prose scaffolded, chain-of-thought stripped first (non-negotiable —
  partial-CoT replay trips reasoning-injection classifiers).
- **Hook hygiene** (item 13): `context.WithTimeout` + `recover()`; observers
  fail open, guards fail closed.
- **Sub-agents inherit via `derive()`** — LANDED (audit 1.2), including the
  worktree-memory hazard: delegates run `MemoryDisabled = true`
  (`delegate.go:156`). Durable delegation records (dispatch/completion)
  persist in the daemon so a restarted desktop recovers subagent results (L5).

## 5. Tools & execution environments

### 5.1 Tool surface

- **Approval model v2** (item 4): four-state enum across all `agent.UI`
  implementors; quick-keys `s`/`a`; shell-operator-aware ruleset engine stays
  the policy substrate. Prerequisite for PTC's rich per-call verdicts.
- **Defensive file ops**: FIFO/device/socket guard in `readFile` (item 1);
  keep BOM/mode-preserving edit pipeline; `$EDITOR` CRLF normalization on
  read-back.
- **Compound `apply_patch`** (N5): multi-file add/update/delete in one turn;
  complements `edit_file`.
- **Bounded outputs** (LANDED spill store) + error bodies capped ~2 KB (N3);
  file-mutation verifier footer when some writes failed unsuperseded (N4).
- **PTC sandbox** (item 22): `execute_code` generates a stub exposing enabled
  tools as functions to a child script; child is untrusted — tool surface,
  NOT filesystem/credentials; per-call authorization still applies. Dual
  transport AF_UNIX/loopback-TCP (verified; stale-docstring incident is the
  lesson: integration-test Windows, don't assume). Builds on `internal/rpc`.
  Protocol carries request IDs — fixing the class of bug that forced Hermes'
  stub to use a `_call_lock` because its protocol lacked them.

### 5.2 Execution environments (NEW, from ADR-007 / lock L7)

Extract an `Environment` interface over today's `proc_unix.go`/
`proc_windows.go`: start / exec / stream / teardown, with snapshot semantics
for undo integration. Local process stays default; exactly one additional
backend in v2: **Docker**. Adopt Hermes' error taxonomy:
connection-level failures (`EnvironmentConnectionError`-class) are retryable;
ordinary command failures are not. SSH/remote/serverless attach later without
loop changes — none are built in v2. Git-snapshot undo (item 25) plugs into
this interface's snapshot semantics.

## 6. Context management — three doctrines, composed (lock L4)

1. **Deterministic pre-call prune (Kaioken; primary)** — tombstone dead weight
   (superseded tool outputs, old reminders) before every call; free,
   deterministic, history stays replayable. Always on.
2. **Threshold LLM compaction with hard guards (Kaioken; second stage)** —
   only when prune cannot hold the window: head/tail split at user-message
   boundaries (LANDED placement), aux-model summary, chained-not-stacked,
   user turns verbatim (item 5), epochs recorded. Compaction prompt chosen
   against small models deliberately (opencode retuned theirs for
   DeepSeek-class mis-following).
3. **Cache-stable layered prompting (Hermes; the flagship import)** — a
   prompt-composition module owns layer assembly: stable identity/tools/rules
   first, volatile content last; byte-stable for the session's life;
   toolset membership frozen at session start; anything mutating the prefix
   (MCP refresh, skill installs) deferred to the next prologue boundary.
   **Enforcement:** CI test asserts stable-prefix byte-equality across turns;
   rebuilt prefixes adopted only on literal byte-match.
   *Evaluated and rejected as default:* continuous micro-compaction —
   invalidates the cache every turn, adds 2–35 s aux latency; its one good
   idea (never compact user messages) is already doctrine 2. Revisit only for
   months-long gateway conversations if they materialize.

Send composition: `stable prefix + volatile tail`. Backstop: existing overflow
replay handling. Memory snapshot frozen at session start (N1); per-turn
`<system-reminder>` blocks ride only in the volatile tail.

## 7. Providers

- **Transform layer** (item 11): ordered independently-testable rules over
  `map[string]any` — nullable-union collapse, tool-ID sanitization
  `[A-Za-z0-9_-]`, empty-text coercion, Gemini schema subsetting, output-only
  field stripping on replay. Table-tested with real malformed payloads.
- **Retry hardening** (item 14, lands with item 8): unknown finish reasons,
  raw network errors, capacity stream errors, caps with jitter; shrink retry
  budget when estimated input cost is high; empty-response streak breaker.
- **Cost visibility** (NEW from hermes_res): OpenRouter usage accounting
  extended to aux-model calls (compaction, reflection) so reduction/learning
  overhead is visible.
- Keep: routed role models, USD budget guard, affordable-max_tokens recovery,
  cost catalog fallback, thinking levels (LANDED).

## 8. State & persistence

- `.kaioken/` layout per §9; `state.json` runtime bookkeeping; daemon adds
  `jobs.json` (cron definitions) and delegation records.
- Sessions stay **JSONL trees** (`session/tree.go`, `fork.go`,
  ParentID/ForkedAt lineage, v2 format — LANDED). Note: hermes_res §6 claims
  "linear chosen" — that contradicts the code; corrected in decisions log R1.
  NEW: incremental flush during the turn (crash-safe, N2).
- Session search (item 16): textrank-BM25 + JSON index, ranked hits, lineage
  dedup, ±5-message anchored hydration — borrow Hermes' retrieval design,
  never its SQLite storage (T5).
- Workspace rollback (item 25): shadow git-tree snapshots via the Environment
  interface's snapshot semantics; per-file `UndoEntry` remains the fast path.
- Turn leases for genuinely multi-client shared sessions: deferred until the
  desktop sidecar needs them (roadmap Unscheduled).

## 9. Unified knowledge layer (lock L6 — the differentiator)

One layer, multiple tenants — wiki, cards, skills, memory, sessions:

- **One retrieval stack** (audit 3.1): extract chunk→rank→fuse (+ relevance
  gate) into `internal/retrieval`; port `search` (drop-in, preserve index
  shape/fingerprint); fold `research/corpus` last. Quality fixes land once.
  PRISM agentic retrieval remains a first-class mode over the stack. Fix the
  memo-cache TOCTOU with per-module singleflight (audit 3.2).
- **Shared artifact metadata**: every tenant artifact carries
  `{source_provenance, created_at, last_verified_at, freshness_state}`.
- **Shared lifecycle**: `active → stale(30d unused) → archived(90d)`
  (configurable; pinned/bundled exempt), non-destructive into `.archive/` —
  one mechanism for skills AND knowledge cards (items 15/27 generalized).
- **Verify/provenance generalised**: the wiki verify pass becomes layer-wide
  trust — generated skills and distilled memory cite their evidence (session
  transcripts, wiki pages), making learning-loop output auditable like docs.
- **Staleness everywhere** (audit 3.3): commit-distance surfaced in
  `knowledgeSummary` and `read_knowledge`.
- **Memory hygiene** (audit 3.4): cheap dedup before append (normalized match
  or similarity threshold, no embedding call); capacity reads as "redundant,"
  not "full".
- **One shared ledger**: all mutations append to one JSONL audit trail with
  sha256 content-addressed blobs and exact rollback (ledger failure never
  blocks mutation — telemetry, not gate).

## 10. Learning loop — gated autonomy (locks L3; ADR-004/010)

```
signals ──► memory nudge (mid-turn, heuristic-gated)        [always on]
corrections ► background reflection fork (async, cancellable ~2s) [always on]
complex-task trace ─► skill SYNTHESIS PROPOSAL              [approval-gated]
        proposals ─► threat guard + linter scan             [always, before accept]
                 ─► shared ledger entry + sha256 blob       [always]
curator (deterministic, no LLM): active→stale→archived      [scheduled/on-update]
consolidation: `kaioken skills consolidate`                  [explicit cmd only]
```

- **Foundation first (T4, hard invariant):** multi-file skill directories
  (#10) → threat guard (#12) + linter → shared ledger (#18) → lifecycle
  pruner (#15) ship BEFORE any feature that writes skills. No reordering.
- **Reflection fork** (#23): gated on `memory.Signals()` heuristics (real
  corrections, error recovery) — not raw counters; preserves the cache
  snapshot; cancelled within ~2 s of new user input; sandbox whitelist =
  `memory` + skill-mutation tools only; patch-over-rewrite editing policy.
- **Gate mechanics:** synthesis proposals land in a review queue surfaced via
  TUI and daemon API; config flip `skills.autonomous_writes: true` promotes to
  auto-apply ONLY after an operator-reviewed track record — the gate is a
  policy point, not missing machinery. Reflective layer keys on objective
  ledger signals (traces, verify failures, rejections), never the executing
  model's own success claims (T9).
- **Consolidation** (#27) explicit command only. **Timeline** (#28) visualizes
  what was learned, after the loop exists.
- **Out of runtime scope:** GEPA/DSPy evolutionary optimization — catalogued
  as a future offline outer loop (PR-based, human-reviewed).

## 11. Platform layer — daemon-as-hub (locks L2/L5/L7)

- The HTTP daemon becomes the **single owner of agent instances, sessions,
  runs, jobs, and delegation records**; TUI/desktop/headless are thin clients
  over local HTTP + SSE. Zero-setup UX preserved: the TUI auto-spawns the
  daemon on a localhost socket when none is running — one binary, hub
  ownership. This kills the dual-mode seam (TUI-embedded vs daemon-owned
  sessions) the logic audit warns about.
- **Cron scheduler in-daemon** (now IN scope, superseding earlier deferral):
  60-second tick, file-locked; jobs persisted as `jobs.json`; delivery targets
  resolved against connected surfaces; scheduled deliveries land in dedicated
  sessions so main-transcript role alternation stays intact (Hermes pattern).
- **ESTOP analog gates NEW dispatches at this layer only** — in-flight work is
  NEVER killed (matches backlog item 3's re-scope; supersedes D11's "dropped").
- **Gateway boundary:** define the `PlatformAdapter` interface (deliver /
  receive / ack) and stop — no adapters ship in v2.
- **God-file discipline day one:** daemon handlers partitioned runs/jobs/
  events/approvals; file-size budget enforced in review (gateway/run.py's
  31.3k lines is the counter-example).

## 12. Surfaces

- **TUI**: double-tap Enter drain (#2); input history recall (#7);
  `$EDITOR` composition with Windows fallback chain (#6); inline `!cmd` /
  `{!...}` interpolation (#9); paste-collapse chips (#20); argument/path
  completion behind palette state machine (#17); searchable model selector
  (#19); approval quick-keys via the enum (#4). Gains daemon
  spawn/health-check/reconnect lifecycle under L5.
- **Live tool tree** (#26) and **learning timeline** (#28): polish, last.
- **Headless/rpc/MCP/ext**: shapes unchanged; inherit everything via T10.

## 13. Cross-cutting invariants (review checklist)

1. Past context never mutated except at user-boundary compaction; stable
   prefix byte-equality enforced by CI test.
2. Tool list frozen within a session; structural changes only at prologue.
3. Strict role alternation preserved by steering/redirect/reminders/cron.
4. Every mutating call approved or rule-covered; newline chaining never
   bypasses stored rules (LANDED).
5. No unbounded model-facing text; hooks cannot hang the loop.
6. `CGO_ENABLED=0` green; no SQLite anywhere, ever (auto-reject at review).
7. Learned artifacts: scanned, ledgered, archival-only, reversible, cited.
8. Retrieval answers carry provenance + staleness + relevance-gate verdicts.
9. One policy owner per concern; front-ends inherit.
10. Windows first-class: TCP-loopback transports, editor fallback chains,
    CRLF handling, no new AF_UNIX assumptions.
