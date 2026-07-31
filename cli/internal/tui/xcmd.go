package tui

// Prompt templates (/t:<name>) and extension commands (/x).
//
// A template is a parameterized prompt file — the user-side twin of a
// skill. /t:review file=main.go expands .kaioken/templates/review.md and
// sends the result as an ordinary chat message. /x runs a command a wasm
// extension declared in its manifest, and shows what it says.

import (
	"context"
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/ext"
	"kaioken/internal/templates"
)

// runTemplate expands one template and submits it as a chat message.
func (m Model) runTemplate(name, args string) (tea.Model, tea.Cmd) {
	t, err := templates.Load(m.repo, name)
	if err != nil {
		m.appendLine(errStyle.Render("template " + name + ": " + err.Error()))
		m.appendLine(dimStyle.Render("/templates lists what exists"))
		return m, nil
	}
	prompt, missing := templates.Expand(t, args)
	if len(missing) > 0 {
		m.appendLine(warnStyle.Render("unfilled placeholders: {{" + strings.Join(missing, "}} {{") + "}}"))
		m.appendLine(dimStyle.Render("pass them as key=value, e.g. /t:" + name + " " + missing[0] + "=…"))
		return m, nil
	}
	if prompt == "" {
		m.appendLine(warnStyle.Render("template " + name + " expanded to nothing"))
		return m, nil
	}
	return m.startChat(prompt)
}

// listTemplates prints the repo's templates with their placeholders.
func (m *Model) listTemplates() {
	ts, err := templates.List(m.repo)
	if err != nil {
		m.appendLine(errStyle.Render("could not read templates: " + err.Error()))
		return
	}
	if len(ts) == 0 {
		m.appendLine(dimStyle.Render("no templates yet — create " + templates.Dir(m.repo) + "\\<name>.md"))
		m.appendLine(dimStyle.Render("use {{placeholders}} for the parts that change; {{args}} catches the rest"))
		return
	}
	for _, t := range ts {
		line := "  /t:" + t.Name
		if len(t.Vars) > 0 {
			line += "  {{" + strings.Join(t.Vars, "}} {{") + "}}"
		}
		m.appendLine(okStyle.Render("  /t:"+t.Name) + dimStyle.Render(strings.TrimPrefix(line, "  /t:"+t.Name)))
		if first := firstLine(t.Content); first != "" {
			m.appendLine(dimStyle.Render("     " + clip(first, 80)))
		}
	}
	m.appendLine(dimStyle.Render("/t:<name> [key=value…] [free text] expands and sends it"))
}

// doExtCommand lists or runs extension-contributed commands.
func (m *Model) doExtCommand(rest string) {
	cmds := ext.Commands()
	fields := strings.Fields(rest)
	if len(fields) < 2 {
		if len(cmds) == 0 {
			m.appendLine(dimStyle.Render("no extension commands — a trusted wasm extension declares them in its manifest"))
			return
		}
		for _, c := range cmds {
			m.appendLine(okStyle.Render(fmt.Sprintf("  /x %s %s", c.ExtID, c.Name)) +
				dimStyle.Render("  "+c.Description))
		}
		return
	}

	extID, name := resolveExtID(cmds, fields[0]), fields[1]
	args := strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(rest), fields[0]))
	args = strings.TrimSpace(strings.TrimPrefix(args, fields[1]))

	res, err := ext.CallCommand(context.Background(), m.repo, extID, name, args)
	if err != nil {
		m.appendLine(errStyle.Render("extension command failed: " + err.Error()))
		return
	}
	if res.Text != "" {
		style := dimStyle
		if res.IsError {
			style = errStyle
		}
		for _, l := range strings.Split(strings.TrimSpace(res.Text), "\n") {
			m.appendLine(style.Render("  " + l))
		}
	}
	if res.Steer != "" {
		if m.runningAgent != nil {
			m.runningAgent.Steer(res.Steer)
			m.appendLine(dimStyle.Render("  steering queued from " + extID))
		} else {
			m.appendLine(dimStyle.Render("  (extension offered steering, but no agent is running)"))
		}
	}
}

// resolveExtID lets the user type just the extension's short name when it is
// unambiguous; the full owner.name always works.
func resolveExtID(cmds []ext.ExtCommand, arg string) string {
	if strings.Contains(arg, ".") {
		return arg
	}
	match := arg
	count := 0
	for _, c := range cmds {
		if strings.HasSuffix(c.ExtID, "."+arg) {
			if c.ExtID != match {
				match = c.ExtID
				count++
			}
		}
	}
	if count == 1 {
		return match
	}
	return arg
}
