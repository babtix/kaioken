# Addendum — `.hermes_dive/`, `.opencode_dive/`, `.antigravity_dive/`

Written 2026-08-23, after [`00-reconciliation.md`](00-reconciliation.md). Same code
baseline: `cli/` is byte-identical across `7be48f2`, `36dfcaf` and `bd740fe` **[v]** —
`bd740fe` is a version-string bump on master, so every verdict in the main report still
applies unchanged.

## 1. Lineage — this is a later generation

Three more folders exist at repo root, hidden from the earlier `docs/` sweep:

```
docs/hermes_res/  +  docs/doc_final_opencode/   ──superseded by──▶  .hermes_dive/   (canonical, rev 1.0)
docs/{all five} + root docs/*.md                ──audited by────▶  .opencode_dive/ (ox-alpha, 7 files)
                                                                   .antigravity_dive/ (3rd synthesis, 5 files)
```

`.hermes_dive/README.md` declares itself **canonical** and states it supersedes the two sets
my report treated as the competing architectures. `.hermes_dive/SUPERSEDED.md` carries a
per-file redirect map. So the main report graded a superseded draft of one folder — which
raises the only question that matters here:

**Does the newer generation already contain the main report's findings?**

Answer: **no.** Every finding that reorders the plan is still net-new. Verified by grep
across all three new folders plus targeted source checks.

## 2. What the newer generation did fix

Credit where due — three of my §3 and §6 items are genuinely closed upstream:

| Fixed | Where |
|---|---|
| "Sessions linear" → **trees** | `.hermes_dive/AUDIT.md` §3: *"CLOSED — canonical states trees"* |
| Four phase branches listed as open → **none open** | `.hermes_dive/AUDIT.md` §1: *"Open branches: NONE"* |
| Wrong baseline commit `4073e44` | Corrected to `bd740fe`, verified |
| **Go 1.24 → 1.26** | `.opencode_dive` §C.1 — independently reached my conclusion, and named it *"precisely the corpus's own named failure class"* |

`.opencode_dive/02-code-verification-log.md` is the real thing: ~40 source-verified claims,
and it independently confirms several of mine — `search` and `research` still on separate
stacks, `events/bus.go` unguarded, empty-200 live, FIFO guard missing, #5 open.

## 3. What survived uncorrected into the canonical set

**3.1 · The non-existent backstop.** `.hermes_dive/adr/ADR-003` step 5 still reads:

> **5. Backstop:** overflow replay handling (existing).

No such mechanism exists. [agent.go:159-163](../../cli/internal/agent/agent.go:159) states the
opposite as the *reason* for the design **[v]**:

> *"Overflow is not recoverable in place: once the request fails, the history that failed to
> send is the only history there is, and it is already too large — so the reduction has to
> happen while the failure is still hypothetical."*

The author read this comment — step 2's rationale ("acts while overflow is still
hypothetical") is lifted from it almost verbatim — and inverted its conclusion into a
component that ships. Because ADR-003 labels it *(existing)*, **no wave schedules it.** A
real gap is hidden by a false claim of completeness, in the canonical document.

**3.2 · The flagship import still duplicates dead code.** ADR-003's Consequences still opens:

> New prompt-composition module owns layer assembly; CI test asserts stable-prefix
> byte-equality across turns.

`ContextEpoch` appears **zero times** across all three new folders. `PruneStale`: zero.
`MaxSkills`: zero. The only `epoch.go` mentions are the inherited disclaimer *"epoch.go is
prompt-cache baselining, NOT this"* — carried forward from the backlog's note about git-undo
(item 25), which is what stopped anyone opening it. As §4 of the main report shows, that file
is ~60–70% of the module ADR-003 proposes building.

`.opencode_dive` Q7 asks *"Where does the prompt-composition module land in the roadmap?
...no wave owns building it."* Correct question, wrong premise — most of it is written.

**3.3 · N9 rests on a fabricated citation and is largely stale.** Of the canonical set's three
genuinely new decisions, N9 cites Hermes `turn_context.py:42-48` for dynamic cache-control tag
placement. Verified **[v]**: lines 38-52 are an **import block**, and `cache_plan` appears
**0 times** in that file. The real function is `prompt_caching.py:385`. The bad citation came
from `doc_agy/hermes-in-depth §3.1` — flagged as fabrication F-4 by that folder's audit, then
inherited unchecked.

Worse, N9's *substance* largely ships already. It proposes "Anthropic-style breakpoints where
supported" at the system prompt and recent turns — which is exactly
[anthropic.go:73](../../cli/internal/llm/anthropic.go:73) and `:86`, using
`cacheEphemeral = {"type":"ephemeral"}` declared at `:62-63` **[v]**.

**3.4 · D8 "Go 1.24" is still in the canonical register.** `.hermes_dive/adr/DECISIONS.md:36`
carries it forward, on the same day `.opencode_dive` proved it wrong. The canonical set and
its own auditor contradict each other, and the canonical set is the one that's wrong.

The irony is sharp: the canonical set's own **N11** is a process rule requiring that baseline
claims cite a SHA and be re-verified before action — adopted specifically because of this
failure class. It is violated two lines below in the same file.

**3.5 · `.antigravity_dive` made the Go error worse.** It states "Go 1.24" in three places,
including *"D8: Go Toolchain Target ► Go 1.24 (Matches root go.mod & CI matrix)"*. Doubly
false: there is no root `go.mod` **[v]**, and CI reads the version from `cli/go.mod` via
`go-version-file`.

## 4. Why the newest audit still missed all of it

`.hermes_dive/AUDIT.md` documents its own method, and the method explains the result:

- **§2** re-checked *"every anchor cited by either predecessor's roadmap."* It can only
  re-confirm what was already cited. It cannot discover code nobody pointed at.
- **§4** *"Grep-audited every deep-dive mechanism against both final sets ... verified by
  targeted grep before concluding."* Document against document, not document against code.
- **§3** therefore concludes *"Residual disagreements between the two sets: none found."*

Two documents sharing a blind spot agreeing with each other is not verification. Every claim
in §3 above sits in the gap that method leaves: code that exists but which no predecessor
document ever cited.

`.opencode_dive` broke this pattern — it read source and caught the Go version. But its §D
("What I did not verify") shows the same boundary: it verified *the corpus's claims*, never
sweeping for capability the corpus failed to mention.

## 5. What `.opencode_dive` adds that nothing else has

This folder is the strongest single artifact across all eight, and several items are new:

1. **Q1 — the PTC child-language hole, with an answer.** ADR-006 fixes transport and trust but
   *never says what the child runs*. Its recommendation: spawn **the `kaioken` binary itself**
   as the child, executing a generated **Starlark** script via an embedded pure-Go interpreter
   (no cgo). Keeps D1's process boundary *and* ADR-009's zero-dependency constraint. **This is
   the best answer to V-3 anyone has produced** and supersedes my framing of that verdict.
2. **ADR-007 — two snapshot concepts collide.** Environment snapshots are a *runtime* concern
   (container state); git-tree undo is a *repo* concern. Forcing item 25 through the
   Environment interface tangles them. Nobody else caught this.
3. **Q4 — two high-value recommendations were silently dropped** between the Aug-1 deep dive
   and the backlog, with no row and no roadmap home: **hybrid token accounting** (~60 lines,
   called "the most valuable single change") and **nested `AGENTS.md` lazy-load**.
4. **Q6 — a real compaction limitation nobody recorded.** User-boundary-only cuts force
   `cut == lastTurn` when the final turn alone exceeds the tail budget. Both references solve
   this; v2 adopts the limitation as doctrine without noting it was considered.
5. **Q2 — daemon transport on Windows is undecided.** ADR-002 says "localhost socket" and
   leaves port, auth, orphan cleanup and version skew unspecified — the same class of decision
   ADR-006 made explicitly for PTC.
6. **Q3 — P1's gate is untestable today.** It requires the desktop sidecar path, and `desktop/`
   is plan-only with no Rust toolchain installed.

## 6. Net effect on the main report

| Main report section | Status after this addendum |
|---|---|
| §1 — autonomy already ships unguarded | **Unchanged and still unique.** All `learn.go` references across the three new folders point at `:37` (`Signals`); nobody read to `:269` (the write) |
| §3 — already-built list | 3 items closed upstream (§2 above); the rest stand |
| §4 — phantom tier | **Unchanged and still unique.** Zero mentions of `ContextEpoch`, `PruneStale`, `MaxSkills` anywhere in the new folders |
| §6 — Go version dispute | **Corroborated** by `.opencode_dive`; still wrong in `.hermes_dive` and `.antigravity_dive` |
| §7 — six bugs | **Unchanged and still unique** |
| §9 — verdicts | V-3 now has a strong candidate answer (§5.1); V-5 unchanged and still unaddressed by anyone |

## 7. Revised verdicts

**V-3 (PTC) — supersede my framing.** Adopt `.opencode_dive` Q1: `kaioken`-as-child running
generated Starlark via an embedded pure-Go interpreter. It resolves the objection in the main
report's §8 (the wazero one-shot ABI can't do N callbacks) without the runtime dependency that
a Python/node stub would add. Remaining sub-decisions: child cleanup on Windows (job objects),
per-script timeout, and carrying Hermes' env-scrubbing allowlist into the ADR text.

**V-8 (new) — the canonical set needs three corrections before it is executable.**
(a) delete *"(existing)"* from ADR-003 step 5 and schedule the backstop, or drop the step;
(b) rewrite ADR-003's Consequences against `epoch.go` — wire, don't rebuild;
(c) strike D8 and fix root `AGENTS.md:33` to Go 1.26.

**V-9 (new) — adopt or reject the two dropped recommendations** (`.opencode_dive` Q4): hybrid
token accounting and nested `AGENTS.md` lazy-load. If rejected, record the rejection so the
corpus stops implying they are pending.

**V-10 (new) — enforce N11 mechanically, not editorially.** The canonical set adopted a
provenance rule and violated it in the same file. A planning doc that claims a baseline should
fail CI if its cited SHA is not an ancestor of `master` — the same instinct as ADR-003's
byte-equality test, applied to documentation.
