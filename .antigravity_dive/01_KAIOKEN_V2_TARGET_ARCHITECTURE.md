# Kaioken v2 — Target Architecture Blueprint

**Location:** `.antigravity_dive/01_KAIOKEN_V2_TARGET_ARCHITECTURE.md`  
**Date:** 2026-08-23  
**Status:** Authoritative Target Architecture  
**Scope:** `cli/` Single Binary Runtime, Daemon Hub, Knowledge Engine, TUI, Desktop Sidecar  

---

## 1. Identity, Mandate & Design Principles

### 1.1 One-Paragraph Identity
Kaioken v2 is a **single, static Go binary (`cli/`)** that combines a deterministic, narrow-waist agent loop with an **actively verified, provenance-tracked repository knowledge engine**. It evolves from an ephemeral CLI into a **Daemon-as-Hub platform**: a background daemon maintains long-lived workspace sessions, scheduled tasks, and asynchronous background reflection workers, serving thin-client frontends (Bubble Tea TUI, Tauri desktop app, and editor extensions) over high-performance local IPC. Kaioken prioritizes prompt-cache byte stability, verifiable safety gates before autonomous authoring, and zero-CGO cross-platform portability.

```
┌────────────────────────────────────────────────────────────────────────────────┐
│                             KAIOKEN V2 TOPOLOGY                                │
│                                                                                │
│   ┌─────────────────────┐   ┌──────────────────────┐   ┌───────────────────┐   │
│   │  Terminal TUI       │   │  Desktop App (Tauri) │   │  Future Clients   │   │
│   │  (Bubble Tea)       │   │  (React 19 Sidecar)  │   │  (VS Code / IDE)  │   │
│   └──────────┬──────────┘   └──────────┬───────────┘   └─────────┬─────────┘   │
│              │                         │                         │             │
│              └─────────────────────────┼─────────────────────────┘             │
│                                        │ Local IPC (AF_UNIX / Named Pipe / TCP)│
│                                        ▼                                       │
│   ┌────────────────────────────────────────────────────────────────────────┐   │
│   │                   KAIOKEN DAEMON CORE (Hub & Runtime)                  │   │
│   │                                                                        │   │
│   │  ┌──────────────────┐  ┌─────────────────────┐  ┌───────────────────┐  │   │
│   │  │ Session Store    │  │ Job Scheduler       │  │ Approval Registry │  │   │
│   │  │ (JSONL Trees)    │  │ (Cron / Maintenance)│  │ (4-State Enum)    │  │   │
│   │  └────────┬─────────┘  └──────────┬──────────┘  └─────────┬─────────┘  │   │
│   │           │                       │                       │            │   │
│   │  ┌────────▼───────────────────────▼───────────────────────▼─────────┐  │   │
│   │  │                   AGENT RUNTIME & DISPATCHER                     │  │   │
│   │  │  - Narrow-Waist Agent.Run (~140 lines)                           │  │   │
│   │  │  - Split Contexts (Turn Context vs HTTP Provider Context)        │  │   │
│   │  │  - Prompt Caching Engine (Byte-Stable 3-Tier Hierarchy)          │  │   │
│   │  │  - Tool Dispatch & Bounded Error Barrier (2 KB Cap)              │  │   │
│   │  └────────┬───────────────────────────────────────────────┬─────────┘  │   │
│   │           │                                               │            │   │
│   │  ┌────────▼────────────────────────┐     ┌────────────────▼─────────┐  │   │
│   │  │ UNIFIED KNOWLEDGE LAYER         │     │ EXECUTION ENVIRONMENTS   │  │   │
│   │  │ (.kaioken/ Substrate)           │     │ & SANDBOXING             │  │   │
│   │  │ - Wiki, Cards, Skills, Memory   │     │ - Ephemeral Git Tree Ref │  │   │
│   │  │ - Pure-Go BM25 (internal/retrieval)│  │ - PTC Child Process      │  │   │
│   │  │ - Staleness & Provenance Engine │     │  (AF_UNIX / Loopback TCP)│  │   │
│   │  │ - SHA-256 Mutation Ledger       │     │ - Inverse UndoEntry Diff │  │   │
│   │  └─────────────────────────────────┘     └──────────────────────────┘  │   │
│   └────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Ten Load-Bearing Design Principles

1. **Narrow Waist, Capability at the Edges:** The inner agent loop (`Agent.Run`) remains a compact, deterministic state machine (~140 lines). Capability expands downward through a strict ladder: *Tool Parameter $\rightarrow$ Subcommand + Skill $\rightarrow$ Service-Gated Tool $\rightarrow$ Extension/MCP $\rightarrow$ Core Tool*.
2. **Prompt Cache is Sacred:** Byte-for-byte prefix stability within a session is enforced. Dynamic and volatile context is strictly confined to the tail. No mid-turn mutation of system prompts is permitted.
3. **Reduce Before Send:** Context reduction (pruning and compaction) executes deterministically *prior* to calling LLM provider APIs. Model-based compaction preserves negative user constraints verbatim.
4. **Bounded Boundaries:** Every boundary enforces hard limits: tool error outputs are capped at 2 KB, streaming chunks are validated for JSON syntax, subagent forks operate under 2-second cancellation windows, and hooks enforce timeouts.
5. **Safety Precedes Autonomy:** No autonomous skill writing or memory consolidation occurs without prior AST threat scanning, schema linting, SHA-256 ledger recording, and operator approval.
6. **Knowledge is Verified or Dropped:** Knowledge artifacts carry cryptographic hashes, source file provenance, and freshness state. Staleness is actively calculated against repository git trees.
7. **Zero-CGO Single Binary:** The core runtime compiles with `CGO_ENABLED=0` across Windows, macOS, and Linux without native C dependencies. Pure-Go BM25 replaces C-based SQLite FTS5.
8. **Dual-Layer Execution Rollback:** Structured editor modifications generate inverse unified diffs (`UndoEntry`). Uncontrolled bash/script mutations are captured via ephemeral git tree snapshot refs (`refs/kaioken/snapshots/...`).
9. **Never Hard-Delete Learned Artifacts:** Learned knowledge, memories, and skills transition through a state machine: `Active` $\rightarrow$ `Stale (30d)` $\rightarrow$ `Archived (90d)`. Hard deletions are prohibited.
10. **Extraction, Not Total Rewrite:** Subsystems evolve by extracting modular interfaces (e.g., `internal/retrieval` extracted from `prism`) rather than high-risk framework rewrites.

---

## 2. Core Subsystem Specifications

### 2.1 Agent Core & Loop Subsystem (`internal/agent`)

The agent core executes tool loops, manages streaming responses, and guarantees error isolation.

```
                  ┌─────────────────────────────────────┐
                  │          Turn Initiation            │
                  │   (User Prompt / Scheduled Job)     │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │    Context Assembly & Pruning       │
                  │   - Byte-Stable System Prefix       │
                  │   - Verbatim User Constraints       │
                  │   - Pre-call Compaction if > Budget │
                  └──────────────────┬──────────────────┘
                                     │
                                     ▼
                  ┌─────────────────────────────────────┐
                  │      Provider HTTP Call (Stream)    │
                  │   (Split Turn Ctx vs HTTP Ctx)      │
                  └──────────┬────────────────┬─────────┘
                             │                │
             Tool Call Chunks│                │ Completion
                             ▼                ▼
        ┌──────────────────────────────┐    ┌───────────────────────────┐
        │ Stream Tool-Call Accumulator │    │ Surface Final Response    │
        │ - JSON Syntax Validator      │    │ - Persist JSONL Node      │
        │ - Length-Stop Guard          │    │ - Trigger Signals() Fork  │
        └──────────────┬───────────────┘    └───────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │  Tool Permission Evaluation  │
        │  (AllowOnce/Session/Always)  │
        └──────────────┬───────────────┘
                       │ Approved
                       ▼
        ┌──────────────────────────────┐
        │ Tool Dispatch & Error Guard  │
        │ - Exec in Target Environment │
        │ - Error body clipped to 2 KB │
        │ - Footer check on write fails│
        └──────────────┬───────────────┘
                       │
                       └────────► Loop back to Model
```

#### Key Technical Invariants:
* **Split Context Architecture:** The execution loop maintains two distinct `context.Context` instances:
  1. `turnCtx`: Represents the user's interactive turn and persists across tool retries and partial outputs.
  2. `httpCtx`: Scoped strictly to the active provider HTTP connection. Canceling the HTTP stream (via Ctrl+C redirect) stops the provider without destroying completed tool call results.
* **Length-Stop Stream Guard:** If the provider terminates with `stop_reason == "length"`, any partial, malformed tool call in flight is structurally rejected and formatted into a retry prompt rather than executed blindly.
* **Bounded Tool Error Barrier:** Tool errors are sanitized, and error payloads sent back to the model are capped at 2,048 characters to prevent prompt bloat and context exhaustion.

---

### 2.2 Daemon-as-Hub Platform Layer (`internal/daemon`)

The daemon functions as the singleton state coordinator on the host machine.

#### Key Responsibilities:
* **Lifecycle & Discovery:** Auto-spawned on demand by the CLI/TUI if not running. Binds to `AF_UNIX` socket at `~/.kaioken/daemon.sock` on Linux/macOS and a named pipe `\\.\pipe\kaioken-daemon` (with fallback to loopback TCP `127.0.0.1:41731`) on Windows.
* **Session Ownership:** Sessions are stored as JSONL lineage trees in `.kaioken/sessions/<session_id>.jsonl`. The daemon owns all file handles and executes **crash-safe incremental flushes** after every completed tool call.
* **Job Scheduler (Daemon Cron):** Runs an internal 60-second tick scheduler reading `.kaioken/jobs.json`. Jobs execute in dedicated isolated sessions to ensure role-alternation integrity.
* **Approval Registry:** Manages asynchronous permission requests from headless runs or background tasks, routing approval prompts to connected TUI or Desktop clients via Server-Sent Events (SSE).

---

### 2.3 Unified Knowledge & Retrieval Subsystem (`.kaioken/`, `internal/retrieval`)

Kaioken v2 unifies repository wikis, skills, episodic memory, and session histories into a single, cohesive knowledge substrate.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       UNIFIED KNOWLEDGE SUBSTRATE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│  .kaioken/                                                                  │
│  ├── wiki/            ◄── Architectural knowledge, cards, entity graphs     │
│  ├── skills/          ◄── Reusable procedures, scripts, tools               │
│  ├── memory/          ◄── Curated session memories & project invariants     │
│  ├── sessions/        ◄── Historical JSONL conversation trees               │
│  └── ledger.jsonl     ◄── Append-only cryptographic mutation log            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    RETRIEVAL & RANKING ENGINE (Pure-Go)                     │
│                                                                             │
│   ┌────────────────────────┐                   ┌────────────────────────┐   │
│   │ Pure-Go BM25 (TextRank)│                   │ Freshness & Staleness  │   │
│   │ Lexical Tokenizer      │                   │ Git-Tree Hash Matcher  │   │
│   └───────────┬────────────┘                   └───────────┬────────────┘   │
│               │                                            │                │
│               └──────────────────────┬─────────────────────┘                │
│                                      │                                      │
│                                      ▼                                      │
│                        ┌───────────────────────────┐                        │
│                        │ Hybrid Ranking & Scoring  │                        │
│                        │ Score = BM25 × Freshness  │                        │
│                        └─────────────┬─────────────┘                        │
│                                      │                                      │
│                                      ▼                                      │
│                        ┌───────────────────────────┐                        │
│                        │ LLM Relevancy Grader Pass │                        │
│                        │ (internal/retrieval/grader)│                       │
│                        └───────────────────────────┘                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Metadata & Provenance Schema:
Every knowledge artifact in `.kaioken/` embeds standardized YAML/JSON frontmatter:
```yaml
id: "feat-retrieval-engine"
type: "wiki" # wiki | skill | memory
source_provenance:
  files: ["cli/internal/retrieval/chunk.go", "cli/internal/retrieval/lexical.go"]
  git_commit: "a867302"
created_at: "2026-08-23T14:30:00Z"
last_verified_at: "2026-08-23T18:00:00Z"
freshness_state: "fresh" # fresh | stale | archived
sha256_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
```

#### Lifecycle State Machine:
1. **Active/Fresh:** Artifact hash matches underlying source files.
2. **Stale (>30 days or Git Drift):** Source files modified since `last_verified_at`. Flagged for re-verification; ranking penalized.
3. **Archived (>90 days untouched):** Moved to `.kaioken/.archive/`. Retained for historical queries but excluded from default active prompt injections.

---

### 2.4 Autonomous Learning & Skill Safety Loop (`internal/skills`, `internal/memory`)

```
   ┌────────────────────────────────────────────────────────────┐
   │               Main Turn Execution Completes                │
   │               (Signals: Error recovery / User correction)  │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │         Background Reflection Fork Spawned (Goroutine)     │
   │         - Clones byte-exact prompt cache prefix            │
   │         - Bound to 2-second user-input cancellation        │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │              Propose Candidate Skill / Memory              │
   │              Write to .kaioken/skills/drafts/<id>.md       │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │                   STATIC SAFETY GATING                     │
   │   1. AST Threat Scanner (AST inspection for subshells,     │
   │      curl exfiltration, eval injection)                    │
   │   2. Schema & Frontmatter Linter (YAML structure check)    │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │                  Append-Only Audit Ledger                  │
   │       Record Proposed Change + SHA-256 Blob Hash           │
   │       in .kaioken/ledger.jsonl                             │
   └─────────────────────────────┬──────────────────────────────┘
                                 │
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │                  Operator Approval Modal                   │
   │      [Allow Once]  [Allow Always]  [Deny & Discard]        │
   └────────────────────────────────────────────────────────────┘
```

---

### 2.5 Programmatic Tool Calling & Execution Environments (`internal/agent`, `internal/rpc`)

Programmatic Tool Calling (PTC) collapses multi-turn exploration loops into a single script call executed in an isolated child process, communicating back to Kaioken over local IPC.

```
   ┌───────────────────────────────────────────────────────────────┐
   │                 Model Invokes `execute_code`                  │
   │      Script: Python / Node / Go tool-dispatch script          │
   └───────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
   ┌───────────────────────────────────────────────────────────────┐
   │              Daemon Spawns Sandboxed Child Process            │
   │   - Environment Scrubbed (API keys & credentials removed)     │
   │   - KAIOKEN_IPC_SOCKET + KAIOKEN_SESSION_TOKEN injected       │
   │   - Local Transport: AF_UNIX (POSIX) / 127.0.0.1:0 (Windows)  │
   └───────────────────────────────┬───────────────────────────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │ Child calls Kaioken Tool via IPC  │
                 ▼                                   ▼
   ┌───────────────────────────────┐   ┌───────────────────────────┐
   │  read_file / grep_search IPC  │   │  apply_patch / edit IPC   │
   └───────────────┬───────────────┘   └─────────────┬─────────────┘
                   │                                 │
                   └─────────────────┬───────────────┘
                                     │
                                     ▼
   ┌───────────────────────────────────────────────────────────────┐
   │             Daemon Permission & Security Enforcer             │
   │   - Evaluates tool call against 4-State Approval Enum         │
   │   - Captures Ephemeral Git Snapshot Ref on file mutations     │
   │   - Returns result over IPC back to child script              │
   └───────────────────────────────┬───────────────────────────────┘
                                   │
                                   ▼
   ┌───────────────────────────────────────────────────────────────┐
   │          Child Completes & Returns Single Aggregated Result   │
   │          (Intermediate exploration turns bypassed!)           │
   └───────────────────────────────────────────────────────────────┘
```

#### Dual-Layer Rollback Model:
1. **Inverse Unified Diffs (`UndoEntry`):** Stored per structured editor modification (`edit_file`, `write_file`). Applied cleanly for editor rollbacks.
2. **Ephemeral Git Snapshots (`refs/kaioken/snapshots/...`):** Prior to executing `run_command` or PTC scripts, Kaioken creates an uncommitted git tree object (`git write-tree`). If a command causes corrupted states or accidental deletions, a single `kaioken undo --tree` command restores the workspace.

---

### 2.6 Context Doctrine & Prompt Cache Architecture

To maximize provider cache hit rates (Anthropic Prompt Caching, OpenAI Prefix Caching), context is structured into a 3-tier byte-stable hierarchy:

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ TIER 0: STRICTLY FROZEN BASE PREFIX                                          │
│ - System prompt instructions & behavioral doctrine                            │
│ - Core invariant rules & tool schema definitions                              │
│ - Immutable byte-for-byte prefix across all turns & sessions                  │
├───────────────────────────────────────────────────────────────────────────────┤
│ TIER 1: SESSION-FROZEN REPO & MEMORY CONTEXT                                  │
│ - Repository profile & tech stack overview                                    │
│ - Frozen memory snapshot loaded at session start                              │
│ - Active pinned skills frontmatter & signatures                               │
│ - Pinned user negative constraints (Verbatim Invariants)                      │
├───────────────────────────────────────────────────────────────────────────────┤
│ TIER 2: VOLATILE DYNAMIC TAIL (Recent Dialogue & Execution)                   │
│ - Compacted historical dialogue summary                                       │
│ - Recent verbatim conversation turns (sliding window)                         │
│ - In-flight tool calls, arguments, and capped execution outputs (≤2 KB)      │
└───────────────────────────────────────────────────────────────────────────────┘
```

#### Verbatim Constraint Retention in Compaction:
When the token budget threshold is reached, `splitForCompaction` executes:
1. **Summary Generation:** Summarizes older dialogue into a compact, structured narrative.
2. **Constraint Extraction:** Regex and heuristic filters extract all explicit user constraints (e.g., *"Never touch package X"*, *"Always use Go 1.24 idioms"*, *"Do not use Tailwind"*).
3. **Prefix Pinning:** Extracted constraints are pinned verbatim to Tier 1 alongside the summary, guaranteeing that lossy LLM summarization never discards critical user instructions.

---

### 2.7 Provider Transform & Robustness Layer (`internal/llm/transform.go`)

Provider quirks and malformed responses are absorbed by a deterministic, rule-based transformation pipeline before reaching the agent loop:
* **Schema Sanitization:** Collapses nullable union types and trims unsupported properties for Gemini schemas.
* **Tool Call Identifier Normalization:** Coerces non-standard tool IDs to `^[A-Za-z0-9_-]+$`.
* **Empty-Response Interception:** Intercepts HTTP 200 responses with empty content and no tool calls, converting them into structured retryable errors.
* **Streak-Breaker Refusal Detection:** Detects repeated zero-token refusals across the same `(model, provider, finish_reason)` tuple and terminates retries to prevent token burn.
* **Exponential Backoff with Full Jitter:** Prevents thundering herd problems during rate limits and server capacity errors.

---

### 2.8 Terminal UX & Ergonomics (`internal/tui`)

Built on Bubble Tea with Elm-architecture state isolation:
* **4-State Approval Enum:** Interactive modals offer `[y] Allow Once`, `[s] Allow for Session`, `[a] Allow Always`, `[n/Esc] Deny`.
* **$EDITOR Integration:** `Ctrl+O` writes the current composer text to a temporary file, opens `$VISUAL` / `$EDITOR` (with automatic fallback to `code --wait`, `notepad.exe` on Windows, and `nano`/`vim` on Unix), and normalizes CRLF line endings on return.
* **Command History:** Up/Down navigation navigates shell and prompt history without breaking viewport scrolling.
* **Paste Collapse Chips:** Pastes exceeding 5 lines or 300 characters collapse into interactive chips (e.g., `[[ Paste #1: 42 lines ]]`) that expand on submission.
* **Live Tool Tree View:** Multi-step tool runs render as a box-drawing tree showing elapsed durations, byte counts, and subagent nesting.
