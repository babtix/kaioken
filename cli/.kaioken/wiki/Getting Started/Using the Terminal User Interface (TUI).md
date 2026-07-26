# Getting Started with kaioken

This chapter explains how to install, build, and run kaioken for the first time, including basic usage of the TUI and CLI commands.

## Table of Contents
- [Installation](#installation)
- [Building from Source](#building-from-source)
- [Launching the TUI](#launching-the-tui)
- [Navigating the Interface](#navigating-the-interface)
- [Starting a Chat Session](#starting-a-chat-session)
- [Slash Commands Reference](#slash-commands-reference)
- [Referenced Files](#referenced-files)

## Installation

You can install kaioken by downloading a pre-built binary from the releases page or by building from source.

## Building from Source

To build kaioken from source:

1. Ensure you have [Go](https://golang.org/dl/) installed (version 1.20 or later recommended).
2. Obtain the source code (e.g., by cloning the repository).
3. From the root of the repository, build the executable:
   ```bash
   go build -o kaioken ./cli
   ```
4. The resulting `kaioken` binary can be moved to a directory in your `PATH` for easy access.

## Launching the TUI

The TUI is launched by running the `kaioken` command without arguments, which starts the interactive terminal interface for the current repository. To specify a different repository, use the `-repo` flag:

```powershell
kaioken            # launches TUI for current directory
kaioken -repo path/to/repo   # launches TUI for specified repository
```

The TUI initializes by loading repository configuration, session history, and any existing knowledge artifacts (wiki, skills) from the `.kaioken` directory.

## Navigating the Interface

The TUI consists of three main areas:
1. **Chat Display** (top): Shows conversation history with markdown rendering, syntax highlighting, and diff previews for proposed changes
2. **Composer** (bottom): Multi-line input area where users type messages
3. **Status Line** (between composer and chat): Displays context information (current repo, model, token usage) and temporary notifications

Key navigation features:
- **Multi-line input**: Press `Alt+Enter` (or `Ctrl+J`) in the composer to insert a newline without submitting the message
- **Command palette**: Type `/` to open the slash-command interface; navigate with arrow keys and press `Enter` to execute
- **Session persistence**: Conversations are automatically saved per repository in `.kaioken/sessions/` and can be resumed later
- **Progress reporting**: Long operations (wiki generation, skill building) show live progress bars in the status line without freezing the UI; `Ctrl+C` cancels in-flight operations

## Starting a Chat Session

To begin chatting with the agent:
1. Type your message or question in the composer at the bottom of the screen
2. Press `Enter` to submit the message
3. The agent processes your request and streams the response token-by-token into the chat display
4. If the agent invokes a tool that modifies files (e.g., `edit_file`), it presents a diff preview for approval:

```
● proposed edit: path/to/file.go
- 	original line
+ 	modified line
apply edit → path/to/file.go ?   [y] yes   [n] no
```

Press `y` to approve and apply the change, or `n` to decline. Declined actions never touch the disk. All file operations are confined to the repository root (no `..` path escapes).

The agent is knowledge-aware: when a repository has generated documentation (via `/wiki` or `/cards`), the system prompt automatically references available knowledge cards and enables the `read_knowledge` tool to retrieve relevant context without re-reading source files.

## Slash Commands Reference

All TUI functionality is accessed via slash-commands. Type `/` to open the command palette, then select or type a command.

| Command | Description |
|---------|-------------|
| `/wiki [xN] [force]` | Generate deep wiki documentation (default depth ×3); `xN` specifies depth multiplier, `force` rebuilds all sections |
| `/wiki retry` | Regenerate only sections that failed in the last run |
| `/skills [force|name]` | Build task guides (skills) for the agent; `force` rebuilds all, `name` builds specific skill |
| `/skills list` | Show inventory of generated skills |
| `/update [<base-rev>]` | Perform incremental wiki update against specified baseline (default: last recorded commit) |
| `/serve [port]` | Serve generated wiki via local HTTP server (default port 7777); use `/serve stop` to terminate |
| `/hook [install\|remove]` | Install/remove Git post-commit hook for automatic wiki updates |
| `/sessions` | List saved chat sessions |
| `/resume [id]` | Resume chat session by ID (or most recent if ID omitted) |
| `/new` | Start fresh session (saves current session first) |
| `/scan` | Scan repository and print file inventory (respecting config excludes) |
| `/plan` | Generate proposed `modules.yaml` for knowledge engine planning phase |
| `/cards [force\|id]` | Generate knowledge cards for modules; `force` rebuilds all, `id` builds specific module |
| `/status` | Show freshness status of all knowledge modules |
| `/models [filter]` | List available LLM models (optional filter for provider-specific models) |
| `/model <id>` | Set active generation model |
| `/provider <name>` | Switch API provider (e.g., openrouter, openai, groq) |
| `/key [value]` | Set API key in-memory (blank value triggers secure prompt) |
| `/repo <path>` | Change active repository context |
| `/notes [add <t>\|clear]` | View/edit steering notes injected into LLM prompts |
| `/undo` | Revert last agent action |
| `/diff` | Show pending file changes from current session |
| `/cost` | Display token usage and estimated cost for current session |
| `/compact` | Condense session history to reduce context length |
| `/copy` | Copy last agent response to clipboard |
| `/config` | View/edit configuration settings |
| `/init` | Initialize `.kaioken` directory and config files |
| `/clear` | Clear chat display |
| `/help` | Show interactive help overlay |
| `/quit` | Exit TUI application |

## Referenced Files
- README.md
