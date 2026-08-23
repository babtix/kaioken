# Kaioken v2 — Architectural Decision Records (ADRs) & Decisions Log

**Location:** `.antigravity_dive/02_DECISION_LOG_AND_ADRS.md`  
**Date:** 2026-08-23  
**Status:** Locked & Authoritative  

---

## Index of Architectural Decision Records

| ADR # | Title | Status | Scope |
|---|---|---|---|
| **ADR-001** | Evolve-in-Place Go Single Binary (No Framework Rewrite) | **LOCKED** | Core Toolchain & Runtime |
| **ADR-002** | Daemon-as-Hub Topology & Thin-Client Protocol | **LOCKED** | System Architecture |
| **ADR-003** | Byte-Stable 3-Tier Prompt Cache Architecture | **LOCKED** | LLM Context Engineering |
| **ADR-004** | Gated Autonomy & Machine-Proposed Skills | **LOCKED** | Self-Improvement Loop |
| **ADR-005** | Unified Knowledge Substrate & SHA-256 Mutation Ledger | **LOCKED** | Knowledge & Storage |
| **ADR-006** | Dual-Transport IPC Sandbox for Programmatic Tool Calling | **LOCKED** | Tool Execution & Security |
| **ADR-007** | Dual-Layer Rollback (UndoEntry + Ephemeral Git Tree Ref) | **LOCKED** | Workspace State Management |
| **ADR-008** | Daemon Cron Scheduler & Session Isolation | **LOCKED** | Background Execution |
| **ADR-009** | Pure-Go BM25 Storage Engine (Strict Zero-CGO Constraint) | **LOCKED** | Search & Indexing |
| **ADR-010** | Static AST Threat Scanner & Schema Linter for Skills | **LOCKED** | Skill Security |
| **ADR-011** | Compiler-First Dry-Run Post-Edit Diagnostics | **LOCKED** | Editor Feedback Loop |
| **ADR-012** | Active Interrupt & Chain-of-Thought Stripping Redirect | **LOCKED** | Streaming & Control Flow |
| **ADR-013** | Deterministic Provider Transform Pipeline & Retry Resilience | **LOCKED** | LLM Provider Integration |
| **ADR-014** | 4-State Interactive Approval Enum (`agent.UI`) | **LOCKED** | User Permissions |
| **ADR-015** | Verbatim User Constraint Retention in Compaction | **LOCKED** | Memory & Dialogue Pruning |

---

## Detailed Architectural Decision Records

### ADR-001: Evolve-in-Place Go Single Binary (No Rewrite)
* **Status:** LOCKED
* **Context:** Prior research evaluated rewriting Kaioken in TypeScript (Node/Bun with Effect-TS like OpenCode) or Python (like Hermes). Kaioken's current Go codebase (`cli/`) features high performance, instant cold start (<30ms), low memory footprint (<35MB), and clean cross-compilation to single static binaries on Windows, macOS, and Linux.
* **Decision:** Evolve the existing Go codebase in place. No language migration or framework rewrite.
* **Rationale:** Rewriting creates massive regression risks, forfeits months of stabilized Go agent logic, and complicates distribution. Go’s strong static typing and concurrency primitives (`goroutines`, `channels`, `sync`) are ideal for the Daemon-as-Hub model.
* **Consequences:** All new capabilities must be implemented in idiomatic Go without external C dependencies.

---

### ADR-002: Daemon-as-Hub Topology & Thin-Client Protocol
* **Status:** LOCKED
* **Context:** Storing agent runtime state exclusively within the ephemeral TUI process means closing the terminal kills background reflection, long-running jobs, and multi-turn workflows. The Tauri desktop app also risked duplicating backend agent logic.
* **Decision:** Convert the runtime into a Daemon-as-Hub model (`internal/daemon`). The daemon runs on localhost, owning session files, scheduler ticks, background workers, and tool dispatchers. The TUI (`bubbletea`), CLI commands, and Desktop sidecar act as thin clients over local IPC.
* **Rationale:** Centralizes session persistence, guarantees crash safety, enables background task execution, and provides identical behavior across CLI and Desktop interfaces.
* **Consequences:** Daemon auto-spawning, local socket discovery, and heartbeat monitoring must be robust on all supported OS platforms.

---

### ADR-003: Byte-Stable 3-Tier Prompt Cache Architecture
* **Status:** LOCKED
* **Context:** Modern LLMs (Anthropic, OpenAI, DeepSeek) offer major cost savings (~50-90%) and latency reductions via prompt caching, which requires exact byte-for-byte prefix matches across requests. Dynamically mutating system prompts or injecting memories mid-session destroys the cache.
* **Decision:** Adopt a strict 3-tier context structure:
  * **Tier 0 (Frozen Base):** System instructions, immutable rules, and tool schemas.
  * **Tier 1 (Session Frozen):** Repository overview, frozen memory snapshot loaded at session start, and verbatim user constraints.
  * **Tier 2 (Volatile Dynamic Tail):** Compacted dialogue summary, recent sliding conversation turns, and ephemeral tool outputs (capped at 2 KB).
* **Rationale:** Guarantees that Tiers 0 and 1 remain completely byte-identical across all turns within a session, maximizing cache utilization.
* **Consequences:** Newly distilled memories or skills are queued and loaded only into subsequent sessions or explicit session refreshes.

---

### ADR-004: Gated Autonomy & Machine-Proposed Skills
* **Status:** LOCKED
* **Context:** Fully autonomous self-learning agents (e.g., Hermes) suffer from the "self-congratulation problem" — writing and approving buggy or insecure skills that corrupt the agent's behavior.
* **Decision:** The background reflection engine generates candidate skills as uncommitted drafts (`.kaioken/skills/drafts/<id>.md`). Autonomous persistence to active skills is gated behind AST security scanning, linting, and explicit operator approval via the 4-state approval modal (`skills.autonomous_writes = false` by default).
* **Rationale:** Captures actionable lessons and procedures automatically while maintaining complete human oversight and codebase safety.
* **Consequences:** A clean interactive UI modal for approving, editing, or discarding candidate skills is required.

---

### ADR-005: Unified Knowledge Substrate & SHA-256 Mutation Ledger
* **Status:** LOCKED
* **Context:** Previously, repository wikis, skills, and memory were managed by disjoint packages (`internal/wiki`, `internal/skills`, `internal/memory`), creating duplicate retrieval indexes and inconsistent staleness tracking.
* **Decision:** Unify all knowledge artifacts into a shared substrate under `.kaioken/`, accessed via a unified retrieval engine (`internal/retrieval`). Every mutation is recorded in an append-only cryptographic ledger (`.kaioken/ledger.jsonl`) with actor provenance and SHA-256 content hashes.
* **Rationale:** Provides unified search scoring, atomic rollbacks, and trustworthy verification of knowledge freshness across the entire project.
* **Consequences:** Existing retrieval calls in `search`, `prism`, and `wiki` must be ported to the extracted `internal/retrieval` package.

---

### ADR-006: Dual-Transport IPC Sandbox for Programmatic Tool Calling
* **Status:** LOCKED
* **Context:** Complex exploration tasks require many LLM turns to read, grep, and analyze files. Programmatic Tool Calling (PTC) allows a script to call tools directly, collapsing 10 turns into 1. Running embedded interpreters (Starlark/WASM) was considered but rejected due to ecosystem limitations.
* **Decision:** Execute PTC scripts in an isolated child process communicating with Kaioken over `AF_UNIX` sockets on POSIX systems and loopback TCP (`127.0.0.1:0`) on Windows. The child process receives scrubbed environment variables and issues tool requests over local JSON-RPC.
* **Rationale:** Enables standard scripting languages (Python, Node, Go) while maintaining strict process isolation, timeout enforcement, and permission evaluation.
* **Consequences:** Requires cross-platform socket/pipe setup and child process lifecycle management in `internal/agent`.

---

### ADR-007: Dual-Layer Rollback (UndoEntry + Ephemeral Git Tree Ref)
* **Status:** LOCKED
* **Context:** Per-file `UndoEntry` inverse diffs are sufficient for structured edits (`edit_file`), but completely fail to track side effects from arbitrary bash commands (`run_command` or PTC scripts) that delete, move, or corrupt files.
* **Decision:** Implement a dual-layer rollback system:
  1. `UndoEntry`: Inverse unified diffs for precise editor modifications.
  2. Ephemeral Git Tree Refs: Prior to executing bash commands or PTC scripts, create an uncommitted git tree ref (`refs/kaioken/snapshots/<session_id>/<turn_id>`), allowing full working-tree restoration via `kaioken undo --tree`.
* **Rationale:** Guarantees 100% undo safety against both editor edits and destructive shell commands without polluting the user's regular git branch history.
* **Consequences:** Integrates `internal/gitx` with tool execution hooks.

---

### ADR-008: Daemon Cron Scheduler & Session Isolation
* **Status:** LOCKED
* **Context:** Periodic maintenance tasks (staleness checks, index refreshing, background audits) need automated scheduling without blocking interactive user sessions.
* **Decision:** Embed a lightweight 60-second tick cron scheduler within the daemon reading `.kaioken/jobs.json`. Each scheduled job executes within an isolated, dedicated session context.
* **Rationale:** Prevents scheduled tasks from injecting unsolicited messages or interleaving turns into active user conversations, preserving strict LLM role-alternation rules.
* **Consequences:** Job execution logs and statuses must be tracked in the daemon runstate.

---

### ADR-009: Pure-Go BM25 Storage Engine (Strict Zero-CGO Constraint)
* **Status:** LOCKED
* **Context:** SQLite FTS5 was considered for session and document search. However, `mattn/go-sqlite3` requires CGO (breaking simple cross-compilation), and `modernc.org/sqlite` introduces substantial transpiled code and memory overhead.
* **Decision:** Implement retrieval using pure-Go BM25 (`internal/textrank`) paired with memory-mapped JSON/CBOR inverted indexes.
* **Rationale:** Preserves instant cross-compilation (`GOOS=windows/darwin/linux GOARCH=amd64/arm64`), maintains <35MB memory footprint, and requires zero external C dependencies.
* **Consequences:** Search indexing and query parsing are maintained directly in Go.

---

### ADR-010: Static AST Threat Scanner & Schema Linter for Skills
* **Status:** LOCKED
* **Context:** Dynamically generated or community-downloaded skills can contain prompt injections, dangerous subshells (`rm -rf /`, `curl | sh`), or credential exfiltration attempts.
* **Decision:** Mandate that all skills pass an AST static threat scan (inspecting frontmatter, scripts, and Markdown blocks for unsafe shell patterns and exfiltration hooks) and a schema linter before they can be loaded or proposed to the user.
* **Rationale:** Ensures that self-improvement and extension capabilities cannot be weaponized to compromise developer environments.
* **Consequences:** Skills failing threat scanning are quarantined immediately.

---

### ADR-011: Compiler-First Dry-Run Post-Edit Diagnostics
* **Status:** LOCKED
* **Context:** Immediate compiler feedback after code edits prevents the agent from compounding syntax errors. Full Language Server Protocol (LSP) integrations are heavy and complex to manage across languages.
* **Decision:** Implement compiler dry-run diagnostics (`go vet`, `tsc --noEmit`, `cargo check`, `pyright`) first. If an edit fails compilation, inject a bounded `<diagnostics>` block into the next turn context.
* **Rationale:** Captures ~90% of compile/type error feedback with minimal engineering overhead and zero background LSP daemon crashes.
* **Consequences:** Requires command runners mapped to project file extensions.

---

### ADR-012: Active Interrupt & Chain-of-Thought Stripping Redirect
* **Status:** LOCKED
* **Context:** When the user interrupts an ongoing agent stream (Ctrl+C), discarding all work wastes tokens, while replaying partial chain-of-thought (CoT) text can trigger provider reasoning-injection safety filters.
* **Decision:** Implement active interrupt-and-redirect: canceling the provider HTTP context stops the stream while retaining completed tool call results. Before replaying partial prose to the model, all chain-of-thought blocks are stripped.
* **Rationale:** Provides seamless user redirection without losing completed tool actions or tripping provider safety filters.
* **Consequences:** Requires split context management (`turnCtx` vs `httpCtx`) in `Agent.Run`.

---

### ADR-013: Deterministic Provider Transform Pipeline & Retry Resilience
* **Status:** LOCKED
* **Context:** Provider API idiosyncrasies (empty 200 responses, schema validation strictness, nullable unions, rate limits) frequently trigger unhandled runtime errors.
* **Decision:** Standardize a pre-flight provider transform pipeline (`llm/transform.go`) that sanitizes schemas, strips unsupported fields, intercepts empty 200 responses, and enforces exponential backoff with full jitter across both LLM and Agent retry layers.
* **Rationale:** Isolates provider quirks at the network boundary so they never surface as agent logic bugs.
* **Consequences:** Table-driven test suites validating transformations against real-world malformed provider payloads.

---

### ADR-014: 4-State Interactive Approval Enum (`agent.UI`)
* **Status:** LOCKED
* **Context:** Binary approvals (`bool`: Allow / Deny) force operators to repeatedly confirm repetitive tool calls or drop into unsafe unrestricted modes (`/yolo`).
* **Decision:** Upgrade the `agent.UI` approval interface across all implementors (TUI, Desktop, Headless) to a 4-state enum:
  * `AllowOnce`: Grants permission for the current single invocation.
  * `AllowSession`: Grants permission for the tool throughout the current session.
  * `AllowAlways`: Persists permission into project configuration.
  * `Deny`: Rejects the tool invocation and returns an error to the model.
* **Rationale:** Maximizes developer control and reduces confirmation fatigue without compromising security.
* **Consequences:** All `Approve()` methods across CLI, TUI, and Desktop sidecar are updated to handle the enum.

---

### ADR-015: Verbatim User Constraint Retention in Compaction
* **Status:** LOCKED
* **Context:** Standard LLM conversation summarization tends to drop negative constraints (e.g., *"Never touch file Y"*, *"Do not use ORM"*), causing the agent to repeat forbidden actions later in long sessions.
* **Decision:** Compaction must extract all explicit user constraints and directives, pinning them verbatim in Tier 1 of the prompt context alongside the narrative summary.
* **Rationale:** Preserves operator intent and boundary rules byte-for-byte across arbitrarily long multi-day sessions.
* **Consequences:** `internal/agent/compact.go` extracts and re-injects user constraints during history pruning.
