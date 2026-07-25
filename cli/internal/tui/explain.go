package tui

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// /explain is the in-depth command reference: full syntax, aliases, workflow
// guidance, tips and worked examples for every command. It goes deeper than
// /tutorial, which focuses on a guided narrative; /explain is the reference
// page you reach for when you already know which command you want.

// commandGuides holds extended usage guidance for each command, keyed by name.
// The init function below copies these into the command struct's guide field
// so the data lives in one place and every command gets its page.
var commandGuides = map[string]string{
	"tutorial": "The tutorial is organized into chapters that group related commands. " +
		"Start with the overview, then drill into a chapter that matches what you " +
		"are trying to do. For a single command's full reference page use /explain.",
	"explain": "Use /explain when you know which command you want but need the full " +
		"picture — syntax, aliases, when to reach for it, and worked examples. " +
		"/explain all prints the complete reference in one go.",
	"help": "The quick reference card. Shows every command in a compact list with " +
		"one-line descriptions. Reach for /help when you know a command exists but " +
		"cannot remember its name; reach for /explain when you need the full story.",
	"init": "Run /init once per repo to create a config you can edit. Kaioken works " +
		"fine without it using defaults, but the file is where you tune the model, " +
		"provider, scope excludes and steering notes. Commit it so the whole team " +
		"shares the same settings.",
	"key": "The key is stored globally in ~/.kaioken/config.yaml with 0600 permissions, " +
		"so it carries across repos and restarts. Each provider keeps its own key — " +
		"switching providers does not lose the previous key. Resolution order: " +
		"session key, then saved key, then the provider's environment variable.",
	"yolo": "Best for quick, low-risk sessions where you trust the model and want to " +
		"batch many small edits. The footer shows 'yolo' while it is active. " +
		"/undo still works afterwards, so nothing is truly irreversible.",
	"undo": "Kaioken records each file's contents before the agent changes it. Repeat " +
		"/undo to walk further back through the session's edit history. A file the " +
		"agent created is deleted rather than restored. The undo stack resets when " +
		"you start a new session or resume a different one.",
	"diff": "A quick way to review everything the agent changed without leaving the " +
		"TUI. Runs git diff on the working tree, so it includes changes from any " +
		"source — not just the agent. Use it before committing to sanity-check the " +
		"full set of modifications.",
	"stop": "Cancels whatever is in flight — a chat turn, a wiki run, a compaction. " +
		"Esc and ctrl+c do the same. Text the model already streamed is kept, not " +
		"discarded, so you never lose partial work. Safe to press even when nothing " +
		"is running.",
	"sessions": "Conversations are saved automatically per repo after every reply, under " +
		".kaioken/sessions/. The list shows the session id, title, turn count, model " +
		"and age. The active session is marked with a dot.",
	"resume": "Restores the full message history so the model keeps its context. The " +
		"transcript is replayed so you can see where you left off. Use the picker " +
		"(no argument) to search by title, or pass the session id to jump straight " +
		"to it.",
	"new": "Clears the model's context without losing anything — the current session " +
		"is saved first, so /resume brings it back. Use it when you want a clean " +
		"slate for a new task but might return to the old one later.",
	"compact": "Replaces the history with an LLM-written summary that preserves key " +
		"decisions, files touched and pending work. Use it when a long session " +
		"starts hitting the context window, instead of losing the thread with /new. " +
		"The summary becomes the new conversation context.",
	"copy": "Copies the last assistant message to the system clipboard. Handy for " +
		"grabbing a code snippet or explanation from a reply without selecting text " +
		"in the terminal. If the reply was empty or tool-only, there is nothing to " +
		"copy.",
	"cost": "Shows cumulative calls and prompt/output token counts for the active " +
		"client. Counts reset when you switch model or provider, since that starts " +
		"a new client. Use it to keep an eye on spend during a long session or a " +
		"big wiki run.",
	"clear": "Only clears the display — the conversation is untouched. Use /new if " +
		"you actually want to reset the model's context. /clear is purely cosmetic: " +
		"it wipes the scrollback so you can focus on what comes next.",
	"model": "The picker fetches the provider's live catalog, so it is always current. " +
		"Your choice is saved as the default for new repos via ~/.kaioken. Pass an " +
		"id directly to skip the picker, or 'list' to print the catalog without the " +
		"interactive UI. The model applies to both chat and the knowledge engine.",
	"models": "Prints the provider's model catalog to the screen, optionally filtered. " +
		"Use it to discover what is available before picking one with /model. The " +
		"list is capped at 80 entries — use a filter to narrow it down.",
	"provider": "Any OpenAI-compatible endpoint works: openrouter, openai, groq, " +
		"together, deepseek, mistral, ollama, fireworks, perplexity, xai, cerebras, " +
		"sambanova, huggingface, cohere, anyscale. Each keeps its own saved key, so " +
		"switching providers does not lose the previous key. Run /provider or " +
		"/provider list to see all available providers with their URLs and key status.",
	"repo": "Everything — chat tools, the knowledge engine, skills — retargets to the " +
		"new path. The config is reloaded from the new repo, and the conversation " +
		"resets since context is repo-specific. Use it to work on a different " +
		"project without restarting Kaioken.",
	"config": "Shows the active configuration at a glance: repo path, model, provider, " +
		"concurrency, token budget, steering notes and auto-approve state. Read-only " +
		"— use the individual commands (/model, /provider, /notes, /yolo) to change " +
		"settings.",
	"notes": "The human-in-the-loop channel. Notes are injected verbatim into every " +
		"generation prompt, so use them for the tribal knowledge the code does not " +
		"state — conventions, guardrails, 'never do X here'. This is the " +
		"highest-leverage way to improve output quality across every interaction.",
	"wiki": "The main documentation pipeline. Pass 1 plans 8-16 sections over the whole " +
		"repo; pass 2 plans each section in detail; pass 3 writes long-form chapters " +
		"plus subsection documents. The multiplier is the depth dial: start with x1 " +
		"to validate the plan, then run x3 (the default) for the full treatment. " +
		"An existing plan in wiki_plan.yaml is reused, so you can edit it first.",
	"update": "A full wiki run is expensive; this one is not. Kaioken diffs the repo " +
		"against the commit the wiki was built from — including uncommitted and " +
		"untracked files — and revises only the documents the diff invalidates. " +
		"Skills whose sources changed are refreshed too. Run it after every batch " +
		"of code changes, or install /hook to do it automatically.",
	"skills": "Skills are task guides: how to DO things in your repo, not what the code " +
		"IS. Build them after a wiki or card run, when there is something to draw " +
		"on. Each SKILL.md names real files, follows local conventions, and lists " +
		"the mistakes people actually make. The chat agent loads them automatically " +
		"via read_knowledge.",
	"serve": "Renders .kaioken/wiki/ as a local website with sidebar navigation, search " +
		"and mermaid diagrams. Runs in the background so chat stays usable. Reading " +
		"a two-thousand-line chapter in an editor is rough; serve it instead. Use " +
		"/serve stop to shut it down.",
	"hook": "Installs a git post-commit hook that runs /update in the background after " +
		"every commit, so documentation never drifts. It appends a delimited block " +
		"to the existing hook, so your other hooks are preserved. Remove it with " +
		"/hook remove.",
	"scan": "A dry run that shows what Kaioken sees after .gitignore and your scope " +
		"excludes apply. Run it before a wiki or card generation to verify the file " +
		"set looks right — no surprises, no missing directories, no vendor noise.",
	"plan": "The first step of the knowledge-card pipeline. The LLM proposes module " +
		"boundaries, but the result is meant to be edited — module boundaries are " +
		"a judgment call you should own. Review and adjust modules.yaml before " +
		"running /cards.",
	"cards": "Short, dense, fixed-schema context blocks per module — overview, " +
		"architecture, conventions, tech stack. Meant as compact agent context " +
		"rather than human reading. Unchanged modules are skipped via content " +
		"hashing, so re-running is cheap. Use force to rebuild everything.",
	"status": "Per-module freshness at a glance: which cards are up to date, which have " +
		"changed source files, and which have not been generated yet. Run it after " +
		"code changes to see what needs regenerating, or before a review to check " +
		"coverage.",
	"version": "Prints the Kaioken version, Go build version and platform. Include this " +
		"when reporting bugs or asking for help.",
	"quit": "The session is already saved — conversations persist after every reply, " +
		"so nothing is lost when you exit. ctrl+d quits on an empty line, keeping " +
		"the terminal's copy/paste shortcuts free.",
}

func init() {
	for i := range commands {
		if g, ok := commandGuides[commands[i].name]; ok && commands[i].guide == "" {
			commands[i].guide = g
		}
	}
}

var (
	explainHeaderStyle  = lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Bold(true)
	explainLabelStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	explainCmdStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("117")).Bold(true)
	explainExampleStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
)

// explainLines resolves an argument into the right reference page.
func explainLines(arg string) []string {
	arg = strings.ToLower(strings.TrimSpace(arg))

	switch arg {
	case "":
		return explainOverview()
	case "all", "everything", "full":
		var out []string
		out = append(out, explainOverview()...)
		for _, c := range commands {
			out = append(out, explainCommand(c)...)
		}
		return out
	}

	if c, ok := lookupCommand(arg); ok {
		return explainCommand(c)
	}

	// Not a known command: say so, and offer near misses.
	out := []string{errStyle.Render("no command called " + arg)}
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
	out = append(out, dimStyle.Render("/explain for the full command reference"))
	return out
}

// explainCommand renders one command's full reference page: syntax, aliases,
// summary, extended guidance and every worked example.
func explainCommand(c command) []string {
	var out []string
	add := func(s string) { out = append(out, s) }

	// Header: /name [args]
	header := "/" + c.name
	if c.args != "" {
		header += " " + c.args
	}
	add("")
	add(explainHeaderStyle.Render(header))
	add(dimStyle.Render(strings.Repeat("─", 52)))

	// Aliases
	if len(c.aliases) > 0 {
		add(explainLabelStyle.Render("  Aliases:  ") +
			dimStyle.Render("/"+strings.Join(c.aliases, ", /")))
	}

	// Summary
	add(explainLabelStyle.Render("  What:     ") + c.summary)

	// Detail — why the command exists, what is surprising about it
	if c.detail != "" {
		add("")
		add(explainLabelStyle.Render("  Detail"))
		for _, line := range wrapText(c.detail, 72) {
			add("    " + dimStyle.Render(line))
		}
	}

	// Guide — workflow context, tips, when and why to use it
	if c.guide != "" {
		add("")
		add(explainLabelStyle.Render("  When & why"))
		for _, line := range wrapText(c.guide, 72) {
			add("    " + dimStyle.Render(line))
		}
	}

	// Examples
	if len(c.examples) > 0 {
		add("")
		add(explainLabelStyle.Render("  Examples"))
		width := 0
		for _, e := range c.examples {
			if len(e.cmd) > width {
				width = len(e.cmd)
			}
		}
		for _, e := range c.examples {
			add("    " + explainExampleStyle.Render(pad(e.cmd, width+2)) +
				dimStyle.Render(e.what))
		}
	}

	return out
}

// explainOverview is the landing page: every command grouped by chapter with
// its one-line summary, plus navigation hints.
func explainOverview() []string {
	var out []string
	add := func(s string) { out = append(out, s) }

	add("")
	add(explainHeaderStyle.Render("KAIOKEN — command reference"))
	add(dimStyle.Render(strings.Repeat("─", 52)))
	add("")
	add("Every command with its syntax and a one-line summary.")
	add(dimStyle.Render("/explain <command> for the full page · /explain all for everything"))
	add("")

	for _, ch := range chapters {
		add(tutChapterStyle.Render(ch.title))
		for _, name := range ch.commands {
			c, ok := lookupCommand(name)
			if !ok {
				continue
			}
			label := "/" + c.name
			if c.args != "" {
				label += " " + c.args
			}
			add("  " + explainCmdStyle.Render(pad(label, 28)) + dimStyle.Render(c.summary))
			if len(c.aliases) > 0 {
				add("  " + dimStyle.Render(pad("", 28)+"also: /"+strings.Join(c.aliases, ", /")))
			}
		}
		add("")
	}

	add(dimStyle.Render("Tip: press / to open the command palette — type to filter, tab to"))
	add(dimStyle.Render("complete, enter to run."))
	add("")
	return out
}
