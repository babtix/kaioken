# kaioken — a terminal AI coding assistant + knowledge engine

`kaioken` is a single Go binary with two faces:

1. **A chat agent** — talk to any model from your provider's live catalog. It
   can `read_file`, `list_files`, `search`, `write_file`, `edit_file`, and
   `run_command` inside the repo. Every file change and command is shown as a
   diff and applied only after you approve it (`/yolo` to auto-approve).
2. **A knowledge engine** — scan a repo, split it into modules with an LLM, and
   generate dense **knowledge cards** per module (inspired by Qoder's
   `.qoder/repowiki/knowledge/`), with a human-in-the-loop planning step.

Both live in one interactive TUI (Bubble Tea), in the spirit of Claude Code /
OpenCode. Provider-agnostic over any OpenAI-compatible endpoint (OpenRouter,
OpenAI, Groq, Together, DeepSeek, Mistral, Ollama).

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

**Interactive TUI** (recommended) — an in-terminal app like Claude Code / OpenCode:

```powershell
kaioken            # bare command launches the TUI
kaioken tui -repo path\to\repo
```

Drive everything with slash-commands from inside it:

```
/wiki [xN] [force]      DEEP wiki: global plan → per-section plans → long docs
                        ×3 is the default depth (×2 adds subsection docs, ×1 sections only)
/wiki retry             regenerate only the sections that failed last run
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
/provider <name>        switch API provider (openrouter, openai, groq, deepseek, …)
/key [value]            set API key in-memory (blank = hidden prompt)
/repo <path>            point at a different repository
/notes [add <t>|clear]  view/edit steering notes injected into prompts
/undo /diff /cost /compact /copy /config /init /clear /help /quit
```

Long operations stream progress live and never freeze the UI; `ctrl+c`
cancels an in-flight run.

**Scriptable CLI** — the same pipeline as subcommands (for CI / automation):

```
kaioken init  →  kaioken scan  →  kaioken plan  →  [edit modules.yaml]  →  kaioken generate

kaioken wiki                 first full run — records the commit it documents
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
catalog and it is instructed to open a matching one before starting work.

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

- Desktop version (Wails wrapper around the same engine — `serve` is the seed)
- Conversation-memory extraction and card self-iteration
- Diff-driven updates for knowledge **cards** (today `update` covers the wiki)
- Export targets (`--export qoder`, `--export claude-md`)
