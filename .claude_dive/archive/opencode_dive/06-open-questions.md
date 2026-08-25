# 06 — Open Questions (each with a recommendation; DECISION NEEDED = you)

Ordered by impact on the v2 plan.

---

## Q1 — PTC child language/runtime · **DECISION NEEDED (blocks P3 design)**
ADR-006 fixes transport (AF_UNIX / loopback TCP, verified vs Hermes source) and trust model (untrusted child gets tool surface only), but never says what the child script *runs in*. Hermes generates Python because its host is Python; Kaioken is Go.
**Options:**
- (a) Require Python on host → new runtime dependency; breaks the single-binary story everything else protects. *Not recommended.*
- (b) Shell/batch child → too weak for the loops/conditionals that justify PTC. *Not recommended.*
- (c) **Spawn `kaioken` itself as the child, running a generated Starlark script via an embedded pure-Go interpreter (`go-starlark`, Apache-2.0, no cgo).** Preserves D1's process-boundary trust model AND ADR-009's zero-dependency constraint; Starlark is deterministic, hermetic by default (no I/O except what you expose — exactly the tool-surface-only property wanted), and Python-like enough for models to write fluently. Generated stub = Starlark definitions mapping to RPC calls over `internal/rpc` with request IDs.
- (d) goja (JS-in-Go) same shape, larger API surface, weaker determinism guarantees.
**Recommendation:** (c), decided before P3 estimation. Note doc_agy's original Starlark suggestion was right about the language and wrong about the process placement — this merges both corrections.

## Q2 — Daemon transport + lifecycle spec on Windows · **DECISION NEEDED (blocks P1 design)**
"Auto-spawn daemon on a localhost socket" leaves transport, port/auth, orphan cleanup, and version-skew undecided.
**Recommendation:** loopback TCP on an ephemeral port + per-boot token file under `.kaioken/daemon/` (mirrors the PTC precedent set in ADR-006); child-daemon tied to spawner lifetime via Windows Job Object; daemon version endpoint checked by TUI at connect, restart-on-mismatch. One paragraph in ADR-002 closes all four gaps.

## Q3 — P1 gate feasibility while desktop/ is unbuilt
Gate says "desktop sidecar path works against the same daemon API"; desktop is plan-only.
**Recommendation:** re-scope P1's gate to a headless client (`kaioken run -json --attach`) proving reconnect-after-restart and kill-9 recovery; add "desktop sidecar validates the same API" to desktop's plan instead.

## Q4 — Adopt the silently-dropped pi/opencode recommendations?
Three verified, high-value items never got backlog rows:
1. **Hybrid token accounting** (~60 lines; anchor compaction triggers on provider usage, estimate only the tail) — deep dive called it "the most valuable single change". Natural home: W0′ or W1.
2. **Nested AGENTS.md lazy-load on read** — monorepo conventions currently invisible to the model. Natural home: W4 or W1.
3. **Edit replacer upgrades + `isDisproportionateMatch` safety guard** — direct edit-success-rate improvement. Natural home: W4.
**Recommendation:** adopt 1 into W0′/W1 (cheap, correctness-adjacent); adopt 2 and 3 as W4 rows. If rejected, record rejection so the corpus stops implying they're pending.

## Q5 — Go version documentation fix
go.mod = `go 1.26`; toolchain go1.26.5; root AGENTS.md and both final sets say 1.24.
**Recommendation:** update root AGENTS.md line 33 → 1.26; add one-line correction note to RECONCILIATION.md §1 (its "CONFIRMED" row for doc_final D8 is wrong); leave cli/AGENTS.md silent on versions if preferred. Five-minute fix preventing future readers from "correcting" go.mod downward.

## Q6 — Compaction split limitation: accept or schedule?
User-boundary-only cuts force cut == lastTurn when the final turn alone exceeds the tail budget (documented in pi-opencode-deep-dive §2; both references solve it).
**Recommendation:** record it in ADR-003 as an accepted v2 limitation now; schedule opencode's `splitTurn` refinement as a W4-optional item rather than leaving it undiscovered later.

## Q7 — Where does the prompt-composition module land in the roadmap?
§5.3 cache-stable layering is the flagship import with a CI enforcement test, but no wave owns building it. It touches `agent/context.go` + reminders + toolset freezing.
**Recommendation:** name it explicitly — small stage after W1, before P1 (P1's daemon inherits session/prompt ownership, so the composition module should exist before persistence moves to the daemon).

## Q8 — Unified-layer metadata schema designed once, upfront
ADR-005's shared artifact metadata will be implemented tenant-by-tenant across W2→W3. Without a single schema decision (frontmatter keys, sidecar file, freshness-state enum values) W3 risks re-fragmenting the layer it exists to unify.
**Recommendation:** half-page schema appendix to ADR-005 before W2 lands the skills ledger; migration = lazy backfill on touch, unknown → active.

## Q9 — phase-branches.md staleness
Still lists four merged branches as open. First reader trap in the docs tree.
**Recommendation:** mark all four merged (commits already in my verification log); consider a banner on logic-audit-and-phases.md ("historical record — all phases landed 2026-08-22").

## Q10 — Estimates for the platform track
P1–P3 have none. Even rough orders would let you plan calendar time across tracks.
**Recommendation:** estimate P3 last (after Q1 resolves — child-runtime choice dominates its size); P1/P2 can be estimated now.

---

*No question above blocks starting W0′ as written — #8/#14 are fully specified, verified-live, and prerequisite-free.*
