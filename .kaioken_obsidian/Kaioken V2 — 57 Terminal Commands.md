---
title: Kaioken V2 — 57 Terminal Commands Reference & Test Checklist
created: 2026-08-30
type: reference-checklist
tags:
  - kaioken
  - v2
  - terminal
  - tui
  - slash-commands
  - testing
---

# Kaioken V2 == 57 Terminal Commands Reference & Test Checklist

> [!NOTE] Companion Notes
> - **Thesis & Architecture**: [[Kaioken]]
> - **Build & Phase Plan**: [[Kaioken — Build Reference]]
> - **CLI Commands Test Checklist**: [[Kaioken V2 — Command Test Checklist]]

The Kaioken Terminal User Interface (`kaioken-tui`) features an extensive slash-command engine with **exactly 57 built-in terminal commands**. 

This document serves as both the **complete reference manual** and an **interactive verification checklist** to test every command inside the terminal environment.

---

## 0. Quick Start & Terminal Launch

Launch the interactive terminal shell:
```bash
cd d:\project\ai_now_know\kaioken_v2
npm run build
node apps/tui/dist/bin.js
```
*(Or if globally linked: `kaioken-tui`)*

In the terminal prompt, type `/` to open the autocomplete palette, or type any command directly.

---

## 1. Master 57 Commands Table

| # | Command | Aliases | Arguments | Category | Summary |
|---|---|---|---|---|---|
| 1 | `/help` | `/h`, `/?` | — | System & Help | Show all commands |
| 2 | `/research` | — | `[xN] <question>` | Knowledge & Web | Deep web search with a cited report |
| 3 | `/wiki` | — | `[xN] [force\|update\|retry]` | Knowledge Engine | Deep multi-pass wiki |
| 4 | `/mode` | — | `[build\|plan\|general\|explore\|review\|prism]` | Model & Agent | Switch the agent's permission mode |
| 5 | `/model` | — | `[id\|list]` | Model & Engine | Pick a model (no id = interactive picker) |
| 6 | `/models` | — | `[filter]` | Model & Engine | List the provider's models |
| 7 | `/new` | `/reset` | — | Conversation | Start a fresh session (current one is saved) |
| 8 | `/clear` | `/cls` | — | System & UI | Clear the screen |
| 9 | `/undo` | — | — | Safety & Git | Revert the last file write/edit |
| 10 | `/diff` | — | — | Safety & Git | Show git diff for the working tree |
| 11 | `/compact` | — | — | Conversation | Summarize the conversation to free context |
| 12 | `/cost` | `/usage` | — | Model & Engine | Token usage and spend for the active model |
| 13 | `/sessions` | — | — | Conversation | List saved conversations |
| 14 | `/resume` | — | `[id]` | Conversation | Reopen a saved conversation (no id = picker) |
| 15 | `/key` | — | `[value]` | Model & Engine | Set the API key (blank = hidden prompt) |
| 16 | `/yolo` | — | — | Model & Agent | Toggle auto-approve for edits and commands |
| 17 | `/thinking` | — | `[off\|low\|medium\|high]` | Model & Engine | Set the model's reasoning depth |
| 18 | `/stop` | — | — | Conversation | Stop the running task |
| 19 | `/queue` | — | `[clear]` | Conversation | Show or clear queued steering messages |
| 20 | `/btw` | — | `<text>` | Conversation | Tell the agent something without asking for a reply |
| 21 | `/switch` | — | `[id]` | Conversation | Save this session and open another |
| 22 | `/update` | — | `[base-rev]` | Knowledge Engine | Git-diff refresh of the wiki and skills |
| 23 | `/skills` | `/skill` | `[force\|list]` | Knowledge Engine | Build task guides for agents |
| 24 | `/impact` | `/imp` | `<description>` | Grounding & Blast | Predict what a change would touch |
| 25 | `/provider` | — | `[name\|list]` | Model & Engine | Switch API provider (no arg = list all) |
| 26 | `/fetcher` | — | `[api\|local] [on\|off]` | Knowledge & Web | Choose what reads the pages research finds |
| 27 | `/config` | — | — | System & Config | Show the active configuration |
| 28 | `/prism` | — | `[subcommand]` | RAG & Docs | Retrieve over documents you import, grouped into modules |
| 29 | `/session` | — | — | Conversation | Stats for the current session |
| 30 | `/notes` | — | `[add <text>\|clear]` | Steering & Memory | Steering notes injected into prompts |
| 31 | `/fork` | — | `[turns]` | Conversation | Rewind the conversation to retry a different way |
| 32 | `/tree` | — | `[n [summarize]]` | Conversation | List conversation branches and switch between them |
| 33 | `/verify` | — | — | Verification Gate | Run the repo's build/test gate |
| 34 | `/init` | — | `[force]` | Repository Setup | Full first-run setup: config, scan, AGENTS.md |
| 35 | `/draft` | — | `[base]` | Safety & Git | Draft the commit message + PR description |
| 36 | `/import` | — | `<path>` | Conversation | Bring an external transcript in as a new session |
| 37 | `/templates` | `/template` | — | Extensibility | List prompt templates (`/t:<name>` runs one) |
| 38 | `/ext` | `/extension`, `/extensions` | `[subcommand]` | Extensibility | Manage community extensions |
| 39 | `/x` | — | `[ext command [args]]` | Extensibility | Run a command a wasm extension contributed |
| 40 | `/theme` | — | `[default\|light\|highcontrast]` | System & UI | Switch the colour palette |
| 41 | `/repo` | — | `<path>` | System & Nav | Point at a different repository |
| 42 | `/learn` | — | — | Steering & Memory | Distill this session into a skill |
| 43 | `/handoff` | — | — | Steering & Memory | Write a continuation briefing for this session |
| 44 | `/copy` | — | — | System & UI | Copy the last reply to the clipboard |
| 45 | `/hook` | — | `[install\|remove]` | Safety & Git | Auto-update the wiki after each commit |
| 46 | `/serve` | — | `[port]` | Knowledge Engine | Browse the wiki in a browser |
| 47 | `/tutorial` | — | `[chapter\|command]` | Help & Manual | Guided walkthrough of every command |
| 48 | `/explain` | — | `[command]` | Help & Manual | In-depth reference for every command |
| 49 | `/publish` | — | — | Knowledge Engine | Render the wiki as a static site |
| 50 | `/onboard` | — | — | Grounding & Docs | Write the day-one ONBOARDING.md |
| 51 | `/scan` | — | — | Knowledge Substrate| Scan the repo and print an inventory |
| 52 | `/plan` | — | — | Knowledge Engine | Propose modules.yaml with the LLM |
| 53 | `/cards` | `/generate`, `/gen` | `[force\|id]` | Knowledge Engine | Generate knowledge cards |
| 54 | `/status` | — | — | Knowledge Engine | Per-module freshness |
| 55 | `/graph` | — | — | Knowledge Engine | Derive the knowledge graph |
| 56 | `/version` | `/v` | — | System & Help | Print the Kaioken version |
| 57 | `/quit` | `/exit`, `/q` | — | System & Help | Exit Kaioken |

---

## 2. Command Details & Testing Checklist

### Group A: Conversation & Session Control (11 Commands)

#### 1. `/new` (alias `/reset`)
- [x] Test command: ✅ 2026-08-30
  ```bash
  /new
  ```
  - **Summary**: Start a fresh session (current one is saved).
  - **Behavior**: Wipes current message context, assigns a fresh conversation ID, and persists old session to `.kaioken/sessions/`.

#### 2. `/clear` (alias `/cls`)
- [x] Test command: ✅ 2026-08-30
  ```bash
  /clear
  ```
  - **Summary**: Clear the screen.
  - **Behavior**: Clears visible terminal transcript only. Context remains active for the model.

#### 3. `/stop`
- [ ] Test command:
  ```bash
  /stop
  ```
  - **Summary**: Stop the running task.
  - **Behavior**: Immediately aborts an in-flight LLM call, research run, or compaction (equivalent to `Esc` or `Ctrl+C`). Retains streamed partial output.

#### 4. `/queue`
- [ ] Test command:
  ```bash
  /queue
  /queue clear
  ```
  - **Summary**: Show or clear queued steering messages.
  - **Behavior**: Messages typed while the agent is running are queued for the next step. `/queue` displays pending items; `/queue clear` flushes them.

#### 5. `/btw <text>`
- [ ] Test command:
  ```bash
  /btw staging server is offline, skip integration tests
  ```
  - **Summary**: Tell the agent something without asking for a reply.
  - **Behavior**: Drops context into the session history without triggering an LLM generation or consuming output tokens until the next question.

#### 6. `/fork [turns]`
- [ ] Test command:
  ```bash
  /fork
  /fork 2
  ```
  - **Summary**: Rewind the conversation to retry a different way.
  - **Behavior**: Rewinds the current branch by $N$ turns without deleting history; the next prompt starts an alternative branch.

#### 7. `/tree [n [summarize]]`
- [ ] Test command:
  ```bash
  /tree
  /tree 1
  /tree 1 summarize
  ```
  - **Summary**: List conversation branches and switch between them.
  - **Behavior**: Visualizes session branch tips. `summarize` briefs the model on lessons learned in the abandoned branch.

#### 8. `/sessions`
- [ ] Test command:
  ```bash
  /sessions
  ```
  - **Summary**: List saved conversations.
  - **Behavior**: Scans `.kaioken/sessions/` and renders a table of sessions sorted newest first with turn counts and timestamps.

#### 9. `/resume [id]`
- [ ] Test command:
  ```bash
  /resume
  /resume <session-id>
  ```
  - **Summary**: Reopen a saved conversation (no id = picker).
  - **Behavior**: Restores message history and replays the transcript to current state.

#### 10. `/switch [id]`
- [ ] Test command:
  ```bash
  /switch
  /switch <session-id>
  ```
  - **Summary**: Save this session and open another.
  - **Behavior**: Saves current conversation, queries extension hooks for clearance, and switches to target session.

#### 11. `/session`
- [ ] Test command:
  ```bash
  /session
  ```
  - **Summary**: Stats for the current session.
  - **Behavior**: Displays active session ID, model, token usage, turn count, cost, and branch lineage.

---

### Group B: Knowledge Engine, Documentation & Web (11 Commands)

#### 12. `/scan`
- [ ] Test command:
  ```bash
  /scan
  ```
  - **Summary**: Scan the repo and print an inventory.
  - **Behavior**: Traverses tree applying `.gitignore` and scope rules; prints file counts, total size, and risk flags.

#### 13. `/plan`
- [ ] Test command:
  ```bash
  /plan
  ```
  - **Summary**: Propose modules.yaml with the LLM.
  - **Behavior**: Analyzes repository structure and writes `.kaioken/module-plan.yaml` for human editing.

#### 14. `/cards [force|id]` (aliases `/generate`, `/gen`)
- [ ] Test command:
  ```bash
  /cards
  /cards force
  /cards <module-id>
  ```
  - **Summary**: Generate knowledge cards.
  - **Behavior**: Produces structured JSON summaries in `.kaioken/cards/` verified against the symbol oracle.

#### 15. `/wiki [xN] [force|update|retry]`
- [ ] Test command:
  ```bash
  /wiki
  /wiki x1
  /wiki x5
  /wiki retry
  /wiki update
  ```
  - **Summary**: Deep multi-pass wiki.
  - **Behavior**: Executes global outline $\rightarrow$ section planning $\rightarrow$ chapter generation $\rightarrow$ claim verification cascade.

#### 16. `/status`
- [ ] Test command:
  ```bash
  /status
  ```
  - **Summary**: Per-module freshness.
  - **Behavior**: Compares recorded source hashes with fresh working tree state; reports fresh, stale, and orphaned documents.

#### 17. `/update [base-rev]`
- [ ] Test command:
  ```bash
  /update
  /update HEAD~3
  ```
  - **Summary**: Git-diff refresh of the wiki and skills.
  - **Behavior**: Determines exactly which documents were invalidated by recent code changes and regenerates only those files.

#### 18. `/research [xN] <question>`
- [ ] Test command:
  ```bash
  /research x2 What are the breaking changes in TypeScript 5.7?
  ```
  - **Summary**: Deep web search with a cited report.
  - **Behavior**: Searches web, fetches and sanitises pages, numbers citations `[N]`, and adversarially verifies claims before saving to `.kaioken/research/`.

#### 19. `/fetcher [api|local] [on|off]`
- [ ] Test command:
  ```bash
  /fetcher
  /fetcher api off
  /fetcher local on
  ```
  - **Summary**: Choose what reads the pages research finds.
  - **Behavior**: Configures Firecrawl API reader vs local headless browser reader for SPA/JavaScript rendering.

#### 20. `/graph`
- [ ] Test command:
  ```bash
  /graph
  ```
  - **Summary**: Derive the knowledge graph.
  - **Behavior**: Reconstructs `contains`, `links`, and `source` edges without model calls; updates `.kaioken/graph.json`.

#### 21. `/serve [port]`
- [ ] Test command:
  ```bash
  /serve
  /serve 8080
  /serve stop
  ```
  - **Summary**: Browse the wiki in a browser.
  - **Behavior**: Spawns local HTTP server on `127.0.0.1:<port>` with search and graph rendering while terminal chat continues running.

#### 22. `/publish`
- [ ] Test command:
  ```bash
  /publish
  ```
  - **Summary**: Render the wiki as a static site.
  - **Behavior**: Compiles `.kaioken/wiki/` into standalone static HTML files under `.kaioken/site/` suitable for GitHub Pages.

---

### Group C: Grounding, Blast Radius & Verification (4 Commands)

#### 23. `/verify`
- [ ] Test command:
  ```bash
  /verify
  ```
  - **Summary**: Run the repo's build/test gate.
  - **Behavior**: Discovers repository's test and build scripts (`package.json`, `Makefile`, `Cargo.toml`) and runs them, printing pass/fail status.

#### 24. `/impact <description>` (alias `/imp`)
- [ ] Test command:
  ```bash
  /impact rename runScan to executeScan
  ```
  - **Summary**: Predict what a change would touch.
  - **Behavior**: Maps blast radius: affected files, callers, declarations, wiki chapters, and tests needing re-run.

#### 25. `/skills [force|list]` (alias `/skill`)
- [ ] Test command:
  ```bash
  /skills list
  /skills
  /skills force
  ```
  - **Summary**: Build task guides for agents.
  - **Behavior**: Generates `.kaioken/skills/<task>/SKILL.md` documents containing executable step-by-step procedures.

#### 26. `/onboard`
- [ ] Test command:
  ```bash
  /onboard
  /onboard force
  ```
  - **Summary**: Write the day-one ONBOARDING.md.
  - **Behavior**: Compiles root `ONBOARDING.md` from scan inventory, module cards, and wiki overview without calling any LLM.

---

### Group D: PRISM Document Intelligence & RAG (1 Command)

#### 27. `/prism [subcommand]`
- [ ] Test commands:
  ```bash
  /prism
  /prism use contract-docs
  /prism import ./docs
  /prism docs
  /prism set utility_model openai/gpt-4o-mini
  /prism set mode agent
  /prism what does clause 4.2 require?
  ```
  - **Summary**: Retrieve over documents you import, grouped into modules.
  - **Behavior**: Hybrid BM25 + Vector retrieval over imported reference material with relevance gate filters (`sourced`, `UNGRADED`, `DEGRADED`).

---

### Group E: Safety, Git & File Control (4 Commands)

#### 28. `/undo`
- [ ] Test command:
  ```bash
  /undo
  ```
  - **Summary**: Revert the last file write/edit.
  - **Behavior**: Reverts the agent's most recent file modification using pre-edit file snapshot; deletes newly created files.

#### 29. `/diff`
- [ ] Test command:
  ```bash
  /diff
  ```
  - **Summary**: Show git diff for the working tree.
  - **Behavior**: Executes `git diff` inside the repo and renders a color-highlighted diff in the terminal.

#### 30. `/draft [base]`
- [ ] Test command:
  ```bash
  /draft
  /draft HEAD~1
  ```
  - **Summary**: Draft the commit message + PR description.
  - **Behavior**: Inspects working tree diff and commit history conventions to write a conventional commit message and PR summary.

#### 31. `/hook [install|remove]`
- [ ] Test command:
  ```bash
  /hook
  /hook install
  /hook remove
  ```
  - **Summary**: Auto-update the wiki after each commit.
  - **Behavior**: Installs a Git `post-commit` hook that triggers `kaioken update` in the background.

---

### Group F: Model, Reasoning, Budget & Providers (7 Commands)

#### 32. `/mode [mode]`
- [ ] Test commands:
  ```bash
  /mode
  /mode plan
  /mode explore
  /mode review
  /mode prism
  /mode build
  ```
  - **Summary**: Switch the agent's permission mode.
  - **Behavior**: Restricts or unlocks write tools. Mid-conversation switches inform the model dynamically.

#### 33. `/model [id|list]`
- [ ] Test commands:
  ```bash
  /model
  /model openrouter/anthropic/claude-3.7-sonnet
  /model anthropic/claude-3.7-sonnet
  ```
  - **Summary**: Pick a model (no id = interactive picker).
  - **Behavior**: Sets active model and saves to `.kaioken/model.json`.

#### 34. `/models [filter]`
- [ ] Test commands:
  ```bash
  /models
  /models sonnet
  ```
  - **Summary**: List the provider's models.
  - **Behavior**: Prints model catalog for the active provider with active model highlighted.

#### 35. `/thinking [off|low|medium|high]`
- [ ] Test commands:
  ```bash
  /thinking
  /thinking high
  /thinking off
  ```
  - **Summary**: Set the model's reasoning depth.
  - **Behavior**: Controls reasoning token budget for supported models (OpenAI, Anthropic, OpenRouter).

#### 36. `/cost` (alias `/usage`)
- [ ] Test command:
  ```bash
  /cost
  ```
  - **Summary**: Token usage and spend for the active model.
  - **Behavior**: Prints prompt tokens, completion tokens, calls count, and estimated USD spend.

#### 37. `/provider [name|list]`
- [ ] Test commands:
  ```bash
  /provider
  /provider list
  /provider openrouter
  ```
  - **Summary**: Switch API provider (no arg = list all).
  - **Behavior**: Switches target provider across 15+ supported endpoints (OpenRouter, OpenAI, Groq, Ollama, DeepSeek, etc.).

#### 38. `/key [value]`
- [ ] Test commands:
  ```bash
  /key
  /key sk-ant-...
  ```
  - **Summary**: Set the API key (blank = hidden prompt).
  - **Behavior**: Temporarily stores API key in process environment without writing to disk.

---

### Group G: Steering, Memory & Learning (3 Commands)

#### 39. `/notes [add <text>|clear]`
- [ ] Test commands:
  ```bash
  /notes
  /notes add Never modify database schema without an explicit migration file.
  /notes clear
  ```
  - **Summary**: Steering notes injected into prompts.
  - **Behavior**: Injects permanent tribal knowledge and guardrails into all future generation and agent prompts.

#### 40. `/learn`
- [ ] Test command:
  ```bash
  /learn
  ```
  - **Summary**: Distill this session into a skill.
  - **Behavior**: Reviews the completed session and extracts repeatable task procedures into `.kaioken/skills/`.

#### 41. `/handoff`
- [ ] Test command:
  ```bash
  /handoff
  ```
  - **Summary**: Write a continuation briefing for this session.
  - **Behavior**: Summarizes active goals, decisions, and open threads into `.kaioken/handoffs/` for team members or fresh agents.

---

### Group H: Extensibility, Sandbox & Templates (3 Commands)

#### 42. `/templates` (alias `/template`)
- [ ] Test commands:
  ```bash
  /templates
  /t:review file=apps/cli/src/main.ts
  ```
  - **Summary**: List prompt templates (`/t:<name>` runs one).
  - **Behavior**: Reads parameterized prompt templates in `.kaioken/templates/<name>.md` and expands `{{placeholders}}`.

#### 43. `/ext [subcommand]` (aliases `/extension`, `/extensions`)
- [ ] Test commands:
  ```bash
  /ext
  /ext browse
  /ext search git
  /ext install owner/repo
  /ext trust <id>
  /ext update
  /ext remove <id>
  ```
  - **Summary**: Manage community extensions.
  - **Behavior**: Manages declarative, MCP, and sandboxed WASM plugins with strict explicit trust approval.

#### 44. `/x [ext command [args]]`
- [ ] Test commands:
  ```bash
  /x
  /x git-flow status
  ```
  - **Summary**: Run a command a wasm extension contributed.
  - **Behavior**: Executes extension tool inside WASM sandbox (no network, read-only filesystem).

---

### Group I: System, UI, Configuration & Help (11 Commands)

#### 45. `/compact`
- [ ] Test command:
  ```bash
  /compact
  ```
  - **Summary**: Summarize the conversation to free context.
  - **Behavior**: Condenses older conversation turns into an LLM-generated summary while preserving system prompt and recent turns.

#### 46. `/import <path>`
- [ ] Test command:
  ```bash
  /import /path/to/transcript.jsonl
  ```
  - **Summary**: Bring an external transcript in as a new session.
  - **Behavior**: Ingests external JSON/JSONL chat transcripts as a native resumable Kaioken session.

#### 47. `/yolo`
- [ ] Test command:
  ```bash
  /yolo
  ```
  - **Summary**: Toggle auto-approve for edits and commands.
  - **Behavior**: Toggles dangerous auto-approval mode; bypasses write/bash confirmation prompts. Footer shows `yolo`.

#### 48. `/config`
- [ ] Test command:
  ```bash
  /config
  ```
  - **Summary**: Show the active configuration.
  - **Behavior**: Prints active model, provider, repo root, scope excludes, and steering notes.

#### 49. `/theme [default|light|highcontrast]`
- [ ] Test commands:
  ```bash
  /theme
  /theme light
  /theme highcontrast
  /theme default
  ```
  - **Summary**: Switch the colour palette.
  - **Behavior**: Instantly repaints terminal interface and updates `.kaioken/config.yaml`.

#### 50. `/repo <path>`
- [ ] Test command:
  ```bash
  /repo /path/to/another/repo
  ```
  - **Summary**: Point at a different repository.
  - **Behavior**: Re-targets the entire terminal engine, tools, and symbol index to a new directory path.

#### 51. `/copy`
- [ ] Test command:
  ```bash
  /copy
  ```
  - **Summary**: Copy the last reply to the clipboard.
  - **Behavior**: Copies the agent's most recent message text into the system clipboard.

#### 52. `/tutorial [chapter|command]`
- [ ] Test commands:
  ```bash
  /tutorial
  /tutorial wiki
  /tutorial all
  ```
  - **Summary**: Guided walkthrough of every command.
  - **Behavior**: Displays chaptered interactive guides and practical first-run workflows.

#### 53. `/explain [command]`
- [ ] Test commands:
  ```bash
  /explain
  /explain wiki
  /explain all
  ```
  - **Summary**: In-depth reference for every command.
  - **Behavior**: Displays deep technical reference page for commands with syntax, pitfalls, and tips.

#### 54. `/help` (aliases `/h`, `/?`)
- [ ] Test command:
  ```bash
  /help
  ```
  - **Summary**: Show all commands.
  - **Behavior**: Outputs compact listing of all 57 slash commands with one-line summaries.

#### 55. `/version` (alias `/v`)
- [ ] Test command:
  ```bash
  /version
  ```
  - **Summary**: Print the Kaioken version.
  - **Behavior**: Outputs Kaioken V2 version, build commit, and platform environment.

#### 56. `/quit` (aliases `/exit`, `/q`)
- [ ] Test command:
  ```bash
  /quit
  ```
  - **Summary**: Exit Kaioken.
  - **Behavior**: Gracefully flushes active session to disk and terminates terminal UI.

---

## 3. Terminal Verification Sign-Off Matrix

- [ ] **All 57 commands tested** in an interactive terminal session (`node apps/tui/dist/bin.js`).
- [ ] **Autocomplete verification**: Typing `/` pops up the filterable command palette.
- [ ] **Mid-name matching verified**: Typing `/date` resolves to `/update`.
- [ ] **Shortcuts verified**: `Ctrl+C` cancels turn, `Ctrl+D` exits clean when idle.
- [ ] **Session survival verified**: Session resumed via `/resume` after `/quit`.
