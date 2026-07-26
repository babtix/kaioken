# Built-in Tutorial

Explains the interactive tutorial system that guides new users through TUI features via structured chapters and command examples. The tutorial is accessible via the `/tutorial` command and provides contextual guidance for all available TUI commands.

## Table of Contents
- [Overview](#overview)
- [Invocation](#invocation)
- [Tutorial Structure](#tutorial-structure)
  - [Chapters](#chapters)
  - [Commands](#commands)
- [Implementation](#implementation)
  - [tutorialLines function](#tutoriallines-function)
  - [tutorialOverview function](#tutorialoverview-function)
  - [tutorialChapter function](#tutorialchapter-function)
  - [tutorialCommand function](#tutorialcommand-function)
  - [Helper functions](#helper-functions)
- [Reference Tables](#reference-tables)
  - [Tutorial Chapters](#tutorial-chapters)
  - [Tutorial Commands](#tutorial-commands)
- [Referenced Files](#referenced-files)

## Overview

The tutorial system provides a structured, progressive introduction to Kaioken's TUI functionality. It is organized into thematic chapters, each containing related commands with explanations and practical examples. Users can access the full tutorial, specific chapters, or individual command details through the `/tutorial` command.

## Invocation

The tutorial system is invoked via the `/tutorial` command (with aliases `/guide` and `/manual`) in the TUI command palette. When executed, it renders formatted help text directly in the chat viewport.

```
<repo-relative-path>:cli/internal/tui/tui.go:920-1043
```

```go
func (m Model) dispatch(raw string) (tea.Model, tea.Cmd) {
	// ...
	case "tutorial", "guide", "manual":
		for _, l := range tutorialLines(rest) {
			m.appendLine(l)
		}
	// ...
}
```

The `rest` argument contains any text following the command (e.g., `/tutorial wiki` passes `"wiki"` as `rest`). This argument determines which portion of the tutorial to display:
- Empty argument: Shows the tutorial overview
- `"all"` or `"everything"` or `"full"`: Shows the complete tutorial
- Chapter name (e.g., `"wiki"`): Shows that specific chapter
- Command name (e.g., `"wiki"`): Shows detailed help for that command

## Tutorial Structure

The tutorial is organized into two hierarchical levels: chapters and commands. Each chapter groups related commands and provides an introductory explanation. Each command entry includes its signature, aliases, summary, detailed description, and practical examples.

### Chapters

Chapters are defined as `chapter` structs in the `tutorial.go` file. Each chapter contains:
- `name`: Internal identifier used for lookup
- `title`: Display name shown in the tutorial
- `intro`: Multi-sentence explanation of the chapter's topic
- `commands`: Slice of command names belonging to this chapter

```
<repo-relative-path>:internal/tui/tutorial.go:22-27
```

```go
type chapter struct {
	name     string
	title    string
	intro    string
	commands []string
}
```

The complete chapter list is stored in the `chapters` variable:

```
<repo-relative-path>:internal/tui/tutorial.go:29-89
```

```go
var chapters = []chapter{
	{
		name: "start", title: "Getting started",
		intro: "Kaioken needs an API key and a model, and nothing else. Everything is\n" +
			"stored per repo in .kaioken/, with your key kept globally in ~/.kaioken.",
		commands: []string{"tutorial", "explain", "help", "key", "init"},
	},
	{
		name: "chat", title: "Chatting and editing code",
		intro: "Type anything that is not a command to talk to the model. It can read,\n" +
			"search, write and edit files, and run shell commands — every change is\n" +
			"shown as a diff and applied only after you approve it.\n\n" +
			"Replies stream as they arrive and render as markdown. The composer is\n" +
			"multi-line: alt+enter (or ctrl+j) adds a newline, so pasting a stack\n" +
			"trace works.",
		commands: []string{"yolo", "undo", "diff", "stop"},
	},
	{
		name: "sessions", title: "Sessions and context",
		intro: "Conversations are saved per repo after every reply, so nothing is lost\n" +
			"when you quit. When a session gets long, compact it rather than losing\n" +
			"the thread.",
		commands: []string{"sessions", "resume", "new", "compact", "copy", "cost", "clear"},
	},
	{
		name: "model", title: "Models, providers and steering",
		intro: "Kaioken works with any OpenAI-compatible endpoint. Notes are the most\n" +
			"valuable setting here: they are injected into every generation prompt.",
		commands: []string{"model", "models", "provider", "repo", "config", "notes"},
	},
	{
		name: "knowledge", title: "The knowledge engine",
		intro: "Two pipelines read the same repo and produce different things.\n\n" +
			"  The WIKI is long-form documentation for humans and deep agent dives:\n" +
			"  planned sections, chapters of real depth, diagrams, cross-links.\n\n" +
			"  CARDS are short, fixed-schema context blocks per module, meant to be\n" +
			"  fed to an AI agent cheaply before it touches code.\n\n" +
			"They are independent — run either, or both. Once a wiki exists, /update\n" +
			"keeps it current from the git diff instead of regenerating everything.",
		commands: []string{"wiki", "update", "scan", "plan", "cards", "status"},
	},
	{
		name: "skills", title: "Skills: teaching an agent your project",
		intro: "The wiki says what the code IS. A skill says how to DO something in it:\n" +
			"which files to touch, in what order, following which local conventions.\n" +
			"That is what an agent actually needs when it starts a task, and exactly\n" +
			"what a general model cannot know about your project.\n\n" +
			"Build them after a wiki or card run. They stay current through /update.",
		commands: []string{"skills"},
	},
	{
		name: "browse", title: "Browsing and automation",
		intro: "Reading a two-thousand-line chapter in an editor is rough; serve it\n" +
			"instead. And let a git hook keep everything fresh without you asking.",
		commands: []string{"serve", "hook"},
	},
	{
		name: "misc", title: "Everything else",
		commands: []string{"version", "quit"},
	},
}
```

### Commands

Individual command documentation is derived from the `command` type (defined elsewhere in the codebase, referenced in `tutorial.go`). Each command provides:
- `name`: Primary command identifier (e.g., `"wiki"`)
- `args`: Usage pattern for arguments (e.g., `"[xN] [force]"`)
- `aliases`: Alternative command names (e.g., `["gen"]` for `"generate"`)
- `summary`: Concise one-line description
- `detail`: Multi-sentence explanation of behavior and usage
- `examples`: Slice of `example` structs containing:
  - `cmd`: Exact command invocation to demonstrate
  - `what`: Explanation of what the example accomplishes

The `command` type is not defined in the provided sources but is used extensively in the tutorial system. Based on usage in `tutorial.go`, it has the structure described above.

## Implementation

The tutorial system is implemented through several functions in `tutorial.go` that work together to format and display help content.

### tutorialLines function

This is the entry point for the `/tutorial` command. It resolves the input argument into the appropriate tutorial content by checking for special cases (overview, full tutorial) then attempting to match against chapters and commands.

```
<repo-relative-path>:internal/tui/tutorial.go:227-263
```

```go
func tutorialLines(arg string) []string {
	arg = strings.ToLower(strings.TrimSpace(arg))

	switch arg {
	case "":
		return tutorialOverview()
	case "all", "everything", "full":
		var out []string
		out = append(out, tutorialOverview()...)
		for _, ch := range chapters {
			out = append(out, tutorialChapter(ch)...)
		}
		return out
	}

	if ch, ok := lookupChapter(arg); ok {
		return tutorialChapter(ch)
	}
	if c, ok := lookupCommand(arg); ok {
		return tutorialCommand(c)
	}

	// Not a chapter or a command: say so, and offer the near misses.
	out := []string{errStyle.Render("no tutorial section called " + arg)}
	if near := filterCommands(arg); len(near) > 0 {
		var names []string
		for _, c := range near {
			names = append(names, "/"+c.name)
			if len(names) == 6 {
				break
			}
		}
		out = append(out, dimStyle.Render("did you mean: "+strings.Join(names, "  ")))
	}
	out = append(out, dimStyle.Render("/tutorial for the overview and chapter list"))
	return out
}
```

Key behaviors:
- Empty argument: Returns the tutorial overview
- `"all"`/`"everything"`/`"full"`: Returns overview followed by all chapters
- Chapter match: Returns the formatted chapter content
- Command match: Returns the formatted command detail
- No match: Returns error message with suggestions from `filterCommands` (which finds similar command names)

### tutorialOverview function

Generates the tutorial's landing page, introducing Kaioken's dual nature as a coding agent and knowledge engine, outlining a typical first-run workflow, and listing available chapters with navigation hints.

```
<repo-relative-path>:internal/tui/tutorial.go:119-167
```

```go
func tutorialOverview() []string {
	var out []string
	add := func(s string) { out = append(out, s) }

	add("")
	add(tutTitleStyle.Render("KAIOKEN — a guided tour"))
	add(dimStyle.Render(strings.Repeat("─", 52)))
	add("")
	add("Kaioken is two tools in one binary:")
	add("")
	add("  " + tutCmdStyle.Render("a coding agent") +
		" — chat that can read, edit and run things in your repo,")
	add("  with every change gated behind a diff you approve.")
	add("")
	add("  " + tutCmdStyle.Render("a knowledge engine") +
		" — it reads the whole repository and writes")
	add("  documentation, then keeps it current from your git history.")
	add("")
	add(tutChapterStyle.Render("First run"))
	add("")
	for i, step := range []example{
		{"/key", "paste your API key (hidden). Get one at openrouter.ai/keys"},
		{"/model", "pick a model from the live catalog"},
		{"/wiki", "generate the documentation — this is the big one"},
		{"/skills", "turn it into task guides an agent can follow"},
		{"/serve", "read the result in a browser"},
	} {
		add(fmt.Sprintf("  %d. %s  %s", i+1,
			tutExampleStyle.Render(pad(step.cmd, 10)), dimStyle.Render(step.what)))
	}
	add("")
	add(dimStyle.Render("  After code changes, /update refreshes only what the diff touched."))
	add("")
	add(tutChapterStyle.Render("Chapters"))
	add("")
	for _, ch := range chapters {
		add("  " + tutExampleStyle.Render(pad("/tutorial "+ch.name, 22)) +
			dimStyle.Render(ch.title))
	}
	add("")
	add(dimStyle.Render("  /tutorial <command>   detail on one command, e.g. /tutorial wiki"))
	add(dimStyle.Render("  /tutorial all         the entire manual"))
	add(dimStyle.Render("  /explain <command>    full reference page with workflow tips"))
	add("")
	add(dimStyle.Render("Tip: press / to open the command palette — type to filter, tab to"))
	add(dimStyle.Render("complete, enter to run."))
	add("")
	return out
}
```

The overview uses helper functions for styling:
- `tutTitleStyle`: Bold orange for main title
- `dimStyle`: Gray text for secondary content
- `tutCmdStyle`: Bold green for command names
- `tutExampleStyle`: Bold cyan for example commands
- `pad`: Right-pads strings for column alignment

### tutorialChapter function

Formats a single chapter's content, including its title, introductory explanation, and all command entries within that chapter.

```
<repo-relative-path>:internal/tui/tutorial.go:170-187
```

```go
func tutorialChapter(ch chapter) []string {
	var out []string
	out = append(out, "", tutTitleStyle.Render(ch.title), dimStyle.Render(strings.Repeat("─", 52)))
	if ch.intro != "" {
		out = append(out, "")
		for _, line := range strings.Split(ch.intro, "\n") {
			out = append(out, line)
		}
	}
	for _, name := range ch.commands {
		c, ok := lookupCommand(name)
		if !ok {
			continue
		}
		out = append(out, tutorialCommand(c)...)
	}
	return out
}
```

Structure:
- Blank line
- Chapter title in bold orange
- Horizontal rule (52 dashes) in dim gray
- If present: chapter introduction split into lines
- For each command in the chapter: append formatted command detail from `tutorialCommand`

### tutorialCommand function

Formats a single command's help entry, including its signature, aliases, summary, detailed description, and usage examples.

```
<repo-relative-path>:internal/tui/tutorial.go:190-224
```

```go
func tutorialCommand(c command) []string {
	var out []string
	add := func(s string) { out = append(out, s) }

	header := "/" + c.name
	if c.args != "" {
		header += " " + c.args
	}
	add("")
	add(tutCmdStyle.Render(header))
	if len(c.aliases) > 0 {
		add(dimStyle.Render("  also: /" + strings.Join(c.aliases, ", /")))
	}
	add("  " + c.summary)

	if c.detail != "" {
		add("")
		for _, line := range wrapText(c.detail, 74) {
			add("  " + dimStyle.Render(line))
		}
	}
	if len(c.examples) > 0 {
		add("")
		width := 0
		for _, e := range c.examples {
			if len(e.cmd) > width {
				width = len(e.cmd)
			}
		}
		for _, e := range c.examples {
			add("  " + tutExampleStyle.Render(pad(e.cmd, width+2)) + dimStyle.Render(e.what))
		}
	}
	return out
}
```

Structure:
- Blank line
- Command signature (`/name [args]`) in bold green
- If aliases exist: "also: /alias1, /alias2, ..." in dim gray
- Command summary line indented two spaces
- If detail exists: blank line followed by wrapped detail text (74 chars width) in dim gray, each line indented two spaces
- If examples exist: blank line followed by example commands in bold cyan (padded for alignment) and descriptions in dim gray

### Helper functions

Several utility functions support the tutorial's text formatting:

```
<repo-relative-path>:internal/tui/tutorial.go:266-271
```

```go
func pad(s string, width int) string {
	if len(s) >= width {
		return s + " "
	}
	return s + strings.Repeat(" ", width-len(s))
}
```
Right-pads string to specified width with spaces (adds trailing space if already at or over width).

```
<repo-relative-path>:internal/tui/tutorial.go:274-290
```

```go
func wrapText(s string, width int) []string {
	words := strings.Fields(s)
	if len(words) == 0 {
		return nil
	}
	var lines []string
	line := words[0]
	for _, w := range words[1:] {
		if len(line)+1+len(w) > width {
			lines = append(lines, line)
			line = w
			continue
		}
		line += " " + w
	}
	return append(lines, line)
}
```
Wraps text at word boundaries without breaking words, returning slice of lines.

## Reference Tables

### Tutorial Chapters

| Chapter Name | Title | Command Count | Key Commands |
|--------------|-------|---------------|--------------|
| start | Getting started | 5 | tutorial, explain, help, key, init |
| chat | Chatting and editing code | 4 | yolo, undo, diff, stop |
| sessions | Sessions and context | 7 | sessions, resume, new, compact, copy, cost, clear |
| model | Models, providers and steering | 6 | model, models, provider, repo, config, notes |
| knowledge | The knowledge engine | 6 | wiki, update, scan, plan, cards, status |
| skills | Skills: teaching an agent your project | 1 | skills |
| browse | Browsing and automation | 2 | serve, hook |
| misc | Everything else | 2 | version, quit |

### Tutorial Commands

The following table lists all commands documented in the tutorial system, grouped by chapter. Each command's documentation can be accessed via `/tutorial <command>`.

| Command | Chapter | Signature | Aliases | Summary |
|---------|---------|-----------|---------|---------|
| tutorial | start | tutorial [chapter\|command\|all] | guide, manual | Show tutorial overview or specific section |
| explain | start | explain <command> | | Full reference page with workflow tips |
| help | start | help | h, ? | List all commands with brief descriptions |
| key | start | key [value] | | Set API key (blank = hidden prompt) |
| init | start | init | | Create .kaioken/config.yaml in current repo |
| yolo | chat | yolo | | Toggle auto-approve for edits and commands |
| undo | chat | undo | | Revert last file write/edit by agent (repeatable) |
| diff | chat | diff | | Show `git diff` for repo's working tree |
| stop | chat | stop | | Cancel current task (chat turn, plan, etc.) |
| sessions | sessions | sessions | | List saved conversations for this repo |
| resume | sessions | resume [id] | | Reopen saved conversation (no id = picker) |
| new | sessions | new | | Start fresh session (current session saved) |
| compact | sessions | compact | | Summarize conversation to free up context |
| copy | sessions | copy | | Copy last assistant reply to clipboard |
| cost | sessions | cost | usage | Show token usage and call count |
| clear | sessions | clear | cls | Clear chat transcript |
| model | model | model [id] | | Pick a model (no id = interactive picker) |
| models | model | models [filter] | | List provider models to screen |
| provider | model | provider [name\|list] | | Switch API provider (no arg = list all) |
| repo | model | repo <path> | | Point at different repository |
| config | model | config | | Show current configuration |
| notes | model | notes [add <t>\|clear] | | Manage steering notes injected into prompts |
| wiki | knowledge | wiki [xN] [force] | | DEEP wiki: global plan → per-section plans → long docs |
| update | knowledge | update [<base-rev>] | | INCREMENTAL: git-diff against documented baseline |
| scan | knowledge | scan | | Inventory repository files |
| plan | knowledge | plan | | Plan repository modules (modules.yaml) |
| cards | knowledge | cards | gen | Generate knowledge cards per module |
| status | knowledge | status | | Check module generation status |
| skills | skills | skills [force\|name] | | Build task guides an agent loads while working |
| serve | browse | serve [port] | | Browse wiki in browser (/serve stop to end) |
| hook | browse | hook [install\|remove\|status] | | Install/remove post-commit auto-update hook |
| version | misc | version | v | Print Kaioken version |
| quit | misc | quit | exit, q | Exit the application |

## Referenced Files

- `internal/tui/tutorial.go` - Contains tutorial data structure (chapters, commands) and formatting functions
- `cli/internal/tui/tui.go` - Contains command dispatch logic that invokes the tutorial system (`/tutorial`, `/guide`, `/manual` handlers)

<!-- kaioken:files internal/tui/tutorial.go,internal/tui/tui.go -->
