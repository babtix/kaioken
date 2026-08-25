# Kaioken logic audit — findings and phased remediation plan

Scope: `cli/` only (Go, ~63k LOC across 49 packages). Desktop app and `registry-web`/
`website`/`web-news` are explicitly out of scope. Focus is **logic correctness**, not
style, not test coverage for its own sake.

Baseline as of this audit: `go vet ./...` clean, `go test ./...` green. Every defect
below is therefore invisible to the current test suite — that is itself a finding.

## Status

**Phases 1 and 2 are landed on `master`** (merged from `fix/phase1-agent-logic`, 8 logic
commits + 2 desktop commits, ~1 300 lines of new tests). Phases 3 and 4 are still open,
each with its own branch — see [phase-branches.md](phase-branches.md) for the
branch/status/scope table.

| Fix | Commit |
|---|---|
| 1.3 newline bypasses standing permissions | `c2fd998` |
| 1.4 invalid tool calls from a stream | `953fd8a` |
| 1.2 sub-agent `derive()` | `a3d476b` |
| 1.1 compaction inside `Run` | `bbb73fe` |
| 2.1 supervisor rejects its own plan | `bc32915` |
| 2.2 escalated runs skip grounding | `7fe80bc` |
| 2.4 worker evidence cap credits an unread source | `73b29d9` |
| 2.3 resume drops the gap query plan | `8bc959e` |

Each fix ships with tests that fail without it. Two items in §1.5 remain open (the step
budget consumed by steering, and `normalizeToLF` rewriting mixed line endings); §2.5
(worker cancellation) is also still open.

---

## Summary of what is actually wrong

The code is unusually well-written at the *statement* level: careful comments, honest
naming, deliberate trade-offs. The defects are almost all at the **seam** level —
where two well-built components meet and one of them makes an assumption the other
does not honour. Four seams account for nearly everything found:

1. **The agent loop never reconsiders its own context size** — compaction is a
   front-end concern, so a long autonomous run walks off the end of the window.
2. **The deep-research supervisor rejects its own plan** — a dedup set is seeded with
   the objectives it is about to ask for.
3. **Sub-agents are constructed by hand-copying fields**, so every new `Agent` field
   is silently dropped one level down.
4. **Three independent chunk→rank→fuse stacks** (`prism`, `search`, `research/corpus`)
   share one primitive (`textrank`) and nothing else, so retrieval quality fixes have
   to be made three times and never are.

---

## Phase 1 — Agent coding system (highest severity, do first)

The tool-calling loop, edit application, permissions, context management.
Files: `cli/internal/agent/*`, `cli/internal/llm/stream.go`.

### 1.1 Auto-compaction never runs inside a run — **critical**

`Agent.Run` ([agent.go:104](../cli/internal/agent/agent.go)) loops up to `MaxSteps`
(25 for the TUI, 40 for a delegate) appending an assistant message plus a full tool
batch each iteration. It never calls `ShouldCompact`, `Prune`, or `Compact`.

The only auto-compaction in the process is in the TUI, *before* `Run` starts
([tui.go:1276](../cli/internal/tui/tui.go)). So the guarantee is "the context fits
when the turn begins" — not "the context fits when the turn ends". A run that reads
twenty large files overflows mid-loop and dies on a provider 400, and by then the
history is already too large to send, which is exactly the unrecoverable state the
TUI comment says it exists to prevent.

The daemon has *no* auto-compaction at all — only a manual
`handleCompactSession` endpoint ([handlers_chat.go:332](../cli/internal/daemon/handlers_chat.go)).
Two front-ends, two different context policies, one shared agent.

**Fix:** move the prune→compact ladder inside `Run`, checked at the top of each step
against `a.Context`. The agent already holds everything it needs (`Client`, `Context`,
model, ceiling). Both front-ends then inherit one policy and the daemon gap closes for
free. Keep the front-end pre-turn check or drop it — it becomes redundant either way.

### 1.2 Sub-agent construction silently drops parent state — **high**

`task` ([task.go:113](../cli/internal/agent/task.go)) and `delegate`
([delegate.go:145](../cli/internal/agent/delegate.go)) each build a fresh `&Agent{…}`
by listing fields. Both omit `MemoryDisabled`, `Perms`, and `Notes`; `task` also omits
`Config`.

Concrete consequences:
- A user who set `memory.disable: true` still gets `recall`/`remember` offered to every
  sub-agent, because `MemoryDisabled` defaults to false.
- The delegate runs with `Perms == nil`, so every standing "always allow `go test`"
  rule the user granted is ignored inside delegated work — it re-asks for everything.
- The delegate's `remember` writes to `<worktree>/.kaioken/MEMORY.md`, and the worktree
  is deleted by the `defer` at [delegate.go:142](../cli/internal/agent/delegate.go).
  Memory the agent was told to keep is destroyed without a word.

**Fix:** a single `func (a *Agent) derive(overrides …) *Agent` that copies the parent
and applies the deliberate differences (Root, Mode, Depth+1, UI, MaxSteps, NoStream,
nil Context). Then the *inheriting* case is the default and the *dropping* case is the
one that has to be written down — the inverse of today.

### 1.3 Standing permission rules can be bypassed with a newline — **high**

`Chainable` ([permission.go:243](../cli/internal/agent/permission.go)) splits on
`strings.Fields` and looks for `&&`, `|`, `;`, `` ` ``, `$(`. `strings.Fields` treats
`\n` as ordinary whitespace, so it is never seen as an operator — but the command is
handed to `sh -c` / `powershell -Command`
([tools.go:1021](../cli/internal/agent/tools.go)), where a newline **is** a separator.

```
git status
rm -rf /
```

canonicalises to `git status`, `Chainable` returns false, and a stored
`allow run: git status` rule auto-approves the whole thing without a prompt. The
docstring on `standingDecision` describes precisely this attack and the guard misses
the newline case.

**Fix:** treat `\n`, `\r`, and `\x00` as chaining; test `Chainable` against a
newline-separated line. Consider also refusing any command containing a newline from
matching a stored rule at all.

### 1.4 Truncated streams produce malformed tool calls — **medium**

`parseSSE` ([stream.go:208](../cli/internal/llm/stream.go)) accumulates
`tc.Function.Arguments` from fragments and, on `io.EOF`, returns the message with no
error. `finish_reason` is parsed into the struct and never read. A stream cut by
`max_tokens` mid-arguments therefore yields a tool call with truncated JSON, and a
provider that omits ids yields `ToolCallID: ""`, which makes the *next* request 400
because the tool result cannot be paired.

**Fix:** on stream end, validate each assembled call — non-empty id, non-empty name,
`json.Valid(arguments)` — and surface a `finish_reason == "length"` that lands inside a
tool call as a retryable error rather than a well-formed-looking message.

### 1.5 Smaller items in this area

- `Run`'s step budget is consumed by steering and follow-up rounds
  ([agent.go:175-191](../cli/internal/agent/agent.go)): a user who steers five times
  loses five of the twenty-five steps the model had to finish the task, with no signal.
- `Prune` ([prune.go:97](../cli/internal/agent/prune.go)) counts the whole message's
  tokens as `freed`, but the stub it writes still costs ~20 tokens per victim; the
  reported saving is optimistic and the caller does `used -= freed` on it.
- `normalizeToLF` ([editmatch.go:56](../cli/internal/agent/editmatch.go)) rewrites bare
  `\r` to `\n`, then `restoreLineEndings` rewrites *every* `\n` to the dominant ending
  — a mixed-ending file is silently normalised wholesale by any edit.

---

## Phase 2 — Deep research (second highest, most user-visible)

Files: `cli/internal/research/*`.

### 2.1 The supervisor rejects its own plan — **critical**

`runSupervisor` ([supervisor.go:176](../cli/internal/research/supervisor.go)) seeds
the dedup set with every *planned* objective:

```go
for _, s := range subs {
    objectives[strings.ToLower(strings.TrimSpace(s.Objective))] = true
}
```

`acceptDispatch` ([supervisor.go:296](../cli/internal/research/supervisor.go)) then
refuses any `conduct_research` whose objective is already in that set, with
*"this objective is already covered by an existing subtopic or finding"*.

The initial plan is never dispatched anywhere else. So the supervisor is handed a plan,
asked to dispatch it, and every faithful dispatch is rejected. The deep path only
produces findings when the model *paraphrases* the objective enough to miss an
exact lowercase match — which is luck, not design, and it silently degrades the run to
whatever the model happened to reword.

**Fix:** track dispatched/settled objectives separately from planned ones. Seed the set
from `loaded` findings only, and mark planned objectives as claimed at dispatch time
(which line 229 already does correctly).

### 2.2 Escalated runs skip the grounding pass — **high**

Escalation ([engine.go:244-259](../cli/internal/research/engine.go)) sets
`e.escalated = true` and mutates `r.Path = "deep"` in the run state, but never updates
`e.route`. Then:

```go
citeWanted := e.opts.Verify || e.route == RouteDeep ||
    (e.mode == "auto" && !e.escalated && !e.dossier)
```

For an escalated auto run all three terms are false, so the citation-grounding pass is
skipped — on exactly the runs that escalated *because the fast path was not good
enough*. The report ships ungrounded and `Report.Grounding` is nil.

**Fix:** set `e.route = RouteDeep` at both escalation sites (the pre-write one and the
post-cite one), and derive `canEscalateAfterCite`'s "still fast" test from `e.escalated`
rather than from `e.route`.

### 2.3 Resume loses the gap-derived query plan — **medium**

`runFast` on resume ([fastpath.go:76](../cli/internal/research/fastpath.go)) sets
`out.pendingQueries = []string{e.question}`. `FastState` persists subs, findings,
queries and round — but not `pendingQueries` or `lastGaps`. A run resumed after round 2
re-searches the original question instead of the specific gaps round 2 identified,
which is the entire value the gap audit produced.

**Fix:** persist `pendingQueries` and `lastGaps` in `FastState`.

### 2.4 Worker evidence cap corrupts the source list — **medium**

`compress` ([worker.go:216-232](../cli/internal/research/worker.go)) appends
`doc.Hash` to `order` *before* the `workerEvidenceCap` check that `break`s. The
document that busts the cap is never shown to the compressor but still ships in
`Finding.SourceHash`, which `toLegacyFinding`
([supervisor.go:417](../cli/internal/research/supervisor.go)) counts toward the
citation set and the `high`/`medium`/`low` confidence verdict. A finding can be rated
`high` partly on a source no model ever read.

**Fix:** move the `order` append after the cap check.

### 2.5 Worker loop has no cancellation check

`runWorker` ([worker.go:80](../cli/internal/research/worker.go)) loops on tool-call
count and budget only; `ctx` cancellation is noticed only when the provider call
happens to fail. `dispatchWorkers` uses `errgroup.WithContext` but every worker returns
`nil` on error ([supervisor.go:338](../cli/internal/research/supervisor.go)), so
`gctx` is never cancelled by a sibling failure either. A cancelled run keeps billing
until the in-flight call returns.

---

## Phase 3 — Knowledge engine (largest structural debt)

Files: `cli/internal/prism/*`, `cli/internal/search/*`, `cli/internal/wiki/*`,
`cli/internal/codemap/*`, `cli/internal/memory/*`.

### 3.1 Three parallel retrieval stacks — **architectural**

`prism`, `search`, and `research/corpus` each implement their own chunking,
BM25 scoring, vector ranking, and fusion. They share only `internal/textrank`. PRISM is
the most advanced (parent/child chunking, RAG-Fusion variants, a corrective relevance
gate); `search` has hybrid BM25+vector but flat chunks and no gate; `research/corpus`
has its own per-host page pool and ranking.

Consequences already visible: the tail-crawl chunking bug was fixed in `prism/chunk.go`
only. The relevance gate that stops PRISM returning the least-bad chunk does not exist
in `search`, so `read_knowledge` and the daemon docs search happily return irrelevant
chapters with no `SourceFound: false` equivalent.

**Fix (phased, not a rewrite):** extract PRISM's chunker, fusion, and gate into a
shared `internal/retrieval` package; port `search` onto it first (same on-disk index
shape, so it is a drop-in); leave `research/corpus` for last since its per-host
politeness logic is genuinely different.

### 3.2 PRISM memo cache is a benign TOCTOU

`candidatesFor` ([retrieve.go:229](../cli/internal/prism/retrieve.go)) releases the
lock before `LoadCorpus` + `newCandidates`, so N concurrent first-queries on one module
each tokenise the whole corpus and the last writer wins. Correct, but on a large module
that is N× the work and N× the memory spike. A per-module `singleflight` or a
`sync.Once`-per-entry fixes it without reintroducing the serialisation the comment
correctly avoids.

### 3.3 Knowledge freshness has no invalidation path

`wiki.Stamp` records the commit a wiki reflects and `search.Index` carries a corpus
fingerprint, but the agent's `read_knowledge` tool
([tools.go](../cli/internal/agent/tools.go)) and `knowledgeSummary` read the generated
docs with no staleness check at all. The agent is told, in its system prompt, that this
documentation describes the repo — with no signal when it describes a repo from forty
commits ago. Given the prompt's own instruction ("Ground answers in the actual files"),
stale knowledge cards are a confident-wrong-answer generator.

**Fix:** surface the stamp's commit distance in `knowledgeSummary` and in
`read_knowledge` output ("generated 43 commits ago; may be stale").

### 3.4 Memory writes are not deduplicated

`internal/memory` caps file size and refuses appends past the cap
([memory.go:153](../cli/internal/memory/memory.go)), but nothing checks whether the
fact being appended is already there. Over a long project the file fills with
near-duplicates and then hard-refuses all further writes, which reads to the agent as
"memory is full" rather than "memory is redundant".

---

## Phase 4 — Cross-cutting: state, concurrency, and the test gap

Smaller in volume, but it is what lets phases 1–3 regress.

- **Every defect above passes the test suite.** The tests are unit-shaped and cover
  the components; nothing exercises a seam. *(Addressed for phases 1–2: each fix landed
  with tests driven against the scripted fake client in `agent_run_test.go`, and the
  escalation and permission fixes were verified to fail when the fix is reverted.)*
- **45 goroutine launch sites, 58 mutexes.** Run the suite under `-race` in CI; it does
  not appear in `.github/` today. Note `-race` needs cgo and a C toolchain, so it cannot
  run on a stock Windows dev box — CI is the only place it will actually execute.
- **Add a `.gitattributes`.** The repo has none, so on Windows every file git touches is
  rewritten LF→CRLF. `gofmt -l` currently reports *every* file in `internal/research` as
  unformatted for this reason alone, which makes real formatting drift invisible.
- `RunState.Mutate` + `Checkpoint` is called from inside `errgroup` workers
  ([supervisor.go:330](../cli/internal/research/supervisor.go)) — verify the write path
  is atomic (temp file + rename) or a crash mid-checkpoint corrupts a resumable run.
- `internal/tui/tui.go` is 3 206 lines and owns model state, compaction policy, command
  dispatch, and rendering. It is where the daemon/TUI policy drift in 1.1 comes from.
  Splitting it is not urgent, but every fix in phase 1 should move policy *out* of it
  rather than into it.

---

## Suggested ordering

| Phase | Why here | Rough shape |
|---|---|---|
| 1 — Agent | Highest severity, and 1.1/1.2 block safe work everywhere else | Compaction into `Run`, `derive()`, `Chainable` newline, stream validation |
| 2 — Research | 2.1 means the deep path is not doing what it claims | Dedup fix, route fix, resume state, evidence cap |
| 3 — Knowledge | Largest debt, but nothing is *wrong* today — it is duplicated | Extract `internal/retrieval`, port `search`, staleness signal |
| 4 — Cross-cutting | Lands alongside 1–3, not after | `-race` in CI, seam tests per phase |

## Where `pi` and `opencode` come in (deferred)

Both are already vendored read-only, with maps in `docs/opencode-map.md` and
`docs/pi-opencode-deep-dive.md`. The audit deliberately did not consult them — these
are Kaioken's own bugs. Once phases 1 and 2 land, the useful comparisons are:

- **opencode** — session/message persistence and abort semantics (relevant to 1.1 and
  2.5), and its permission `evaluate` model, which Kaioken already ports but without
  the newline case.
- **pi** — `estimateContextTokens` anchoring (already ported into `ctxtrack.go`) and
  its edit-diff strategy ladder (already ported into `editmatch.go`); the remaining
  unported piece is its multi-strategy *retry* behaviour when a strategy misses.

Note: `PI_KAIOKEN_ANALYSIS.md`'s gap table is stale and should not be used as input.
