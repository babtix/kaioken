# Pi vs Kaioken: Architecture Analysis and Integration Roadmap

> Revised July 2026 after a full audit of `cli/internal/`. The previous
> revision of this document was written against an outdated snapshot of
> Kaioken and claimed several features were missing that have since shipped
> (session persistence, steering/follow-up queues, auto-compaction, the
> multi-provider registry, skills, slash commands). This revision reflects
> the code as it exists today and renumbers the roadmap accordingly.

## Executive Summary

Pi (earendil-works/pi-mono) is a mature TypeScript agent framework with a
hook-driven extension runtime, session branching, parallel tool execution,
and streaming tool updates. Kaioken has independently converged on much of
Pi's feature set — persistence, steering, compaction, multi-provider — but
in a flatter architecture with no event bus, no interception points, and
strictly sequential tools.

**Key finding**: the remaining gap between Pi and Kaioken is no longer
"features" — it is *extensibility infrastructure*: an event/hook bus,
tool-execution plumbing (parallel, streaming, interceptable), and session
lineage (fork/switch/import).

---

## Part 1: Corrected Architecture Comparison

### 1.1 What Kaioken already has (previously misreported as missing)

| Feature | Kaioken implementation |
|---------|------------------------|
| Session persistence | One JSON file per conversation in `.kaioken/sessions/`, written after every turn; `/resume`, `/sessions`, `/new` (`cli/internal/session/session.go`) |
| Steering queue | `Agent.Steer()` injects user text after the current tool batch, before the next model call (`cli/internal/agent/agent.go`) |
| Follow-up queue | `Agent.FollowUp()` starts another round after the final answer |
| Durable inbox | Session-persisted prompt inbox with steer/queue delivery modes |
| Auto-compaction | Triggers on context overflow; summary survives with the system prompt and recent turns verbatim; recorded as an epoch (`compact.go`, `epoch.go`) |
| Multi-provider | 20+ providers via registry (OpenRouter, OpenAI, Anthropic, Google, Groq, Mistral, Azure, ...) plus local auto-discovery (ollama, lmstudio, llamacpp, vllm, jan) in `cli/internal/llm/` |
| Transport retry | 429/5xx with Retry-After, backoff fallbacks, 402 token-ceiling adjustment (`llm/retry.go`) |
| Skills | `.kaioken/skills/<name>/SKILL.md` with YAML frontmatter; generated, learned, and human origins (`cli/internal/skills/`) |
| Slash commands | 50+ commands with a central registry and palette completion (`cli/internal/tui/commands.go`) |
| Model/provider switching | `/model` (live catalog picker) and `/provider` at runtime |
| Sub-agent delegation | `task` tool: read-only delegate, fresh context, shared budget, depth-capped |
| Memory | Project (`.kaioken/MEMORY.md`) + user (`~/.kaioken/USER.md`) with remember/recall and session learning |
| Budget guard | USD guardrails with warn/hard-stop, checked before each turn |
| Modes | build / plan / general / explore / review permission presets |
| Undo | File state captured before every write/edit; `/undo` |
| Extensions (tools) | WASM (wazero sandbox) and MCP (subprocess) extension tools with trust management (`cli/internal/ext/`) |

### 1.2 Genuine gaps vs Pi

| # | Gap | Pi has | Kaioken today |
|---|-----|--------|---------------|
| 1 | Event/hook bus | 15+ hook points across the agent lifecycle | Direct calls + tea.Msg only; nothing interceptable |
| 2 | Session branching | Fork at any message, switch, import | Linear sessions only |
| 3 | Parallel tool execution | Parallel default, per-tool sequential override | Strictly sequential |
| 4 | Streaming tool updates | `onUpdate` partial results during execution | Complete result only |
| 5 | Before/after tool hooks | Block calls, rewrite args, modify results | None |
| 6 | Thinking/reasoning levels | 7 levels with per-model clamping | None |
| 7 | Extension hooks/commands | Extensions subscribe to lifecycle, register slash commands | Extensions contribute tools + skills only |
| 8 | Prompt templates | Parameterized files with `{{variable}}` expansion | Per-model-family guidance only |
| 9 | Themes | CSS-variable theme system with watcher | Hardcoded lipgloss styles |
| 10 | Model cycling | Ctrl+P through scoped models | Manual `/model` picker only |
| 11 | Agent-level auto-retry | Retry failed turns with backoff | Transport-level only |
| 12 | Branch summarization | Summarize abandoned conversation branches | n/a (no branches yet) |

### 1.3 Permanently de-scoped Pi features

- **30+ provider ports** — Kaioken's OpenRouter + local-provider registry
  already covers the practical model space.
- **Proxy streaming (`streamProxy`)** — no server-side auth routing need;
  revisit only if the daemon grows one.
- **Session-affinity caching formats** — provider-specific optimization
  with no current payoff.
- **HTTP dispatcher configuration** — Go's transport plus `llm/retry.go`
  already handle timeouts/retries.
- **JSONL session format** — Kaioken's JSON-per-session format works and
  is extended in place rather than migrated.

---

## Part 2: Integration Roadmap

Backward compatibility is not a constraint: `agent.go`, `tools.go`, and
their callers (tui, daemon, task) may be restructured freely.

### Phase 1 — Event bus + hook system (foundation)

New package `cli/internal/agent/events/`:
- `types.go`: `AgentEvent` taxonomy — `agent_start/end`, `turn_start/end`,
  `message_start/update/end`, `tool_execution_start/update/end`,
  `compaction_start/end`, `retry_start/end`, `session_before_switch/fork`.
- `bus.go`: synchronous ordered dispatch; handlers may mutate payloads
  (`before_provider_request`, `tool_call` block, `tool_result` modify) or
  veto (`cancel`).
- Emission wired into `Agent.Run()`, tool dispatch, compaction, and the
  session lifecycle. The TUI becomes a bus subscriber where practical.

### Phase 2 — Tool system overhaul

Restructure `tools.go`/`tool_store.go` into `cli/internal/agent/tools/`:
- `AgentTool` interface: `Name/Description/Parameters/Execute(ctx, callID,
  args, onUpdate)/ExecutionMode()`; `ToolResult` with `IsError`/`Terminate`.
- Dynamic registry replacing the static `Tools()` list; built-ins and
  extension tools register through it.
- Parallel-by-default executor with per-tool sequential override —
  mutating tools (`write_file`, `edit_file`, `run_command`) stay
  sequential; reads/searches run parallel. Approval flow and mode
  permission checks preserved.
- `onUpdate` streams partial output as `tool_execution_update` events;
  the TUI renders progressive output.
- `before_tool_call` / `after_tool_call` hooks via the Phase 1 bus.

### Phase 3 — Session branching and forking

Extend `session/session.go` in place (JSON format, new fields):
- `parent_id` + `forked_at_index` metadata for queryable lineage.
- `Fork(atMessageIndex)`, `Switch(id)` (emits `session_before_switch`),
  `Import(path)` for external JSON/JSONL transcripts.
- Branch summarization reusing `Summarize()` from `compact.go`.
- TUI: `/fork [n]`, `/switch`, `/import <path>`; lineage in `/sessions`.

### Phase 4 — Provider and loop enhancements

- Thinking levels (`off` → `max`) with per-model clamping, mapped to
  OpenRouter `reasoning` params and Anthropic thinking budgets;
  `/think <level>`; persisted per session.
- Agent-level auto-retry on retryable run failures (stream death
  mid-turn), with backoff and `retry_start/end` events.
- Model cycling: Ctrl+P through a configured `models.scoped` list.

### Phase 5 — Extension system upgrade

- Manifest gains `hooks:` and `commands:` declarations.
- Hook dispatch to WASM extensions over the existing one-shot stdio
  protocol; timeout guards and error boundaries (failures log and
  continue, except explicit `block` on `tool_call`).
- Extension slash commands registered into the TUI command registry with
  a scoped context API.
- Prompt templates: `.kaioken/templates/<name>.md` with `{{variable}}`
  expansion, invoked as `/t:<name> args`.

### Phase 6 — UI polish

- Theme system: lipgloss styles extracted into a `Theme` struct; built-in
  default/light/high-contrast; `theme` config key + `/theme` command.
- `/session` stats (tokens, cost, epochs, lineage); fork lineage in the
  `/resume` picker.
- Extension hook/command development guide in the wiki.

### Sequencing

Phase 1 → 2 → 3 is a strict chain (bus before hooks, hooks before session
events). Phases 4 and 5 depend on 1–2 and are mutually independent.
Phase 6 depends only on Phase 3's lineage data.

---

## Part 3: Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing tool behavior | Medium | High | Regression tests asserting sequential-path behavior is unchanged; race tests on the parallel executor |
| Session corruption on fork/switch | Low | High | Fork copies to a new file (source untouched); validation on load |
| Extension hooks wedging a turn | Medium | Medium | Timeout guards; log-and-continue error boundaries |
| Event-bus overhead | Low | Low | Synchronous dispatch, no reflection, skip when no subscribers |

## Part 4: Success Criteria

- Phase 1: every lifecycle moment observable via the bus; mutation/veto
  covered by unit tests.
- Phase 2: read-only tool batches run in parallel under `-race`; partial
  `run_command`/`task` output visible live; hooks can block a tool call.
- Phase 3: fork/switch/import round-trip against real session files;
  lineage visible in the picker.
- Phase 4: thinking level survives resume; a mid-turn stream death
  retries instead of failing the run.
- Phase 5: a WASM extension can observe tool calls and register a slash
  command; templates expand.
- Phase 6: three themes switchable at runtime; `/session` reports stats.

Per phase: `cd cli && make check` green; `make build` after final edits.

---

*Audit and roadmap current as of July 2026, against `cli/internal/` and
Pi (earendil-works/pi-mono).*
