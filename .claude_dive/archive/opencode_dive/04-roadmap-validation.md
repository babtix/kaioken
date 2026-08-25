# 04 — Roadmap Validation (validate-only, per operator lock)

Target: `docs/hermes_res/roadmap.md` v1.1 (doc_final 02-roadmap is substantively identical post-reconciliation; differences noted where they matter).

## What checks out

| Aspect | Verdict |
|---|---|
| W0′ scope = exactly the live provider debt (#8, #14) | **VERIFIED** — everything else formerly in W0 is merged; #8 confirmed live at `agent.go:237`, transform.go absent, retry layers thin |
| "Both retry layers together" (#8+#14 same landing) | Sound — matches inspire-phases phase-3 revision rationale (merge-conflict avoidance in the same files) |
| W1 = inspire ph1+ph2 minus consumed items | Consistent |
| WP before W4 (PTC stubs emit transformed schemas) | Dependency is real and correctly ordered |
| Ordering invariant: nothing in Learning before W2 merged | Correctly pinned as outranking everything |
| P3 lands with W4 (approval enum from W1 is its prerequisite) | Prerequisite chain verified |
| Stage↔source traceability table | Accurate against inspire-phases |
| Deferred list | Matches architecture §8 non-goals; no contradictions found |

## Sequencing problems / gaps to flag

### R1. W4 ↔ P3 circular-ish dependency on snapshots
W4 contains "#25 git-snapshot undo — plugs into Environment snapshot semantics (P3)", and P3 "lands with W4". Two items in different tracks each nominally wait for the other's stage. Resolution options: (a) land the Environment *interface* early inside P3 with Docker backend later; or (b) decouple #25 from Environment entirely (see R6). Either way the roadmap should say which.

### R2. Session search (#16) temporally re-coupled to W3 after being deliberately decoupled
inspire-phases revised phase 5 specifically to move #16 onto its own branch because it "has no skill-safety dependency" and shouldn't wait behind phase 4. The v1.1 roadmap agrees ("no dependency on W2 — verified") but then *schedules it inside W3 anyway*, putting it behind the hard W2 gate. If capacity exists earlier, the plan blocks it for no stated reason. Recommend: restore it as an anytime branch (it was ~1–2d, high user value).

### R3. Platform track carries no estimates
P1–P3 are the largest net-new surface in v2 (daemon ownership conversion, cron, environments+PTC). Every correctness wave has hour/day estimates; the platform track has none. Even rough orders (P1 ≈ 2w, P2 ≈ 1w, P3 ≈ 2–3w) would let the operator sequence tracks realistically. *(Validate-only: flagged, not invented here.)*

### R4. W1 estimate not shrunk after W0′ consumed items
W1 inherits inspire phases 1+2 (~5d combined) but phases' items 8 and 14 moved to W0′. The residual set (items 1,5,13 + TUI 2,4,6,7,9,17,20) should carry a smaller number than the inherited sum; roadmap stays silent.

### R5. P1's gate depends on desktop/, which doesn't exist
"Desktop sidecar path works against the same daemon API" — desktop/ is spec-only (per workspace AGENTS.md; Rust toolchain not installed). Gate is untestable until desktop lands. Re-scope to a headless client (e.g. `run -json` over HTTP) proving reconnect/recovery semantics; keep the desktop gate for when desktop exists.

### R6. #25 via Environment interface may tangle two concerns
Workspace undo (git-tree snapshots) is a repo concern; environment snapshots are runtime/container state. Forcing undo through the Environment interface couples `internal/gitx` concerns into ADR-007's abstraction. opencode's shadow-git approach (verified: snapshot.ts service) lives entirely outside its environment layer. Suggest #25 stay in gitx even if Environment exists.

### R7. Silent scope drops between pi-opencode-deep-dive and the backlog
The Aug-1 deep dive ranked ten recommendations; the backlog absorbed only some. Missing entirely from every later document:
- **Hybrid token accounting** — called "the most valuable single change in this document" (~60 lines; anchor on provider usage instead of char-estimate). No backlog row, no wave.
- **Nested AGENTS.md lazy-load** — monorepo conventions never reach the model today. No row.
- **Edit replacer upgrades + isDisproportionateMatch guard** (LineTrimmed/IndentationFlexible/BlockAnchor). No row.
- Smaller: grep line-cap, question-tool, read "did you mean", per-line read cap.
These need an explicit adopt/reject decision rather than silence (see 06-open-questions Q6).

### R8. Compaction split limitation adopted unrecorded
v2 doctrine fixes compaction cuts at user-message boundaries, but both references go finer and the deep dive documents the failure case (single huge final turn forces cut == lastTurn, tail budget ignored). Not a blocker; should be recorded as an accepted limitation or scheduled (06-open-questions Q7).

### R9. Minor: doc_final's W0 vs hermes_res W0′ divergence is fully resolved
doc_final still lists `.gitattributes`/`-race`/audit-residuals as W0 work; hermes_res removed them as merged. Verified merged — anyone reading doc_final's roadmap without RECONCILIATION would redo finished work. Reading-order note, not a defect of the authority set.

## Net assessment
The wave structure is sound and its verified baseline makes it immediately actionable: **W0′ can start today exactly as written.** The flags above are ordering hygiene (R1/R2/R6), estimation honesty (R3/R4), gate feasibility (R5), and scope-loss decisions (R7/R8) — none invalidate the plan.
