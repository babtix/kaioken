# Kaioken v2 — Unified Roadmap

> Revised 2026-08-22 after reconciliation with `../hermes_res/roadmap.md`:
> adopts its operator-approved **three-track wave structure** and platform
> insertions (P1–P3), while retaining this plan's per-stage gates and the
> explicit provider stage. Item numbers (#N) refer to
> `docs/inspire-backlog.md`; audit §N refer to
> `docs/logic-audit-and-phases.md`.

## Current baseline (2026-08-22)

- **LANDED (merged to master, `4073e44`):** audit phases 1–2 — compaction
  inside `Run`, `Agent.derive()` (incl. delegate `MemoryDisabled`), Chainable
  newline fix, stream tool-call validation; research supervisor dedup,
  escalation grounding, resume query plan, worker evidence cap.
- **Open branches:** `fix/phase4-cross-cutting`, `fix/phase3-knowledge-engine`,
  `fix/phase1-followups`, `fix/phase2-followups`. No inspire-phase branches
  started.
- Known environmental failure: `TestPrismImportAndQuery` (missing Ollama model)
  — non-regression, ignore.

## Track structure

Three tracks, internally ordered. Cross-track rule: **the ordering invariant
outranks everything** — nothing in the Learning track starts before Wave 2 is
merged, regardless of readiness elsewhere (lock L3 / T4).

```
CORRECTNESS TRACK   W0 ──► W1 ──► WP ─────────► W4 (deep capability)
PLATFORM TRACK            P1 ──► P2 ──► P3 (environments + PTC, lands with W4)
LEARNING TRACK                       W2 ──► W3 (gated loop goes live)
```

## Correctness track

### W0 — debt closure (no new design)

| Item | Where | Est. |
|---|---|---|
| `.gitattributes` + renormalize (**alone, first commit**) | repo root | ~0.5d |
| `-race` in CI; surfaced races in scope | `.github/workflows/ci.yml` | — |
| Empty-response silent-success bug (#8, fix-first half) | `internal/agent`, `internal/llm` | 3h |
| Retry hardening (#14) + rest of #8 (streak detection, cost-aware budget) — both retry layers together | `llm/retry.go`, `agent/retry.go` | 1d |
| Audit residuals: steering step-budget accounting (§1.5), `normalizeToLF` mixed endings (§1.5, after `.gitattributes`), worker cancellation (§2.5) | see audit doc | ~2d |

**Gate:** suite green incl. `-race`; empty 200 surfaces as error; worker honours
cancellation; named-pipe read returns structured error rather than hanging
(#1 may land here or in W1 — it is a one-liner).

### W1 — correctness & ergonomics quick wins (= inspire phases 1+2)

Items 1 (if not consumed by W0), 5, 13, then TUI set 2, 4, 6, 7, 9, 17, 20.

Hard requirements:
- **#5 never summarise user messages** — highest value-per-hour item in the
  corpus; gate: compaction preserves user text verbatim.
- **#4 approval enum** (`AllowOnce/AllowSession/AllowAlways/Deny`) across every
  `agent.UI` implementor — **prerequisite for PTC (P3)**.
- **#6 `$EDITOR`** Windows fallback chain mandatory + CRLF normalisation.
- **#17 palette state machine first**, completion after.

**Gate:** inspire-phase gates verbatim + manual TUI verification matrix;
`-race` clean.

### WP — provider robustness

| Item | Where | Est. |
|---|---|---|
| Transform layer (#11): rule-list over `map[string]any`, table-tested against real malformed payloads | new `llm/transform.go` | 1–2d |
| Searchable model selector (#19; thinking levels already LANDED) | `internal/tui` | 0.5d |

Independent of W1; can run parallel. Lands before W4 so PTC's generated stubs
emit already-transformed schemas.

### W4 — deep capability (= inspire phase 6)

- #21 active interrupt-and-redirect — split turn ctx / HTTP ctx; strip CoT
  before replay (**non-negotiable**); test: redirect preserves completed tool
  results with valid alternation.
- #24 post-edit diagnostics — compiler dry-runs first (`go vet`,
  `tsc --noEmit`), bounded sanitised `<diagnostics>` block; gopls later.
- #25 git-snapshot undo — plugs into Environment snapshot semantics (P3).
- #26 live tool tree (visual structure + metrics only); #27/#28 if not
  consumed by W3. Optional add: compound `apply_patch` (N5).

**Est:** ~2–3w. **Gate:** `-race` clean; diagnostics output bounded.

## Platform track *(v2, locks L2/L5/L7)*

### P1 — daemon-as-hub conversion — starts once W1 merges

TUI becomes a thin client over the auto-spawned localhost daemon (ADR-002);
handlers partitioned runs/jobs/events/approvals from day one; durable
delegation records land here.

**Gate:** desktop sidecar path works against the same daemon API; reconnect
after daemon restart recovers run state.

### P2 — cron inside the daemon — after P1 + W1

Scheduler (60s tick, file-locked), `jobs.json`, ESTOP-gates-new-dispatches-only,
delivery targets among connected surfaces, deliveries in dedicated sessions
(role-alternation safety). Per ADR-008.

**Gate:** `-race` green with scheduler concurrent against live runs; daemon
restart resumes job state.

### P3 — execution environments + PTC — lands with W4

Environment interface + Docker backend + connection-error taxonomy (§5.2 /
ADR-007), then `execute_code`: dual transport, untrusted child (tool surface,
not filesystem), request-ID protocol, per-call authorization via the W1 enum
(ADR-006).

**Gate:** Windows PTC integration test passes over TCP loopback; child proves
isolation; approval enum returns rich verdicts per call.

## Learning track

### W2 — skill safety foundation (= inspire phase 4) — HARD GATE

Items 10 → 12 (+linter) → 18 → 15, in that order (ADR-010 pins this before ANY
skill-writing feature, including the reflection fork's proposals).

**Gate:** malicious-skill fixture rejected; ledger rollback restores exact
bytes; lifecycle honours pinned skills; no deletion path exists.

### W3 — the gated learning loop (= inspire phase 5, revised)

- Background reflection fork (#23): gated on `memory.Signals()`, cache-snapshot
  preserved, ~2s cancellation handshake, whitelist sandbox, patch-over-rewrite.
  Approval-gated proposals only; `skills.autonomous_writes` ships **false**.
- Consolidation (#27) explicit CLI command only.
- Learning timeline (#28) last.
- Session search (#16) on its own branch — no dependency on W2 (verified);
  textrank-BM25 + JSON index, never SQLite (T5).
- Unified knowledge layer groundwork begins here: shared artifact metadata +
  lifecycle states across skills/memory/wiki (L6 / ADR-005).

**Gate:** `-race` green; fork provably cannot write while a foreground turn
mutates the same skill.

## Sequencing rationale

Carried from `docs/inspire-phases.md`, still binding: safety precedes autonomy
(W2 → W3); cheap correctness first (W0 → everything). Platform insertions sit
where prerequisites exist and later waves need them: approval enum (W1)
precedes PTC (P3); the daemon hub (P1) precedes cron (P2) and gives W4's
delegation-dependent items a stable home; provider robustness (WP) precedes
W4 so PTC stubs emit transformed schemas.

## Stage ↔ prior-plan mapping (traceability)

| New | Old (this doc, pre-reconciliation) | Source plan |
|---|---|---|
| W0 | S0 + S0b + parts of S1/S2 (#8/#14) | audit ph4 + hermes_res W0 |
| W1 | S1 remainder + S3 | inspire ph1+ph2; hermes_res W1 |
| WP | S2 remainder (#11/#19) | inspire ph3 |
| W4 | S7 | inspire ph6; hermes_res W4 |
| P1–P3 | *new* | hermes_res platform track (operator locks L2/L5/L7) |
| W2 | S5 | inspire ph4 |
| W3 | S6 + session search (was S4) + knowledge-layer groundwork | inspire ph5 revised |

## Explicitly deferred beyond v2

Gateway adapters (`PlatformAdapter` interface only), GEPA/DSPy outer
optimisation loop (offline, PR-based, human-reviewed if ever), SSH/serverless
environments, micro-compaction mode for months-long sessions, background
delegation with async completion queue, session turn leases (revisit when the
desktop sidecar shares sessions), Ralph-style goal loops, Lean verification
interleaving. Each has a shape ready in [01-architecture.md](01-architecture.md)
or `../hermes_res/kaioken-v2-architecture.md` §8.

## Success criteria for v2 as a whole

1. No hang-class reads; no silent-success empty responses; user constraints
   survive months-long sessions verbatim; stable prompt prefix byte-equal
   across turns (CI-enforced).
2. Provider quirks absorbed by tested rules; retries never burn budget on
   deterministic refusals; aux-model spend visible.
3. Terminal-native TUI; four-state approvals; one daemon-owned session truth.
4. One retrieval engine with relevance gates, staleness honesty, provenance —
   shared by wiki/cards/skills/memory/sessions; local session search.
5. Kaioken can safely author skills behind an approval gate: scanned,
   ledgered, reversible, lifecycle-managed, consolidated on demand; zero
   unattended loops.
6. N-exploration-turn tasks collapse into one PTC call; edits self-report
   diagnostics; `run_command` damage restorable via environment snapshots.
