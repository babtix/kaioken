package tui

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// /tutorial is the manual: what each command is for, when to reach for it, and
// a worked example. It is built from the same registry that drives the palette,
// so a command cannot exist without appearing here.

var (
	tutTitleStyle   = lipgloss.NewStyle().Foreground(lipgloss.Color("208")).Bold(true)
	tutChapterStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("214")).Bold(true)
	tutCmdStyle     = lipgloss.NewStyle().Foreground(lipgloss.Color("117")).Bold(true)
	tutExampleStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("42"))
)

// chapter groups commands into something worth reading end to end.
type chapter struct {
	name     string
	title    string
	intro    string
	commands []string
}

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

// lookupCommand finds a command by name or alias.
func lookupCommand(name string) (command, bool) {
	name = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(name), "/"))
	for _, c := range commands {
		if c.name == name {
			return c, true
		}
		for _, a := range c.aliases {
			if a == name {
				return c, true
			}
		}
	}
	return command{}, false
}

func lookupChapter(name string) (chapter, bool) {
	name = strings.ToLower(strings.TrimSpace(name))
	for _, ch := range chapters {
		if ch.name == name {
			return ch, true
		}
	}
	return chapter{}, false
}

// tutorialOverview is the landing page: what this is, a first run, and where
// to go next.
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

// tutorialChapter renders one chapter: its intro, then each of its commands.
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

// tutorialCommand renders one command's entry.
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

// tutorialLines resolves an argument into the right page.
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

// pad right-pads to width for column alignment.
func pad(s string, width int) string {
	if len(s) >= width {
		return s + " "
	}
	return s + strings.Repeat(" ", width-len(s))
}

// wrapText breaks a paragraph at word boundaries.
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
