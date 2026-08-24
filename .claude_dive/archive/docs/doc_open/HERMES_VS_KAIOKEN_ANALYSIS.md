# Hermes Deep Dive & Hermes-vs-Kaioken Comparison

> Source survey of `inspire/` (pi, opencode, hermes-agent), with the primary
> focus on how **Hermes** functions, followed by a detailed comparison against
> **Kaioken** (`cli/`). Written August 2026 from a direct read of each
> codebase. File paths are relative to each repo root unless prefixed.

---

## Executive Summary

The `inspire/` folder holds three reference agent codebases:

| Repo | Language | One-line identity |
|------|----------|-------------------|
| `inspire/hermes-agent` | Python (Nous Research) | A **personal AI agent** whose one core runs across a CLI, ~30 messaging platforms, an Ink TUI, and an Electron desktop app — it *learns* across sessions (memory + skills), delegates to subagents, runs cron jobs, and drives a real terminal and browser. |
| `inspire/pi` | TypeScript (earendil-works) | A minimal, aggressively extensible **coding agent harness**: pure-function agent loop, JSONL tree sessions, hot-reload extensions, deliberately no MCP / no subagents / no permission popups. |
| `inspire/opencode` | TypeScript (sst, Bun + Effect-TS) | A **client/server coding agent**: headless HTTP core with generated SDKs, event-sourced SQLite persistence, hook-based plugins, MCP, LSP integration; mid-migration to a durable "V2 session runtime". |

**Hermes is the outlier in intent.** Pi and opencode (like Kaioken) are
repo-scoped coding assistants where the unit of work is *a codebase*. Hermes is
a life-scoped personal operator where the unit of work is *a conversation that
may live on Telegram for months*. That single difference explains nearly every
architectural divergence analyzed below: Hermes optimizes for **long-lived,
cache-stable conversations amortized over many surfaces**, while Kaioken
optimizes for **deep repo knowledge served cheaply inside one terminal**.

**Key comparative findings:**

1. Both Hermes and Kaioken independently arrived at the same two governing
   principles — *keep the model-facing core narrow* and *treat prompt caching
   as sacred* — but Hermes enforces them with dedicated machinery
   (`prompt_caching.py`, cache-boundary registration, frozen memory snapshots)
   where Kaioken relies on build-order discipline.
2. Hermes's biggest structural liability is acknowledged god-files
   (`cli.py` 21.4k lines, `gateway/run.py` 31.3k); Kaioken's equivalent risk
   (`internal/tui/tui.go`, `internal/agent/tools.go`) is smaller by an order
   of magnitude.
3. Hermes has three capabilities Kaioken lacks entirely: scheduled jobs,
   background delegation with async result delivery, and multi-platform
   message delivery. Kaioken has one capability Hermes lacks entirely: a
   precomputed, freshness-tracked **knowledge engine** as the product.

---

## Part 1 — Quick Survey: pi and opencode

These are context; details kept brief since prior analyses exist
(`PI_KAIOKEN_ANALYSIS.md` covers pi vs Kaioken).

### pi (`inspire/pi`) — minimal core, maximal extensibility

- npm monorepo: `packages/ai` (unified provider API), `packages/agent`
  (pure-function loop in `agent-loop.ts` returning an `EventStream`),
  `packages/coding-agent` (the CLI), plus protocol/server/client, SQLite
  session backend, telemetry, evals.
- Agent loop = pure functions; steering/follow-up injection and stop hooks are
  config callbacks. Default prompt exposes only **four tools**
  (read/write/edit/bash).
- Sessions are **JSONL trees** (`session-manager.ts`) enabling fork/branch in
  place; compaction stored as checkpoint entries.
- Extension story: TypeScript extensions (hot-reloadable), Agent-Skills
  standard, prompt templates, themes, npm "pi packages". Explicit non-goals:
  MCP, subagents, permission popups (containerize instead).

### opencode (`inspire/opencode`) — server/client split, durable runtime

- Bun monorepo built heavily on Effect-TS. Shipped binary hosts an HTTP API
  (`packages/server`, HttpApi routes); the SolidJS TUI is a pure SDK client.
- Two generations coexist: V1 loop (`packages/opencode/src/session/prompt.ts`,
  Vercel AI SDK) and V2 durable runtime (`packages/core/src/session/*`) —
  prompts are admitted as durable rows, drained by a run coordinator, one
  explicit `llm.stream()` per provider turn, incremental persistence of parts.
- Storage migrated to **SQLite + Drizzle** with event sourcing
  (`core/src/session/sql.ts`: session/message/part/session_input tables).
- Tools registered in `ToolRegistry`; plugins supply ~25 hook points; MCP via
  official SDK with OAuth + catalog; subagents via the `task` tool; LSP and
  formatter integrations server-side.

---

## Part 2 — How Hermes Functions

### 2.1 Design philosophy: two sacred invariants

From `inspire/hermes-agent/AGENTS.md` (the design-intent document), every
decision is judged against:

1. **"Per-conversation prompt caching is sacred."** A long-lived conversation
   reuses a cached prefix every turn. Anything that mutates past context,
   swaps toolsets, or rebuilds the system prompt mid-conversation multiplies
   user cost. The single permitted exception is explicit context compression.
2. **"The core is a narrow waist; capability lives at the edges."** Every
   model tool schema ships on *every* API call, so core tools have a high bar.
   New capability must descend the **Footprint Ladder**: extend existing code →
   CLI command + skill → service-gated tool (`check_fn`) → plugin → MCP server
   → new core tool (last resort).

This produces a distinctive shape: a small set of always-on model tools, a
large registry of conditionally-gated ones, and product breadth pushed into
plugins/skills/platform adapters rather than the agent core.

### 2.2 Repository anatomy

Top-level god-files (sizes verified):

| File | Size | Contents |
|------|------|----------|
| `cli.py` | ~1 MB, 21.4k lines | `HermesCLI` (line 4970) mixing setup/commands/billing mixins; `main()` at 20843 |
| `run_agent.py` | ~427 KB, 9.2k lines | `AIAgent` (412) — mostly forwarders into `agent/` |
| `hermes_state.py` | ~624 KB, 13.7k lines | `SessionDB` (3587): SQLite + FTS5 persistence, composed from schema/search/portability mixins |
| `gateway/run.py` | 31.3k lines | `GatewayRunner` (:6729) — all messaging platforms |
| `model_tools.py` | 1.6k lines | `get_tool_definitions()` (:323), `handle_function_call()` (:1192) |
| `toolsets.py` | 972 lines | `_HERMES_CORE_TOOLS` (:31), named `TOOLSETS`, `resolve_toolset()` |
| `trajectory_compressor.py` | 1.5k lines | **Offline** training-trajectory compressor — not runtime compression |

Extraction into the `agent/` package is underway but incomplete:
`conversation_loop.py` (8.4k lines), `tool_executor.py`, `turn_context.py`,
`context_compressor.py` / `conversation_compression.py` (4.4k lines),
provider wire adapters (`anthropic_adapter.py`, `bedrock_adapter.py`,
`codex_responses_adapter.py`, `gemini_native_adapter.py`), `system_prompt.py`,
`prompt_caching.py`, `memory_manager.py`, `curator.py`.

Other majors: `tools/` (~130 files incl. `tools/environments/` terminal
backends: local/docker/ssh/modal/daytona/singularity/vercel_sandbox);
`gateway/platforms/` + `plugins/platforms/` (~30 platform adapters);
`plugins/model-providers/` (36 provider profiles); `skills/` +
`optional-skills/`; `ui-tui/` (Ink) ⇄ `tui_gateway/server.py` (15.7k-line
JSON-RPC server); `acp_adapter/` (Zed/VS Code/JetBrains); `cron/`;
`apps/desktop` (Electron); `web/` (dashboard); `mcp_serve.py` (expose agent as
MCP server); `batch_runner.py` / `mini_swe_runner.py` (training-data
pipelines). State isolation via `HERMES_HOME` — profiles are deliberate
islands.

### 2.3 The agent core loop

Entry chain: `hermes` script → `hermes_cli/main.py` (~55 subcommands) → chat
mode → `HermesCLI` builds an `AIAgent` → REPL calls
`run_conversation()` (`cli.py:16423`) which forwards to the real loop at
`agent/conversation_loop.py:1766`.

Per-turn structure:

1. **Prologue** — `build_turn_context()` (`agent/turn_context.py:431`)
   performs once-per-turn setup: sanitization, todo hydration,
   **restore-or-build system prompt** (`_restore_or_build_system_prompt`,
   conversation_loop.py:809 — cached from session start, never rebuilt
   mid-conversation), preflight compression check, plugin `pre_llm_call`
   hooks, external-memory prefetch.
2. **Loop guard** — bounded by `max_iterations` and an iteration budget with
   grace logic; checks interrupt flags; drains `/steer` text by appending it
   to the *last tool-role message* (never a synthetic user message — strict
   role alternation preserved, conversation_loop.py:2030–2078).
3. **LLM call** — `chat.completions.create` or `interruptible_streaming_api_call`
   (`agent/chat_completion_helpers.py:3275`) with stale-stream timeout kill,
   `TurnRetryState` retries, and fallback-model activation.
4. **Tools** — `execute_tool_calls_concurrent/sequential/segmented`
   (`agent/tool_executor.py`) dispatch through `model_tools.handle_function_call()`;
   results appended as `role:"tool"` messages; loop repeats until no tool calls.
5. **Exit** — returns `{final_response, messages, api_calls, ...}`; transcript
   persisted incrementally to `SessionDB` under a per-turn lease.

### 2.4 Prompt-caching discipline (Hermes's signature engineering)

Mechanisms, not conventions:

- **Byte-stable system prompt**: resolved once per session keyed on the fixed
  model name; date-only timestamps (`system_prompt.py:849`); static text
  frozen (`:452`).
- **Frozen memory snapshot**: `MEMORY.md`/`USER.md` injected at session start;
  mid-session memory writes hit disk immediately but do **not** enter the
  prompt until next session (`tools/memory_tool.py`).
- **Skills via messages**: skill slash commands inject a *user message*, never
  a system-prompt edit; mutating skill commands default to deferred cache
  invalidation (`agent/skill_commands.py`).
- **Cron isolation**: scheduled deliveries land in their own sessions so the
  main transcript alternation stays intact.
- **Provider-side planning**: `prompt_caching.py` places 4 Anthropic
  `cache_control` breakpoints (5m/1h TTL); `prompt_cache_boundary.py` records
  builder-declared stable prefixes.
- **The one sanctioned break**: `compress_context`
  (`agent/conversation_compression.py:2234`) summarizes, splits the session in
  SQLite, rotates the session_id, and notifies memory/context engines.

### 2.5 Tool system

- **Core tools** (`_HERMES_CORE_TOOLS`): web_search/web_extract, terminal +
  process, read_file/write_file/patch/search_files, vision_analyze/
  image_generate, video gen, skills_list/view/manage, 12 `browser_*` tools,
  text_to_speech, todo, memory, session_search, clarify, execute_code,
  delegate_task, cronjob, ha_* (Home Assistant), kanban_*, computer_use.
  Desktop-only extras live in separate toolsets folded in by the gateway based
  on session source — never env vars.
- **Registry with service gates**: `tools/registry.py` — each module registers
  `(name, toolset, schema, handler, check_fn)` at import; `check_fn` gates on
  configured prerequisites (e.g. Home Assistant token) with a 30 s TTL cache.
  Unconfigured services cost zero tokens.
- **MCP both directions**: inbound client (`tools/mcp_tool.py` + OAuth) and a
  stdio MCP server (`mcp_serve.py`) exposing messaging conversations;
  `optional-mcps/` catalogs ~20 ready-made servers.
- **Plugins**: `PluginManager` discovers `~/.hermes/plugins/`, project-local,
  and pip entry points; lifecycle hooks `pre/post_tool_call`,
  `pre/post_llm_call`, `on_session_start/end`. Plugins must never touch core
  files.
- **Terminal environments**: `tools/environments/*` swap local/docker/ssh/
  modal/daytona backends behind one `terminal` tool, with optional PTY and
  background processes with completion watchers.

### 2.6 Memory, skills, state

- Memory: curated `MEMORY.md`/`USER.md` via a single `memory` tool (locked
  file edits), pluggable `MemoryProvider` ABC orchestrated by
  `memory_manager.py` (`prefetch_all` / `sync_turn` / `shutdown`); eight
  bundled external providers.
- Skills: autonomous creation after complex tasks, usage nudges, and a
  **Curator** (`agent/curator.py` + `.usage.json` sidecars) that archives
  stale agent-created skills (never deletes; pinned skills exempt).
- State: `SessionDB` (SQLite + FTS5) with per-turn incremental appends and a
  cross-process `acquire_session_turn_lease` (300 s TTL) so CLI/gateway/desktop
  can't interleave turns on one conversation.

### 2.7 Execution flow walkthroughs

**Interactive CLI turn:** prompt_toolkit input → slash-command resolution →
pending notes prepended → `agent.run_conversation(...)` acquires the session
lease → `build_turn_context` restores cached prompt/history → stream deltas to
the UI → concurrent/sequential tool execution → final response rendered →
messages flushed to SQLite → memory sync hooks.

**Gateway turn (Telegram/Discord/Slack/etc.):** adapter long-poll/webhook →
normalized `MessageEvent` + `SessionSource` → `GatewayRunner._handle_message`
(:16670): reset leaked ContextVars, authorization checks, intercept control
commands (`/stop`, `/new`, `/queue`, `/approve`...) → if an agent is already
running for this chat, either interrupt it or queue in `_pending_messages`
(two sequential-message guards) → resolve/create the per-conversation cached
`AIAgent` with the platform's base toolset → identical loop internals from
here down, with progress callbacks translating tool events into typing status
and streaming drafts governed by a four-invariant delivery contract
(prefix-stable drafts, declared final, metadata, edit-reconcile) → sanitized
final text sent via adapter → queued follow-ups drain.

### 2.8 Delegation, scheduling, surfaces

- `delegate_task` spawns child `AIAgent`s with fresh context and own terminal;
  blocked-tool list prevents recursion/memory abuse; spawn depth ≤ 2,
  ≤ 3 concurrent children; `background=true` returns immediately with results
  delivered later via an async-completion queue.
- Cron scheduler ticks jobs into **dedicated sessions**, hard-interruptible.
- Surfaces: Rich CLI; Ink TUI ⇄ JSON-RPC gateway; Electron desktop spawning
  headless `hermes serve`; headless batch runners (multiprocessing,
  checkpoint/resume); ACP adapter for editors; MCP server mode.

### 2.9 Providers

36 provider plugin dirs (`openrouter`, `anthropic`, `gemini`, `bedrock`,
`vertex`, `copilot`, ...) registering `ProviderProfile`s lazily with
last-writer-wins override so users can swap any profile from their own plugin
dir. Wire-shape differences absorbed by `agent/` adapters. Side-LLM tasks
(titles, vision, compression, curator review) resolved per-task through
`auxiliary_client.py`. Fallback models + credential pools round out
resilience.

### 2.10 Strengths & limitations (evidenced)

**Strengths**
- Caching discipline encoded as reviewable modules rather than tribal rules.
- The Footprint Ladder gives a concrete, teachable cost model for core growth.
- One core amortized across ~30 platform surfaces with mature operational
  hardening (leases, double sequential-guards, streaming contract, transactional
  six-stage updater).
- Genuine learning loop: memory + self-created, curator-maintained skills.
- Fleet-grade terminal environments and research/training-data tooling.
- Real Windows support (native path translation, bundled MinGit, UTF-8 stdio
  bootstrap, live CI lane).

**Limitations**
- God-files concentrate merge/review risk (`cli.py` 21.4k, `gateway/run.py`
  31.3k, `tui_gateway/server.py` 15.7k lines) — extraction underway but far
  from done.
- Defensive lazy imports and module-level global state throughout reflect
  Python startup/runtime cost and hidden coupling (e.g., save/restore of
  tool-resolution caches around subagent execution).
- Heavyweight packaging: uv venv + Node runtime (TUI/desktop) + bundled MinGit
  + vendored FTS5 C extension; Android needs trimmed extras.
- Native Windows PTY incomplete for the dashboard bridge (ConPTY pending).
- Fundamentally **single-user-personal**: allowlist/DM-pairing authz, one
  identity per chat, profiles-as-islands — team/multi-tenant deployment fights
  the grain.

---

## Part 3 — Hermes vs Kaioken

### 3.1 At-a-glance

| Dimension | Hermes | Kaioken (`cli/`) |
|---|---|---|
| Language/runtime | Python + Node (TUI/desktop) + bundled Git | Go 1.24, **single static binary** |
| Identity | Personal life/operator agent | Repo-scoped coding assistant **+ knowledge engine** |
| Primary surface | CLI, ~30 chat platforms, Ink TUI, Electron, batch, ACP | bubbletea TUI, headless `-json`, JSON-RPC stdio, daemon HTTP+SSE sidecar |
| Session store | SQLite + FTS5 (`SessionDB`), per-turn leases | JSONL tree files in `.kaioken/sessions/` (fork lineage, epochs) |
| Model access | 36 provider plugins + 5 wire adapters + aux-LLM router | ~20 hosted endpoints + native Anthropic + local auto-discovery (Ollama/LM Studio/vLLM) |
| Core tools | ~31 always-on, gated extras via `check_fn` | ~13 hand-written Go schemas; extension tools via WASM/MCP |
| Sub-agents | `delegate_task` (depth 2, background queue) | `task` (read-only, depth 1) + `delegate` (throwaway git worktree, diff returned) |
| Memory | Frozen-snapshot files + `MemoryProvider` ABC + Curator | `MEMORY.md`/`USER.md` + session-digest learning loop w/ reinforcement-decay |
| Skills | SKILL.md + curator lifecycle + usage sidecars | SKILL.md generated/learned, UseCount-ranked in prompt catalog |
| Scheduling | Cron jobs → dedicated sessions | none |
| Knowledge engine | none (searches sessions/web instead) | scan→plan→cards→wiki pipeline, staleness tracking, TextRank+embeddings index, PRISM RAG |
| Extensibility | Plugins (ABC hooks), check_fn gates, MCP ± , skills, platform adapters | WASI wasm plugins (permissioned), hooks bus, MCP consume **and serve**, runtime `RegisterTool` |
| Budget control | Iteration budget, fallback models | USD spend guard (warn/hard-stop), affordable-max_tokens retry, role-routed models |

### 3.2 Architecture comparison

**Same skeleton, different center of gravity.** Both are loop-centric agents
with: a bounded while-loop (`agent/conversation_loop.py` ↔
`internal/agent/agent.go:Run`), a registry-dispatched tool layer
(`tools/registry.py` ↔ `internal/agent/tools.go`), steering/follow-up queues,
pre-request compaction, Anthropic cache breakpoints, JSON/SQLite transcripts,
and an edge-extension story. The differences are about what sits at the
center:

- **Hermes centers the conversation.** Everything optimizes for a
  months-long, cache-stable thread reachable from any surface: byte-stable
  prompts, frozen memory snapshots, leases preventing cross-surface turn
  interleaving, cron isolated into side sessions. Capability arrives as
  *tools and platforms* around the loop.
- **Kaioken centers the repository.** Everything optimizes for answering and
  acting correctly inside one repo: offline knowledge cards/wiki/skills
  advertised in the system prompt, staleness surfaced honestly ("wiki stale —
  code wins"), PRISM RAG for imported docs, blast-radius prediction, drift
  gates for CI. Capability arrives as *generated knowledge and Go tools*
  around the loop.

**Layering contrast.** Hermes is mid-refactor from god-files to a package
layout (`agent/` extraction); Kaioken was born layered (`internal/{agent,llm,
tui,wiki,...}`) with small files but a few fat ones (`tui.go` ~3.2k lines,
`tools.go` ~1.2k). Hermes's seams are *runtime* abstractions (environments,
providers-as-plugins, check_fn gates); Kaioken's are *build-time* packages
plus a wasm sandbox boundary.

**Concurrency models differ tellingly.** Hermes runs concurrent tool batches
with segmented execution and background delegation feeding a completion queue;
its hardest bugs (per AGENTS.md) are ordering/interleaving ones, hence leases
and double guards. Kaioken parallelizes only consecutive read-only tools and
answers every call even when cancelled (`abortedResults`) to keep history
provider-valid — simpler, safer, less throughput.

### 3.3 Execution-flow comparison (one user turn)

| Step | Hermes | Kaioken |
|---|---|---|
| Intake | slash resolution → pending notes → `run_conversation` (+ lease) | composer → `/dispatch` or `startChat`; if busy → `Steer()` |
| Turn setup | `build_turn_context`: restore byte-stable prompt, todos, plugin hooks, memory prefetch | goroutine: `ShouldCompact`/`Prune`/`Compact` first, then `Agent.Run` |
| Context mgmt | compression only as sanctioned break (rotates session id) | prune stale tool bodies → structured-summary compaction at user-message boundaries → epochs |
| Provider call | `chat.completions` / interruptible stream w/ retry + fallback model | `ChatWithToolsStream` w/ `chatWithRetry` (2 retries), budget guard checked first |
| Tools | concurrent/sequential/segmented executor; `role:"tool"` appends | read-only batch parallel; mutating solo; approval modal w/ arity-matched standing rules |
| Steering | injected into last tool message (alternation-safe) | drained after tool batch; unbilled turns; anti-flood ceiling |
| Exit/persist | incremental SQLite flush under lease; memory sync | transcript saved after turn; `LearnSession` experience loop fires on close |

Notable asymmetries: Hermes checks budget in *iterations*, Kaioken in *USD*
with a price-catalog fallback; Hermes persists *during* the turn (crash-safe,
multi-surface), Kaioken after it (simpler, single-owner).

### 3.4 Strengths: Hermes over Kaioken

1. **Surface reach** — one agent answers Telegram, Discord, desktop, and CLI;
   Kaioken speaks only terminal/daemon.
2. **Conversation durability engineering** — leases, streaming-delivery
   contract, alternating-role guarantees, crash-safe incremental persistence.
3. **Learning-loop maturity** — curator lifecycle, usage telemetry sidecars,
   autonomous skill creation, pluggable external memory providers.
4. **Scheduling & background work** — cron jobs and background delegation
   with async delivery; Kaioken has neither.
5. **Operational/test maturity** — hermetic subprocess test runner, OS-lane
   CI including live Windows process topology, transactional self-updater.
6. **Ecosystem breadth** — 36 provider profiles, ~20 optional MCP servers, ~130
   tool modules, all without growing the waist (check_fn gates keep unconfigured
   features free of token cost).

### 3.5 Strengths: Kaioken over Hermes

1. **Distribution** — one static Go binary vs Python venv + Node + bundled
   MinGit + C extension. Startup, install friction, and resource use favor
   Kaioken by orders of magnitude.
2. **The knowledge engine** — Hermes learns about *you*; Kaioken learns about
   *the repo*, ahead of time: precomputed cards/wiki/skills, git-diff-driven
   incremental refresh, staleness notes in-prompt, MCP exposure of repo
   knowledge to other agents (Claude Desktop/Cursor). Hermes would answer repo
   questions by searching/blundering in real time.
3. **Safety ergonomics** — mode presets + wildcard/arity standing rules +
   undo entries + symlink-confined file ops + worktree-isolated writable
   delegation. Hermes delegates broadly and trusts the platform allowlist.
4. **Cost governance** — USD budgets enforced before each call, affordable-
   max_tokens recovery on credit errors, role-based model routing
   (cheap models for task/compact roles). Hermes bounds iterations, not spend.
5. **Sandboxed third-party code** — WASI plugins with declared permissions;
   Hermes's plugin ABC is powerful but in-process Python (trust-by-install).

### 3.6 Shared limitations / risks

- Both carry oversized files at the UI/wiring layer (`gateway/run.py` /
  `cli.py` ↔ `tui.go` / `tools.go`).
- Both keep memory as editable markdown snapshots — simple, inspectable, but
  prone to drift and poisoning; both bolt heuristics on top (Hermes curator,
  Kaioken distillation gate).
- Neither isolates untrusted tool output fully from prompt-injection paths;
  Hermes leans on platform authz, Kaioken on mode presets.
- Compaction remains lossy summarization in both (Hermes at least makes the
  break auditable via session rotation; Kaioken keeps epochs).

### 3.7 What Kaioken could borrow from Hermes

Ranked by expected payoff, consistent with `PI_KAIOKEN_ANALYSIS.md` roadmap
culture (numbering continues conceptually from that doc's gaps):

1. **Session turn leases** (from `acquire_session_turn_lease`) — cheap file/
   SQLite lock preventing daemon + TUI + MCP-server interleaving on one
   `.kaioken` session; prerequisite for the desktop app's sidecar future.
2. **Crash-safe incremental persistence** — flush entries during the turn,
   not after; Kaioken's JSONL-per-turn writer makes this a small change.
3. **Curator-style skill lifecycle** — Kaioken already tracks UseCount; add
   archive-don't-delete + pinned exemptions to prevent skill rot.
4. **Background delegation with completion queue** — extend `delegate` beyond
   the blocking worktree call for long builds/research.
5. **Scheduled jobs in dedicated sessions** — natural fit for wiki refresh
   and knowledge maintenance (`kaioken cron`), reusing the existing
   incremental-update machinery.
6. **Frozen-snapshot discipline as code** — formalize "memory enters prompt
   only at session start" in `context.go` so caching guarantees survive
   refactors (mirrors `prompt_caching.py`'s rationale).

Conversely, Hermes's docs could crib Kaioken's honesty flags (`SourceFound/
Graded/Degraded`) and USD budget guardrails — but that's out of scope here.

---

## Appendix — Verification notes

Claims spot-checked against source: `_HERMES_CORE_TOOLS` at
`toolsets.py:31`; `AIAgent` at `run_agent.py:412` with forwarder docstrings;
`build_turn_context` at `agent/turn_context.py:431`; god-file line counts via
direct measurement. Kaioken facts cross-checked against `cli/AGENTS.md` and
`PI_KAIOKEN_ANALYSIS.md`.
