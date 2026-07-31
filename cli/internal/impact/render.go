package impact

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Rendering shared by the CLI and the persisted report. The TUI tree view
// consumes the Report struct directly instead.

// kindHeadings names each group as a human reads it.
var kindHeadings = map[Kind]string{
	KindSymbol: "Symbols",
	KindFile:   "Files",
	KindModule: "Modules",
	KindDoc:    "Wiki documents",
	KindSkill:  "Skills",
	KindTest:   "Tests",
}

// ByKind groups the verified items in presentation order; kinds with no items
// are omitted.
func (r *Report) ByKind() ([]Kind, map[Kind][]Item) {
	groups := map[Kind][]Item{}
	for _, it := range r.Items {
		groups[it.Kind] = append(groups[it.Kind], it)
	}
	var kinds []Kind
	for _, k := range kindOrder {
		if len(groups[k]) > 0 {
			kinds = append(kinds, k)
		}
	}
	return kinds, groups
}

// Markdown renders the report as a standalone document.
func (r *Report) Markdown() string {
	var b strings.Builder
	b.WriteString("# Impact report\n\n")
	fmt.Fprintf(&b, "**Intent:** %s\n\n", r.Intent)
	fmt.Fprintf(&b, "**Risk:** %s — %s\n\n", r.Risk, r.Summary)
	if !r.GeneratedAt.IsZero() {
		fmt.Fprintf(&b, "_Generated %s by %s._\n", r.GeneratedAt.Format("2006-01-02 15:04"), r.Model)
	}

	kinds, groups := r.ByKind()
	for _, k := range kinds {
		b.WriteString("\n## " + kindHeadings[k] + "\n\n")
		for _, it := range groups[k] {
			b.WriteString("- " + itemLine(it) + "\n")
		}
	}

	if len(r.Checklist) > 0 {
		b.WriteString("\n## Checklist\n\n")
		for _, c := range r.Checklist {
			b.WriteString("- [ ] " + c + "\n")
		}
	}

	if len(r.Unverified) > 0 {
		b.WriteString("\n## Unverified claims\n\n")
		b.WriteString("The model named these, but the index could not confirm them:\n\n")
		for _, it := range r.Unverified {
			b.WriteString("- " + itemLine(it) + "\n")
		}
	}

	if len(r.Notes) > 0 {
		b.WriteString("\n## Notes\n\n")
		for _, n := range r.Notes {
			b.WriteString("- " + n + "\n")
		}
	}
	return b.String()
}

// itemLine is one bullet: name, location, risk and reason.
func itemLine(it Item) string {
	var b strings.Builder
	fmt.Fprintf(&b, "**%s**", it.Name)
	if it.Path != "" && it.Path != it.Name {
		fmt.Fprintf(&b, " `%s`", it.Path)
	}
	fmt.Fprintf(&b, " (%s)", it.Risk)
	if it.Reason != "" {
		b.WriteString(" — " + it.Reason)
	}
	return b.String()
}

// JSON renders the report for machine consumers (-format json).
func (r *Report) JSON() (string, error) {
	raw, err := json.MarshalIndent(r, "", "  ")
	if err != nil {
		return "", err
	}
	return string(raw) + "\n", nil
}
