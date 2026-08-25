package tui

import (
	"fmt"
	"strings"

	tea "github.com/charmbracelet/bubbletea"

	"kaioken/internal/impact"
)

// The impact tree is a full-screen, keyboard-driven view of one impact
// report: groups per kind (symbols, files, modules, docs, skills, tests)
// that fold and unfold, with a kind filter for "show only the docs" style
// questions. Closing it writes the current view into the transcript so the
// report stays consultable after the interaction ends.

// impactFilter selects which kind groups are visible.
type impactFilter string

const (
	filterAll     impactFilter = "all"
	filterCode    impactFilter = "code"
	filterModules impactFilter = "modules"
	filterDocs    impactFilter = "docs"
	filterSkills  impactFilter = "skills"
	filterTests   impactFilter = "tests"
)

// filterCycle is the order the f key steps through.
var filterCycle = []impactFilter{filterAll, filterCode, filterModules, filterDocs, filterSkills, filterTests}

// kindsFor maps a filter to the kinds it keeps visible.
func kindsFor(f impactFilter) []impact.Kind {
	switch f {
	case filterCode:
		return []impact.Kind{impact.KindSymbol, impact.KindFile}
	case filterModules:
		return []impact.Kind{impact.KindModule}
	case filterDocs:
		return []impact.Kind{impact.KindDoc}
	case filterSkills:
		return []impact.Kind{impact.KindSkill}
	case filterTests:
		return []impact.Kind{impact.KindTest}
	default:
		return []impact.Kind{impact.KindSymbol, impact.KindFile, impact.KindModule,
			impact.KindDoc, impact.KindSkill, impact.KindTest}
	}
}

// impactNode is one visible row: a foldable group header or an item.
type impactNode struct {
	id    string // stable key for the collapsed set
	group bool
	label string // group heading text
	count int
	item  impact.Item
	dim   bool // unverified items render dimmed
}

type impactTree struct {
	report    *impact.Report
	filter    impactFilter
	collapsed map[string]bool
	cursor    int
	scroll    int
	nodes     []impactNode
}

// openImpactTree switches the model into the tree view for a fresh report.
func (m *Model) openImpactTree(rep *impact.Report) {
	m.impactTree = &impactTree{
		report:    rep,
		filter:    filterAll,
		collapsed: map[string]bool{},
	}
	m.impactTree.rebuild()
	m.mode = modeImpact
}

// rebuild recomputes the visible rows for the current filter and fold state.
func (t *impactTree) rebuild() {
	t.nodes = t.nodes[:0]
	_, groups := t.report.ByKind()
	headings := map[impact.Kind]string{
		impact.KindSymbol: "Symbols", impact.KindFile: "Files",
		impact.KindModule: "Modules", impact.KindDoc: "Wiki documents",
		impact.KindSkill: "Skills", impact.KindTest: "Tests",
	}
	for _, k := range kindsFor(t.filter) {
		items := groups[k]
		if len(items) == 0 {
			continue
		}
		id := "group:" + string(k)
		t.nodes = append(t.nodes, impactNode{id: id, group: true, label: headings[k], count: len(items)})
		if t.collapsed[id] {
			continue
		}
		for i, it := range items {
			t.nodes = append(t.nodes, impactNode{id: fmt.Sprintf("%s/%d", id, i), item: it})
		}
	}
	// Unverified claims only clutter a filtered view; show them under "all".
	if t.filter == filterAll && len(t.report.Unverified) > 0 {
		id := "group:unverified"
		t.nodes = append(t.nodes, impactNode{id: id, group: true, label: "Unverified claims", count: len(t.report.Unverified)})
		if !t.collapsed[id] {
			for i, it := range t.report.Unverified {
				t.nodes = append(t.nodes, impactNode{id: fmt.Sprintf("%s/%d", id, i), item: it, dim: true})
			}
		}
	}
	if t.cursor >= len(t.nodes) {
		t.cursor = max(len(t.nodes)-1, 0)
	}
}

// onImpactKey drives the tree while it is open.
func (m Model) onImpactKey(key string) (tea.Model, tea.Cmd) {
	t := m.impactTree
	if t == nil { // stale mode — never trap the user
		m.mode = modeChat
		return m, nil
	}
	switch key {
	case "up", "k":
		t.cursor = max(t.cursor-1, 0)
	case "down", "j":
		t.cursor = min(t.cursor+1, max(len(t.nodes)-1, 0))
	case "pgup":
		t.cursor = max(t.cursor-m.impactBodyRows(), 0)
	case "pgdown":
		t.cursor = min(t.cursor+m.impactBodyRows(), max(len(t.nodes)-1, 0))
	case "home":
		t.cursor = 0
	case "end":
		t.cursor = max(len(t.nodes)-1, 0)
	case "enter", " ", "space", "left", "right":
		if t.cursor < len(t.nodes) && t.nodes[t.cursor].group {
			id := t.nodes[t.cursor].id
			switch key {
			case "left":
				t.collapsed[id] = true
			case "right":
				t.collapsed[id] = false
			default:
				t.collapsed[id] = !t.collapsed[id]
			}
			t.rebuild()
		}
	case "f":
		for i, f := range filterCycle {
			if f == t.filter {
				t.filter = filterCycle[(i+1)%len(filterCycle)]
				break
			}
		}
		t.cursor, t.scroll = 0, 0
		t.rebuild()
	case "a", "c", "d", "s":
		t.filter = map[string]impactFilter{
			"a": filterAll, "c": filterCode, "d": filterDocs, "s": filterSkills,
		}[key]
		t.cursor, t.scroll = 0, 0
		t.rebuild()
	case "m", "t":
		t.filter = map[string]impactFilter{"m": filterModules, "t": filterTests}[key]
		t.cursor, t.scroll = 0, 0
		t.rebuild()
	case "u":
		// Hand off to the incremental updater — useful once the change has
		// actually been made; until then it reports "already current".
		m.closeImpactTree()
		return m.startWikiUpdate(nil)
	case "esc", "q", "ctrl+c":
		m.closeImpactTree()
	}
	return m, nil
}

// closeImpactTree returns to chat, preserving the current view as transcript
// lines so the report is still there after the interaction.
func (m *Model) closeImpactTree() {
	t := m.impactTree
	m.mode = modeChat
	m.impactTree = nil
	if t == nil {
		return
	}
	var b []string
	b = append(b, m.impactHeader(t)...)
	for _, n := range t.nodes {
		b = append(b, renderImpactNode(n, false))
	}
	if t.report.SavedPath != "" {
		b = append(b, dimStyle.Render("full report: "+t.report.SavedPath+" · after making the change, /update refreshes docs and skills"))
	}
	m.appendLine(strings.Join(b, "\n"))
	m.syncLayout()
}

// impactBodyRows is how many tree rows fit between header and footer.
func (m Model) impactBodyRows() int {
	// 3 header rows + 1 footer row; keep at least one body row.
	return max(m.height-4, 1)
}

// impactHeader is the block above the tree: intent, verdict, filter state.
func (m Model) impactHeader(t *impactTree) []string {
	rep := t.report
	risk := riskStyle(rep.Risk).Render(strings.ToUpper(rep.Risk))
	return []string{
		promptStyle.Render("impact") + " " + userStyle.Render(clip(rep.Intent, max(m.width-10, 10))),
		risk + " " + clip(rep.Summary, max(m.width-10, 10)),
		dimStyle.Render(clip("filter: "+string(t.filter)+" · "+rep.Counts(), max(m.width, 10))),
	}
}

// impactView renders the full-screen tree.
func (m Model) impactView() string {
	t := m.impactTree
	if t == nil {
		return ""
	}
	rows := m.impactBodyRows()
	// Keep the cursor inside the visible window.
	if t.cursor < t.scroll {
		t.scroll = t.cursor
	}
	if t.cursor >= t.scroll+rows {
		t.scroll = t.cursor - rows + 1
	}

	lines := m.impactHeader(t)
	end := min(t.scroll+rows, len(t.nodes))
	for i := t.scroll; i < end; i++ {
		lines = append(lines, clip(renderImpactNode(t.nodes[i], i == t.cursor), m.width))
	}
	for len(lines) < rows+3 {
		lines = append(lines, "")
	}
	lines = append(lines, clip(hintStyle.Render(
		"↑/↓ move · enter fold · f cycle filter (a/c/m/d/s/t direct) · u /update · q close"), m.width))
	return strings.Join(lines, "\n")
}

// renderImpactNode draws one row; selected adds the cursor marker.
func renderImpactNode(n impactNode, selected bool) string {
	marker := "  "
	if selected {
		marker = promptStyle.Render("› ")
	}
	if n.group {
		return fmt.Sprintf("%s%s %s", marker,
			promptStyle.Render(n.label), dimStyle.Render(fmt.Sprintf("(%d)", n.count)))
	}
	it := n.item
	var b strings.Builder
	b.WriteString(marker + "  ├─ ")
	name := it.Name
	if name == "" {
		name = it.Path
	}
	if n.dim {
		b.WriteString(dimStyle.Render(name))
	} else {
		b.WriteString(name)
	}
	if it.Path != "" && it.Path != name {
		b.WriteString(" " + dimStyle.Render(it.Path))
	}
	b.WriteString(" " + riskStyle(it.Risk).Render("["+it.Risk+"]"))
	if it.Reason != "" {
		b.WriteString(" " + dimStyle.Render(clip(it.Reason, 80)))
	}
	return b.String()
}

// riskStyle colors a risk level the way the rest of the UI colors outcomes.
func riskStyle(risk string) interface{ Render(...string) string } {
	switch risk {
	case "high":
		return errStyle
	case "low":
		return okStyle
	default:
		return warnStyle
	}
}
