package tui

// /ext manages community extensions from inside the TUI. It mirrors the
// `kaioken ext` CLI: listing and toggling are synchronous (local disk),
// while install, update and search hit the network and run in the
// background like every other long operation here.

import (
	"context"
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/ext"
)

// doExt routes /ext subcommands.
func (m Model) doExt(args []string) (tea.Model, tea.Cmd) {
	sub, arg := "", ""
	if len(args) > 0 {
		sub = strings.ToLower(args[0])
	}
	if len(args) > 1 {
		arg = args[1]
	}

	switch sub {
	case "", "list", "ls":
		m.extList()
	case "browse":
		return m.openExtBrowser()
	case "install", "add":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext install <owner/repo[@version]>"))
			return m, nil
		}
		return m.startExtInstall(arg)
	case "remove", "uninstall", "rm":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext remove <id>"))
			return m, nil
		}
		if err := ext.Remove(arg); err != nil {
			m.appendLine(errStyle.Render("ext: " + err.Error()))
		} else {
			m.appendLine(okStyle.Render("removed " + arg))
		}
	case "update":
		return m.startExtUpdate(arg)
	case "search":
		if arg == "" {
			// A bare search means "show me what exists" — the picker does
			// that better than a wall of text.
			return m.openExtBrowser()
		}
		return m.startExtSearch(arg)
	case "enable", "disable":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext " + sub + " <id>"))
			return m, nil
		}
		if err := ext.SetEnabled(arg, sub == "enable"); err != nil {
			m.appendLine(errStyle.Render("ext: " + err.Error()))
		} else {
			m.appendLine(okStyle.Render(arg + " " + sub + "d"))
		}
	case "trust":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext trust <id>"))
			return m, nil
		}
		confirmed := len(args) > 2 && strings.EqualFold(args[2], "yes")
		return m.doExtTrust(arg, confirmed)
	case "untrust":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext untrust <id>"))
			return m, nil
		}
		if err := ext.Untrust(arg); err != nil {
			m.appendLine(errStyle.Render("ext: " + err.Error()))
		} else {
			m.appendLine(okStyle.Render(arg + " untrusted — its server will not run again until you re-trust it"))
		}
	case "tools":
		if arg == "" {
			m.appendLine(warnStyle.Render("usage: /ext tools <id>"))
			return m, nil
		}
		tools, err := ext.CachedTools(arg)
		switch {
		case err != nil:
			m.appendLine(errStyle.Render("ext: " + err.Error()))
		case len(tools) == 0:
			m.appendLine(dimStyle.Render("no tools recorded — /ext trust " + arg + " first"))
		default:
			for _, t := range tools {
				m.appendLine(fmt.Sprintf("  %-40s %s", t.FullName, t.Description))
			}
		}
	default:
		m.appendLine(errStyle.Render("unknown ext subcommand: " + sub))
		m.appendLine(dimStyle.Render("usage: /ext [list|browse|install|remove|update|search|enable|disable|trust|untrust|tools]"))
	}
	return m, nil
}

// extItem is one registry listing in the shared picker. The tier travels
// in the description so the user sees what trusting would mean before
// installing.
type extItem struct{ id, repo, tier, desc string }

func (i extItem) Title() string { return i.id }
func (i extItem) Description() string {
	label := "[" + i.tier + "] "
	if i.desc == "" {
		return label + i.repo
	}
	return label + i.repo + " — " + i.desc
}
func (i extItem) FilterValue() string { return i.id + " " + i.repo + " " + i.tier + " " + i.desc }

// extFlaggedMalicious reports whether a registry entry carries the kill
// switch flag.
func extFlaggedMalicious(e ext.RegistryEntry) bool {
	for _, f := range e.Flags {
		if strings.EqualFold(f, "malicious") {
			return true
		}
	}
	return false
}

// openExtBrowser fetches the community index and opens the shared picker,
// mirroring how the model picker works: fetch async, populate on the
// message, install on enter.
func (m Model) openExtBrowser() (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	m.busy = true
	m.busyText = "fetching extension registry"
	return m, tea.Batch(
		func() tea.Msg {
			entries, err := ext.Registry(context.Background(), true)
			return extRegistryFetchedMsg{entries, err}
		},
		m.spin.Tick,
	)
}

// doExtTrust is deliberately two-step in the TUI: the first invocation only
// shows what would run; nothing launches until the user repeats the command
// with an explicit "yes". Even the sandboxed wasm tier keeps the step —
// reading the workspace is a grant worth an explicit yes.
func (m Model) doExtTrust(id string, confirmed bool) (tea.Model, tea.Cmd) {
	man, entry, err := ext.InstalledManifest(id)
	if err != nil {
		m.appendLine(errStyle.Render("ext: " + err.Error()))
		return m, nil
	}
	if !ext.Executable(man.Type) {
		m.appendLine(dimStyle.Render(id + " is a declarative extension — it runs no code and needs no trust"))
		return m, nil
	}
	if entry.Trusted() {
		m.appendLine(okStyle.Render(id + " " + entry.Version + " is already trusted"))
		return m, nil
	}
	if !confirmed {
		if man.Type == ext.TypeWasm {
			perms := "none — fully isolated"
			if len(man.Permissions) > 0 {
				perms = strings.Join(man.Permissions, ", ")
			}
			m.appendLine(warnStyle.Render(id + " " + entry.Version + " wants to run a SANDBOXED wasm plugin:"))
			m.appendLine("    module:      " + man.Wasm.Entry)
			m.appendLine("    permissions: " + perms)
			m.appendLine(dimStyle.Render("No network, no environment, memory capped; fs:read:workspace mounts"))
			m.appendLine(dimStyle.Render("your repo read-only. Trust applies to this exact version; updates revoke it."))
		} else {
			cmdline := man.MCP.Command
			if len(man.MCP.Args) > 0 {
				cmdline += " " + strings.Join(man.MCP.Args, " ")
			}
			m.appendLine(warnStyle.Render(id + " " + entry.Version + " wants to run an MCP server, UNSANDBOXED:"))
			m.appendLine("    " + cmdline)
			m.appendLine(dimStyle.Render("Kaioken cannot restrict what this process does. Trust applies to this"))
			m.appendLine(dimStyle.Render("exact version; updates revoke it automatically."))
		}
		m.appendLine(warnStyle.Render("to proceed: /ext trust " + id + " yes"))
		return m, nil
	}
	if m.guardBusy() {
		return m.busyNote()
	}
	ch := m.events
	go func() {
		ch <- busyMsg{true, "trusting extension"}
		tools, err := ext.Trust(context.Background(), id)
		if err == nil {
			ch <- logMsg{fmt.Sprintf("trusted %s — %d tool(s) available to the agent (each call still needs approval)", id, len(tools))}
			for _, t := range tools {
				ch <- logMsg{fmt.Sprintf("  %-40s %s", t.FullName, t.Description)}
			}
		}
		ch <- doneMsg{"ext trust", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

// extList prints the installed extensions from the lockfile.
func (m *Model) extList() {
	lock, err := ext.LoadLock()
	if err != nil {
		m.appendLine(errStyle.Render("ext: " + err.Error()))
		return
	}
	if len(lock.Extensions) == 0 {
		m.appendLine(dimStyle.Render("no extensions installed — /ext search to browse, /ext install owner/repo to add one"))
		return
	}
	for _, e := range lock.Extensions {
		state := okStyle.Render("enabled")
		if !e.Enabled {
			state = dimStyle.Render("disabled")
		}
		trust := ""
		if man, _, err := ext.InstalledManifest(e.ID); err == nil && ext.Executable(man.Type) {
			if e.Trusted() {
				trust = "  " + okStyle.Render("trusted")
			} else {
				trust = "  " + warnStyle.Render("UNTRUSTED — /ext trust "+e.ID)
			}
		}
		m.appendLine(fmt.Sprintf("  %-32s %-10s %-28s %s%s", e.ID, e.Version, e.Repo, state, trust))
	}
	m.appendLine(dimStyle.Render(fmt.Sprintf("%d extension(s) in %s", len(lock.Extensions), ext.Root())))
}

func (m Model) startExtInstall(source string) (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	ch := m.events
	go func() {
		ch <- busyMsg{true, "installing extension"}
		res, err := ext.Install(context.Background(), source)
		if err == nil {
			for _, w := range res.Warnings {
				ch <- logMsg{"! " + w}
			}
			ch <- logMsg{fmt.Sprintf("installed %s %s  (%s, release %s)",
				res.Entry.ID, res.Entry.Version, res.Entry.Repo, res.Entry.Tag)}
			for _, s := range res.Skills {
				ch <- logMsg{"  + skill " + s.Name + " — " + s.Description}
			}
			if len(res.Skills) == 0 {
				ch <- logMsg{"  (no skills contributed)"}
			}
			if res.NeedsTrust {
				ch <- logMsg{"! executable extension: it stays inert until you run /ext trust " + res.Entry.ID}
			}
		}
		ch <- doneMsg{"ext install", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startExtUpdate(id string) (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	ch := m.events
	go func() {
		ch <- busyMsg{true, "updating extensions"}
		var results []ext.UpdateResult
		var err error
		if id != "" {
			results, err = ext.Update(context.Background(), id)
		} else {
			results, err = ext.Update(context.Background())
		}
		if err == nil && len(results) == 0 {
			ch <- logMsg{"no extensions installed"}
		}
		for _, r := range results {
			switch {
			case r.Err != nil:
				ch <- logMsg{fmt.Sprintf("✗ %s: %v", r.ID, r.Err)}
			case r.Updated:
				ch <- logMsg{fmt.Sprintf("✓ %s %s → %s", r.ID, r.From, r.To)}
			default:
				ch <- logMsg{fmt.Sprintf("· %s %s is current", r.ID, r.From)}
			}
		}
		ch <- doneMsg{"ext update", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}

func (m Model) startExtSearch(term string) (tea.Model, tea.Cmd) {
	if m.guardBusy() {
		return m.busyNote()
	}
	ch := m.events
	go func() {
		ch <- busyMsg{true, "searching extensions"}
		entries, err := ext.Registry(context.Background(), false)
		if err == nil {
			hits := ext.SearchRegistry(entries, term)
			if len(hits) == 0 {
				ch <- logMsg{"no matching extensions in the registry"}
			}
			for _, e := range hits {
				ch <- logMsg{fmt.Sprintf("%-32s %-28s [%s] %s", e.ID, e.Repo, e.TierLabel(), e.Description)}
			}
			if len(hits) > 0 {
				ch <- logMsg{"install with /ext install <owner/repo>"}
			}
		}
		ch <- doneMsg{"ext search", err}
		ch <- busyMsg{false, ""}
	}()
	return m, nil
}
