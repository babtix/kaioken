# inspire/ backlog — ranked

Everything worth porting from the three vendored references, ranked by
(value × confidence) ÷ effort. Sources: `inspire/hermes-agent` (fresh read, see
[`hermes-map.md`](hermes-map.md)), `inspire/opencode` and `inspire/pi` (delta against the
Aug-1 read in [`pi-opencode-deep-dive.md`](pi-opencode-deep-dive.md)).

Written 2026-08-22. Every "Kaioken status" below was verified by hand against `cli/` —
file and line references are real. Execution order is in
[`inspire-phases.md`](inspire-phases.md).

Effort is one developer's estimate for a working, tested implementation, not a spike.

## Tier 1 — hours, high confidence

| # | Item | Source | Where | Effort | Why first |
|---|---|---|---|---|---|
| 1 | **FIFO / device read guard** | hermes | `agent/tools.go` `readFile` | 1–2h | `readFile` stats the path and checks `IsDir` and binary content, but never inspects `Mode()`. Reading a named pipe or `/dev/stdin` hangs the agent until timeout. Fix is `fi.Mode() & (os.ModeDevice\|os.ModeNamedPipe\|os.ModeSocket) != 0`. A whole hang-class failure removed for almost nothing. |
| 2 | **Double-tap empty Enter** | hermes | `tui/tui.go` `onEnter` | 1–2h | Empty Enter currently returns `m, nil` and does nothing. Two within 450ms should drain the queue, or interrupt-and-drain when busy. |
| 3 | **ESTOP sentinel** | hermes | `internal/agent`, `cmd/kaioken` | 2–3h | A file-based pause every loop and background task honours. Kaioken has in-process `context` cancellation only, so there is no clean way to pause the daemon and a CLI session together. |
| 4 | **Approval quick-keys** | hermes | `tui/tui.go:684` | 2–4h | Approval accepts only `y/Y/enter` and `n/N/esc`. Escalating to session-wide or always-allow means leaving the prompt and typing `/yolo`. Add `s` (session) and `a` (always) reusing the rules already in `agent/permission.go`. |
| 5 | **Never summarise user messages** | hermes | `agent/compact.go:323` | 2–4h | `splitForCompaction` sends the whole `head` — user turns included — to the summariser; only the tail stays verbatim. User messages carry intent and negative constraints ("don't touch package X") that cannot be reconstructed once paraphrased. Extract user messages from `head` and re-inject verbatim beside the summary. **Highest value-per-hour item here.** |
| 6 | **`$EDITOR` composition** | hermes | `tui/tui.go` | 3–5h | Write the composer buffer to a temp file, open `$EDITOR`, read back on exit 0. Bubble Tea has first-class support via `tea.ExecProcess`, which handles raw-mode exit and restore. |
| 7 | **Input history recall** | hermes | `tui/tui.go:783` | 4–6h | With a single-line composer, Up/Down scrolls the viewport; there is no history stack at all. Table stakes for a CLI. Move viewport scroll to PgUp/PgDn at the line boundary, stash the uncommitted draft. |
| 8 | **Empty-response circuit breaker** | hermes | `internal/llm` | 4–6h | Two consecutive zero-output completions from the same (model, provider, finish_reason) mean a deterministic refusal — usually an unsignalled content filter. Retrying burns input cost for a result that cannot change. Also shrink the retry budget when estimated input cost is high. |
| 9 | **Inline shell interpolation** | hermes | `tui/tui.go`, `tui/commands.go` | 4–8h | `!cmd` runs without an LLM turn; `{!git diff HEAD~1}` inside a prompt is expanded before submission. Removes the copy-paste round trip that dominates real usage. |
| 10 | **Multi-file skill layout** | hermes | `internal/skills` | 4–8h | `skills.Path` is `<dir>/<name>/SKILL.md` — one file per skill. Allowing `references/`, `templates/`, and `scripts/` lets a skill carry dense material loaded on demand instead of inflating the prompt. |

## Tier 2 — one to two days

| # | Item | Source | Where | Effort | Why |
|---|---|---|---|---|---|
| 11 | **Provider transform layer** | hermes | new `llm/transform.go` | 1–2d | Kaioken's longest-standing open gap (rec #5 from the Aug-1 read, still unbuilt). Collapse nullable unions, sanitise tool IDs to `[A-Za-z0-9_-]`, coerce empty text blocks, subset Gemini schemas, strip output-only fields on replay. Each rule is cheap; without them provider quirks look like Kaioken bugs. |
| 12 | **Skill threat guard + linter** | hermes | `internal/skills` | 1d | `skills.Parse` validates YAML and nothing else. Before Kaioken writes its own skills (tier 3), it needs the static scanner for credential exfiltration and prompt injection, plus a linter for frontmatter and convention drift. Safety must land *before* autonomous authoring. |
| 13 | **Hook deadlines, fail-open/fail-closed** | hermes | `agent/events` | 1d | The event bus runs listeners synchronously with veto power but no timeout and no panic recovery. One hung handler stalls the agent. Observer hooks should fail open, guard hooks fail closed. |
| 14 | **Retry hardening** | opencode | `llm/retry.go` | 1d | `retry.go` is 68 lines. opencode shipped five separate fixes in this area since the Aug-1 read: unknown finish reasons, raw network finish errors, network error variants, capacity stream errors, and retry caps with jitter. Cheap, well-specified robustness. |
| 15 | **Skill lifecycle pruner** | hermes | `internal/memory`, `internal/skills` | 1d | `memory.PruneStale` flags candidates for human review. Add non-destructive active → stale (30d) → archived (90d) transitions with an `.archive/` directory, honouring pinned and bundled skills. |
| 16 | **FTS5 session search** | hermes | `internal/session`, `internal/memory` | 1–2d | `memory.Recall` (`digest.go:114`) scans `.digest.md` files by substring frequency. An SQLite FTS5 table with `AFTER INSERT/UPDATE/DELETE` triggers gives millisecond BM25 recall over every past session with zero LLM cost, hydrated with a ±5-message anchored window. |
| 17 | **Argument + path completion** | hermes | `tui/palette.go:56` | 1–2d | The palette matches the command name only and closes the instant whitespace is typed. No argument completion, no path completion. Extend to context-aware states, with filesystem completion behind a debounce. |
| 18 | **Skill audit ledger + rollback** | hermes | `internal/skills` | 1–2d | Append-only JSONL of every mutation with actor provenance, plus sha256 content-addressed blob snapshots for per-mutation rollback. The prerequisite that makes autonomous skill editing safe to enable. |
| 19 | **Thinking levels + model cycling** | pi | `internal/tui`, `internal/llm` | 1–2d | Both were listed as "still genuinely open" in the Aug-1 read. pi has since built them out: a `/thinking` command, a searchable model/thinking selector, `ctrl+s` to persist, and session-scoped model changes. A reference implementation now exists to copy. |
| 20 | **Paste collapse** | hermes | `tui/tui.go` | 1–2d | `CharLimit = 0` dumps a pasted 500-line diff straight into the textarea. Collapse large pastes to a `[[ Paste #1: 42 lines ]]` chip, expand on submit. |

## Tier 3 — multi-day, high ceiling

| # | Item | Source | Where | Effort | Why |
|---|---|---|---|---|---|
| 21 | **Active interrupt-and-redirect** | hermes | `internal/agent`, `internal/tui` | 2–3d | The best UX idea in any of the three references. `Agent.Steer()` only queues until the tool batch finishes; Ctrl+C cancels everything. Active redirect cancels the provider stream alone, keeps completed tool calls, and replays the partial prose as scaffolded context. Requires splitting the turn context from the provider HTTP context. **Strip chain-of-thought before replay** — serialising partial CoT trips reasoning-injection classifiers. |
| 22 | **Programmatic tool calling** | hermes | `internal/agent`, `internal/rpc` | 2–3d | An `execute_code` tool exposing Kaioken's own tools over local IPC to a child script. Ten exploration turns collapse into one, with intermediate results never entering context. Kaioken already has `internal/rpc` to build on. Highest token-efficiency ceiling here. **Caveat:** hermes' implementation is POSIX-only and *disabled on Windows* (`tools/code_execution_tool.py:27`) because it uses Unix domain sockets. Kaioken is developed on Windows, so the transport must be named pipes or loopback TCP from the start — do not copy the socket design. |
| 23 | **Background reflection fork** | hermes | `internal/agent`, `internal/memory` | 2–3d | `memory.Distill` runs only at session end. Gate an async post-turn goroutine on the existing `memory.Signals()` heuristics so corrections are captured when they happen. Must preserve the prompt-cache snapshot and cancel on the next user message. |
| 24 | **Post-edit diagnostics** | hermes | new `agent/lsp.go` | 3–4d | The other long-standing open gap (rec #8). Baseline before edit, fresh after, delta only, sanitised and bounded into a `<diagnostics>` block on the tool result. Start with `gopls` and `tsc --noEmit`; the compiler-dry-run path is much cheaper than full LSP and captures most of the value. |
| 25 | **Git-snapshot undo** | opencode | `internal/agent`, `internal/gitx` | 2–3d | Still open from the Aug-1 read (rec #6). Note `agent/epoch.go` is **not** this — it is prompt-cache context baselining. Per-file tracking cannot close the `run_command` hole; a tree snapshot can. |
| 26 | **Live tool tree** | hermes | `internal/tui` | 3–5d | Active tool calls collapse to a single status line. A box-drawing tree with durations, token counts, and subagent nesting makes multi-step runs scannable. Adopt the visual structure and metrics; do not build a collapsible DOM-style accordion. |
| 27 | **Skill consolidation pass** | hermes | `internal/skills` | 3–4d | Clusters narrow skills into umbrella skills and archives absorbed siblings — the answer to entropy once autonomous authoring is on. Ship as an explicit `kaioken skills consolidate` command, not an unattended loop. |
| 28 | **Learning timeline view** | hermes | `internal/tui`, `internal/status` | 2–3d | Renders what the agent has learned and remembered over time. Genuinely useful for trusting a learning loop, but only after there is a loop to visualise. |

## Deliberately not recommended

Carried forward from the Aug-1 read and unchanged: opencode's Effect service graph, its
part-based message model, per-model prompt *files*, and the 30+ provider ports.

Added by this read:

- **Continuous micro-compaction** — invalidates the prompt cache every turn and adds 2–35s
  of auxiliary latency per turn. Kaioken's prune-then-compact is better. hermes' own docs
  concede the trade-off.
- **Honcho dialectic user modelling** — remote SaaS, OAuth device flows, multi-user identity
  resolution. Wrong shape for a local-first single binary.
- **Fast-echo stdout bypass, Yoga flexbox, Nano Stores** — React-latency workarounds that
  would corrupt Bubble Tea's screen buffer or duplicate what the Elm loop already does.
- **Recursive Pydantic sanitisers** — Go struct tags make the category moot.

## Notes on the pi/opencode delta

The two well-mined references were re-checked rather than re-read, and the result reshapes
the earlier assumption that they were exhausted.

**opencode has moved 353 commits** since the Aug-1 read (which was against `7534d23`). Only
51 touch agent-core paths, and they are overwhelmingly bug fixes rather than new mechanisms
— the bulk of the 353 is desktop UI polish, i18n, and model-catalogue additions. The
harvest is item 14 (retry hardening) plus one worth knowing about: opencode retuned its
compaction prompt specifically because smaller models like DeepSeek V4 Flash mis-followed
the original instructions. If Kaioken's compaction is ever driven by a small model, expect
the same and look at that commit.

**pi has moved 450 commits**, and they are the richer seam: pi has since built out exactly
the two features the Aug-1 read flagged as still open — thinking levels and model cycling
(item 19).

Of the ten ranked recommendations in [`pi-opencode-deep-dive.md`](pi-opencode-deep-dive.md),
eight are now implemented. The three that remain open are items 11 (provider transform), 24
(diagnostics), and 25 (git-snapshot undo). Rec #10 (read polish) is effectively done —
`readFile` already handles byte caps independent of line caps, binary detection, and
directory redirection; only a fuzzy "did you mean" on a missing path is absent, which is not
worth its own backlog row.
