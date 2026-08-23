# 02 — Code Verification Log

**Target:** `master` @ HEAD `36dfcaf` (branch `docs/inspire-analysis`). `git diff 7be48f2..36dfcaf --stat` = docs only, 25 files, 5452 insertions → **`cli/` is identical to the corpus's verified baseline `7be48f2`.**
Labels: VERIFIED-EXACT (citation matches to the line) · VERIFIED (substance confirmed) · STALE (was true when written; drift since) · WRONG (contradicted by source) · UNVERIFIABLE.

## A. hermes_res baseline §9.1 / roadmap claims

| Claim | Verdict | Evidence |
|---|---|---|
| HEAD adds docs only vs `7be48f2` | VERIFIED | `git diff 7be48f2..HEAD --stat`: 25 doc files only |
| `internal/retrieval/` extracted from prism w/ tests | VERIFIED-EXACT | chunk.go/grader.go/lexical.go/variants.go + `_test.go` each (+ utility.go), under `cli/internal/retrieval/` |
| Prism memo-cache TOCTOU closed via singleflight | VERIFIED-EXACT | `prism/retrieve.go:8` import; comment at `:248` |
| `wiki/staleness.go` landed | VERIFIED | file exists |
| Memory write-dedup landed | VERIFIED | `memory/memory.go:192 isDuplicateFact` |
| Empty-response silent success still live (#8) | VERIFIED | `agent/agent.go:205-237`: empty content prints nothing; falls through to `return history, nil` at :237 (docs cite :238 — off by one line) |
| Transform layer still missing (#11) | VERIFIED | no `cli/internal/llm/transform.go` |
| Two retry layers | VERIFIED | `llm/retry.go` exists; `agent/retry.go:62 chatWithRetry` |
| Steering no longer consumes step budget (`48f3c7d`) | VERIFIED | two-counter loop + "The turn is not billed" comment, `agent.go:215-228` |
| Sessions are JSONL trees (`ParentID`/`ForkedAt`, `Entries`+`Leaf`) | VERIFIED-EXACT | `session/session.go:51-65`; `tree.go`, `fork.go` exist |
| Delegate runs `MemoryDisabled=true` at delegate.go:156 | VERIFIED-EXACT | `delegate.go:156` |
| Thinking levels at thinking.go:18 | VERIFIED-EXACT | `ThinkingLevels = []string{"off","low","medium","high"}` at `thinking.go:18` |
| Approval returns bare bool (tui.go:3073, delegate.go:103) | VERIFIED-EXACT | both lines exact |
| FIFO/device read guard missing (#1 open) | VERIFIED | `tools.go:562 os.Stat`, no `ModeNamedPipe/ModeDevice` anywhere in tools.go |
| #5 never-summarise-user still open | VERIFIED | `compact.go:323 splitForCompaction`; no user-role extraction in compact.go |
| `.gitattributes` + CI `-race` (ubuntu-only) landed | VERIFIED | repo-root .gitattributes; ci.yml:25-27 `-race` on ubuntu-latest (+ windows jobs) |
| Runstate hardening (`aa5e865`) | VERIFIED | `research/runstate.go:226 Checkpoint` uses `os.CreateTemp(rs.dir, "run.json.*.tmp")` + `os.Rename` (:233,:247) — unique temp names as phase4 plan specified. (This is the file currently open in your editor — it's the fixed version.) |
| Merge commits real; `4073e44` is a desktop feature commit | VERIFIED-EXACT | `git log`; `git show 4073e44` = desktop VS Code-style tabs |
| `TestPrismImportAndQuery` environmental failure | VERIFIED | test exists (`daemon/handlers_prism_test.go`); needs Ollama model per plans |
| `search` and `research/corpus` still on own stacks | VERIFIED | zero `retrieval.` imports in `internal/search` or `internal/research` |
| Skills single-file, YAML-only parse (#10/#12 open) | VERIFIED | `skills/skills.go:76 Path → <dir>/<name>/SKILL.md`; `:141 Parse` |
| Hook deadlines missing (#13 open) | VERIFIED | `events/bus.go:67 Emit` invokes handlers synchronously; no WithTimeout/recover |
| `Runs.Cancel` at daemon/runs.go:199 | VERIFIED-EXACT | `runs.go:199` |
| `handleCompactSession` at handlers_chat.go:332 | VERIFIED-EXACT | exact |
| textrank BM25 at textrank.go:183 | VERIFIED-EXACT | k1/b constants :22-23, scoring formula :183 |
| memory.Recall substring scan at digest.go:114 | VERIFIED-EXACT | `digest.go:114` |
| USD budget guard pre-call | VERIFIED | `agent/budget.go:48 HardStop` check |
| `derive()` adopted (task.go:113, delegate.go:145) | VERIFIED-EXACT | both exact |
| "~140-line explicit Run loop" | VERIFIED | `Run` spans agent.go:104–~241 ≈ 138 lines |

## B. Cross-document citation checks (doc_agy / backlog)

| Claim | Verdict | Evidence |
|---|---|---|
| `code_execution_tool.py:27` stale "Disabled on Windows" docstring | VERIFIED-EXACT | line 27 contains exactly that claim |
| `SANDBOX_AVAILABLE = True` every platform | VERIFIED | at :59 (docs say "lines 53–56" — minor drift, substance right) |
| `:1357 _use_tcp_rpc = _IS_WINDOWS` | VERIFIED-EXACT | exact |
| Curator defaults 30d/90d | VERIFIED-EXACT | `curator.py:72-73` |
| Background review cancel = 2.0 s | VERIFIED-EXACT | `background_review.py:34` |
| Hermes empty-guard quote (`consecutive_empty_count >= 2` fn) | WRONG-as-quote | no such function; actual file: `EmptyAttempt` streak machinery, `DEFAULT_EMPTY_RETRY_BUDGET=3`, cost threshold $0.25. Substance (streak keyed model/provider/finish_reason, budget shrink on high input cost) matches |
| Hermes god-file sizes: conversation_loop.py 8,418 / gateway run.py 31.3k | STALE | current vendored checkout measures 7,985 / 28,845 (checkout has moved; claims directionally right) |
| `tui.go:3073 uiAdapter.Approve` | VERIFIED-EXACT | rg line 3073 |
| opencode transform.ts = 1832 lines (pinned checkout) | VERIFIED-EXACT | measured 1832 |
| opencode prune tombstones + `PRUNE_PROTECTED_TOOLS=["skill"]` | VERIFIED-EXACT | compaction.ts:31, :267-281 |
| opencode apply_patch tool exists | VERIFIED | tool/apply_patch.ts |
| opencode retry-after-ms precedence | VERIFIED | session/retry.ts:39 |
| `.reference/opencode` pinned at `7534d23`; `inspire/opencode` moved ahead | VERIFIED | git log of each |
| inspire/{hermes-agent,pi,opencode} all present | VERIFIED | all three exist |

## C. Findings that correct the corpus about itself

1. **WRONG — Go version (propagated by the authority set).** `cli/go.mod` declares `go 1.26`; installed toolchain go1.26.5. The source-verification-report header ("Go 1.26") was accurate. doc_final D8 "corrected" it to 1.24 citing AGENTS.md, and RECONCILIATION stamped that CONFIRMED. Root `AGENTS.md:33` ("Go 1.24.2") is itself stale. This is precisely the corpus's own named failure class: trusting a stale doc over a project file.
2. **STALE — root AGENTS.md layout.** It lists `opencode/` as a root-level nested repo; actual locations are `.reference/opencode/` (pinned) and `inspire/opencode/`. No root `opencode/` directory exists.
3. **STALE — phase-branches.md.** Still lists `fix/phase1-followups`, `fix/phase2-followups`, `fix/phase3-knowledge-engine`, `fix/phase4-cross-cutting` as open; all four merged (`a651bea`, `ae6a808`, `a867302`, `aa651…`/`aa5e865`).
4. **DRIFT — small line-count citations.** `llm/retry.go` now 62 lines (backlog says 68); PTC `SANDBOX_AVAILABLE` at :59 (docs say 53–56); agent.go empty-return at :237 (docs say :238). None change any decision.
5. **UNVERIFIABLE — "~26% cheaper review forks".** RECONCILIATION already excluded this figure from its set; I concur (it traces to a Hermes issue comment quoted in doc_agy, not independently checkable here).

## D. What I did *not* verify
- The 4 external research papers' internal claims (cited secondhand by both final sets consistently; content not present in this repo).
- Hermes internals beyond the ~12 spot checks above (full re-audit would duplicate doc_her/doc_agy's work; their mutual consistency plus my spot-check rate justifies confidence).
- Desktop/website implications (out of scope per operator boundary: cli-only).
