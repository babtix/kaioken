<!-- kaioken architecture brief — injected verbatim into every chapter prompt.
     EDIT FREELY: corrections here propagate to the whole wiki on the next run.
     Delete this file to have it regenerated. -->

## What this system is
Kaioken is a terminal-based AI coding assistant that combines an interactive chat agent with a knowledge engine. The chat agent allows users to converse with LLMs to perform coding tasks like editing files and running commands, with changes shown as diffs for approval. The knowledge engine scans repositories, generates structured documentation (knowledge cards and wiki), and incrementally updates it over time.

## Architecture
- **cmd/kaioken/main.go**: Entry point; defines CLI commands (init, scan, plan, generate, wiki, update, models, status, skills, hook, serve) and depends on all internal packages.
- **internal/tui/tui.go**: Terminal UI (Bubble Tea); handles user input, displays output, and orchestrates interactions with agent, LLM, session, skills, wiki, serve, codemap, scan, plan, state, and gitx.
- **internal/agent/agent.go**: Chat agent; processes user messages, invokes LLM with tools (read_file, edit_file, etc.), and manages approvals via UI; depends on llm, config, codemap, scan, session, skills, wiki, and state.
- **internal/wiki/wiki.go**: Knowledge engine; generates modules, knowledge cards, and wiki documentation; depends on scan, plan, llm, config, codemap, state, gitx, and skills.
- **internal/llm/openrouter.go**: LLM provider integration; handles streaming, tool use, token budgeting, and retries; depends on config.
- **internal/skills/skills.go**: Manages task guides (skills); depends on scan, llm, and config.
- **internal/scan/scan.go**: Inventorys repository files; depends on config.
- **internal/plan/plan.go**: Plans repository modules (modules.yaml); depends on scan, llm, and config.
- **internal/codemap/codemap.go**: Parses source code to build symbol indexes and skeletons; no internal dependencies.
- **internal/session/session.go**: Manages chat session persistence; depends on llm.
- **internal/state/state.go**: Tracks wiki build state for incremental updates; depends on scan.
- **internal/serve/serve.go**: Serves generated wiki via HTTP; depends on wiki.
- **internal/gitx/gitx.go**: Git integration (hooks, diffs, etc.); no internal dependencies.
- **internal/config/config.go**: Manages global and per-repo configuration; depends on environment and standard library.

Dependency direction: High-level layers (cmd, tui) depend on lower-level layers (agent, wiki, llm, etc.), which in turn depend on utilities (scan, plan, codemap, state, skills, serve, gitx). Config is a cross-cutting dependency.

## Key flows
1. **Interactive chat session**:
   - User starts TUI (`tui.Run`).
   - User enters message → TUI forwards to agent (`agent.Agent.Run`).
   - Agent chats with LLM (`llm.Client.ChatWithTools`); if tools are requested (e.g., `edit_file`), agent prompts UI for approval.
   - On approval, agent executes tool (e.g., writes file) and returns result to LLM.
   - LLM streams response back to TUI for display.

2. **Knowledge generation (wiki)**:
   - User runs `kaioken wiki` (or `/wiki` in TUI).
   - `scan.Repo` inventories files.
   - `plan.Generate` proposes modules (using LLM).
   - User edits `modules.yaml` (optional).
   - `generate.Run` creates knowledge cards per module (using LLM and codemap for context).
   - `wiki.Run` builds outline and sections (with critique/correction passes).
   - `state.Save` records build state.

3. **Incremental update**:
   - User runs `kaioken update` (or `/update` in TUI).
   - `gitx.Changes` finds changes since last build (from state).
   - `wiki.Update` identifies affected documentation.
   - Regenerates only invalidated sections (similar to wiki generation but scoped to changes).

## Glossary
**Agent** — The component that interacts with the LLM and executes tools (e.g., file edits) under user approval.  
**Knowledge card** — A dense document generated for a repository module, containing facts, explanations, and context.  
**Wiki** — The collection of knowledge cards and structured documentation generated for a repository.  
**Module** — A logical part of the repository (defined in `modules.yaml`) for which knowledge is generated.  
**Skill** — A task guide that the agent can load to perform a specific task (stored in `.kaioken/skills/`).  
**Session** — A saved conversation history (stored in `.kaioken/sessions/`).  
**Tool** — A function the LLM can invoke (e.g., `read_file`, `edit_file`, `run_command`) that the agent executes.  
**Approval** — The user's confirmation required before the agent applies a state-changing tool (like editing a file).  
**Code map** — A parsed representation of a source file that exports symbols (functions, types, etc.) for context.  
**Scan** — The process of inventorying repository files (respecting config excludes).  
**Plan** — The output of the planning phase (`modules.yaml`) listing modules and their file paths.  
**State** — A record of the last wiki build (file hashes) used for incremental updates.  
**TUI** — The terminal user interface built with Bubble Tea.  
**LLM client** — The component that communicates with the language model provider (OpenRouter, OpenAI, etc.).  
**Provider** — The LLM service (e.g., OpenRouter, OpenAI, Groq) that kaioken connects to.  
**Composer** — The multi-line input area in the TUI where users type messages.  
**Palette** — The command palette in the TUI (opened with `/`) for executing slash-commands.  
**Progress** — A callback interface for reporting progress during long operations (used in wiki generation, etc.).

## Conventions
- **Error handling**: Functions return `error` as the last return value; callers check and handle errors (often propagating them up). The TUI displays errors in the status line or popups.
- **Configuration**: Global config lives in `$HOME/.config/kaioken/config.yaml`; per-repo config in `.kaioken/config.yaml`. Loaded via `config.Load(repo)` and `config.Global()`. The `Config` struct defines fields for excludes, model concurrency, etc.
- **Naming**: Packages use lowercase names matching directories. Interfaces use `-er` suffix (e.g., `UI`). Structs and methods use MixedCaps. Package-level constants use MixedCaps or ALL_CAPS.
- **Layering**: 
  - `cmd`: Entry point, orchestrates high-level commands.
  - `tui`: Handles UI and user interactions.
  - `agent`: Manages agent logic (tool execution, LLM interaction).
  - `wiki`, `plan`, `scan`, `skills`, `state`: Handle knowledge engine phases.
  - `llm`: Handles LLM provider communication.
  - `codemap`: Handles code parsing.
  - `gitx`: Handles Git operations.
  - Dependencies flow inward: high-level layers depend on lower-level layers, but not vice versa.
