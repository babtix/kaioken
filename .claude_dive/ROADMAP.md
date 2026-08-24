# ROADMAP — Kaioken v2

**Date:** 2026-08-24 · **Baseline:** `master @ bd740fe` (verified ancestor; `cli/` byte-identical
to `7be48f2` and `36dfcaf` — the intervening commits are docs and version strings only).
Canonical successor to `archive/hermes_dive/roadmap.md`. Item numbers (#N) refer to
`archive/docs/inspire-backlog.md`; audit §N to `archive/docs/logic-audit-and-phases.md`.

Every file target below was re-verified against source during this rewrite (`AUDIT.md`).
Decisions resolving open verdicts are in `DECISIONS.md` (DV-1 … DV-10).

---

## 0. Precondition — the stopgap

**`00-STOPGAP.md` lands before Wave 0′. It is not a wave.**

Kaioken already writes model-generated skills to disk unattended, with no approval, scan,
ledger or rollback ([learn.go:269](../cli/internal/memory/learn.go:269), reachable from
`/learn` at default settings). Every ADR in this set sequences safety *before* autonomy; that
sequencing is right, but it assumed autonomy was not yet live. The stopgap closes the live gap
in one patch so it does not stay open for the weeks W2 takes to build properly. See DV-1.

---

## 1. Track structure

```
                    ┌─ STOPGAP (precondition, blocks everything)
                    │
CORRECTNESS   W0' ──┴─► W1 ──────────────────────────► W4 (deep capability)
PLATFORM                 └─► P1 ──► P2 ──► P3 (environments + PTC, lands with W4)
LEARNING            W2 ─────────────► W3 (gated loop goes live)
              WP (provider robustness) runs parallel, before W4
```

**Binding sequencing rules:**

1. **The stopgap precedes everything.** (DV-1)
2. **The ordering invariant outranks all other readiness** — nothing in the Learning track
   starts before W2 merges, regardless of what else is ready (L3 / ADR-010).
3. Cheap correctness first: W0′ before everything else.
4. Approval enum (W1) precedes PTC (P3) — PTC needs rich per-call verdicts.
5. Daemon hub (P1) precedes cron (P2).
6. Transform layer (WP) precedes W4, so PTC stubs emit already-transformed schemas.
7. **The epoch module is wired in W1 before WP's N9 cache-tag rules** — the tags need stable
   boundaries that only doctrine 3 creates (ADR-003).

**W2 has moved.** In both predecessor roadmaps W2 sat behind W1 as phase 4 of 6. It is now the
second thing that happens, concurrent with W0′/W1, because it is remediation for a shipped
capability rather than a gate in front of a future one.

---

## 2. Mapping onto the root roadmap

Root [`ROADMAP.md`](../ROADMAP.md) is a live 12-month plan (Aug 2026 → Jul 2027, v1.3.1 → v2.0)
with a stated capacity budget of **~1 substantial feature per week** and its own operating
discipline. **None of the eight documents that fed this plan mention it.** This plan slots into
it rather than replacing it (DV-5).

| This plan | Root milestone | Fit |
|---|---|---|
| **STOPGAP** | *(override — none)* | Deliberately ignores the cadence. Closes a live gap; does not build a capability |
| **W0′** provider bugs | **M1** Green everywhere (Aug, v1.4) | Direct fit — correctness, self-verifying |
| **W1** correctness + ergonomics | **M1**/**M3** | TUI ergonomics are the CLI-side complement to M3's desktop depth pass |
| **WP** transform layer | **M1–M2** | Provider robustness underpins everything after |
| **W2** skill safety | *(pulled forward from M7/M8)* | **The one substantive resequencing.** Root schedules sandboxing at M7 (Feb 2027); the stopgap + W2 cannot wait that long |
| **Knowledge layer** (search → `internal/retrieval`, staleness, provenance) | **M4** Retrieval that earns its keep (Nov, v1.7) | Excellent fit — M4 already calls for a unified search tool and a retrieval eval harness |
| **P1** daemon-as-hub | late **M6** / early **M7** | Infrastructure prerequisite for M8's background workers |
| **P3** environments + PTC | **M7** Permissions & sandboxing (Feb, v1.10) | Direct fit — M7 already calls for worktree isolation, tool permission policy, resource ceilings |
| **P2** cron, **W3** learning loop | **M8** Background workers (Mar, v1.11) | Direct fit — M8 *is* the Hermes concept from `IDEA.md` |
| **W4** deep capability | spread across **M4**–**M9** | Post-edit diagnostics near M4; interrupt-and-redirect later |

**Root-roadmap work this plan does not cover at all** — v2 is a *slice*, not a superset:

- **M2** Trusted distribution — goreleaser, cosign signing, installers, package managers,
  Rekor. The highest-trust code in the project, and no folder in this corpus mentions it.
- **M5** Tree-sitter codemap — root calls it "the highest-leverage quality work in the year."
  Absent from all eight planning documents.
- **M10–M12** IDE extension, GitHub Action / team surface, registry GA, **and the license
  decision due March 2027.**

That absence is itself a finding: eight documents mined three reference agents for agent-core
features and none looked at the project's own distribution, indexing, or reach story.

---

## 3. Committed vs candidate

Root roadmap capacity is ~1 feature/week (DV-7). This plan therefore commits only to work
landing in the current and next root quarter; everything else is a candidate re-evaluated at
the root roadmap's existing quarterly checkpoint.

**Committed (Q1 → early Q2):** STOPGAP · W0′ · W1 · WP · W2
**Candidate (re-evaluate at the Q1 checkpoint):** P1 · W3 · knowledge-layer continuation
**Deferred pending capacity:** P2 · P3 · W4

The stopgap, W0′ and W1-a/b/c are ~1.5 weeks of work combined and carry most of the
correctness value in the entire corpus. If nothing else in this plan ever ships, ship those.

---

## 4. Deleted from the plan — already built

Carried by one or more predecessor documents as open work; verified present on master. **Do not
re-propose.** Full evidence in `archive/docs/v2/00-reconciliation.md` §3.

| Was proposed as | Actually at |
|---|---|
| `finish_reason == length` guard | [stream.go:281-289](../cli/internal/llm/stream.go:281) — *streaming path only; see W0′-c for the real remnant* |
| **Searchable model selector (#19)** — WP-b in the predecessor, 0.5 d | [tui.go:325-328](../cli/internal/tui/tui.go:325); `setModel` already persists as default. **WP-b is deleted from this roadmap** |
| Wiki staleness in `knowledgeSummary`/`read_knowledge` | [knowledge.go:200-202](../cli/internal/agent/knowledge.go:200), `:230-232`, tested |
| Memory write dedup | [memory.go:182-215](../cli/internal/memory/memory.go:182) |
| PRISM memo-cache singleflight | [retrieve.go:248](../cli/internal/prism/retrieve.go:248) |
| `BeforeProviderRequest` hook | [events/types.go:36](../cli/internal/agent/events/types.go:36), emitted `agent.go:186-189` |
| `chatWithRetry` | [retry.go:63](../cli/internal/agent/retry.go:63) |
| Deterministic pre-call prune | `internal/agent/prune.go`, driven from `compact.go:288` |
| Chained (not stacked) summaries | [compact.go:378-380](../cli/internal/agent/compact.go:378) |
| Daemon handler partitioning | Already 13 `handlers_*.go` files |
| `.gitattributes`, CI `-race` | `d76d6c8`, `b8c578a` |
| Skills as per-skill directories | [skills.go:75-77](../cli/internal/skills/skills.go:75) — only bundled sibling files are missing |
| AllowSession/AllowAlways *mechanism* | [permission.go:41-108](../cli/internal/agent/permission.go:41) — W1-d is keybinding + persistence only, not the engine |
| Extension hook deadlines | [ext/hooks.go:33](../cli/internal/ext/hooks.go:33) — the gap is `events.Bus`, see W1-c |
| Bounded tool output | [tool_store.go:31-33](../cli/internal/agent/tool_store.go:31) — 1500 lines / 64 KB with spill |
| Build/test command detection | `internal/verify` `Detect`/`Gate` — half of W4's diagnostics work |
| `internal/retrieval` extraction | `444981f` — **step 1 of 3 done**; W3 finishes it |

---

## 5. Waves

### W0′ — live provider bugs · ~1.5 d · **committed**

**W0′-a — Empty-response silent success (#8).**
`internal/agent/agent.go` final-answer branch, `internal/llm/`. An empty 200 (`Content == ""`,
no tool calls) currently reaches `return history, nil` and reports success with no output.
Surface it as an error at the agent boundary. Add internal ephemerality flags so synthetic
recovery-nudge scaffolding never persists as a real turn.
*Test:* empty completion ⇒ error; normal completions unaffected; scaffolding never persisted.
**~3 h.**

**W0′-b — Retry hardening (#14) + streak breaker + cost-aware budget.**
`internal/llm/retry.go` **and** `internal/agent/retry.go` — both layers change together.
Port opencode's five fixes (unknown finish reasons, raw network finish errors, network error
variants, capacity stream errors, caps with jitter). Streak detection keyed on
`(model, provider, finish_reason)`: two consecutive zero-output completions is a deterministic
refusal — break the loop. Shrink the retry budget when estimated input cost is high. **~1 d.**

**W0′-c — Non-streaming `finish_reason` remnant.** *(new — not in any predecessor roadmap)*
The length guard exists only in `stream.go`. `openrouter.go:700-713` parses `FinishReason` and
never reads it; the path is reachable via `Agent.NoStream`. **~1 h.**

**Gate:** suite green incl. CI `-race`; empty 200 surfaces as error; streak breaker fires on
deterministic refusal but not on transient errors.

---

### WP — provider robustness · parallel, before W4 · **committed**

**WP-a — Transform layer (#11).** NEW `internal/llm/transform.go` + tests. Ordered,
independently testable rules over `map[string]any`: nullable-union collapse · tool-ID
sanitisation to `[A-Za-z0-9_-]` · empty-text coercion · Gemini schema subsetting ·
output-only field stripping on replay. Table tests use **real** captured malformed payloads.
**1–2 d.**

**WP-b — N9 cache-control tag placement.** *Sequenced after W1-k.* Anthropic breakpoints
already ship at [anthropic.go:73](../cli/internal/llm/anthropic.go:73)/`:86` — the remaining
work is extending tagging to boundaries the wired epoch module creates (tool definitions), and
adding equivalents for other providers where supported. **~2 h.**
*(The predecessor's WP-b — searchable model selector — is deleted; see §4.)*

**WP-c — Argument-repair sanitisation (N10).** Defensive repair of malformed tool-call
arguments before dispatch, table-tested; pairs with the length-stop guard. **~0.5 d.**

**Gate:** every transform rule has a table test with a real payload; `-race` clean.

---

### W1 — correctness & ergonomics · **committed**

Correctness first (a–c), then the phantom-tier wiring (k–n), then TUI (d–j).

| Task | Work | Size |
|---|---|---|
| **W1-a** | FIFO/device/socket read guard (#1) — reject `Mode() & (ModeDevice\|ModeNamedPipe\|ModeSocket)` in `readFile` before any read | 1–2 h |
| **W1-b** | **Never summarise user messages (#5)** — extract user turns from the compaction head, re-inject verbatim. *Highest value-per-hour item in the corpus* | 2–4 h |
| **W1-c** | Hook deadlines on `events.Bus` (#13) — `context.WithTimeout` + `recover()`; observers fail open, guards fail closed. (`ext/hooks.go` already does this for the extension tier — this is the in-process bus) | ~1 d |
| **W1-d** | Approval enum (#4) — `AllowOnce/AllowSession/AllowAlways/Deny` across every `agent.UI` implementor; quick-keys `s`/`a`. **Reuses the existing ruleset engine** (`permission.go`), does not replace it | 4–6 h |
| **W1-e** | `$EDITOR` composition (#6) — `tea.ExecProcess`; Windows chain `$VISUAL → $EDITOR → code --wait → notepad.exe` **mandatory**; CRLF normalisation on read-back | 4–6 h |
| **W1-f** | Input history recall (#7) — Up/Down stack; viewport scroll moves to PgUp/PgDn; draft stashed | 4–6 h |
| **W1-g** | Double-tap empty Enter (#2) | 1–2 h |
| **W1-h** | Inline shell interpolation (#9) — `!cmd`, `{!...}` | 4–8 h |
| **W1-i** | Paste collapse chips (#20) | 1–2 d |
| **W1-j** | Argument/path completion (#17) — **state machine first**, filesystem completion behind a debounce after | 1–2 d |

**Phantom-tier wiring** (DV-2) — *these are wiring tasks, not builds:*

| Task | Work | Size |
|---|---|---|
| **W1-k** | **Wire `epoch.go`, do not rebuild it.** Call `InitializeEpoch` where the system prompt is first assembled; call `Reconcile` at the prologue boundary; route output through the existing `ContextUpdate`/`ModeSwitch` mechanism ([reminders.go:164-175](../cli/internal/agent/reminders.go:164)). Add the CI stable-prefix byte-equality test against the wired module. **Supersedes the predecessor's `promptcompose.go`** — that file would have duplicated `epoch.go` | 1–2 d |
| **W1-l** | Fix the `ApplyReminders` cache defect — [reminders.go:95-103](../cli/internal/agent/reminders.go:95) strips reminders from every historical user message, rewriting bytes `applyCacheBreakpoints` marked. Lands with W1-k | ~2 h |
| **W1-m** | Aux-model spend escapes `Budget.Check` — routed clients (`routedClient("compact")`) start fresh counters, so aux spend evades the hard stop, not just the display | ~3 h |
| **W1-n** | Remove the TUI's duplicate compaction ladder ([tui.go:1278-1296](../cli/internal/tui/tui.go:1278)) — audit §1.1 landed the agent half and left the front-end copy | ~2 h |
| **W1-o** | Hybrid token accounting (DV-9) — anchor compaction triggers on provider-reported usage, estimate only the uncommitted tail. ~60 lines | ~0.5 d |

**Gate:** named-pipe read errors instead of hanging; user text survives compaction byte-verbatim;
stable-prefix byte-equality test green; `-race` clean; manual TUI verification matrix.

---

### W2 — skill safety foundation · **committed** · HARD GATE

Strict order (ADR-010), no reordering: **#10** multi-file skill layout (4–8 h) → **#12** threat
guard + linter (~1 d) → **#18** audit ledger + sha256 content-addressed rollback blobs (1–2 d)
→ **#15** lifecycle pruner (~1 d).

**Wiring corrections (DV-2):** #15 **wires `memory.PruneStale`**
([reinforce.go:127](../cli/internal/memory/reinforce.go:127)) as the curator's query layer —
it already implements never-hard-delete and human-exempt staleness and has no caller. In the
same task, `config.MaxSkills` ([config.go:212](../cli/internal/config/config.go:212)) either
becomes the pruner's cap or is deleted — it does not remain a documented knob nothing reads.
Delete `LearnPerTurn` ([config.go:230](../cli/internal/config/config.go:230)) in the same
commit.

**W2-e — Failed sessions reinforce as successes.** *(new — in no predecessor backlog)*
[session.go:41](../cli/internal/memory/session.go:41) hardcodes `clean=true`, so an aborted or
failed session reinforces its skills as though it had succeeded. The learning loop is being fed
a corrupted success signal — fix before W3 consumes it. **~2 h.**

**Gate:** malicious-skill fixture **rejected**; ledger rollback restores exact prior bytes;
lifecycle honours pinned skills; **no deletion path exists** (assert by negative test);
the stopgap's held-proposal surface is replaced by the real review queue.

---

### P1 — daemon-as-hub · **candidate** · starts once W1 merges

TUI becomes a thin client over an auto-spawned daemon. **Transport: loopback TCP on an
ephemeral port** + per-boot token file under `.kaioken/daemon/` (ADR-002 — not AF_UNIX, not a
named pipe). Handlers stay partitioned. Durable delegation records land here. Transcript
persistence moves to the daemon including crash-safe incremental flush (N2) — note
[session.go:194-213](../cli/internal/session/session.go:194) currently rewrites the whole file,
so this is a write-mode change, not just a cadence change.

**Gate (re-scoped per ADR-002):** a **headless client** (`kaioken run -json --attach`) proves
reconnect-after-restart and `kill -9` mid-turn losing at most the current stream chunk.
*Not* "the desktop sidecar works" — `desktop/` is plan-only with no Rust toolchain present.

---

### P2 — cron inside the daemon · **deferred** · after P1 + W1

Scheduler (60 s tick), `jobs.json`, ESTOP gating **new dispatches only** (in-flight work is
never killed), deliveries into dedicated sessions so main-transcript role alternation survives.

**Portability requirement:** "file-locked (Hermes' proven pattern)" means `fcntl.flock`, which
is POSIX-only. Use `LockFileEx` via `golang.org/x/sys/windows` or an atomic-rename lease.
**Gate:** `-race` green with the scheduler concurrent against live runs; restart resumes jobs.

---

### P3 — execution environments + PTC · **deferred** · lands with W4

`Environment` interface (start/exec/stream/teardown + **runtime** snapshot semantics) over
`proc_unix.go`/`proc_windows.go`; Docker as the one additional backend, opt-in, degrading to
unavailable when absent; connection-vs-command error taxonomy.

Then `execute_code` (ADR-006): **spawn the `kaioken` binary itself as the child**, running
generated **Starlark** via an embedded pure-Go interpreter. Dual transport, untrusted child,
request-ID protocol, per-call authorization via the W1-d enum, env scrubbing at spawn.

**Gate:** Windows PTC integration test passes over TCP loopback; child proves isolation;
approval enum returns rich per-call verdicts.

---

### W3 — gated learning loop · **candidate** · depends on W2

- **Background reflection fork (#23)** — gated on `memory.Signals()`
  ([learn.go:37](../cli/internal/memory/learn.go:37), already live and called by `Distill`, so
  this is a *cadence* change, not new machinery). Cache snapshot preserved; ~2 s cancellation
  handshake; whitelist sandbox = memory + skill-mutation tools; patch-over-rewrite.
  `skills.autonomous_writes` ships **false**. Must not write to stdout — Bubble Tea owns it.
- **Consolidation (#27)** as an explicit `kaioken skills consolidate` command only.
- **Session search (#16)** — **extends `internal/search` with a `KindSession`** (DV-6). That
  package already has BM25, a JSON index and a corpus fingerprint and indexes
  `KindWiki`/`KindCard`/`KindSkill`. Building a separate stack would make it the *fourth*.
  Lineage dedup across fork ancestry; ±5-message anchored hydration.
- **Knowledge-layer continuation** — port `internal/search` onto `internal/retrieval`
  (drop-in, preserving index shape), fold `research/corpus` last; shared artifact metadata
  across wiki/skills/memory; one ledger. **The extraction is already started — finish it.**

**Gate:** `-race` green; the fork provably cannot write while a foreground turn mutates the
same skill; search dedupes hits across fork ancestry.

---

### W4 — deep capability · **deferred** · ~2–3 w

- **#21 interrupt-and-redirect** — split turn ctx from provider HTTP ctx; **strip
  chain-of-thought before replay (non-negotiable)**. Note partial prose is *already* retained
  on interrupt ([tui.go:860-877](../cli/internal/tui/tui.go:860)); the missing half is
  redirect.
- **#24 post-edit diagnostics** — compiler dry-runs first (`go vet`; **not**
  `go build -o /dev/null`, which is POSIX-only), bounded sanitised `<diagnostics>` delta.
  Builds on `internal/verify`'s existing `Detect`/`Gate`.
- **#25 git-snapshot undo** — **`internal/gitx`, standalone, shadow-git style. Does *not* go
  through the `Environment` interface** (ADR-007 correction: runtime state and repo state are
  different concerns). Ship an off-switch — shadow snapshots are costly on large repos.
- **#26 live tool tree** — visual structure + metrics only, no DOM-style accordion.
- **Nested `AGENTS.md` lazy-load** (DV-9) — monorepo conventions currently invisible.
- Optional: compound `apply_patch` (N5); mutation verifier footer (N4); opencode's `splitTurn`
  compaction refinement (ADR-003 §6).

**Gate:** `-race` clean; diagnostics bounded; redirect preserves valid role alternation.

---

## 6. Traceability

| Stage | Source |
|---|---|
| STOPGAP | `archive/docs/v2/00-reconciliation.md` §1 (found in this corpus, in no predecessor) |
| W0′ | inspire ph1 #8 + #14 remainder; W0′-c new |
| W1 a–j | inspire ph1 + ph2 |
| W1 k–o | ADR-003 correction + reconciliation §4 phantom tier + §7 bugs + DV-9 |
| WP | inspire ph3 (#11) + N9 + N10 |
| W2 | inspire ph4 + DV-2 wiring + reconciliation §7 bug 2 |
| P1–P3 | locks L2/L5/L7, ADR-002/006/007 as rewritten |
| W3 | inspire ph5 revised + #16 (re-homed per DV-6) + L6 continuation |
| W4 | inspire ph6 + DV-9 |

## 7. Deferred beyond v2

Gateway adapters (`PlatformAdapter` interface only) · GEPA/DSPy outer loop (offline, PR-based;
needs an eval harness that does not exist) · SSH/serverless environments · micro-compaction
mode · background delegation completion queue · session turn leases (revisit when the desktop
sidecar actually shares sessions) · Ralph goal loops · Lean verification interleaving.

## 8. Success criteria

1. No hang-class reads; no silent-success empty responses; user constraints survive long
   sessions **byte-verbatim**; stable prompt prefix byte-equal across turns, CI-enforced.
2. Provider quirks absorbed by tested rules; retries never burn budget on deterministic
   refusals; **aux-model spend visible and inside the hard stop**.
3. Terminal-native TUI; four-state approvals; one daemon-owned session truth; crash-safe
   transcripts.
4. One retrieval engine with relevance gates, staleness honesty and provenance — shared by
   wiki, cards, skills, memory and sessions.
5. **Kaioken authors skills only behind an approval gate: scanned, ledgered, reversible,
   lifecycle-managed. Zero unattended writes — starting from the stopgap, not from W2's merge.**
6. N-turn exploration collapses into one PTC call; edits self-report diagnostics;
   `run_command` damage is restorable.
