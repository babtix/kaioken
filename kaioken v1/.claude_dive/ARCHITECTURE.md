# ARCHITECTURE — Kaioken v2 (canonical)

**Date:** 2026-08-24 · **Baseline:** `master @ bd740fe` · **Status:** Canonical.
Successor to `archive/hermes_dive/README.md`, which superseded `archive/docs/hermes_res/` and
`archive/docs/doc_final_opencode/`. See `SUPERSEDED.md` for the full chain.

**Provenance.** The skeleton, locks and subsystem breakdown are inherited from the predecessor
set. What is new here is that **every "current state" claim was re-derived from source** rather
than inherited from a predecessor's verification pass — which is how the corrections in
`adr/ADR-003`, `adr/ADR-006`, `adr/ADR-007` and `DECISIONS.md` were found. Reading order:
this file → `adr/` for the *why* → `ROADMAP.md` to build. `00-STOPGAP.md` first if you are
about to touch the learning loop.

---

## 1. Identity and mandate

Kaioken v2 remains a **single static Go binary** (`cli/`, `CGO_ENABLED=0`) pairing a small,
deterministic agent core with a **verified, provenance-tracked knowledge layer**, and grows
into a **platform**: a daemon-as-hub runtime that owns sessions, runs, jobs and delegations,
with terminal and desktop as thin clients.

It is not a conversation runtime. Hermes centres the *conversation*; Kaioken centres the
*repository*. That single difference predicts which imports from the reference agents port
cleanly (durability, lifecycle, scheduling, sandboxing) and which are category errors
(platform adapters, per-conversation identity, allowlist authz).

### 1.1 Operator locks

| Lock | Statement | Where |
|---|---|---|
| **L1** | Evolve `cli/` in place — no rewrite; everything additive; seam fixes outrank restructuring | ADR-001 |
| **L2** | Full platform trajectory — daemon-as-hub shape, gateway-*ready* but adapter-free | §8, ADR-002 |
| **L3** | Gated autonomy: full machinery built, autonomous-write switch ships OFF | §9, ADR-004 |
| **L4** | Context doctrines clarified individually, then composed | §6, ADR-003 |
| **L5** | Daemon-as-hub topology is core v2 scope | §8, ADR-002 |
| **L6** | Unified knowledge layer across wiki/cards/skills/memory/sessions | §7, ADR-005 |
| **L7** | In scope: PTC sandbox, execution environments, cron-in-daemon. Out: gateway adapters | ADR-006/007/008 |
| **L8** | Deliverable = master doc + decision records + roadmap | this set |

> **L3 carries an amendment.** L3 was written believing the autonomous-write switch was off.
> It is not — see `00-STOPGAP.md`. L3's *intent* is preserved by making it true, via the
> stopgap, before anything else ships.

### 1.2 Principles

1. **Footprint ladder.** New capability descends: extend an existing tool → CLI command +
   skill → service-gated tool → plugin/wasm/MCP → new core tool (last resort). Every core tool
   schema ships on every API call; the loop must not grow. Kaioken is at 12 built-in tools and
   drifting upward — the ladder's default answer is *no*.
2. **Extraction, not rewrite.** Duplicated subsystems converge by extracting the best
   implementation behind an interface and porting callers landing-by-landing. Proven once
   already by `internal/retrieval`.
3. **Never hard-delete learned artifacts.** Archival-only transitions, append-only ledger,
   content-addressed rollback.
4. **Bounded everything at boundaries.** Tool output, error bodies, hook handlers, background
   goroutines — each has a cap, a deadline or a cancellation handshake.
5. **Legible state.** All durable state is inspectable markdown/YAML/JSONL under `.kaioken/`.
   No opaque database, ever.
6. **The ledger is telemetry, not a gate.** An audit record's failure must never block the
   mutation it records.
7. **Windows is first-class.** No AF_UNIX assumptions, no POSIX-only primitives, CRLF handled,
   integration-tested rather than assumed.
8. **Objective signals only.** Reflective judgement keys on execution traces, verify failures
   and user rejections — never the executing model's own claim of success.

### 1.3 Verified baseline

`cli/` is byte-identical across `7be48f2`, `36dfcaf` and `bd740fe`. All four logic-audit phase
branches are merged; **no branches are open**. Landed and *not* to be re-proposed: retrieval
extraction (step 1 of 3), PRISM singleflight, wiki staleness, memory dedup, steering step-budget
fix, line-ending fix, worker cancellation, runstate hardening, `.gitattributes`, CI `-race`
(ubuntu-only — it needs cgo, which does not reopen cgo for the product build).
Genuinely open: **#8, #11, #14**. Full deleted-work list in `ROADMAP.md` §4.
Toolchain: **Go 1.26** (`cli/go.mod:3`) — see `DECISIONS.md` DV-Go-Version for why three prior
document generations said 1.24.

---

## 2. Component map

```
   TUI (thin)        Desktop (Tauri)        Headless / RPC / MCP
        └───────────────────┴───────────────────────┘
                            │  loopback TCP + SSE, ephemeral port + token
                    ┌───────▼────────┐
                    │     DAEMON     │  owns: sessions · runs · jobs · delegations
                    │   (the hub)    │  cron scheduler · ESTOP dispatch gate
                    └───────┬────────┘
                            │
                    ┌───────▼────────┐
                    │   AGENT CORE   │  ~140-line Run loop · prologue/loop/finalize
                    │                │  prune → compact → cache-stable prefix
                    └───┬────────┬───┘
                        │        │
        ┌───────────────▼──┐  ┌──▼──────────────────┐
        │  TOOL SYSTEM     │  │  PROVIDER LAYER     │
        │  12 core tools   │  │  transform rules    │
        │  registry seam   │  │  2 retry layers     │
        │  wasm · MCP      │  │  cache-control tags │
        │  PTC (Starlark)  │  └─────────────────────┘
        └───────┬──────────┘
                │
        ┌───────▼─────────────────────────────────────┐
        │        UNIFIED KNOWLEDGE LAYER              │
        │  one retrieval engine (internal/retrieval)  │
        │  tenants: wiki · cards · skills · memory ·  │
        │           sessions                          │
        │  shared: metadata · lifecycle · verify ·    │
        │          ledger                             │
        └─────────────────────────────────────────────┘
```

---

## 3. Agent core

The ~140-line `Run` loop ([agent.go:104](../cli/internal/agent/agent.go:104)) is preserved.
v2 gives it named phases:

- **Prologue** — apply queued structural changes (tool-list changes, skill installs) at a
  defined boundary; reconcile the context epoch; inject volatile reminders into the tail only.
- **Loop** — budget check → context management → provider call → tool batch. Read-only tool
  calls already fan out concurrently; mutating calls stay sequential.
- **Finalize** — persist, evaluate distillation signals. Today persistence is the *caller's*
  job (TUI and daemon each do it differently) — P1 consolidates it.

**Correctness invariants v2 adds:** empty 200s fail loudly; length-truncated tool calls fail
structurally on *both* streaming and non-streaming paths; failed writes that are never
superseded produce an advisory footer, so "I edited five files" cannot be claimed when two
failed.

---

## 4. Tool system

Twelve core tools plus a live-but-unused runtime registry seam
([tool_registry.go](../cli/internal/agent/tool_registry.go) — `registeredSchemas` and
`lookupRegistered` are wired; nothing registers). Extension tiers: wasm/WASI under wazero
(pure Go, no sockets, no filesystem — sandboxed by construction), MCP in both directions.

v2 adds **four-state approvals** (`AllowOnce/AllowSession/AllowAlways/Deny`) over the
*existing* shell-operator-aware ruleset engine — the engine is not replaced, only the
return type and the keybindings — and **PTC** (`execute_code`): the `kaioken` binary spawned
as an untrusted child running generated Starlark, receiving the tool surface and nothing else.

---

## 5. Provider layer

A transform layer (`internal/llm/transform.go`, new) turns provider quirks into ordered,
individually-tested rules instead of scattered special cases. Two retry layers — transport and
per-turn — gain jitter, streak detection keyed on `(model, provider, finish_reason)`, and a
cost-aware budget shrink.

**Aux-model spend must enter the budget.** `Budget.Check` reads only the workspace client's
spend, while compaction and delegation run on routed clients with fresh counters — so aux spend
currently escapes the hard stop, not merely the display.

---

## 6. Context management — the three doctrines

*This is the section `adr/ADR-003` refers to.*

Three independent mechanisms, stated separately then composed. A fourth (continuous
micro-compaction) was evaluated and rejected.

### 6.1 Doctrine 1 — deterministic pre-call prune · **already built**

Before every call, tombstone provably dead weight — superseded tool outputs, stale reminders —
at zero model cost, preserving `tool_call_id` pairing and leaving history replayable.
`internal/agent/prune.go`, driven from `manageContext`. Always on.

Its placement is load-bearing and the code says why:

> *"Overflow is not recoverable in place: once the request fails, the history that failed to
> send is the only history there is, and it is already too large — so the reduction has to
> happen while the failure is still hypothetical."* — [agent.go:159-163](../cli/internal/agent/agent.go:159)

**There is no overflow-replay backstop.** The predecessor ADR listed one as "(existing)",
borrowing this comment's reasoning while asserting the thing it says does not exist. Nothing
scheduled it as a result. The reconciliation point created by wiring the epoch module (§6.3) is
where such a backstop would hook, if one is ever built.

### 6.2 Doctrine 2 — threshold LLM compaction

When pruning is not enough: head/tail split at user-message boundaries, aux-model summary via a
fixed template with cumulative reconciliation. Summaries are **chained, not stacked** — already
true today ([compact.go:378-380](../cli/internal/agent/compact.go:378) folds a prior summary in
rather than accreting layers).

The one genuine gap: **user messages are summarised away**
([compact.go:323-363](../cli/internal/agent/compact.go:323)). Every non-final user turn goes to
the summariser, so stated constraints — *"don't touch package X"* — become paraphrase and stop
binding. Extracting user turns and re-injecting them verbatim is the highest value-per-hour
item in the entire corpus.

**Accepted limitation, recorded rather than absorbed silently:** the user-boundary-only cut
forces `cut == lastTurn` when the final turn alone exceeds the tail budget. Both reference
agents solve this; v2 accepts it for the default path and schedules opencode's `splitTurn`
refinement as optional W4 work.

### 6.3 Doctrine 3 — cache-stable layered prompting · **~65% already written, unwired**

The system prompt is assembled once per session in stable→volatile layer order and is then
byte-stable for the session's life. Anything that would mutate the cached prefix defers to the
next prologue boundary. A rebuilt prefix is adopted only on literal byte-match.

[epoch.go](../cli/internal/agent/epoch.go) already implements the mechanism: `ContextEpoch`
holds per-source sha256 `Snapshots`; `Reconcile()` diffs current sources against the baseline;
`BuildMidConversationMessage()` emits a `<system_context_update>` *instead of* mutating the
prefix. `InitializeEpoch` ([context.go:88](../cli/internal/agent/context.go:88)) is the wiring
point. **Zero callers, zero tests.** Three independent audits of this corpus found it; none of
the eight planning documents opened it.

So doctrine 3 is a **wiring task, not a build**. Two real defects sit alongside it:

- [reminders.go:95-103](../cli/internal/agent/reminders.go:95) strips reminder blocks from
  *every* historical user message each turn, rewriting the exact bytes
  `applyCacheBreakpoints` marked ([anthropic.go:76-89](../cli/internal/llm/anthropic.go:76)).
- Memory is read at render time, so its session-start-snapshot semantics hold only by accident
  of how each front-end happens to build the prompt. v2 makes it a code-level rule.

Anthropic cache breakpoints already ship at
[anthropic.go:73](../cli/internal/llm/anthropic.go:73) and `:86`. The remaining N9 work is
extending tags to boundaries the wired module creates, and to other providers.

### 6.4 Rejected — continuous micro-compaction

Invalidates the prompt cache every turn and adds 2–35 s of aux latency per turn. Its one good
idea — never compact user messages — is captured in doctrine 2. **Recorded nuance:** Hermes
both thrashes the cache (main loop) *and* engineers cache warmth (background review forks
inherit byte-exact prefixes). Both are true, scope-dependent; the second pattern carries into
the reflection fork. Revisit only if months-long gateway conversations materialise.

---

## 7. Unified knowledge layer

One retrieval engine, five tenants. Today there are **three parallel stacks**: `internal/prism`
(ported onto `internal/retrieval`), `internal/search` (still raw `textrank`, and crucially
**no relevance gate** — so `read_knowledge` returns the least-bad chunk), and
`internal/research` (its own `Chunk`, `keywordScore`, `rankChunks`, lexicon). The extraction
that fixes this is **started and two-thirds unfinished** — `internal/retrieval` exists and
PRISM is its only importer.

v2 finishes it: port `search` onto `retrieval` as a drop-in preserving index shape, fold
`research/corpus` last, keep PRISM agentic retrieval as a first-class *mode* over the shared
stack. Sessions join as a **`KindSession` on the existing `internal/search` index** — that
package already has BM25, a JSON index and a corpus fingerprint; a separate session-search
stack would make it the fourth.

Shared across tenants: `{source_provenance, created_at, last_verified_at, freshness_state}`;
non-destructive `active → stale(30d) → archived(90d)` lifecycle with pinned/bundled exemptions;
the wiki verify pass generalised so generated skills and distilled memory cite their evidence;
one append-only JSONL ledger with sha256 content-addressed blobs.

**Storage is pure Go, permanently.** No SQLite — `mattn/go-sqlite3` needs a C toolchain and
ends single-binary cross-compilation; `modernc.org/sqlite` drags a large transpiled tree. If
BM25 ever proves insufficient the escape hatch is a pure-Go vector index, not SQL. Any future
SQLite proposal is auto-rejected at design review.

---

## 8. Daemon and platform

The daemon becomes the single owner of agent instances, sessions, runs, jobs and delegations.
Today two code paths own sessions — the TUI constructs an `Agent` in-process and saves its own
transcripts, while the daemon does the same differently, each building its own system prompt
under different conditions. That is precisely the seam-class defect the logic audit warns
about.

**Transport: loopback TCP on an ephemeral port, plus a per-boot token** under
`.kaioken/daemon/` — not AF_UNIX, not a named pipe, consistent with the PTC decision.
Auto-spawn preserves zero-setup UX; the child daemon is tied to its spawner's lifetime.

Cron lives inside the daemon: 60 s tick, jobs persisted as `jobs.json`, scheduled deliveries
landing in **dedicated sessions** so main-transcript role alternation survives. An ESTOP analog
gates **new dispatches only** — in-flight work is never killed. Locking must be portable:
`fcntl.flock` is POSIX-only, so use `LockFileEx` or an atomic-rename lease.

A `PlatformAdapter` interface (deliver/receive/ack) is defined and **no adapters ship**. The
platform trajectory is preserved by shape, not by code.

---

## 9. Skills and the learning loop

**The switch is not off.** `memory.Distill` writes model-generated skills to disk today with no
approval, scan, ledger or rollback, reachable from `/learn` at default settings. See
`00-STOPGAP.md`. Everything below describes the intended end state; the stopgap is what makes
the interim honest.

Order is an invariant, not a schedule (ADR-010): **multi-file skill layout → threat guard +
linter → audit ledger + rollback → lifecycle pruner**, all before any feature that writes
skills. `memory.PruneStale` already implements never-hard-delete, human-exempt staleness
detection and has no caller — the pruner *wires* it rather than rebuilding it.

The reflection fork runs post-turn, gated on `memory.Signals()` — which is already live and
called by `Distill`, making this a cadence change rather than new machinery — cancellable
within ~2 s of new user input, sandboxed to memory and skill-mutation tools, patching rather
than rewriting. It keys on objective signals, never the model's own success claim. Two failure
modes are designed against explicitly: **curator takeover** (a fork writing its own harness turn
into the user's session, which the agent then reads back as a standing instruction) and
**hallucinated overwrites** (a write refused unless the fork actually read that skill this
turn).

Consolidation is an explicit command. There are no unattended loops.

---

## 10. State layout

All under `.kaioken/`, all legible: `wiki/` · `knowledge/` · `skills/` · `sessions/` ·
`prism/` · `research/` · `impact/` · `handoffs/` · `templates/` · `site/`, plus `ledger/`
(new, W2) and `daemon/` (new, P1). Memory lives in markdown; sessions are **JSONL trees**
with `ParentID`/`ForkedAt` lineage, `Entries` and `Leaf` — *not* linear, contrary to one
predecessor's claim, and `tree.go`/`fork.go` are shipping code that claim would have justified
deleting.

---

## 11. Constraints

`CGO_ENABLED=0`, single cross-compiled binary · no SQLite, ever · Windows first-class ·
`-race` in CI is ubuntu-only and does not reopen cgo for the product build · `kaioken.exe` is
locked while running, so build-then-swap · root capacity is ~1 substantial feature per week.

## 12. Non-goals

Rewrite or re-architecture toward Hermes' shape · gateway/messaging adapters · GEPA/DSPy
evolutionary optimisation in the v2 runtime · SSH/serverless execution backends · Effect-style
monadic service graphs · opencode's part-based message model, per-model prompt files, or 30+
provider ports · continuous micro-compaction as the default path · session turn leases until
the desktop sidecar actually shares sessions · a collapsible DOM-style tool tree · multi-user
anything.
