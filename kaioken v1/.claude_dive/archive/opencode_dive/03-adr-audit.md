# 03 — ADR Audit (ADR-001 … ADR-010)

Each ADR: verdict → gaps/risks not stated in the record. Authority set = `docs/hermes_res/adr/`.

---

## ADR-001 — Evolve in place, no rewrite
**Verdict: SOUND.** The seam-level defect thesis is the audit's own conclusion, and the "extraction, not rewrite" doctrine has one landed proof case (`internal/retrieval`).
**Gaps**
- The greenfield rejection cites "~63k LOC of verified, tested behaviour". Actual non-test LOC under `cli/internal` measures ≈55k (blank-line-inclusive counts vary by tool); directionally right, figure unverifiable as stated.
- No explicit rule for what happens when an import *conflicts* with an existing Kaioken mechanism mid-implementation (e.g. approval enum vs ruleset engine). Principle 1's ladder covers new capability, not replacement cases. Minor.

## ADR-002 — Daemon-as-hub topology
**Verdict: SOUND IN DIRECTION, UNDER-SPECIFIED IN MECHANICS.** Single-owner sessions kill the dual-mode seam; auto-spawn preserves zero-setup UX.
**Gaps**
1. **Transport unspecified.** "localhost socket" on Windows means either a TCP port (which port? collision handling? auth?) or a named pipe. Nothing decides it. This is the same class of decision ADR-006 made explicitly for PTC — the daemon deserves the same treatment (recommendation in 06-open-questions Q2).
2. **Lifecycle failure modes unlisted:** orphaned daemon after TUI crash (Windows job objects?), version skew between a long-running daemon and a freshly updated TUI binary, two TUIs racing to spawn.
3. **P1's gate is untestable today:** it requires "desktop sidecar path works against the same daemon API", but desktop/ is plan-only (Rust toolchain absent). Gate should be re-scoped to a headless client (see 06-open-questions Q3).
4. **No estimate**, unlike every correctness wave.
5. Rollback story absent: if thin-client conversion destabilises the TUI mid-P1, is there an intermediate mode? (The rejected "dual-mode" alternative is also the natural fallback.)

## ADR-003 — Context doctrine (prune → compact under cache-stable layering)
**Verdict: STRONGEST ADR IN THE SET.** Three doctrines stated on their own terms, composed with explicit order, micro-compaction rejected with recorded nuance (background forks DO inherit byte-exact prefixes). Enforcement via CI byte-equality test is mechanical, not conventional — correct instinct.
**Gaps**
1. **Known compaction limitation absorbed silently:** both references can split *within* a turn (pi cuts at assistant boundaries; opencode scans for the largest fitting suffix). Kaioken's user-boundary-only cut forces `cut == lastTurn` when the final turn alone exceeds the tail budget — pi-opencode-deep-dive §2 documents this exact consequence. v2 adopts the limitation as doctrine without recording that it was considered. Recommend: document as accepted limitation or schedule opencode's `splitTurn` refinement.
2. Anthropic role-folding interaction unexamined: opencode-map notes every system-role message folds into the single top-level `system` string on Anthropic — so "volatile tail" reminders must ride on user messages there (reminders.go already attaches to latest user message ✓), but the CI byte-stability test needs to define the stable/volatile seam per-provider, not just per-session.
3. N6's fixed template has no named owner package (`agent/compact.go` presumably).

## ADR-004 — Gated learning loop
**Verdict: SOUND.** Machinery complete / switch OFF is the right shape; objective-signal gating over self-judged success is the corpus's best-supported decision (multiple independent sources).
**Gaps**
1. **Ledger-as-telemetry vs rollback gate tension:** W2's gate test requires "ledger rollback restores exact bytes", but the ledger "never blocks mutation" — so a ledger write failure creates an unrolled-backable mutation. Acceptable trade-off, but should be stated (bounded risk: only mutations during ledger outage are unrecoverable).
2. `skills.autonomous_writes: true` promotion has evidence requirements but **no demotion procedure** (what happens after a bad autonomous write — flip back + review queue backlog?).
3. Reflection-fork whitelist includes "skill-mutation tools" — safe only because roadmap orders it after W2. If anyone reorders, this becomes the vulnerability. Worth a cross-reference comment in code, not just docs.

## ADR-005 — Unified knowledge layer
**Verdict: SOUND — the differentiator bet.** Continuation-not-initiation framing matches verified master state.
**Gaps**
1. **Artifact metadata schema unspecified.** `{source_provenance, created_at, last_verified_at, freshness_state}` — frontmatter? sidecar YAML? per-tenant differences (wiki stamps vs skill frontmatter vs memory bullets) need one format decided before W3, or every tenant invents its own and the layer re-fragments.
2. **Migration story absent:** existing `.kaioken/` artifacts have none of this metadata. Backfill? Lazily-on-touch? Treat-as-active?
3. Ledger schema should be designed once in W2 (skills-ledger scope) with the unified-layer extension in mind (W3 folds wiki/memory/session mutations in) — otherwise W3 breaks W2's ledger format. Sequencing implies this but never says it.

## ADR-006 — PTC sandbox
**Verdict: TRANSPORT SOLID AND SOURCE-VERIFIED; ONE GENUINE HOLE.**
Verified against vendored Hermes: stale docstring at :27, `SANDBOX_AVAILABLE=True` :59, `_use_tcp_rpc=_IS_WINDOWS` :1357 — the dual-transport claim stands. Request-ID protocol point (vs Hermes' `_call_lock`) verified by doc_agy's stub quote (`_call_lock` exists because protocol lacks IDs).
**THE HOLE: the child script's language/runtime is never named.** Hermes generates a *Python* stub because its host is Python. Kaioken is Go:
- Ship Python → new runtime dependency, contradicts the single-binary ethos everything else protects.
- Bash/batch → too weak for the orchestration use-case (loops over results, conditionals) that justifies PTC at all.
- doc_agy suggested Starlark/WASM embedded; D1 correctly rejected *embedded interpreters sharing the parent process*, but never replaced the runtime half.
Natural resolution (06-open-questions Q1): spawn **the kaioken binary itself** as the child running a generated Starlark script via an embedded pure-Go interpreter (`go-starlark`, no cgo) — keeps the process-boundary trust model of D1 *and* the zero-runtime-dependency property of ADR-009. But it must be decided before P3, not during.
**Other gaps:** child-process cleanup on Windows (job objects) unstated; per-script timeout policy unstated; env-scrubbing allowlist exists in Hermes source (:136-220, doc_agy) but isn't carried into the ADR text.

## ADR-007 — Execution environments
**Verdict: SOUND, well-scoped YAGNI.** Connection-vs-command error taxonomy is a real Hermes lesson worth importing.
**Gaps**
1. Docker-on-Windows prerequisite (Docker Desktop/WSL2) unstated; P3's gate runs Windows PTC over TCP loopback but says nothing about which platform exercises the Docker backend.
2. **Two snapshot concepts collide:** Environment "snapshot semantics" (ADR-007) vs git-tree snapshots for undo (#25, which "plugs into" them). Workspace undo is a *repo* concern; environment snapshot is a *runtime* concern (container state ≠ git tree). Forcing #25 through the Environment interface risks a tangled abstraction. Cleaner: keep #25 in `internal/gitx` (shadow-git like opencode), keep Environment snapshots for container/runtime state. Flagged in 04 as sequencing note.

## ADR-008 — Cron inside daemon; gateway interface only
**Verdict: SOUND.** ESTOP-analog-gates-new-dispatches-only resolves the item-3 chain coherently across all three revisions (backlog drop → D11 drop → L7 revival at daemon layer).
**Gaps**
1. Zero-connected-surfaces delivery policy undefined (queue until reconnect? drop with ledger entry?).
2. Schedule syntax/timezone unspecified (`jobs.json` schema is named but not defined).
3. Missed-job catch-up policy (daemon down at fire time) unstated — matters because P2's gate tests restart-resume.

## ADR-009 — Pure-Go storage
**Verdict: SOUND, constraint VERIFIED** (no sqlite entries in go.mod/go.sum; textrank BM25 present at textrank.go:183). Escape hatch (pure-Go vector index) correctly pre-agreed.
**Gaps:** none material. The ubuntu-only `-race` clarification neatly defuses the "but -race needs cgo" confusion.

## ADR-010 — Skill safety precedes authoring
**Verdict: SOUND and correctly pinned as invariant rather than schedule.** Order 10→12+linter→18→15 matches inspire-phases phase 4.
**Gaps**
1. "No deletion path exists" gate needs negative-test inventory (assert absence of delete calls in skills package? build-tag guard?). Cheap to specify now.
2. Linter effort is bundled inside item 12's 1d estimate — likely underestimated if conventions coverage is meant seriously (frontmatter lint + directory-contract validation from #10).

---

## Cross-cutting ADR observations
- **No rollout/feature-flag strategy** spans the waves (e.g. daemon-as-hub behind a config flag while P1 stabilises?). Each wave has gates but no "how do we ship this to the operator safely between waves" answer.
- **Approval-enum persistence semantics** (where AllowAlways writes, how it interacts with ruleset precedence) live in backlog #4's one-liner, not any ADR — fine until P3 depends on rich verdicts.
- The ADR set never states **who estimates the platform track** — P1–P3 are the largest new surface in v2 and carry no numbers at all.
