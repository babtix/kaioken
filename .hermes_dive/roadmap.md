# ROADMAP — Kaioken v2

**Date:** 2026-08-23 · Canonical successor to both predecessor roadmaps
(baseline: `master @ bd740fe`). Item numbers (#N) refer to
`docs/inspire-backlog.md`; audit §N refer to `docs/logic-audit-and-phases.md`.
Every file target below was re-verified against source during the audit
(`AUDIT.md` §2).

## Track structure

Three tracks, internally ordered. Cross-track rule: **the ordering invariant
outranks everything** — nothing in the Learning track starts before Wave 2 is
merged, regardless of readiness elsewhere (L3 / ADR-010).

```
CORRECTNESS TRACK   W0' ──► W1 ─────────► W4 (deep capability)
PLATFORM TRACK             P1 ──► P2 ──► P3 (environments + PTC, lands with W4)
LEARNING TRACK                    W2 ──► W3 (gated loop goes live)
        WP (provider robustness) runs parallel, before W4
```

Sequencing rationale (binding): safety precedes autonomy (W2 → W3); cheap
correctness first (W0′ → everything); approval enum (W1) precedes PTC (P3);
daemon hub (P1) precedes cron (P2) and gives W4's delegation-dependent items a
stable home; transform layer (WP) precedes W4 so PTC stubs emit transformed
schemas; composition module (W1) precedes cache-tag placement (WP, N9).

## Verified baseline

See README §1.3. LANDED: all logic-audit phases + follow-ups + knowledge wave.
Open: #8, #11, #14, and every inspire-phase branch. Environmental failure to
ignore in gates: `TestPrismImportAndQuery`.

---

# Correctness track

## W0′ — live provider bugs (~1.5 d)

### Task W0′-a — Empty-response silent success (#8), fix-first half
- **Files:** `internal/agent/agent.go` (final-answer branch at ~`:238`),
  `internal/llm/`
- **Work:** an empty 200 (`Content == ""`, no tool calls) must surface as an
  error at the agent boundary instead of falling through to
  `return history, nil`. Add the Hermes-style internal ephemerality flags for
  synthetic empty-response/prefill scaffolding messages so recovery nudges are
  never mistaken for real turns (mechanism per verification report item 8).
- **Test:** new test — empty completion ⇒ error surfaces; normal completions
  unaffected; scaffolding flags never leak into persisted history.
- **Size:** ~3 h.

### Task W0′-b — Retry hardening (#14) + streak breaker + cost-aware budget (#8 second half)
- **Files:** `internal/llm/retry.go`, `internal/agent/retry.go`
- **Work:** port opencode's five fixes (unknown finish reasons, raw network
  finish errors, network error variants, capacity stream errors, caps with
  jitter). Streak detection keyed on `(model, provider, finish_reason)` — two
  consecutive zero-output completions = deterministic refusal ⇒ break the
  retry loop. Shrink retry budget when estimated input cost is high. BOTH
  retry layers change together (transport + per-turn).
- **Test:** table tests per fix class; streak-breaker fires on deterministic
  refusal and does not fire on transient errors; budget-shrink unit test.
- **Size:** ~1 d.

**Gate:** suite green incl. CI `-race`; empty 200 surfaces as error; streak
breaker fires on deterministic refusal.

---

# Platform-parallel stage

## WP — provider robustness (parallel; before W4)

### Task WP-a — Transform layer (#11)
- **Files:** NEW `internal/llm/transform.go` (+ `transform_test.go`)
- **Work:** ordered, independently-testable rules over `map[string]any`:
  nullable-union collapse · tool-ID sanitisation `[A-Za-z0-9_-]` · empty-text
  coercion · Gemini schema subsetting (strip fields outside Gemini's Schema
  subset) · output-only field stripping on replay. Table tests use REAL
  malformed payloads captured from providers.
- **Extension (N9):** once landed, add provider cache-control tag placement
  as additional rules — Anthropic-style ephemeral breakpoints at boundaries
  created by the W1 prompt-composition module; no-op where unsupported.
  *Sequence note: tag rules land after the composition module exists.*
- **Size:** 1–2 d (+~2 h for N9 rules).

### Task WP-b — Searchable model selector (#19)
- **Files:** `internal/tui/` (model picker)
- **Work:** interactive searchable selector, pi-style persist-to-config,
  session-scoped override. Thinking levels already landed (`thinking.go:18`) —
  surface them in the same UI.
- **Size:** 0.5 d.

**Gate:** each transform rule has a table test with a real payload; selector
persists choice; `-race` clean.

---

# Correctness track (continued)

## W1 — correctness & ergonomics (= inspire phases 1+2)

Order within the wave: #1, #5, #13 first (correctness), then TUI set.

### Task W1-a — FIFO/device/socket read guard (#1)
- **Files:** `internal/agent/tools.go` `readFile`
- **Work:** reject `Mode() & (os.ModeDevice|os.ModeNamedPipe|os.ModeSocket)`
  with a structured error before any read attempt.
- **Test:** named pipe returns structured error, never hangs.
- **Size:** 1–2 h.

### Task W1-b — Never summarise user messages (#5)
- **Files:** `internal/agent/compact.go` `splitForCompaction`
- **Work:** extract user messages from the compaction head; summarise only
  non-user content; re-inject user turns verbatim beside the summary.
- **Gate:** compaction preserves user text byte-verbatim (test asserts).
- **Size:** 2–4 h. Highest value-per-hour item in the corpus.

### Task W1-c — Hook deadlines, fail-open/fail-closed (#13)
- **Files:** `internal/agent/events`
- **Work:** every listener wrapped in `context.WithTimeout` + `recover()`;
  observer hooks fail open, guard hooks fail closed.
- **Test:** hung handler cannot stall the loop; panicking observer doesn't
  kill the run; vetoing guard still vetoes.
- **Size:** ~1 d.

### Task W1-d — Approval enum v2 (#4)
- **Files:** `internal/tui/tui.go` (`uiAdapter.Approve` at `:3073`),
  `internal/agent/delegate.go` (`delegateUI.Approve` at `:103`), `agent.UI`
  interface + every implementor, `tui/commands.go`
- **Work:** replace bare bool with `AllowOnce / AllowSession / AllowAlways /
  Deny`; quick-keys `s`/`a` at the approval prompt reusing ruleset semantics;
  `/yolo` remains as session-wide escape hatch.
- **Why here:** prerequisite for PTC rich verdicts (P3).
- **Size:** 4–6 h.

### Task W1-e — `$EDITOR` composition (#6)
- **Files:** `internal/tui/` (composer)
- **Work:** write buffer to temp file, open editor via `tea.ExecProcess`,
  read back on exit 0. Windows fallback chain MANDATORY:
  `$VISUAL → $EDITOR → code --wait → notepad.exe`; CRLF normalisation on
  read-back.
- **Size:** 4–6 h.

### Task W1-f — Input history recall (#7)
- **Files:** `internal/tui/tui.go`
- **Work:** Up/Down history stack; viewport scroll moves to PgUp/PgDn at line
  boundary; uncommitted draft stashed while navigating history.
- **Size:** 4–6 h.

### Task W1-g — Double-tap-empty-Enter drain (#2)
- **Files:** `internal/tui/tui.go` `onEnter`
- **Work:** two empties within 450 ms drain queued steering/follow-ups;
  interrupt-and-drain when busy.
- **Size:** 1–2 h.

### Task W1-h — Inline shell interpolation (#9)
- **Files:** `internal/tui/tui.go`, `tui/commands.go`
- **Work:** `!cmd` runs without an LLM turn; `{!...}` inside a prompt expands
  before submission.
- **Size:** 4–8 h.

### Task W1-i — Paste collapse chips (#20)
- **Files:** `internal/tui/tui.go`
- **Work:** pastes above threshold collapse to `[[ Paste #1: 42 lines ]]`;
  expand on submit.
- **Size:** 1–2 d.

### Task W1-j — Argument/path completion behind palette state machine (#17)
- **Files:** `internal/tui/palette.go`
- **Work:** STATE MACHINE FIRST (context-aware states), filesystem completion
  behind a debounce after. Today the palette closes on any whitespace.
- **Size:** 1–2 d.

### Task W1-k — Prompt-composition module (doctrine 3 foundation)
- **Files:** NEW `internal/agent/promptcompose.go` (+ test); integration in
  `internal/agent/context.go`
- **Work:** layered assembly (stable identity/tools/rules → volatile tail);
  memory enters ONLY as frozen session-start snapshot (N1 as code); reminders
  ride volatile tail exclusively; CI test asserting stable-prefix
  byte-equality across turns.
- **Note:** not a backlog item — it is doctrine 3's implementation vehicle
  (ADR-003). Sized ~1–2 d. If the wave feels heavy, this may slip to early WP
  but MUST precede WP's N9 tag rules.
- **Size:** 1–2 d.

**Gate:** inspire-phase gates verbatim (named-pipe read errors instead of
hanging; verbatim user text through compaction) + manual TUI verification
matrix; `-race` clean; stable-prefix byte-equality test green.

---

# Platform track *(L2/L5/L7)*

## P1 — daemon-as-hub conversion — starts once W1 merges

- TUI becomes thin client over auto-spawned localhost daemon (ADR-002).
- Handlers partitioned runs/jobs/events/approvals from day one.
- Durable delegation records land here.
- Transcript persistence moves to the daemon incl. crash-safe incremental
  flush during turns (N2).
- **Gate:** desktop sidecar path works against the same daemon API; reconnect
  after daemon restart recovers run state; `kill -9` mid-turn loses at most
  the current stream chunk, not the turn.

## P2 — cron inside the daemon — after P1 + W1

- Scheduler (60 s tick, file-locked), `jobs.json`, ESTOP gates NEW dispatches
  only, delivery targets among connected surfaces, deliveries in dedicated
  sessions (ADR-008).
- **Gate:** `-race` green with scheduler concurrent against live runs; daemon
  restart resumes job state.

## P3 — execution environments + PTC — lands with W4

- Environment interface + Docker backend + connection-error taxonomy
  (ADR-007), then `execute_code` (ADR-006): dual transport, untrusted child,
  request-ID protocol, per-call authorization via the W1 enum.
- **Gate:** Windows PTC integration test passes over TCP loopback; child
  proves isolation; approval enum returns rich verdicts per call.

## P4 — argument-repair sanitisation (N10) — small add-on, lands with WP or early W4

- Defensive repair of malformed tool-call arguments before dispatch,
  table-tested; pairs with the length-stop structural-failure guard.
- **Gate:** repaired-argument fixtures pass; unrecoverable malformations fail
  structurally.

---

# Learning track

## W2 — skill safety foundation (= inspire phase 4) — HARD GATE

Items in strict order (ADR-010): #10 multi-file skill layout (4–8 h) →
#12 threat guard + linter (~1 d) → #18 audit ledger + sha256 rollback blobs
(1–2 d) → #15 lifecycle pruner (~1 d).

**Gate:** malicious-skill fixture REJECTED; ledger rollback restores exact
prior bytes; lifecycle honours pinned skills; no deletion path exists.

## W3 — gated learning loop (= inspire phase 5 revised)

- Background reflection fork (#23): gated on `memory.Signals()`
  (`learn.go:37`), cache-snapshot preserved, ~2 s cancellation handshake,
  whitelist sandbox = memory + skill-mutation tools, patch-over-rewrite.
  Approval-gated proposals only; `skills.autonomous_writes` ships FALSE.
- Consolidation (#27) explicit CLI command only; learning timeline (#28) last.
- Session search (#16) on its own branch (no W2 dependency — verified):
  textrank-BM25 + JSON index over `internal/session` transcripts; lineage
  dedupe across fork ancestry; ±5-message anchored hydration.
- Unified knowledge continuation: port `search` onto `internal/retrieval`
  (drop-in), fold `research/corpus` last; shared artifact metadata across
  wiki/skills/memory; one ledger for all mutations (L6 / ADR-005). The
  extraction is already started on master — finish it, don't restart it.

**Gate:** `-race` green; fork provably cannot write while a foreground turn
mutates the same skill; search dedupes hits across fork ancestry.

---

# Correctness track (deep capability)

## W4 — deep capability (= inspire phase 6) — ~2–3 w

- #21 active interrupt-and-redirect: split turn ctx / HTTP ctx; strip CoT
  before replay (**non-negotiable**); test: redirect preserves completed tool
  results with valid role alternation.
- #24 post-edit diagnostics: compiler dry-runs first (`go vet`, `tsc
  --noEmit`), bounded sanitised `<diagnostics>` block; gopls later (D2).
- #25 git-snapshot undo: plugs into Environment snapshot semantics (P3);
  `epoch.go` is prompt-cache baselining, NOT this.
- #26 live tool tree: visual structure + metrics only (no DOM accordion).
- Optional: compound `apply_patch` (N5); #27/#28 if not consumed by W3.

**Gate:** `-race` clean; diagnostics output bounded; redirect preserves
alternation.

---

# Traceability

| Stage | Source |
|---|---|
| W0′ | inspire ph1 items #8+#14 remainder (everything else merged) |
| W1 | inspire ph1+ph2 + composition module (ADR-003 vehicle) |
| WP | inspire ph3 (#11, #19) + N9 tags |
| P1–P3 | locks L2/L5/L7 |
| P4 | N10 (this audit) |
| W2 | inspire ph4 |
| W3 | inspire ph5 revised + #16 branch + L6 continuation |
| W4 | inspire ph6 |

# Explicitly deferred beyond v2

Gateway adapters (`PlatformAdapter` interface only), GEPA/DSPy outer loop
(offline, PR-based, human-reviewed; needs eval harness), SSH/serverless
environments, micro-compaction mode for months-long sessions, background
delegation async completion queue, session turn leases (revisit when desktop
sidecar shares sessions), Ralph goal loops, Lean verification interleaving.

# Success criteria for v2 as a whole

1. No hang-class reads; no silent-success empty responses; user constraints
   survive months-long sessions verbatim; stable prompt prefix byte-equal
   across turns (CI-enforced).
2. Provider quirks absorbed by tested rules; retries never burn budget on
   deterministic refusals; aux-model spend visible; cache tags engage
   provider caches where supported.
3. Terminal-native TUI; four-state approvals; one daemon-owned session truth;
   crash-safe transcripts.
4. One retrieval engine with relevance gates, staleness honesty, provenance —
   shared by wiki/cards/skills/memory/sessions; local session search that
   respects lineage.
5. Kaioken can safely author skills behind an approval gate: scanned,
   ledgered, reversible, lifecycle-managed, consolidated on demand; zero
   unattended loops.
6. N-exploration-turn tasks collapse into one PTC call; edits self-report
   diagnostics; `run_command` damage restorable via environment snapshots.
