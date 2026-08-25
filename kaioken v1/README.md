# kaioken — a terminal AI coding assistant + knowledge engine

## Table of Contents
- [Repository layout](#repository-layout)
- [Overview](#overview)
- [Chat + agent](#chat--agent)
- [Two ways to use it](#two-ways-to-use-it)
- [Interactive TUI (recommended)](#interactive-tui-recommended)
- [Scriptable CLI](#scriptable-cli)
- [Incremental updates (`kaioken update`)](#incremental-updates-kaioken-update)
- [Skills (`kaioken skills`)](#skills-kaioken-skills)
- [Deep research engine (`kaioken research` / `/research`)](#deep-research-engine-kaioken-research--research)
- [Browsing the wiki (`kaioken serve`)](#browsing-the-wiki-kaioken-serve)
- [How output quality is engineered](#how-output-quality-is-engineered)
- [Output layout (inside the target repo)](#output-layout-inside-the-target-repo)
- [Quick start](#quick-start)
- [The steering-notes channel](#the-steering-notes-channel)
- [Wiring into an AI agent](#wiring-into-an-ai-agent)
- [Design decisions](#design-decisions)
- [Roadmap (not yet built)](#roadmap-not-yet-built)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Repository layout

```
├── cli/        the Go source (single binary)
└── website/    the React landing + docs site (Vite + Tailwind)
```

- **cli/** — build with `cd cli && go build -o kaioken.exe ./cmd/kaioken`
- **website/** — run with `cd website && npm install && npm run dev`

## Overview

`kaioken` is a single Go binary with two faces:

1. **A chat agent** — talk to any model from your provider's live catalog. It
   can `read_file`, `list_files`, `search`, `write_file`, `edit_file`, and
   `run_command` inside the repo. Every file change and command is shown as a
   diff and applied only after you approve it (`/yolo` to auto-approve).
2. **A knowledge engine** — scan a repo, split it into modules with an LLM, and
   generate dense **knowledge cards** per module (inspired by Qoder's
   `.qoder/repowiki/knowledge/`), with a human-in-the-loop planning step.

Both live in one interactive TUI (Bubble Tea), in the spirit of Claude Code /
OpenCode. Provider-agnostic over ~20 built-in endpoints — most OpenAI-compatible
(OpenRouter, OpenAI, Google, Groq, Together, DeepSeek, Mistral, Azure, Ollama,
…), plus Anthropic reached through its own Messages API directly.

## Chat + agent

Replies **stream token by token** and are rendered as markdown (headings,
tables, syntax-highlighted code). The composer is multi-line — `alt+enter`
(or `ctrl+j`) inserts a newline, so pasting a stack trace works. Conversations
are saved per repo and reopened with `/resume`.

The agent is **knowledge-aware**: when a repo has generated docs, the system
prompt advertises them and a `read_knowledge` tool opens any card or wiki
chapter on demand — so the engine you ran actually feeds the assistant instead
of it re-reading source every time.

Just type to chat. Pick your model interactively with `/model` (fetched live
from the provider). When the model wants to change a file it proposes a diff:

```
● proposed edit: internal/api/handler.go
- 	return nil
+ 	return fmt.Errorf("validate: %w", err)
apply edit → internal/api/handler.go ?   [y] yes   [n] no
```

Safety: all file paths are confined to the target repo (no `..` escapes), a
declined action never touches disk, and `edit_file` refuses non-unique matches.

## Two ways to use it

### Interactive TUI (recommended) — an in-terminal app like Claude Code / OpenCode:

```powershell
kaioken            # bare command launches the TUI
kaioken tui -repo path\to\repo
```

Drive everything with slash-commands from inside it:

```
/wiki [xN] [force]      DEEP wiki: global plan → per-section plans → long docs
                        ×3 is the default depth (×2 adds subsection docs, ×1 sections only)
/wiki retry             regenerate only the sections that failed last run
/research [xN] <query>  ask open web: fast loop or multi-agent research dossier
/skills [force|name]    build task guides an AI loads while working here
/skills list            show the generated skills
/update [<base-rev>]    incremental: git-diff against the commit the wiki was built
                        from, and revise only the documents that diff invalidates
/serve [port]           browse the generated wiki in a browser · /serve stop
/hook [install|remove]  refresh the wiki automatically after every commit
/sessions /resume [id]  list and reopen saved conversations
/new                    start a fresh session (the current one is saved)
/scan                   scan the repo, print an inventory
/plan                   LLM proposes modules.yaml (edit it, then generate)
/cards [force|id]       generate knowledge cards — all, one module, or force a rebuild
/status                 per-module freshness
/models [filter]        list the provider's models
/model <id>             set the generation model
/provider <name>        switch API provider (openrouter, openai, anthropic, groq, deepseek, …)
/key [value]            set API key in-memory (blank = hidden prompt)
/repo <path>            point at a different repository
/notes [add <t>|clear]  view/edit steering notes injected into prompts
/undo /diff /cost /compact /copy /config /init /clear /help /quit
```

Long operations stream progress live and never freeze the UI; `ctrl+c`
cancels an in-flight run.

### Scriptable CLI — the same pipeline as subcommands (for CI / automation):

```
kaioken init  →  kaioken scan  →  kaioken plan  →  [edit modules.yaml]  →  kaioken generate

kaioken wiki                 # first full run — records the commit it documents
        │
kaioken update  ←  later: git-diffs the repo against that commit and rewrites
                   only the chapters the change actually touches
```

## Incremental updates (`kaioken update`)

A full `wiki` run is expensive. Once one has completed, Kaioken records the
commit it reflects in `.kaioken/wiki_state.yaml` and `update` works from the
diff instead of regenerating everything:

1. `git diff <baseline>` against the **working tree** — committed, staged,
   unstaged and untracked changes all count, because the docs describe the code
   on disk, not just what was committed.
2. Changed files are mapped to documents via the **provenance footer** every
   generated document carries (`<!-- kaioken:files … -->`), which records the
   exact sources it was written from. A section's own document additionally
   matches its planned file scope, so a brand-new file — which appears in no
   existing document's provenance — still gets documented. Documents predating
   the footer fall back to scanning their *Referenced Files* list.
3. Each affected document is revised in one pass that receives the **existing
   document + the diff + the current file contents** — a revision, not a
   rewrite, so structure, diagrams and still-accurate prose survive.
4. A dated entry lands in `.kaioken/wiki/CHANGELOG.md`, and the baseline moves
   to the new commit.

Files no section claims are reported rather than silently ignored — that
usually means the plan needs a `-force` re-plan to cover a new area.

```powershell
kaioken update                 # since the recorded baseline
kaioken update -base HEAD~10   # or an explicit commit / tag / expression
kaioken hook install           # or: refresh automatically after every commit
```

`hook install` appends a delimited block to `.git/hooks/post-commit`, so an
existing hook is preserved; `hook remove` strips just that block back out.

## Skills (`kaioken skills`)

The wiki explains what a codebase **contains**. A skill explains how to **do a
task** in it — which files to touch, in what order, following which local
conventions. That is what an agent actually needs at the moment it starts
working, and it is exactly what a general model cannot know about your project.

Kaioken plans the recurring tasks in your repo (`add-an-api-endpoint`,
`add-a-cli-command`, `write-a-test`, `run-a-migration` — whatever fits your
stack), then writes one grounded guide per task:

```
.kaioken/skills/
├─ README.md                     the catalog an agent reads first
└─ add-a-tui-command/
   └─ SKILL.md
```

Each `SKILL.md` uses the Agent Skills format, so runtimes that understand it can
load skills on demand by matching the `description`:

```markdown
---
name: add-a-tui-command
description: How to add a slash command to the Kaioken TUI. Use when adding,
  renaming or removing TUI commands.
sources:
  - internal/tui/tui.go
generated_at: 2026-07-24T19:02:36Z
---

# Add a TUI command

## Steps
1. Add a case to `dispatch` …
```

The body is procedural, not descriptive: prerequisites, numbered steps naming
real files, the conventions that are not obvious from the code, how to verify
the change, and the mistakes people actually make in this codebase.

**They stay current.** The `sources` list is what makes skills incremental:
`kaioken update` diffs the repo and refreshes only the skills whose sources the
change touched — the same mechanism that keeps the wiki current.

```powershell
kaioken skills            # plan and build the set
kaioken skills list       # see what exists
kaioken skills -force     # rewrite them all
kaioken update            # refreshes wiki AND the affected skills
```

The TUI suggests `/skills` once a wiki or card run finishes, since that is when
there is something to build on. The chat agent lists skills first in its
knowledge catalog and is told to open a matching one *before* starting a task.

## Deep research engine (`kaioken research` / `/research`)

Ask the open web a complex question and get a grounded, cited dossier:

```powershell
kaioken research "what changed in Go 1.24 GC?"
kaioken research x3 -mode deep "compare OSS auth designs"
/research x2 is solar cheaper than nuclear in europe?
kaioken research -resume <run_id>
```

- **Router**: A light model determines whether the prompt needs a single search loop or a multi-agent deep research run.
- **Decomposition**: A supervisor splits the topic into distinct sub-questions and assigns each to an isolated worker agent.
- **Parallel Workers**: Workers search the web, fetch and read web pages, gap-check findings, and cite sources precisely.
- **Dossier Output**: Generates structured markdown + JSON + signed PDF reports in `.kaioken/research/`.

## Browsing the wiki (`kaioken serve`)

Reading a two-thousand-line chapter in an editor is rough. `serve` renders
`.kaioken/wiki/` as a local site with a sidebar, working links, full-text
search, and mermaid diagrams:

```powershell
kaioken serve                  # http://127.0.0.1:7777
kaioken serve -port 8080
```

From the TUI, `/serve` runs it in the background so chat stays usable, and
`/serve stop` ends it.

## How output quality is engineered

Long-form generation fails in predictable ways. Kaioken addresses each one
mechanically rather than by asking the model nicely:

**The model sees whole files, not their edges.** Bundling used to give each file
a byte cap and cut anything longer into "first three quarters + last quarter" —
so for a 2000-line file the middle, where the logic lives, was never seen.
`internal/codemap` parses every source file into a skeleton (package, imports,
and every declaration with its line range: `go/ast` for Go, signature parsers
for Python/JS/TS/Java/Rust/C-like). Prompts now get **every declaration in
scope** for a few hundred tokens per file, plus full bodies of the most relevant
code in the remaining budget. Files too large to include whole contribute
**complete functions**, never arbitrary byte slices.

**Chapters agree with each other.** Sections generate in parallel and can only
see sibling titles, which produces the same concept explained three times in
three vocabularies. A prior pass writes an authoritative brief — real
architecture, key flows, and a glossary of canonical terms — to
`.kaioken/architecture.md`, injected verbatim into every later prompt. Edit that
file and every chapter inherits the correction on the next run.

**Claims are checked, not trusted.** The prompt asks the model not to invent
APIs; verification enforces it. Every file path, symbol, line anchor and quoted
excerpt a document asserts is checked against the code index. Excerpts must
actually appear at the lines they cite. Failures are reported, and at ×10 fed
back for correction.

**Length follows substance.** Line-count targets make models pad, so the prompt
specifies *coverage* instead: every exported declaration, endpoint, config key
and model in scope must be documented. A shorter chapter that covers everything
beats a longer one that repeats itself.

**Framework facts are extracted, not guessed.** Real routes, models, CLI
commands and environment variables are pulled from the source
(Express/FastAPI/Flask/Spring/Gin/Rails and friends) and handed to the prompt,
so an API reference lists actual endpoints.

**The plan is validated.** Planning sees a structural skeleton of the repo, not
just a directory listing. Afterwards Kaioken reports what percentage of scanned
files the plan actually claims, and which directories the misses cluster in — a
plan that silently ignores a third of the codebase is visible before generation
spends tokens on it.

**Post-passes with no model call:** invalid mermaid is demoted to a plain code
block rather than shipping as an error box in the browser, and mentions of other
chapters become relative links instead of duplicated explanations.

### What the multiplier buys

Above ×3 the multiplier used to mean "ask for more lines". It now buys passes:

| Level | Behavior |
| --- | --- |
| ×1 | public surface and main flow, section docs only |
| ×2 | adds subsection documents and diagrams |
| ×3 (default) | exhaustive coverage of every declaration in scope |
| ×4+ | adds a **critique-and-revise** cycle: score the draft against a rubric, fix the gaps, cut the padding |
| ×10 | additionally **corrects** every grounding failure verification found |

Each level roughly doubles the calls per document, which is what a
power-multiplier metaphor ought to mean. The estimate names the passes before
the run starts.

## Output layout (inside the target repo)

```
.kaioken/
├─ config.yaml       model, scope excludes, steering notes (injected into prompts)
├─ modules.yaml      LLM-proposed module tree — EDIT before generating
├─ wiki_plan.yaml    LLM-proposed wiki outline — EDIT before generating
├─ architecture.md   shared brief + glossary injected into every chapter — EDIT freely
├─ wiki_state.yaml   the commit the wiki reflects (+ failed sections for retry)
├─ state.json        per-module source hashes → incremental updates
├─ sessions/         saved chat conversations → /resume
├─ skills/           task guides an agent loads while working (SKILL.md each)
├─ research/         cited research dossiers (.md, .json, .pdf)
├─ wiki/             the deep wiki: one folder per section, plus CHANGELOG.md
├─ KNOWLEDGE.md      index an agent reads first
└─ knowledge/<module>/
   ├─ _module.yaml   metadata (scope, model, generated_at)
   ├─ overview.md
   ├─ architecture.md
   ├─ conventions.md
   ├─ tech_stack.md
   └─ setup_commands.md   (only when the module has unique commands)
```

## Quick start

```powershell
# build (Go >= 1.24)
cd cli
go build -o kaioken.exe ./cmd/kaioken

# set your OpenRouter key (get one at openrouter.ai/keys)
$env:OPENROUTER_API_KEY = "sk-or-..."

cd path\to\your\repo
kaioken init                 # creates .kaioken/config.yaml — review model + notes
kaioken scan                 # sanity-check what will be analyzed
kaioken plan                 # LLM proposes modules.yaml — edit it if you like
kaioken generate             # parallel card generation
kaioken status               # freshness per module
kaioken wiki                 # deep multi-pass wiki (×3 by default)
kaioken update               # after code changes: git-diff-driven wiki refresh
kaioken models claude        # discover OpenRouter model ids
```

### Detailed Quick Start Steps

1. **Build the binary**
   ```powershell
   cd cli
   go build -o kaioken.exe ./cmd/kaioken
   ```
   This compiles the Go source into a single executable named `kaioken.exe`.

2. **Configure your API key**
   ```powershell
   $env:OPENROUTER_API_KEY = "sk-or-..."
   ```
   Get your API key from [OpenRouter](https://openrouter.ai/keys) or another supported provider.
   Kaioken supports multiple providers via the `/provider` command.

3. **Initialize a repository**
   ```powershell
   cd path\to\your\repo
   kaioken init
   ```
   This creates `.kaioken/config.yaml` in your repository. Review the generated
   configuration to ensure the model and provider settings are correct for your
   use case.

4. **Scan the repository**
   ```powershell
   kaioken scan
   ```
   This command analyzes your repository structure to understand what files and
   directories are present, helping Kaioken plan the knowledge generation process.

5. **Plan the module structure**
   ```powershell
   kaioken plan
   ```
   Kaioken uses an LLM to propose a module breakdown in `modules.yaml`. Review
   and edit this file to define how your codebase should be partitioned into
   logical modules for documentation.

6. **Generate knowledge cards**
   ```powershell
   kaioken generate
   ```
   This creates per-module knowledge cards in `.kaioken/knowledge/` based on the
   module plan. Each module gets overview, architecture, conventions, tech stack,
   and setup commands documentation.

7. **Check freshness**
   ```powershell
   kaioken status
   ```
   See which modules have up-to-date knowledge cards and which need regeneration
   due to source changes.

8. **Generate the full wiki**
   ```powershell
   kaioken wiki
   ```
   This creates a comprehensive, multi-pass wiki in `.kaioken/wiki/` with
   detailed sections, diagrams, and cross-references. By default, it uses a 3x
   multiplier for exhaustive coverage.

9. **Update after code changes**
   ```powershell
   kaioken update
   ```
   After modifying your code, run this to incrementally update only the
   affected parts of the wiki and skills, saving time and resources.

10. **Explore available models**
    ```powershell
    kaioken models claude
    ```
    Discover available model IDs for your chosen provider (e.g., OpenRouter).

## The steering-notes channel

The most valuable idea borrowed from Qoder's `wiki_plan.yaml`: `notes` in
`config.yaml` are **authoritative instructions injected into every prompt** —
use them for tribal knowledge the code doesn't state:

```yaml
notes:
  - "Real-time features follow the dual-router pattern: REST APIRouter plus a
     sibling ws_router authenticating via short-lived JWT in the token query param."
  - "Every admin mutation must be audit-logged via the AuditLog model."
```

## Wiring into an AI agent

Point your agent at the index, e.g. in `CLAUDE.md` / `AGENTS.md`:

```markdown
## Project knowledge
Before starting a task, check `.kaioken/skills/README.md` — if a skill matches
what you are doing, follow it. For unfamiliar areas, read
`.kaioken/KNOWLEDGE.md` and the cards for the modules you touch, or the
relevant chapter in `.kaioken/wiki/`.
```

Kaioken's own chat agent does this automatically: skills lead its knowledge
catalog and it is instructed to open a matching one *before* starting a task.

## Design decisions

- **Human-in-the-loop plan**: `modules.yaml` is meant to be edited — module
  boundaries are a judgment call the maintainer should own.
- **Fixed card schema**: agents can rely on the same five files existing for
  every module.
- **Content-hash incrementality**: `state.json` stores a sha256 over each
  module's scoped files; unchanged modules are never re-billed.
- **Bundling heuristics**: manifests and entry points first, tests last;
  long files keep head (imports/types) + tail (registrations/exports).
- **Low temperature (0.2)**: cards should be factual, not creative.
- **Provenance over prose**: documents record their sources in a machine-readable
  footer, so incremental updates do not depend on the model writing a tidy
  *Referenced Files* section.
- **Structure before text**: a file's skeleton always fits the budget, so nothing
  in scope is ever invisible to the model — detail is what gets rationed, never
  coverage.
- **Verify, don't trust**: a prompt asking for no hallucinations is a request;
  checking every claimed path, symbol and excerpt against the code index is a
  guarantee.
- **Free-tier aware**: a model id ending in `:free` caps parallelism at 2,
  because those tiers rate-limit hard and four parallel calls mostly buys 429s.
- **Cost up front**: a wiki run prints its estimated calls and tokens before
  starting, and asks for confirmation past a threshold.
- **Streaming is not retried mid-flight**: once tokens have been shown, a failed
  stream surfaces as an error rather than replaying and duplicating output.

## Roadmap (not yet built)

- Desktop app (Tauri v2 + React 19 + Go daemon sidecar — `desktop/`)
- Conversation-memory extraction and card self-iteration
- Diff-driven updates for knowledge **cards** (today `update` covers the wiki)
- Export targets (`--export qoder`, `--export claude-md`)

## Troubleshooting

### Common Issues and Solutions

#### "API key not found" error
- **Solution**: Ensure you've set the appropriate API key environment variable
  (e.g., `OPENROUTER_API_KEY`) or use the `/key` command in the TUI to set it
  interactively.

#### "Model not found" error
- **Solution**: Use `/models` to list available models for your provider, then
  `/model <id>` to select a valid model.

#### Wiki generation fails or is too slow
- **Solutions**:
  1. Reduce the multiplier: `kaioken wiki -scale 1` for faster, less detailed output
  2. Check your API rate limits and consider upgrading your plan
  3. Exclude large or irrelevant directories in `.kaioken/config.yaml` under
     `scope.excludes`
  4. Ensure you have a stable internet connection for API calls

#### "Permission denied" when running commands
- **Solution**: On Unix-like systems, you may need to make the binary executable:
  ```bash
  chmod +x kaioken
  ```
  On Windows, ensure your antivirus isn't blocking the executable.

#### Generated documentation seems incomplete
- **Solutions**:
  1. Run `kaioken plan` and review/edit `modules.yaml` to ensure all important
     directories are included
  2. Increase the multiplier: `kaioken wiki -scale 4` for more thorough coverage
  3. Check `.kaioken/wiki_state.yaml` for any failed sections that may need
     manual intervention

#### Skills not being generated or updated
- **Solutions**:
  1. Run `kaioken skills -force` to regenerate all skills from scratch
  2. Ensure your repository has recognizable patterns for common tasks (like
     adding API endpoints or writing tests)
  3. Check that `.kaioken/skills/README.md` exists and is readable

## Contributing

We welcome contributions to kaioken! Here's how you can help:

### Reporting Issues
- Use the GitHub issue tracker to report bugs or request features
- Include your operating system, kaioken version, and steps to reproduce
- For bugs, include relevant log output and screenshots if applicable

### Submitting Changes
1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Commit your changes: `git commit -m 'Add amazing feature'`
5. Push to the branch: `git push origin feature/amazing-feature`
6. Open a pull request

### Development Setup
```bash
# Clone the repository
git clone https://github.com/babtix/kaioken.git
cd kaioken

# Install Go dependencies (for CLI)
cd cli
go mod download

# Install Node.js dependencies (for website)
cd ../website
npm install

# Build the CLI
cd ../cli
go build -o kaioken ./cmd/kaioken

# Run the website for development
cd ../website
npm run dev
```

### Code Style
- Follow the existing code style in the repository
- Go code should pass `golangci-lint` (run `make lint`)
- JavaScript/TypeScript should follow ESLint configuration in the website/
- Write clear, descriptive commit messages

### Documentation
- Update the README.md if you change functionality
- Add or update knowledge cards if you add significant features
- Consider adding skills for common tasks related to your contribution

## License

This project is licensed under the License Zero Noncommercial Public License 2.0.1 - see the [LICENSE](LICENSE) file for details.