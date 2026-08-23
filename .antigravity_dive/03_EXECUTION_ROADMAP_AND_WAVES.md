# Kaioken v2 — Master Execution Roadmap & Wave Sequencing

**Location:** `.antigravity_dive/03_EXECUTION_ROADMAP_AND_WAVES.md`  
**Date:** 2026-08-23  
**Status:** Authoritative Execution Plan  
**Toolchain:** Go 1.24.2, Bubble Tea, Tauri v2 (Desktop), React 19 / Vite 6  

---

## 1. Roadmap Architecture & Execution Principles

### 1.1 The Solo Vibe Coding Operating Doctrine
1. **The Review Bottleneck:** The rate of engineering is gated by code review and characterization testing, not LLM code generation speed. Plan for **one substantial package per session**.
2. **Green Build Precondition:** `go test ./... -race`, `golangci-lint`, and `tsc -b` must pass before any branch merges. Never build on a red test suite.
3. **Characterization Golden Tests:** Before refactoring existing subsystems (`internal/agent`, `internal/retrieval`, `internal/daemon`), capture golden JSON/diff snapshots to ensure zero unintentional regression.
4. **Hard Track Invariant:** **Wave 2 (Skill Safety Foundation) MUST merge before any autonomous skill writing in Wave 3 goes live.** Safety machinery always precedes autonomy.

---

## 2. Multi-Track Wave Schedule & Dependency Graph

```
                                  MASTER WAVE TIMELINE
                                  
 [W0' Hotfixes] ──► [W1 Ergonomics] ────────────► [WP Transform] ──► [W4 Deep Capability]
      │                   │                             ▲                     ▲
      │                   ▼                             │                     │
      │             [P1 Daemon Hub] ──► [P2 Cron] ──────┼──────► [P3 Environments + PTC]
      │                                                 │
      └───────────► [W2 Safety Foundation] ─────────────┴──────► [W3 Gated Learning]
```

---

## 3. Detailed Wave Breakdown

### Wave 0′ — Live Provider Bug Hotfixes (~1.5 Days)
*Objective: Eliminate active production failure modes in LLM communication and retry loops.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#8** | Empty-Response Silent Success | `internal/agent`, `internal/llm` | Intercept HTTP 200 responses where `Content == ""` and tool calls are empty. Surface as structured error; add streak breaker keyed on `(model, provider, finish_reason)`. | 3 h |
| **#14** | Retry Hardening & Full Jitter | `internal/llm/retry.go`, `internal/agent/retry.go` | Implement exponential backoff with full jitter, capacity error detection, and unified retry budget across both layers. | 1 d |

**Gate Criteria:**
* Unit test verifying empty 200 HTTP response is surfaced as an error.
* Test confirming streak-breaker halts retries on repeated deterministic refusals.
* `go test -race ./...` passes clean.

---

### Wave 1 — Ergonomics & Correctness Baseline (~1 Week)
*Objective: Remove hang hazards, preserve critical user invariants, and upgrade terminal interaction.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#1** | FIFO / Device Read Guard | `internal/agent/tools.go` | Inspect `fi.Mode() & (os.ModeDevice \| os.ModeNamedPipe \| os.ModeSocket)` to prevent hangs on special devices. | 2 h |
| **#5** | Verbatim User Compaction | `internal/agent/compact.go` | Extract explicit negative user constraints from history and re-inject them verbatim into Tier 1 prompt prefix. | 4 h |
| **#4** | 4-State Approval Enum | `internal/agent`, `internal/tui` | Upgrade `agent.UI.Approve` to `AllowOnce / AllowSession / AllowAlways / Deny` across all implementors. | 6 h |
| **#6** | $EDITOR Integration | `internal/tui/tui.go` | Support `Ctrl+O` opening `$VISUAL` / `$EDITOR` (with fallback to `notepad.exe` on Windows, `vim` on Unix) + CRLF normalization. | 6 h |
| **#7** | Command History Stack | `internal/tui` | Dedicated up/down prompt history navigation without interfering with viewport scrolling. | 4 h |
| **#9** | Inline Shell Interpolation | `internal/tui`, `internal/agent` | Support `!cmd` instant execution and `{!git diff}` prompt interpolation. | 6 h |
| **#17** | Argument / Path Palette | `internal/tui/palette.go` | Context-aware autocomplete state machine for commands and workspace filepaths. | 1.5 d |
| **#20** | Paste Collapse Chips | `internal/tui` | Collapse large pasted text blocks (>5 lines) into interactive `[[ Paste #1 ]]` chips. | 1 d |

**Gate Criteria:**
* Compaction preserves user negative constraints byte-for-byte in golden test fixtures.
* FIFO guard verified against named pipe read timeouts.
* Approval enum functions across all interactive prompt paths.

---

### Wave WP — Provider Robustness & Transform Pipeline (~2 Days)
*Objective: Normalize provider payloads and enable dynamic model selection.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#11** | Provider Transform Layer | `internal/llm/transform.go` | Table-driven rule list sanitizing schemas, subsetting Gemini properties, and normalizing tool IDs. | 1.5 d |
| **#19** | Interactive Model Selector | `internal/tui` | Searchable modal for dynamic runtime model switching with session-scoped persistence. | 0.5 d |

**Gate Criteria:**
* Table tests verify malformed provider JSON payloads are normalized cleanly.
* Tool calling works seamlessly across OpenAI, Anthropic, Gemini, and Ollama backends.

---

### Wave 2 — Skill Safety Foundation (HARD GATE: ~3 Days)
*Objective: Establish static threat scanning, schema linting, and cryptographic audit ledgers.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#10** | Multi-File Skill Layout | `internal/skills` | Support directory-based skills containing `SKILL.md`, `references/`, `scripts/`, and `templates/`. | 6 h |
| **#12** | AST Threat Guard & Linter | `internal/skills/security.go` | Static AST scanner detecting dangerous subshells, eval injection, and exfiltration hooks; YAML schema linter. | 1 d |
| **#18** | SHA-256 Mutation Ledger | `internal/skills/ledger.go` | Append-only `.kaioken/ledger.jsonl` recording all mutations with actor provenance and rollback snapshots. | 1 d |
| **#15** | Skill Lifecycle Pruner | `internal/skills/lifecycle.go` | State machine transitioning skills: `Active` $\rightarrow$ `Stale (30d)` $\rightarrow$ `Archived (90d)` without deletion. | 1 d |

**Gate Criteria:**
* Malicious skill test fixture is intercepted and rejected by the AST threat scanner.
* Rollback command restores exact byte-for-byte state from SHA-256 ledger snapshots.

---

### Phase P1 — Daemon-as-Hub Platform Conversion (~1.5 Weeks)
*Objective: Transition runtime into a background daemon hub with thin-client TUI and desktop sidecar.*

| Stage | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **P1.1** | Daemon Core & IPC Socket | `internal/daemon` | Localhost daemon auto-spawning, `AF_UNIX` (POSIX) and named pipe / loopback TCP (Windows) binding. | 3 d |
| **P1.2** | Session Tree Ownership | `internal/daemon/runs.go` | Move session JSONL tree persistence to daemon with crash-safe incremental per-turn flushing. | 2 d |
| **P1.3** | Thin-Client TUI Cutover | `internal/tui`, `cmd/kaioken` | Refactor TUI to communicate over local JSON-RPC / SSE stream to the daemon. | 3 d |

**Gate Criteria:**
* Terminal process kill (`SIGKILL`) during active streaming loses at most the in-flight chunk, with all prior turns safely written to disk.
* TUI reconnects seamlessly to running daemon tasks after restart.

---

### Wave 3 — Gated Learning Loop & Unified Knowledge Substrate (~2 Weeks)
*Objective: Deploy signal-driven background reflection and unify repository knowledge retrieval.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#23** | Signal-Driven Reflection | `internal/agent`, `internal/memory` | Async background reflection fork triggered on `memory.Signals()` with 2-second user-input cancellation. | 3 d |
| **#16** | Pure-Go Session Search | `internal/session`, `internal/textrank` | BM25 search over JSONL session trees with lineage deduplication and context hydration. | 2 d |
| **#27** | Skill Consolidation CLI | `internal/skills` | Explicit `kaioken skills consolidate` command clustering related skills into umbrella guides. | 3 d |
| **#28** | Learning Timeline View | `internal/tui` | Visual dashboard rendering learned skills, memories, and provenance over time. | 2 d |
| **L6** | Unified Retrieval Port | `internal/retrieval` | Migrate `search`, `prism`, and `wiki` to use the unified `internal/retrieval` engine. | 3 d |

**Gate Criteria:**
* Reflection fork provably aborts when a new user prompt is submitted within the 2-second window.
* All knowledge search queries execute through pure-Go BM25 without CGO dependencies.

---

### Phase P2 & P3 — Scheduler, Environments & Programmatic Tool Calling (~2 Weeks)
*Objective: Embed cron scheduling, execution sandboxing, and script-based tool dispatch.*

| Stage | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **P2** | Daemon Cron Scheduler | `internal/daemon/cron.go` | 60-second tick scheduler running `.kaioken/jobs.json` in dedicated isolated sessions. | 3 d |
| **P3.1** | Dual-Transport PTC Sandbox | `internal/agent/ptc.go` | `execute_code` child process runner communicating over local IPC (`AF_UNIX` / `127.0.0.1:0`). | 4 d |
| **P3.2** | Ephemeral Git Snapshots | `internal/gitx`, `internal/agent` | Capture `refs/kaioken/snapshots/...` before script/shell execution for one-command tree undo. | 3 d |

**Gate Criteria:**
* Windows loopback TCP and POSIX UNIX socket PTC test scripts successfully execute tool calls.
* `kaioken undo --tree` completely reverts untracked and modified files after destructive shell operations.

---

### Wave 4 — Deep Capability & Developer Polish (~2 Weeks)
*Objective: Active stream redirection, post-edit compiler feedback, and live visualization.*

| Item # | Focus Area | Target Packages | Scope & Description | Est. |
|---|---|---|---|---|
| **#21** | Active Interrupt & Redirect | `internal/agent` | Split `turnCtx` / `httpCtx`; cancel provider stream on Ctrl+C, strip CoT, and preserve completed tool calls. | 3 d |
| **#24** | Post-Edit Diagnostics | `internal/agent/diagnostics.go` | Compiler dry-run checks (`go vet`, `tsc --noEmit`, `cargo check`) injecting bounded `<diagnostics>`. | 3 d |
| **#26** | Live Tool Tree Display | `internal/tui` | Box-drawing visual tree rendering active tool calls, execution durations, and subagent hierarchies. | 3 d |
| **N5** | Compound `apply_patch` | `internal/agent/tools.go` | High-efficiency multi-file patch application tool complementing atomic `edit_file`. | 2 d |

**Gate Criteria:**
* Interrupting a running stream preserves prior tool results and replays cleanly without CoT leakage.
* Compiler diagnostics capture syntax errors immediately after tool edits.
