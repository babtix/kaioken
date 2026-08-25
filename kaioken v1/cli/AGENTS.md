# AGENTS.md

Kaioken is a terminal-based AI coding assistant that combines an interactive chat agent with a knowledge engine. The single most important thing to know before editing is that the agent will not make any state-changing modifications (like editing files) without explicit user approval via the TUI.

## Commands
- `make test`: Run all unit tests (`go test ./... -count=1` to disable caching)
- `make vet`: Run Go static analysis
- `make lint`: Run golangci-lint if installed (skips if missing)
- `make check`: Run test and vet
- `make build`: Build binary (first `go build ./...`, then `go build -o kaioken.exe ./cmd/kaioken`)
- `make clean`: Remove `kaioken.exe` binary

## Architecture
- CLI entry point: `cmd/kaioken/main.go` defines commands (init, scan, plan, generate, wiki, update, export, models, status, skills, hook, serve)
- TUI: `internal/tui/tui.go` handles user input/output and forwards messages to agent
- Agent: `internal/agent/agent.go` processes user messages, invokes LLM with tools (e.g., read_file, edit_file), and manages approvals via UI
- Knowledge engine: `internal/wiki/wiki.go` generates documentation; invoked by `wiki`/`update` commands. `kaioken update` uses `gitx.Changes` to find changes since last build and updates affected documentation via `wiki.Update`
- Export: `internal/export/export.go` flattens generated cards/wiki/skills into CLAUDE.md, AGENTS.md, .cursorrules or CONTEXT.md (`kaioken export <target>`; no LLM calls)
- LLM client: `internal/llm/openrouter.go` handles provider communication (OpenRouter, etc.). On OpenRouter it requests usage accounting, so `Client.CostUSD` reports real spend; `internal/agent/budget.go` turns `budget: {warn_at, hard_stop}` (USD, in `.kaioken/config.yaml`) into session guardrails
- Dependencies flow inward: high-level (cmd, tui) → mid-level (agent, wiki, llm) → utilities (scan, plan, codemap, state, skills, serve, gitx); config is cross-cutting

## Conventions
- State-changing tools (edit_file, run_command, etc.) require explicit TUI approval before execution
- Configuration: global in `$HOME/.config/kaioken/config.yaml`, per-repo in `.kaioken/config.yaml` (per-repo overrides global)
- TUI command palette opened with `/` provides access to slash-commands (e.g., `/wiki`, `/update`)
- Error handling: functions return `error` as last value; callers must check and handle
- Naming: packages match directories; interfaces use `-er` suffix; structs/methods use MixedCaps

## Gotchas
- `.kaioken` directory (config, sessions, skills, generated wiki) is agent-managed; do not edit directly
- `kaioken.exe` is built from source; never commit—use `make build` to compile
- Wiki generation (`kaioken wiki` or `/wiki`) is resource-intensive (multiple LLM calls, high token usage)

<!-- kaioken:knowledge:start — generated, do not edit by hand -->

## Project knowledge (generated)

Kaioken maintains documentation for this repository under `.kaioken/`.
Read the relevant entry before exploring source files — it is faster, and it
carries decisions the code does not state. Source files remain ground truth:
if a document and the code disagree, the code wins.

- `.kaioken/architecture.md` — the canonical architecture brief and glossary. Use its vocabulary.

### Task guides (`.kaioken/skills/`)

Open the matching skill FIRST when starting one of these tasks:

- `add-a-cli-command` — Add a new command to the kaioken CLI. Load this skill when extending the command-line interface with new functionality.
- `add-a-skill` — Create a new skill file in the .kaioken/skills/ directory. Load this skill when you want to teach the agent a new task by defining a skill guide.
- `add-a-tui-command` — Add a new command to the TUI's command palette. Load this skill when you want to extend the interactive terminal interface with a new slash command.
- `build-the-binary` — Compile the kaioken executable. Load this skill after modifying source code to produce an updated binary.
- `generate-wiki-documentation` — Generate the wiki documentation for the repository. Load this skill after making changes to the source that should be reflected in the generated knowledge base.
- `lint-the-code` — Run golangci-lint to check for style issues and potential bugs. Load this skill as part of code quality checks.
- `run-the-test-suite` — Execute all unit tests for the project. Load this skill before committing changes or when verifying fixes.
- `update-dependencies` — Update Go dependencies to their latest versions and tidy the go.mod file. Load this skill when bringing in dependency updates.

### Wiki (`.kaioken/wiki/`)

- **Architecture Overview** — Chat Agent, Component Interactions and Data Flow, Dual Nature Chat Agent and Knowledge Engine, Knowledge Engine (Wiki System), Terminal User Interface (TUI)
- **Chat Agent** — Agent Core Loop and Session Handling, Knowledge Integration from the Wiki, LLM Interaction and Tool Invocation, Tool System Definition, Execution, and Approval Workflow
- **Code Mapping and Indexing** — Building the Repository Index, Bundling Code for LLM Context, Code Mapping Overview, Generating Code Skeletons, Parsing Individual Files
- **Configuration** — Behavior Toggles and Advanced Settings, Configuration Layers and Precedence, Configuration Structure and Key Settings, Managing LLM Providers and Models, Token Budgets and Concurrency, Viewing and Editing Configuration
- **Development Guide** — Building the Project, Linting and Code Quality, Making Changes and Contributing, Running Tests, Setting up the Development Environment, Understanding the Repository Structure
- **Getting Started** — Basic CLI Commands Overview, Building the Binary, Initializing a Repository, Installation, Serving the Generated Wiki, Using the Terminal User Interface (TUI)
- **Git Integration** — Automatic Update Hooks, Detecting Changes Since Last Build, Generating Diff Patches and Previews, Git Repository Detection and Basics, Viewing Commit History
- **Knowledge Engine** — Incremental Wiki Updates, Knowledge Card Generation and Refinement, Module Planning, Repository Scanning, State Management for Incremental Updates, Wiki Outline Planning
- **LLM Provider Integration** — Client Configuration and Provider Support, Error Handling and Retry Logic, Streaming Responses, Token Budget Management, Tool Use and Function Calling
- **Serving the Generated Wiki** — Rendering and Navigating Documentation, Searching the Wiki, Server Routing and Request Handling, Starting the Wiki Server
- **Skills System** — Skill Generation, Skill Refreshing and Invalidation, Skill Storage, Loading, and Indexing, Skill Structure and Format
- **Terminal User Interface (TUI)** — Approval Workflow, Built-in Tutorial, Command Palette, Keybindings and Input Handling, Markdown Rendering, Session Management, Status Line and Footer, TUI Structure and Main Loop

### Knowledge cards (`.kaioken/knowledge/`)

Dense per-module cards for: kaioken

Refresh after significant changes with `kaioken update`.

<!-- kaioken:knowledge:end -->
