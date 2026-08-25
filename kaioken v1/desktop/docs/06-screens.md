# 06 — Screens

Layout is described in text so it is unambiguous. Every screen lists its states —
empty, loading, error — because those are where GUI work actually goes.

## 6.0 Shell

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ▎KAIOKEN   ai_now_know ▾   master ·3        anthropic/claude-sonnet-4.5 ▾│  40px
├────┬─────────────────────────────────────────────────────────────────────┤
│ ▶  │                                                                     │
│ 📖 │                                                                     │
│ ▣  │                         route content                               │
│ ✦  │                                                                     │
│ ⚡ │                                                                     │
│    │                                                                     │
│ ⚙  │                                                                     │
├────┴─────────────────────────────────────────────────────────────────────┤
│ ● daemon ok · :54312   ×3 wiki 4/11 ▓▓▓▓░░░░  12 calls · 184k tok   ⌘K   │  28px
└──────────────────────────────────────────────────────────────────────────┘
```

- **Top bar**: wordmark, workspace switcher (recents dropdown + *Open folder…*),
  git branch with dirty count, model picker. All three are live.
- **Nav rail** (48 px, icon + tooltip): Chat, Wiki, Cards, Skills, Activity;
  Settings pinned to the bottom. Badges: a dot on Activity while runs are live.
- **Status bar**: daemon connection pill (green ok / amber reconnecting / red
  dead), the active run's compact progress, cumulative usage, palette hint.
  This replaces the TUI's `/cost` — always visible, never a command.

Window chrome is native. A custom title bar is not worth the cross-platform cost
in v1.

## 6.1 Welcome (no workspace)

Centred, terminal-styled, with the ASCII wordmark from `cli/internal/tui/logo.go`.

```
              ▄ ▄▄ ▄ KAIOKEN ▄ ▄▄ ▄

        open a repository to get started

        [ Open folder…  ⌘O ]

        recent
        ▸ ai_now_know      D:/project/ai_now_know      2 min ago
        ▸ medcore          D:/xii/medcore              yesterday
        ▸ old-thing        D:/tmp/old-thing            missing ✕
```

- **Empty state**: no recents → just the button plus one line of explanation.
- **Missing recents** are shown greyed with a ✕ to forget them; clicking one
  offers to remove it rather than erroring.
- Dropping a folder onto the window opens it.

## 6.2 Chat  `⌘1`

```
┌── sessions ──┬──────────────── transcript ─────────────────────────────┐
│ + new  ⌘N    │                                                          │
│              │  ▎ why does update skip new files?                       │
│ ▸ why does…  │                                                          │
│   7 turns    │  Let me look at the provenance mapping.                  │
│   2 min ago  │                                                          │
│              │  ◇ read_file  cli/internal/wiki/update.go                │
│ ▸ add a -json│    └ 469 lines                                           │
│   3 turns    │                                                          │
│              │  ◎ search  provenance                                    │
│              │    └ 14 matches in 6 files                               │
│              │                                                          │
│              │  New files appear in no document's provenance footer,    │
│              │  so `update` maps them by the section's planned scope…   │
│              │  ▌                                                       │
├──────────────┼──────────────────────────────────────────────────────────┤
│              │ › ▏                                          [⏎ send]     │
│              │   auto-approve ☐   shell ☐        25 steps · ×1 · 4.2k   │
└──────────────┴──────────────────────────────────────────────────────────┘
```

**Message rendering**
- User messages: `--kai-blue` left rule, mono, preserved whitespace.
- Assistant: rendered markdown, GFM tables, syntax-highlighted code.
- Tool calls: a compact card, glyph + name + one-line argument summary, matching
  the TUI's glyph vocabulary (`◇ read_file · ◈ list_files · ◎ search · ◆ write/edit
  · ▶ run_command`). Collapsed by default; click expands the full result.
  Errors get the `--kai-rose` treatment.
- Streaming tail: plain pre-wrapped text with a blinking caret, replaced by
  rendered markdown on completion (§5.6).

**Composer**
- Multi-line. `Enter` sends, `Alt+Enter`/`Ctrl+J` newlines — identical to the TUI.
- `/` at position 0 opens the slash menu (fuzzy, arrow keys, `Tab` completes).
  Commands that map to runs (`/wiki x3`, `/skills`, `/update`) start a run and
  switch the view to Activity; commands that map to state (`/model`, `/provider`)
  open the relevant control.
- Per-turn toggles: **auto-approve** (the `/yolo` equivalent, resets each turn,
  amber when on) and **shell** (`AllowRun`, off by default, with a one-line
  warning on first enable).
- Right-hand meta: step budget, multiplier, live token estimate of the composed
  message.

**While a turn runs**: composer disabled with a *Cancel ⎋* button; `Esc` cancels.

**States**
- No sessions → centred prompt with three example questions grounded in this repo.
- No API key → an inline banner *No key for openrouter* with *Open settings*,
  not a modal; the user may still browse.
- Turn failed → the error is a message in the transcript with a *Retry* action,
  never a toast that scrolls away.

## 6.3 Approval dialog

Modal, focus-trapped, keyboard-first. It is the single most important screen in
the app — it is where trust is won or lost.

```
┌── apply edit ───────────────────────────────────────────────── ⎋ ───┐
│ cli/internal/wiki/update.go                        +3 −1  · edit     │
├──────────────────────────────────────────────────────────────────────┤
│ @@ 212,4 → 212,6 @@                                                  │
│  212      if err != nil {                                            │
│  213  −       return nil                                             │
│  213  +       return fmt.Errorf("resolve base: %w", err)             │
│  214  +   }                                                          │
│                                                                      │
│ [ show 40 lines of context ]                                         │
├──────────────────────────────────────────────────────────────────────┤
│  [Y] apply     [N] deny     [A] apply all this turn     open in editor│
└──────────────────────────────────────────────────────────────────────┘
```

- Added lines `--kai-green`, removed `--kai-rose`, both at ~12% background tint;
  gutter line numbers dim.
- **New file**: header says *create file*, the whole body renders as additions,
  with a byte count.
- **`run_command`**: the command in a mono block with the working directory, an
  amber caution rule, and no *apply all* button — shell commands are approved one
  at a time, always.
- **Timeout**: a thin bar shows the 5-minute expiry; at expiry the dialog closes
  and reports *denied (timed out)* in the transcript.
- **Multiple queued approvals**: one modal at a time, with `2 more pending`
  shown; deciding advances to the next.
- **Never auto-focus the approve button.** Focus lands on the diff; `Y`/`N` still
  work. Nobody should approve a file write by hitting `Enter` reflexively.

## 6.4 Wiki  `⌘2`

Two modes in one route, switched by whether a wiki exists.

### 6.4a No wiki yet — the run panel

```
┌──────────────────────────────────────────────────────────────────────┐
│  no wiki generated for ai_now_know yet                               │
│                                                                      │
│  depth        ×1 ─── ×2 ─── [×3] ─── ×4 ─── … ─── ×10                │
│               exhaustive coverage of every declaration in scope      │
│                                                                      │
│  ☐ re-plan from scratch (force)                                      │
│                                                                      │
│  ┌ estimate ──────────────────────────────────────────────────────┐  │
│  │ 96 calls · ~2.25M tokens · heavy                               │  │
│  │ passes: global plan → brief → section plans → sections → subs  │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  [ start ×3 wiki ]                                                   │
└──────────────────────────────────────────────────────────────────────┘
```

The multiplier control is the product's signature — it is the kaioken metaphor.
A discrete slider from ×1 to ×10 whose caption updates from the same table the
README documents (×1 public surface · ×2 +subsections · ×3 exhaustive · ×4+
critique-and-revise · ×10 + grounding correction). The estimate refetches on
every change and shows `heavy: true` in amber above a threshold, mirroring the
CLI's confirmation prompt.

### 6.4b A wiki exists — the reader

```
┌── tree ─────────┬────────────── document ──────────────┬── on this page ──┐
│ ⌕ search…       │  Architecture Overview               │ Overview          │
│                 │  812 lines · 28 min · updated 19:19  │ Process model     │
│ ▾ Getting Start │                                      │   The daemon      │
│ ▾ Architecture  │  ## Process model                    │   The shell       │
│   • Data Flow   │                                      │ Data flow         │
│   • Layers      │  <mermaid diagram>                    │ Failure modes     │
│ ▸ Chat Agent    │                                      │                   │
│ ▸ Knowledge Eng │  Kaioken splits generation into…     │ referenced files  │
│ ▸ Wiki Pipeline │                                      │ · wiki/wiki.go    │
│                 │                                      │ · wiki/passes.go  │
│ CHANGELOG       │                                      │                   │
└─────────────────┴──────────────────────────────────────┴───────────────────┘
```

- Tree: sections collapsible, the section's own document first (matching
  `internal/serve`'s ordering), current document highlighted.
- Search (`⌘F`): live results with snippet and line; `Enter` opens and scrolls to
  the hit with the match highlighted.
- Right rail: TOC from the server-supplied `toc` (§2.8), scroll-spy active
  heading, and *Referenced Files* from the provenance footer — each opens the
  source in a read-only viewer with the line range.
- Header actions: *Regenerate this section*, *Update from git diff*, *Open in
  editor*, *Reveal in Explorer*.
- **Stale banner** when `wiki_state.yaml`'s base commit ≠ current HEAD:
  *12 commits since this wiki was generated · [update]*. This is the feature that
  makes incremental updates discoverable, which they are not in the CLI.

### 6.4c Plan editor

Tab within Wiki. Two synced views of `wiki_plan.yaml`:

- **Form**: a list of sections, each with title, goal, and a file-scope chip list
  with an add/remove picker fed by the scan result. Drag to reorder.
- **YAML**: a plain textarea with monospace, line numbers, and a validation
  gutter. Save is disabled while invalid; the `422` response's `problems[]`
  place markers on the exact lines.

Same component serves `architecture.md` (markdown, with a live preview) and
`modules.yaml` (with `plan.Validate` warnings and the coverage percentage shown
as a bar — a plan covering 92% of scanned files is a fact worth surfacing).

## 6.5 Cards  `⌘3`

```
 module                        files  state       generated
 cli.internal.agent                5  ✓ fresh     today 18:52     [view]
 cli.internal.wiki                12  Δ changed   yesterday       [regen]
 website                          38  ○ missing   —               [gen]
 docs                              0  ∅ empty     —
                                                       [ generate all ]
```

Row click opens the module's five cards (overview, architecture, conventions,
tech_stack, setup_commands) as tabs. `Δ changed` rows carry a *regenerate* action
that starts a `generate` run scoped to that module only. The state glyphs match
the CLI's exactly, so `kaioken status` output and this table read the same.

## 6.6 Skills  `⌘4`

List of `SKILL.md` files with name, description, source count, and a *stale* pill
when a source file is newer than `generated_at`. Detail view renders the body and
shows the front-matter as structured fields; an edit mode writes back through
`skills.Parse` validation. Header actions: *Build skills*, *Rebuild all (force)*.

Empty state explains what a skill is in two sentences and offers *Build skills* —
this is the least-known feature and deserves the explanation.

## 6.7 Activity  `⌘5`

The run console. One row per run, newest first, expandable.

```
 ▾ ×3 wiki            running   4/11   03:41    [cancel]
     → indexing code structure
     → global plan: 11 sections → .kaioken/wiki_plan.yaml
     ✓ Getting Started/Getting Started.md (412 lines)
     ✓ Architecture Overview/Architecture Overview.md (812 lines)
     → Chat Agent
 ▸ skills             done      6 skills   01:12
 ▸ update             failed    provider error: 402 insufficient credits   [retry]
```

- Log lines stream in from `run.log` / `run.progress`; artifacts from
  `run.artifact` are clickable and open in the reader.
- Failed runs show the error verbatim with a *Retry* that restarts with the same
  params. A failed wiki additionally offers *Retry failed sections only*
  (`wiki_retry`), which is what `wiki_state.yaml`'s failed list is for.
- Cancelled ≠ failed, visually and in copy.
- The log view auto-follows unless the user scrolls up.

## 6.8 Settings  `⌘,`

Sections, in this order:

1. **Providers** — a list of all 17 from `llm.Providers`. Each row: name, base
   URL, key status (`saved` / `from env $OPENROUTER_API_KEY` / `none`), a masked
   hint, and *Test*. The key field is a password input that clears on blur and is
   never repopulated from the server. Test calls `/models` and reports the model
   count or the upstream error.
2. **Model** — searchable list from the live catalogue with a filter box; the
   current model pinned at the top. Free models (`:free`) get a badge plus the
   note that concurrency is clamped to 2.
3. **Defaults** — default provider and model for new workspaces.
4. **Workspace** — concurrency (with the clamp explained inline), max module
   tokens, max reply tokens, scope include/exclude editors with a live count of
   matched files, and the **steering notes** editor.
5. **Repository** — the post-commit hook toggle, `allow_run` toggle with a plain
   warning, and *Open `.kaioken/` folder*.
6. **About** — versions (app, daemon, Go), the config file paths as clickable
   reveals, and a *Copy diagnostics* button that puts versions + paths + last
   daemon error on the clipboard.

The **notes editor deserves emphasis**: `config.notes` are injected verbatim into
every generation prompt and are the highest-leverage control in the product. Give
it real space, a short explanation, and one worked example — not a cramped
textarea at the bottom of a form.

## 6.9 Command palette  `⌘K`

Fuzzy over: navigation, every slash command, recent workspaces, wiki documents by
title, skills by name, and settings fields. Results grouped with a section label
and a keyboard hint. This is the discovery surface — anything a user might hunt
through menus for belongs here.

## 6.10 Parity checklist

Every TUI command must map to something. Tick these off in M6.

| TUI | GUI |
| --- | --- |
| `/wiki [xN] [force]` | Wiki → run panel, multiplier dial |
| `/wiki retry` | Activity → failed run → *Retry failed sections* |
| `/update [base]` | Wiki header *Update from git diff*; base in the run dialog |
| `/skills [force\|name]` | Skills → *Build* / *Rebuild all* / per-skill regen |
| `/skills list` | Skills list (the default view) |
| `/serve [port]` `/serve stop` | Not ported — the app *is* the reader. Offer *Open in browser* which starts `serve` in the background for sharing. |
| `/hook install\|remove` | Settings → Repository |
| `/sessions` `/resume` | Chat → session sidebar |
| `/new` | Chat → *+ new* (`⌘N`) |
| `/scan` | Workspace → scan summary panel |
| `/plan` | Cards → *Plan modules* |
| `/cards [force\|id]` | Cards → per-row and *Generate all* |
| `/status` | Cards table state column |
| `/models [filter]` | Settings → Model, with search |
| `/model <id>` | Top-bar model picker |
| `/provider <name>` | Settings → Providers |
| `/key [value]` | Settings → Providers → key field |
| `/repo <path>` | Top-bar workspace switcher |
| `/notes` | Settings → Workspace → notes editor |
| `/undo` | `⌘Z`, and an undo affordance on each applied diff |
| `/diff` | Applied changes list in the transcript |
| `/cost` | Status bar (always visible) |
| `/compact` | Chat → session menu → *Compact* |
| `/copy` | Copy button on every message and code block |
| `/config` | Settings → Workspace |
| `/init` | Welcome / workspace banner → *Initialize* |
| `/clear` | Chat → session menu → *Clear* |
| `/yolo` | Composer *auto-approve* toggle |
| `/tutorial` `/explain` `/help` | Command palette → *Help*, plus first-run tour |
| `/quit` | Window close |
