# Getting Started

## Introduction
Kaioken is a terminal-based AI coding assistant that combines an interactive chat agent with a knowledge engine. This chapter guides new users through installing, building, and running kaioken for the first time, covering both the Command Line Interface (CLI) and [Terminal User Interface (TUI)](../Terminal User Interface (TUI)/Terminal User Interface (TUI).md).

## Table of Contents
- [Prerequisites](#prerequisites)
- [Obtaining the Source Code](#obtaining-the-source-code)
- [Building the Binary](#building-the-binary)
- [Setting Up the Environment](#setting-up-the-environment)
- [Initializing a Repository](#initializing-a-repository)
- [Basic CLI Workflow](#basic-cli-workflow)
- [Using the Terminal User Interface (TUI)](#using-the-terminal-user-interface-tui)
- [Common CLI Commands](#common-cli-commands)
- [Next Steps](#next-steps)

## Prerequisites
- Go 1.24 or later (specified in `go.mod`)
- An API key for an LLM provider (OpenRouter is the default; obtain one at https://openrouter.ai/keys)

## Obtaining the Source Code
If you don't already have the source code, clone the repository:
```bash
git clone https://github.com/yourusername/kaioken.git
cd kaioken
```

## Building the Binary
Build the kaioken executable using the Go toolchain:
```bash
go build -o kaioken ./cli/cmd/kaioken
```
Alternatively, use the provided Makefile:
```bash
make -C cli build
```
This produces an executable named `kaioken` (or `kaioken.exe` on Windows). The Makefile also provides additional development targets:
- `test`: run unit tests
- `vet`: run go vet static analysis
- `lint`: run golangci-lint (if installed)
- `check`: run test and vet
- `clean`: remove build artifacts

## Setting Up the Environment
Set your LLM provider API key as an environment variable. For OpenRouter:
```bash
# Unix-like systems
export OPENROUTER_API_KEY="sk-or-..."

# Windows CMD
set OPENROUTER_API_KEY=sk-or-...

# Windows PowerShell
$env:OPENROUTER_API_KEY="sk-or-..."
```
Kaioken also supports other providers (OpenAI, Groq, etc.) via configuration in `.kaioken/config.yaml`.

## Initializing a Repository
Navigate to the repository you want to analyze and run:
```bash
kaioken init
```
This creates `.kaioken/config.yaml` in the repository root. Review this file to set your preferred model and any steering notes. Example output:
```
created .kaioken/config.yaml
next: set OPENROUTER_API_KEY, review the config, then run `kaioken plan`
```

## Basic CLI Workflow
The typical steps to generate knowledge for a repository are:

1. **Scan** the repository to see what files will be considered:
   ```bash
   kaioken scan
   ```
   Output includes a file inventory and summary statistics.

2. **Plan** the modules (using an LLM to split the repo into logical parts):
   ```bash
   kaioken plan
   ```
   This creates `.kaioken/modules.yaml`. Review and edit this file to adjust module boundaries if needed.

3. **Generate** knowledge cards for all modules:
   ```bash
   kaioken generate
   ```
   Output shows progress per module and a final summary.

4. Check the **status** of modules to see which are up-to-date:
   ```bash
   kaioken status
   ```
   Output indicates freshness (up-to-date, Δ missing).

5. Generate the full **wiki** (deep multi-pass documentation):
   ```bash
   kaioken wiki
   ```
   By default, this runs with a `x3` coverage multiplier (use `x1` for faster iteration, `x4` for critique-and-revise cycles). Output includes estimated run time and progress.

6. After making code changes, update the wiki incrementally:
   ```bash
   kaioken update
   ```
   Output shows the number of updated documents and changed files.

## Using the Terminal User Interface (TUI)
The TUI provides an interactive way to use kaioken. Launch it by running:
```bash
kaioken
```
or explicitly:
```bash
kaioken tui
```
In the TUI:
- Chat with the LLM agent to perform coding tasks (file edits, command execution, etc.)
- Access slash-commands by typing `/` to open the command palette (e.g., `/wiki`, `/plan`, `/skills`)
- View saved sessions with `/sessions` and `/resume`
- Browse the generated wiki in a browser with `/serve`
- Install automatic post-commit updates with `/hook install`
- The TUI streams progress live during long operations and never freezes the UI

## Common CLI Commands
Here is a reference of the available CLI commands:

| Command | Description |
|---------|-------------|
| `init` | Create `.kaioken/config.yaml` in the target repo |
| `scan` | Scan the repo and print an inventory summary |
| `plan` | Propose a module tree with the LLM → `.kaioken/modules.yaml` (editable) |
| `generate` | Generate knowledge cards for all modules (skips unchanged ones) |
| `status` | Show module freshness (changed / up-to-date / missing) |
| `models` | List provider models (optional filter argument) |
| `wiki` | Deep multi-pass wiki (positional arg: x1..x10 multiplier) |
| `update` | Incremental wiki refresh: git-diff the repo against the commit the wiki was generated from and revise only the affected documents |
| `skills` | Build task-oriented skills an AI agent loads while working in the repo (positional: "list", or a skill name; -force to rewrite) |
| `serve` | Browse the generated wiki in a browser (-port, default 7777) |
| `hook` | Manage the post-commit auto-update hook (install|remove|status) |
| `tui` | Launch the interactive terminal UI (also the default with no args) |
| `daemon` | Serve the engine over a loopback HTTP API (used by Kaioken Desktop) |
| `logo` | Print the KAIOKEN wordmark |
| `version` | Print the version |
| `help` | Print usage information |

Note: The `tui` command is the default when no command is given.

## Next Steps
- Explore the TUI and try chatting with the agent to edit files or run commands
- Experiment with different wiki depths (e.g., `kaioken wiki x2` for faster iteration, `kaioken wiki x4` for critique-and-revise cycles)
- Learn about the skills system to generate task guides for common development workflows
- Set up the post-commit hook (`kaioken hook install`) to keep your wiki up-to-date automatically
- Serve the generated wiki in a browser (`kaioken serve`) for easy navigation and searching

## Referenced Files
- cli/cmd/kaioken/main.go
- README.md
- cli/go.mod
- cli/Makefile

<!-- kaioken:files Makefile,go.mod,cmd/kaioken/main.go -->
