# Kaioken v2 — Executive Synthesis & Research Audit

**Location:** `.antigravity_dive/00_EXECUTIVE_SYNTHESIS_AND_AUDIT.md`  
**Date:** 2026-08-23  
**Status:** Authoritative Synthesis  
**Corpus Basis:** Exhaustive survey of `docs/hermes_res/`, `docs/doc_final_opencode/`, `docs/doc_agy/`, `docs/doc_her/`, `docs/doc_open/`, `docs/pi-opencode-deep-dive.md`, `docs/inspire-backlog.md`, `docs/inspire-phases.md`, and master git history (`cli/`).

---

## 1. Executive Summary & Purpose

Kaioken v2 represents the evolution of **Kaioken** from a standalone terminal coding tool into a **high-trust repository intelligence platform and developer copilot**.

This document synthesizes all previous research streams, audits the architectural proposals generated across prior AI agent reviews, reconciles discrepancies against the actual git commit history of the repository, and establishes the authoritative baseline for the target architecture, decision records, execution roadmap, and schema contracts.

### The Core Tension: What is Kaioken?
Across the 20+ reference research documents in `docs/`, three reference architectures were analyzed:
1. **Hermes Agent (`inspire/hermes-agent` - Python):** A *life-scoped personal operator* designed for continuous multi-month existence across 30+ messaging platforms (Telegram, Discord, Slack, etc.) with autonomous skill generation, dynamic memory distillation, cron scheduling, and subagent delegation.
2. **OpenCode (`inspire/opencode` - TypeScript/Bun/Effect-TS):** A *client/server coding agent* with a headless HTTP daemon, event-sourced SQLite session store, LSP integration, plugin hooks, and MCP support.
3. **Pi (`inspire/pi` - TypeScript):** A *minimal, pure-function coding harness* centered on JSONL session trees, hot-reloading extensions, and a strict 4-tool model-facing surface.

**The Kaioken v2 Resolution:**
Kaioken is **not** a life-scoped personal messaging chatbot (rejecting Hermes' multi-platform gateway complexity and 30k-line god-files), nor is it an Effect-TS monadic web service (rejecting OpenCode's framework overhead and runtime fragmentation).

Kaioken v2 is a **single, static Go binary (`cli/`)** providing:
* A **Daemon-as-Hub** runtime that owns long-lived sessions, scheduled jobs, and background workers while remaining lightweight and local-first.
* A **Narrow, Deterministic Agent Core** (~140-line `Agent.Run` heritage) protected by strict boundaries, bounded tool errors, and byte-stable prompt caching.
* A **Verified, Provenance-Tracked Knowledge Engine** (`.kaioken/` repo wiki, skills, memories, session lineage) with active staleness verification and an append-only mutation ledger.
* A **Gated Autonomous Learning Loop** that proposes new skills and memory updates via background reflection forks, safe-guarded by static AST threat scanning, schema linting, and interactive user approvals.
* **Programmatic Tool Calling (PTC)** and **Ephemeral Git Snapshots** allowing single-turn multi-step script execution with full rollback safety.

---

## 2. Comprehensive Corpus & Literature Audit

### 2.1 Research Document Inventory

| Document Directory | Primary Focus | Key Contributions | Identified Defects / Biases |
|---|---|---|---|
| `docs/hermes_res/` | Target v2 Architecture, ADRs 001–010, Roadmap v1.1 | Clear ADR format, strict prompt cache doctrine, bounded error handling, daemon-as-hub model, unified knowledge layer. | v1 had linear sessions claim (corrected in v1.1); omitted item #11 in initial waves; over-relied on prompt-caching assumptions without measuring token costs. |
| `docs/doc_final_opencode/` | Architecture, Roadmap, Decisions Log (D1–D13, N1–N8) | Conflict resolution matrix (D1–D13), new architectural innovations N1–N8 (frozen memory rules, incremental transcript flush, compound `apply_patch`, small-model compaction warning). | Stale git baseline in initial draft (claimed branches were unmerged that were already on master); misattributed commit hash `4073e44`; overstated "28 items confirmed". |
| `docs/doc_agy/` | Deep Dives: Agent Tools, Hermes Architecture, Self-Improvement, OpenCode, Pi, Source Verification | Thorough source code verification of Hermes and OpenCode; 433/511 citation verification; PTC dual-transport discovery; detailed threat models for self-improvement. | Highly academic; sometimes suggested embedded Starlark/WASM sandboxes which conflict with pure-Go single-binary constraints. |
| `docs/doc_her/` & `docs/doc_open/` | Comparative Hermes/Kaioken analysis | Dissected prompt caching mechanics, session database layouts, subagent delegation mechanics, and the "self-congratulation" hazard in autonomous optimization. | Conceptual focus; lacked concrete Go struct definitions and wire contracts. |
| `docs/phase-plans/` | Audit follow-up phases 1–4 | Detailed work items for compaction inside `Run`, `derive()`, worker cancellation, knowledge extraction, and CI `-race`. | Fully executed and merged on master (now historical reference). |

---

## 3. Ground-Truth Git & Codebase Audit (Master Verification)

To eliminate any ambiguity between past proposals and the active code, the entire `cli/` codebase was audited against `git log` on `master` (baseline commit `7be48f2`+):

### 3.1 Landed & Merged Capabilities (DO NOT RE-IMPLEMENT)

1. **Audit Follow-up Phases 1 & 2:**
   * Compaction integrated directly into `Agent.Run` (`internal/agent/compact.go`).
   * Clean agent state derivation via `Agent.derive()` (`internal/agent/derive.go`).
   * Stream tool-call chunk validation and newline-chaining fixes (`internal/agent/agent.go`).
   * Steering step-budget limiting runaway execution (`internal/agent/budget.go`, commit `48f3c7d`).
   * Mixed line-ending normalization on file writes (`internal/agent/fileops.go`, commit `0bca280`).
   * Asynchronous worker cancellation with context propagation (`ae6a808`).
   * `.gitattributes` LF enforcement, Ubuntu CI `-race` pipeline, runstate hardening (`aa5e865`).

2. **Knowledge Engine Groundwork (Phase 3 Extraction):**
   * `internal/retrieval/` successfully extracted from `internal/prism`: contains modular chunking (`chunk.go`), LLM relevancy grader (`grader.go`), lexical tokenization (`lexical.go`), and query variant generation (`variants.go`).
   * Wiki staleness detection engine (`internal/wiki/staleness.go`).
   * Singleflight concurrency deduplication on prism memo-cache TOCTOU hazards (`internal/prism/retrieve.go`).
   * Memory write-deduplication with test coverage (`internal/memory/memory.go`, commit `a867302`).

3. **Session Lineage & Tree Structure:**
   * Session storage is **already a tree** (not linear!): `internal/session/session.go:51-65`, `tree.go`, and `fork.go` implement v2 JSONL transcripts with `ParentID`, `ForkedAt`, `Entries`, and `Leaf` pointers managed by `syncTree`.

4. **Thinking Levels:**
   * `internal/llm/thinking.go` defines `ThinkingLevels{off, low, medium, high}`, fully wired to `/thinking` in the TUI (`tui.go:1802`).

### 3.2 Live Defects & Active Gaps (The True Starting Point: W0′)

Only two live correctness/robustness bugs remain open from the initial audit before new feature waves begin:
1. **Empty-Response Silent-Success Bug (Inspire Item #8):**
   * *Location:* `internal/agent/agent.go:238`, `internal/llm/`
   * *Defect:* An HTTP 200 response with empty body (`Content == ""` and no tool calls) returns `cerr == nil` and falls through to `return history, nil`. The agent terminates with a green status without having performed work or notified the user.
   * *Fix:* Treat empty 200 responses as structural errors; add streak-detection keyed on `(model, provider, finish_reason)` to break loops on silent content-filter refusals.
2. **Retry Hardening & Jitter (Inspire Item #14):**
   * *Location:* `internal/llm/retry.go` (currently 68 lines), `internal/agent/retry.go`
   * *Defect:* Lacks backoff jitter, does not handle capacity stream errors, raw network EOFs, or unknown provider finish reasons, leading to premature failure or wasted retry spend.
   * *Fix:* Implement comprehensive error taxonomy, exponential backoff with full jitter, and deterministic refusal detection across both LLM and Agent retry layers.

---

## 4. Synthesis of Competing Proposals & Definitive Resolutions

The prior AI agents debated thirteen major design conflicts (D1–D13) and introduced eight novel synthesis items (N1–N8). Below is the authoritative resolution of all conflicts based on the locked decision matrix:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                       SYNTHESIZED CONFLICT RESOLUTIONS                       │
├──────────────────────────────────────────────────────────────────────────────┤
│ D1: PTC Architecture         ► Child Process with Dual Transport (UNIX/TCP)  │
│ D2: Post-Edit Diagnostics    ► Phase 6 (Compiler dry-run first: vet/tsc)     │
│ D3: FIFO / Read Guard        ► Wave 1 (Immediate hang-class fix in fileops)  │
│ D4: Reflection Trigger       ► memory.Signals() (Errors & user corrections)  │
│ D5: Curator Day Thresholds   ► 30d (Stale) / 90d (Archive) configurable      │
│ D6: Self-Improvement Gating  ► Machine-Proposed, Human-Gated (No auto-commit)│
│ D7: Storage Engine           ► Pure-Go BM25 + JSON Index (Strict Zero CGO)   │
│ D8: Go Toolchain Target      ► Go 1.24 (Matches root go.mod & CI matrix)     │
│ D9: Cache Optimization       ► Byte-Stable Prefix + Tail Volatility          │
│ D10: Undo & Rollback Scope   ► Dual-Layer: UndoEntry + Ephemeral Git Tree Ref│
│ D11: ESTOP Sentinel          ► Re-scoped to Daemon Dispatch Gate (No loop stat)│
│ D12: Legacy Analyses         ► Archived/Ignored in favor of Git Truth       │
│ D13: Approval Quick-Keys     ► AllowOnce/AllowSession/AllowAlways/Deny Enum  │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Resolved Points:

1. **PTC Sandboxing (D1):**
   * Embedded interpreters (Starlark/WASM) were rejected because they require custom Go bindings, cannot execute standard user scripts (Python/Node), and blur memory boundaries.
   * Hermes' dual-transport pattern was adopted: `AF_UNIX` sockets on POSIX, loopback `127.0.0.1:0` TCP on Windows. Child processes receive IPC access to Kaioken's tool surface with environment scrubbing and per-tool permission enforcement.

2. **Self-Improvement & Gated Autonomy (D4, D6, N7):**
   * The "self-congratulation problem" (agents judging their own buggy skills as successful) is eliminated by rejecting unmonitored autonomous self-mutation.
   * Reflection workers run in the background post-turn on a cloned context, triggered by `memory.Signals()`. Generated skills are written to `.kaioken/skills/drafts/`, verified against an AST threat scanner and linter, and presented to the operator in an interactive approval modal.

3. **Storage & CGO Discipline (D7):**
   * SQLite (whether via `mattn/go-sqlite3` requiring GCC or `modernc.org/sqlite` adding massive transpiled Go code) is completely barred from core dependencies.
   * Retrieval relies on `internal/textrank` pure-Go BM25 indexing with atomic JSON/CBOR metadata files, preserving effortless single-binary cross-compilation.

4. **Prompt Cache Stability & Invariant Retention (D9, N1, N6):**
   * Prompt caching is treated as an architectural invariant. Memory blocks are frozen at session initialization and never mutated mid-session in the system prompt.
   * Compaction uses a structured template that extracts negative user constraints verbatim into the persistent prefix block, ensuring critical instructions are never lost during lossy context summarization.

---

## 5. Architectural Quality Attributes & Non-Goals

### 5.1 Core Quality Attributes
* **Determinism & Reproducibility:** Tool dispatch and context pruning follow predictable, table-driven rules.
* **Cold-Start Latency:** Single binary launches in <30ms; memory footprint remains <35MB idle.
* **Crash-Resilience:** Incremental per-turn transcript flushing ensures that sudden process termination loses at most the in-flight stream chunk.
* **Safety First:** Static analysis and human approvals precede any automated code generation or skill persistence.

### 5.2 Named Non-Goals for v2
* **Multi-Platform Chat Gateway:** No built-in Telegram, Discord, or Slack bot runners.
* **SaaS / Remote Dialectic User Modeling:** No external vector database subscriptions or cloud memory syncing (Honcho-style).
* **Monadic Framework Refactoring:** No Effect-TS or reactive micro-store migrations.
* **Continuous Micro-Compaction:** No per-turn prompt summarization that invalidates LLM prompt caches.
