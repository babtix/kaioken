# 01 — Comparison Matrix: the Kaioken v2 document corpus

**Method:** every file read in full (33 workspace docs + 4 external papers); claims spot-verified per [02-code-verification-log.md](02-code-verification-log.md). Authority rule: `hermes_res` v1.1 wins conflicts (operator lock).

---

## 1. The corpus at a glance

| Set | Files | Role in the pipeline | Freshness |
|---|---|---|---|
| `docs/logic-audit-and-phases.md` + `phase-plans/` + `phase-branches.md` | 6 | Kaioken's own defect audit; ground truth for what was broken | Written 08-21; **all branches merged 08-22** — now historical record only |
| `docs/hermes-map.md`, `opencode-map.md`, `pi-opencode-deep-dive.md` | 3 | Source maps of the three vendored references | Aug-1 (pi/opencode) / 08-22 (hermes) |
| `docs/inspire-backlog.md` + `inspire-phases.md` | 2 | The ranked porting plan (#1–#28) + branch-per-phase sequencing. **The numbering system every other set cites** | 08-22, adversarially revised same day |
| `doc_agy/` | 6 | First research pass: per-agent deep dives + byte-level source verification report | 08-22 |
| `doc_her/` | 1 | Second-pass Hermes deep dive & comparison ("verified-numbers pass") | 08-22, newest comparison |
| `doc_open/` | 1 | Independent third-pass Hermes-vs-Kaioken analysis + borrowable-ideas ranking | Aug-2026 |
| `~/Documents/reserch/` | 4 | Research papers on self-improvement (Beyond Autonomy, DRR, GLM, ARCH) — source of the "self-congratulation problem", curator thresholds, GEPA/DSPy catalogue | external |
| `doc_final_opencode/` | 4 | Parallel final synthesis (conflict log D1–D13 + NEW N1–N8 + tenets T1–T12) | 08-22, reconciled |
| `docs/hermes_res/` | 13 | **Authoritative final set:** master architecture + 10 ADRs + roadmap v1.1 + RECONCILIATION | 08-22→23, git-rebaselined |

## 2. Per-set assessment

### hermes_res (v1.1) — authority
**Strengths**
- Only set whose baseline was re-derived from `git log` instead of inherited. My verification confirms its §9.1 baseline is accurate on every point checked.
- Decision quality: 10 ADRs each name alternatives considered and consequences; ordering invariant (ADR-010) is pinned as schedule-independent.
- Honest confidence section (§9) — distinguishes verified numbers from inherited ones.

**Weaknesses**
- Platform track (P1–P3) has **no estimates**, unlike every correctness wave.
- ADR-006 specifies PTC transport but not child-script language (see ADR audit).
- Inherits doc_final's D8 Go-version error rather than checking go.mod (RECONCILIATION marked it CONFIRMED — it wasn't).

### doc_final_opencode
**Strengths**
- The conflict-resolution log (D1–D13) is the corpus's best practice artifact — every inter-source contradiction resolved with citations. All 13 resolutions I checked match evidence.
- N1–N8 are concrete and buildable; all eight were adopted by hermes_res (frozen memory snapshot as code, incremental transcript flush, 2 KB cap, verifier footer, compound apply_patch, compaction template, fork cancel window + whitelist, lease deferral).
- Caught two real defects in hermes_res v1 (sessions format, missing WP stage) plus omitted item #20.

**Weaknesses**
- Stale baseline at publication time (four follow-up branches already merged; wrong commit citation `4073e44`; W0 checklist mostly done). RECONCILIATION documents this fully — my checks agree with its verdicts.
- Overstated language: README says "all 28 backlog items CONFIRMED"; its own cited report counts 433/511 quotes.
- Self-describes as derivative of hermes_res locks (L1–L8) — correct self-assessment.

### doc_agy (first pass)
**Strengths**
- The source-verification-report is the corpus's evidence backbone: per-item verdicts with verbatim quotes from both sides. Its PTC-Windows finding (stale docstring at `code_execution_tool.py:27`; truth at :59/:1357) unlocked items #22 — I re-verified all three line citations against the vendored checkout: exact.
- hermes-self-improvement-deep-dive is the mechanism-level source for ADR-004's specifics (read-before-write invariant, persistence isolation, 2.0 s cancel, thread-scoped silence).

**Weaknesses**
- Header states "Go 1.26" — flagged by later sets as an outlier and "corrected" to 1.24. **The header was right** (`go.mod`: `go 1.26`).
- Some quotes are reconstructed, not verbatim: `empty_response_guard.py` has no `should_failover_empty_response(consecutive_empty_count >= 2)` function; the real file uses an `EmptyAttempt` streak with `DEFAULT_EMPTY_RETRY_BUDGET = 3` + cost threshold. Substance matches (streak keyed on model/provider/finish_reason), literal code does not exist.
- Roadmap suggestions (§6 of hermes-in-depth: Starlark/WASM embedded sandbox) were correctly overridden by doc_final D1 — but note D1 never replaced the *runtime* half of that suggestion. That gap survives into ADR-006.

### doc_her (second pass)
**Strengths**
- The cleanest single-file picture of both systems; its §5.4 transfer lists are what became principles 2–3 and W-wave imports. Its verdict framing ("Hermes learns while it works; Kaioken learns between sessions") is quoted by both final sets.
- Mechanism details (cache-layer order, `reconstruct_static_prefix` byte-match rule, CompressionCommitFence) trace directly into ADR-003.

**Weaknesses**
- Says Kaioken approval is "bare bool" without noting the enum blast radius (10 implementors) — backlog #4 correction supersedes.
- No independent baseline claims — safe by design, but adds no git-state evidence.

### doc_open (third pass)
**Strengths**
- Independent arrival at the same two governing invariants (narrow waist, cache-sacred) — good triangulation.
- Its borrowable-ranking (#1 turn leases … #6 frozen-snapshot-as-code) maps cleanly onto N8/N2/T4/N7 and cron-P2; nothing in it contradicts the authority set.
- Best Hermes process-topology description (gateway agent caching, lease TTL, delivery contract).

**Weaknesses**
- Predates the audit merges; its "Kaioken persists after the turn" row is still true today but its roadmap-ish remarks are superseded.
- Describes opencode storage as SQLite event-sourced — true for `inspire/opencode` HEAD, but the pinned `.reference/opencode@7534d23` differs; sets disagree about which opencode they mean without saying so.

### Root docs (backlog/phases/maps)
**Strengths**
- inspire-backlog is the strongest single document in the corpus: hand-verified file:line refs (I confirmed ~15 of them — nearly all EXACT), a real adversarial pass with 5 corrections honestly logged, and effort estimates that the roadmaps reuse unchanged.
- phase-plans contain paste-ready prompts with explicit do-NOT-touch guardrails (e.g. "don't fix Checkpoint atomicity — it's already correct") — unusually disciplined.

**Weaknesses**
- Now partially historical: all four phase branches merged; phase-branches.md table still lists three as open. First thing a new reader would trip on.
- pi-opencode-deep-dive's top recommendations (#1 hybrid token accounting, #3 nested AGENTS.md, #4 BashArity approvals) never became backlog rows; the backlog only absorbed #5 (transform), #14 (retry), #25 (undo), #24 (diagnostics), #16 (search). Silent scope loss — see 04/06.

### External reserch (4 papers)
Both final sets cite them consistently and accurately per the summaries: dual-layer reactive/reflective model, objective-signal gating over self-judged success, GEPA/DSPy as offline outer loop only, HITL checkpoints default-on, 30/90 curator defaults ([ARCH] 14/30 demoted to example values in doc_final D5 — reasonable resolution, adopted).

---

## 3. Cross-set conflict table (post-reconciliation residue)

| Conflict | Sets involved | Authority resolution | My check |
|---|---|---|---|
| Sessions linear vs JSONL trees | hermes_res v1 vs doc_final R1 | Trees (fixed in v1.1) | VERIFIED-EXACT `session.go:51-65` |
| Transform layer unplaced | doc_final R2 | New WP stage | Consistent |
| Audit phases 3/4 open vs merged | doc_final vs RECONCILIATION | Merged | VERIFIED (merge commits `a651bea`,`ae6a808`,`a867302`,`aa5e865`) |
| Audit landed at `4073e44` | doc_final | Wrong commit (desktop tabs feature) | VERIFIED WRONG (`git show 4073e44`) |
| Go 1.24 vs 1.26 | doc_final D8 + RECONCILIATION vs source-report header | **Authority set is wrong here** | go.mod = `go 1.26`; toolchain go1.26.5 |
| Micro-compaction cache-thrashing vs cache-warm forks | hermes-in-depth vs hermes-self-improvement | Both true, scoped (D9) | Sound; nuance carried into ADR-003 |
| Curator 30/90 vs 14/30 | reserch BA/GLM vs ARCH | 30/90 configurable (D5) | Matches `curator.py:72-73` |
| ESTOP dropped vs daemon-gated | backlog #3 vs D11 vs L7/ADR-008 | Final: ESTOP-analog gates new dispatches only (P2) | Consistent chain across revisions |
| PTC Starlark/WASM vs child-process+IPC | doc_agy roadmap vs doc_final D1 | Child process + dual transport | Transport verified; child runtime left undecided (open question Q1) |
| Search placement ph5 vs own branch | inspire-phases revision | Own branch, no W2 dependency | Both final sets agree; temporal coupling reintroduced in W3 (see 04) |

No unreconciled substantive conflicts remain. The residue is: one factual error (Go version), one unspecified decision (PTC child language), and several silent scope drops (deep-dive recs without backlog rows).

## 4. Convergence analysis

**All five research passes independently agree on** (highest-confidence findings in the corpus):
1. Cache-stable layered prompting is the highest-leverage Hermes import.
2. Deterministic prune before LLM compaction beats micro-compaction for this product.
3. Safety machinery precedes autonomous skill authoring (phase 4 → 5 invariant).
4. Pure-Go/no-SQLite constraint is non-negotiable given `CGO_ENABLED=0`.
5. The knowledge engine (verify + provenance) is Kaioken's sole unique differentiator.
6. Never summarise user messages (#5) is the best value-per-hour fix available.

**Unique contributions per set** (what would be lost if the set were deleted):
- logic-audit: the seam-defect taxonomy ("well-written statements, wrong seams") — ADR-001's foundation.
- inspire-backlog: item numbering + estimates + adversarial corrections.
- doc_agy: byte-level verification report + self-improvement internals.
- doc_her: verdict framing + transfer lists + mechanism detail.
- doc_open: borrowable ranking + topology/lease/delivery-contract depth.
- doc_final: conflict log D1–D13 + NEW N1–N8.
- hermes_res: operator locks D1–D8, ADR discipline, git-verified baseline, platform track.
