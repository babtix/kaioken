# Kaioken v2 Roadmap

**Date:** 2026-08-22 · **Rev:** v1.1 — rebaselined against `git log` on
2026-08-23 (see RECONCILIATION.md and architecture §9.1): all logic-audit
follow-up branches are MERGED; W0 shrinks to the two live provider bugs;
WP (provider robustness) added as its own stage so PTC lands after transforms.

Item numbers (#N) refer to `docs/inspire-backlog.md`. Estimates carried from
that backlog; platform-track items are new *(v2)*.

## Verified baseline (master @ `7be48f2`, checked 2026-08-23)

- **LANDED:** audit phases 1–2 + ALL follow-ups (phases 1–4 branches merged
  2026-08-22): compaction inside `Run`, `Agent.derive()`, newline-chaining fix,
  stream tool-call validation, steering step-budget (`48f3c7d`), mixed-ending
  edit safety (`0bca280`), worker cancellation (`ae6a808`), `.gitattributes`,
  CI `-race` job (ubuntu), runstate hardening (`aa5e865`), AND knowledge-engine
  wave: `internal/retrieval/` extracted from prism, singleflight memo-cache fix,
  `wiki/staleness.go`, memory write-dedup (`a867302`).
- **Open:** #8 empty-response silent success · #11 transform layer · #14 retry
  hardening · every inspire-phase branch (none started).
- **Environmental failure, ignore in gates:** `TestPrismImportAndQuery`
  (needs a local Ollama model).

## Track structure

Three tracks, internally ordered. Cross-track rule: **the ordering invariant
outranks everything** — nothing in the Learning track starts before Wave 2 is
merged, regardless of readiness elsewhere (D3 / ADR-010).

```
CORRECTNESS TRACK   W0' ──► W1 ─────────► W4 (deep capability)
PLATFORM TRACK             P1 ──► P2 ──► P3 (environments + PTC, lands with W4)
LEARNING TRACK                    W2 ──► W3 (gated loop goes live)
        WP (provider robustness) runs parallel, before W4
```

## Correctness track

### W0′ — live provider bugs (~1.5 d total)

| Item | Where | Est. |
|---|---|---|
| Empty-response silent-success bug (#8, fix-first half): surface empty 200 as error | `internal/agent`, `internal/llm` | 3 h |
| Retry hardening (#14) + rest of #8 (streak detection keyed on model/provider/finish_reason, cost-aware retry budget) — **both retry layers together** | `llm/retry.go`, `agent/retry.go` | 1 d |

**Gate:** suite green incl. CI `-race`; new test: empty 200 surfaces as error;
streak breaker fires on deterministic refusal.

*(Everything formerly proposed for W0 — `.gitattributes`, `-race`, audit
residuals §1.5/§2.5 — is already merged; do not redo it.)*

### W1 — correctness & ergonomics (= inspire phases 1+2)

Items 1, 5, 13, then TUI set 2, 4, 6, 7, 9, 17, 20.

Hard requirements:
- **#5 never summarise user messages** — highest value-per-hour item in the
  corpus; gate: compaction preserves user text verbatim.
- **#4 approval enum** (`AllowOnce/AllowSession/AllowAlways/Deny`) across every
  `agent.UI` implementor — **prerequisite for PTC (P3)**.
- **#6 `$EDITOR`** Windows fallback chain mandatory + CRLF normalisation.
- **#17 palette state machine first**, completion after.
- **#20 paste collapse chips.**

**Gate:** inspire-phase gates verbatim (named-pipe read errors instead of
hanging; verbatim user text through compaction) + manual TUI verification
matrix; `-race` clean.

### WP — provider robustness (parallel; before W4)

| Item | Where | Est. |
|---|---|---|
| Transform layer (#11): rule-list over `map[string]any`, table-tested against real malformed payloads | new `llm/transform.go` | 1–2 d |
| Searchable model selector (#19; thinking levels already landed) | `internal/tui` | 0.5 d |

Independent of W1. Lands before W4 so PTC's generated stubs emit
already-transformed schemas.

### W4 — deep capability (= inspire phase 6)

- #21 active interrupt-and-redirect — split turn ctx / HTTP ctx; strip CoT
  before replay (**non-negotiable**); test: redirect preserves completed tool
  results with valid role alternation.
- #24 post-edit diagnostics — compiler dry-runs first (`go vet`,
  `tsc --noEmit`), bounded sanitised `<diagnostics>` block; gopls later.
- #25 git-snapshot undo — plugs into Environment snapshot semantics (P3).
- #26 live tool tree (visual structure + metrics only); #27/#28 if not
  consumed by W3. Optional: compound `apply_patch` (N5).

**Est:** ~2–3 w. **Gate:** `-race` clean; diagnostics output bounded.

## Platform track *(v2)*

### P1 — daemon-as-hub conversion — starts once W1 merges

TUI becomes a thin client over the auto-spawned localhost daemon (ADR-002);
handlers partitioned runs/jobs/events/approvals from day one; durable
delegation records land here; transcript persistence moves to the daemon,
including **crash-safe incremental flush during turns** (N2).

**Gate:** desktop sidecar path works against the same daemon API; reconnect
after daemon restart recovers run state; kill -9 mid-turn loses at most the
current stream chunk, not the turn.

### P2 — cron inside the daemon — after P1 + W1

Scheduler (60 s tick, file-locked), `jobs.json`, ESTOP-gates-new-dispatches-only,
delivery targets among connected surfaces, scheduled deliveries in dedicated
sessions (role-alternation safety). Per ADR-008.

**Gate:** `-race` green with scheduler concurrent against live runs; daemon
restart resumes job state.

### P3 — execution environments + PTC — lands with W4

Environment interface + Docker backend + connection-error taxonomy (ADR-007),
then `execute_code`: dual transport, untrusted child (tool surface, not
filesystem/credentials), request-ID protocol, per-call authorization via the
W1 enum (ADR-006).

**Gate:** Windows PTC integration test passes over TCP loopback; child proves
isolation; approval enum returns rich verdicts per call.

## Learning track

### W2 — skill safety foundation (= inspire phase 4) — HARD GATE

Items 10 → 12 (+linter) → 18 → 15, in that order (ADR-010 pins this before ANY
skill-writing feature, including the reflection fork's proposals).

**Gate:** malicious-skill fixture rejected; ledger rollback restores exact
bytes; lifecycle honours pinned skills; no deletion path exists.

### W3 — gated learning loop (= inspire phase 5 revised)

- Background reflection fork (#23): gated on `memory.Signals()`, cache-snapshot
  preserved, ~2 s cancellation handshake, sandbox whitelist = memory +
  skill-mutation tools, patch-over-rewrite policy. Approval-gated proposals
  only; `skills.autonomous_writes` ships **false**.
- Consolidation (#27) explicit CLI command only; learning timeline (#28) last.
- Session search (#16) on its own branch — no dependency on W2 (verified);
  textrank-BM25 + JSON index, never SQLite (ADR-009); respects fork lineage.
- Unified knowledge layer continuation: port `search` onto
  `internal/retrieval` (drop-in), fold `research/corpus` last; shared artifact
  metadata `{source_provenance, created_at, last_verified_at, freshness_state}`
  across wiki/skills/memory; one ledger for all mutations (L6 / ADR-005).
  *The extraction is already started on master — finish it, don't restart it.*

**Gate:** `-race` green; fork provably cannot write while a foreground turn
mutates the same skill; search dedupes hits across fork ancestry.

## Stage ↔ source-plan mapping (traceability)

| Stage | Source |
|---|---|
| W0′ | inspire ph1 items 8+14 remainder (rest already merged) |
| W1 | inspire ph1+ph2 |
| WP | inspire ph3 (#11, #19) |
| W4 | inspire ph6 |
| P1–P3 | operator locks D2/D5/D7 (v2 platform track) |
| W2 | inspire ph4 |
| W3 | inspire ph5 revised + session-search branch + L6 continuation |

## Explicitly deferred beyond v2

Gateway adapters (`PlatformAdapter` interface only), GEPA/DSPy outer
optimisation loop (offline, PR-based, human-reviewed; needs an eval harness),
SSH/serverless environments, micro-compaction mode for months-long sessions,
background delegation with async completion queue, session turn leases
(revisit when the desktop sidecar shares sessions), Ralph-style goal loops,
Lean verification interleaving. Shapes ready in architecture §8.

## Success criteria for v2 as a whole

1. No hang-class reads; no silent-success empty responses; user constraints
   survive months-long sessions verbatim; stable prompt prefix byte-equal
   across turns (CI-enforced).
2. Provider quirks absorbed by tested rules; retries never burn budget on
   deterministic refusals; aux-model spend visible.
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
