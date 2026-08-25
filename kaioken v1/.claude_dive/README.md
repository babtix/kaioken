# Kaioken v2 — the plan

**Canonical.** Date 2026-08-24 · Baseline `master @ bd740fe`.
Supersedes `.hermes_dive/`, `docs/hermes_res/`, `docs/doc_final_opencode/` and the two v2
reconciliation reports. Everything prior is preserved under [`archive/`](archive/) —
see [`SUPERSEDED.md`](SUPERSEDED.md).

---

## Read this first

**Kaioken already writes model-generated skills to disk, unattended, with no approval, no
threat scan, no ledger and no rollback.** It is reachable from `/learn` at default settings
today. Nine planning documents preceded this one and none of them found it; all nine sequence
"safety before autonomy" as though autonomy were a future switch.

→ [`00-STOPGAP.md`](00-STOPGAP.md). It lands before anything else in this plan.

---

## The documents

| File | What it is | Read it when |
|---|---|---|
| [`00-STOPGAP.md`](00-STOPGAP.md) | The one patch that must land before any wave | **Now** |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Target architecture: identity, locks, principles, component map, subsystems, the three context doctrines, state layout, non-goals | You want the shape of v2 |
| [`adr/`](adr/) | ADR-001…010 — what was decided, what was rejected, what it costs | You want the *why* behind a choice |
| [`DECISIONS.md`](DECISIONS.md) | Tabular register: D1–D13 inherited, N1–N11 inherited, **DV-1…DV-10 new** | You want to know how a conflict was resolved |
| [`ROADMAP.md`](ROADMAP.md) | Waves, task-level work, gates, committed-vs-candidate split, mapping onto the root roadmap | **You are about to build** |
| [`AUDIT.md`](AUDIT.md) | Verification record: method, ground truth, and the findings no predecessor had | You doubt a claim in here |
| [`SUPERSEDED.md`](SUPERSEDED.md) | What this replaces, what stays live, where the originals are | You are looking for an older document |

## What changed, and why it was worth another pass

Nine documents preceded this set. Their citations into the **reference agents** (`inspire/`)
are near-flawless — 18-for-18 in one case. Their citations into **Kaioken itself** are where
the errors are, and every error points the same direction: inflating Kaioken's gaps, and
therefore its effort estimates.

The predecessor that called itself canonical stated its own method plainly: it *"grep-audited
every deep-dive mechanism against both final sets."* Document against document. It concluded
*"residual disagreements: none found"* — but two documents sharing a blind spot agreeing with
each other is not verification.

This set started from the code. That produced five things no predecessor had:

1. **Autonomy already ships** — the finding above. Reorders the plan.
2. **A phantom tier** — 11 exported functions with no callers, clustering into whole
   subsystems that are written, tested, sometimes exposed in config, and never invoked. The
   largest single item in both predecessor architectures — cache-stable layered prompting,
   "the flagship import" — is **~65% already written and dead** in `agent/epoch.go`. Both
   proposed building a new module. Neither opened the file.
3. **A gap hidden by a false claim of completeness** — ADR-003 listed an overflow backstop as
   "(existing)". It does not exist; the code says so in the very comment the ADR borrowed its
   reasoning from. Because it was marked existing, nothing scheduled it.
4. **Four live defects in no backlog** — failed sessions reinforcing as successes, a cache
   defect in `ApplyReminders`, aux-model spend escaping the budget *hard stop*, and a duplicate
   compaction ladder left behind when audit §1.1 landed half a fix.
5. **~20 items already built** — roughly a full wave of re-proposed work, deleted in
   `ROADMAP.md` §4 so it is not proposed a tenth time.

Credit where it is due: [`archive/opencode_dive/`](archive/opencode_dive/) broke the
document-against-document pattern, did ~40 real source checks, and independently caught the
Go-version error. Four of its findings are adopted directly rather than re-derived —
`AUDIT.md` §4.

## The shape of the plan

```
                    ┌─ STOPGAP (precondition, blocks everything)
                    │
CORRECTNESS   W0' ──┴─► W1 ──────────────────────────► W4
PLATFORM                 └─► P1 ──► P2 ──► P3
LEARNING            W2 ─────────────► W3
              WP (provider robustness) parallel, before W4
```

**Committed:** STOPGAP · W0′ · W1 · WP · W2
**Candidate:** P1 · W3 · knowledge-layer continuation
**Deferred:** P2 · P3 · W4

W2 moved. In both predecessor roadmaps it was phase 4 of 6; it is now second, because it is
remediation for a shipped capability rather than a gate in front of a future one.

**This plan slots into root [`ROADMAP.md`](../ROADMAP.md); it does not replace it.** That plan
budgets ~1 substantial feature per week and owns work this corpus never examined at all —
distribution and signing, the tree-sitter codemap, the IDE and CI surfaces, and the license
decision due March 2027. Mapping in `ROADMAP.md` §2.

## If only one thing ever ships

The stopgap, W0′, and W1-a/b/c. About a week and a half, and it removes a hang class, stops
empty provider responses from reporting success, stops user constraints being silently
paraphrased away in long sessions, and closes the unguarded skill-write path.
