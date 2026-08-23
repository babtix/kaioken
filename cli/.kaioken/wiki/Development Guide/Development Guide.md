# Development Guide

## Table of Contents
- [Setting up the Development Environment](#setting-up-the-development-environment)
- [Building the Project](#building-the-project)
- [Running Tests](#running-tests)
- [Linting the Codebase](#linting-the-codebase)
- [Understanding the Codebase Structure](#understanding-the-codebase-structure)
- [Making Changes](#making-changes)
- [Referenced Files](#referenced-files)

## Setting up the Development Environment
Kaioken requires Go 1.26 or later. Dependencies are managed via Go modules as specified in `go.mod`.

`go.mod:1-2`
```go
module kaioken

go 1.26
```

To initialize the development environment:
1. Ensure Go 1.26+ is installed
2. Run `go mod download` to fetch dependencies
3. The project uses standard Go tooling (test, vet, build) with optional `golangci-lint` for linting
4. The repository pins LF line endings via `.gitattributes`; make sure your editor and Git settings do not rewrite them (on Windows, prefer `core.autocrlf=input` or disable CRLF conversion) so checkouts stay byte-stable

## Building the Project
The Makefile provides build targets. The primary build command compiles all packages and creates the executable.

`Makefile:19-22`
```makefile
## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```

- `go build ./...` builds all packages in the module
- `go build -o kaioken.exe ./cmd/kaioken` creates the platform-specific executable (`.exe` suffix is handled in clean target for cross-platform compatibility)
- Run `make build` to execute these commands

## Running Tests
Unit tests are located alongside source files. The test target runs all tests in the module with caching disabled.

`Makefile:3-5`
```makefile
## test: run all unit tests
test:
	go test ./... -count=1
```

- Execute with `make test` or `go test ./... -count=1`
- Tests should pass before submitting changes
- CI runs the full Go suite with the race detector enabled; mirror that locally with `go test ./... -race -count=1`, especially when touching concurrent code paths (checkpointed research runs, singleflight-guarded caches, background workers)
- The `check` target combines testing and static analysis
- The `vet` target runs `go vet ./...` for static analysis

## Linting the Codebase
Linting enforces code style and catches potential issues using `golangci-lint` if installed.

`Makefile:10-14`
```makefile
## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...
```

- The target first checks for `golangci-lint` availability
- If found, runs `golangci-lint run ./...` across the entire module
- If not installed, prints a message and exits successfully (does not block development)
- Install via `go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest`

## Understanding the Codebase Structure
Kaioken follows a layered architecture where high-level components depend on lower-level utilities. The structure aligns with the authoritative overview:

```
cmd/kaioken/main.go        → Entry point (CLI commands)
cmd/webnews/main.go        → Entry point for the serverless news site
cmd/desktop/main.go        → Entry point for the desktop application
cmd/website/main.go        → Entry point for the website app
internal/tui/tui.go        → Terminal UI (Bubble Tea)
internal/agent/agent.go    → Chat agent (LLM interaction, tool execution)
internal/wiki/wiki.go      → Knowledge engine (documentation generation)
internal/llm/openrouter.go → LLM provider integration
internal/skills/skills.go  → Task guides (skills system)
internal/scan/scan.go      → Repository file inventory
internal/plan/plan.go      → Module planning (modules.yaml)
internal/codemap/codemap.go→ Source code parsing/symbol indexing
internal/retrieval/…       → Retrieval primitives (chunker, variants, grader, lexical ranking)
internal/session/session.go→ Chat session persistence
internal/state/state.go    → Wiki build state tracking
internal/serve/serve.go    → Wiki HTTP server
internal/gitx/gitx.go      → Git integration (hooks, diffs)
internal/config/config.go  → Configuration management
```

Key dependency flow:
- `cmd` and `tui` depend on all internal packages
- `agent` depends on `llm`, `config`, `codemap`, `scan`, `session`, `skills`, `wiki`, `state`
- `wiki` depends on `scan`, `plan`, `llm`, `config`, `codemap`, `state`, `gitx`, `skills`
- Utilities (`scan`, `plan`, `codemap`, `state`, `skills`, `serve`, `gitx`, `retrieval`) have minimal internal dependencies
- `config` is a cross-cutting dependency used throughout

Conventions to note:
- Error handling: Functions return `error` as last value; callers check and handle
- [Configuration](../Configuration/Configuration.md): Global (`$HOME/.config/kaioken/config.yaml`) and per-repo (`.kaioken/config.yaml`)
- Naming: Packages lowercase; interfaces `-er` suffix; structs MixedCaps
- Layering: Dependencies flow inward (high-level → low-level), never upward
- Line endings: `.gitattributes` enforces LF across the repository; do not introduce CRLF — tooling and the agent's edit pipeline rely on stable, byte-predictable line endings

## Making Changes
Follow these workflows when contributing:

1. **Create a feature branch** from `main`
2. **Make changes** adhering to:
   - [Codebase structure](#understanding-the-codebase-structure)
   - [Conventions](#understanding-the-codebase-structure) (error handling, naming, layering, line endings)
   - [Configuration](../Configuration/Configuration.md) patterns in `internal/config/config.go`
3. **Verify changes** locally:
   ```bash
   make check                        # Runs test + vet
   make lint                         # If golangci-lint is installed
   go test ./... -race -count=1      # Matches CI's race-detector run
   ```
4. **Update documentation** if needed (knowledge engine flows in `internal/wiki/`)
5. **Submit pull request** with clear description of changes

Important considerations:
- The TUI (`internal/tui/tui.go`) handles user input and orchestrates interactions
- Agent tool execution (`internal/agent/agent.go`) requires user approval for state changes and has been enhanced with improved permissions, context tracking, and directory notes; file edits preserve line endings outside the edited span byte-for-byte, so keep sources normalized to LF
- Wiki generation (`internal/wiki/wiki.go`) follows scan → plan → generate → update flow
- Git operations (`internal/gitx/gitx.go`) respect `.gitignore` patterns, which have been updated to ignore local dev and session artifacts
- Configuration changes should work with both global and per-repo configs
- The LLM provider integration now supports multiple providers (e.g., OpenRouter, OpenAI) and local models, with per-operation model-role resolution (see `internal/config/config.go`)
- The TUI includes a workspace explorer for navigating the repository structure and has been enhanced with research mode UI and other improvements.
- Research mode has been added for deep research capabilities.
- MCP server support has been added for model context protocol integration.
- The knowledge engine maintains a persistent repo knowledge base to support incremental updates
- The CLI has been extended with new endpoints for browser proxy, file-write, git write operations, per-file diff, git worktree helpers for isolated sub-agent checkouts, and hybrid research engine features including supervisor, router, and PDF exporter, as well as new commands such as hub, watch, verify, impact, handoff, gitdraft, onboard, pack, and publish (see `cmd/kaioken/main.go` for details)

## Referenced Files
- `go.mod` - Dependency declarations and Go version
- `Makefile` - Build, test, lint, and clean commands
- `.gitattributes` - Repository-wide LF line-ending policy

These files were referenced in this guide:
```
go.mod
Makefile
.gitattributes
```

<!-- kaioken:files Makefile,go.mod -->
