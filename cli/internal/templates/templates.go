// Package templates implements parameterized prompt files: reusable prompts
// with {{placeholder}} slots, stored in .kaioken/templates/, expanded and
// sent as ordinary chat messages via /t:<name>.
//
// Skills teach the agent how to do a task; a template is the other
// direction — it captures how the *user* phrases a recurring request
// ("review this file for X, Y, Z") so the request stops being retyped and
// starts being versioned.
package templates

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

	"kaioken/internal/config"
)

// Template is one parameterized prompt file.
type Template struct {
	Name    string
	Path    string
	Content string
	// Vars are the distinct {{placeholders}} in file order, "args" excluded.
	Vars []string
}

// Dir is where a repository's templates live.
func Dir(repo string) string {
	return filepath.Join(repo, config.Dir, "templates")
}

var placeholderRe = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}`)

// List returns the repo's templates, sorted by name. A missing directory is
// an empty list, not an error.
func List(repo string) ([]Template, error) {
	entries, err := os.ReadDir(Dir(repo))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	var out []Template
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".md") {
			continue
		}
		t, err := Load(repo, strings.TrimSuffix(name, ".md"))
		if err != nil {
			continue // one unreadable file must not hide the rest
		}
		out = append(out, t)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

// Load reads one template by name.
func Load(repo, name string) (Template, error) {
	name = strings.TrimSpace(name)
	if name == "" || strings.ContainsAny(name, `/\`) || strings.Contains(name, "..") {
		return Template{}, fmt.Errorf("invalid template name %q", name)
	}
	p := filepath.Join(Dir(repo), name+".md")
	raw, err := os.ReadFile(p)
	if err != nil {
		return Template{}, err
	}
	content := strings.TrimSpace(string(raw))
	var vars []string
	seen := map[string]bool{}
	for _, m := range placeholderRe.FindAllStringSubmatch(content, -1) {
		v := m[1]
		if v == "args" || seen[v] {
			continue
		}
		seen[v] = true
		vars = append(vars, v)
	}
	return Template{Name: name, Path: p, Content: content, Vars: vars}, nil
}

// Expand fills a template's placeholders from an argument string.
//
// Tokens shaped key=value bind named placeholders; everything else, in
// order, joins into {{args}}. A placeholder nothing filled stays literal so
// the user can see what the prompt still needs — silently sending "review
// {{file}}" with the hole blanked out would hide the mistake from the one
// person able to fix it.
func Expand(t Template, argstr string) (string, []string) {
	named := map[string]string{}
	var rest []string
	for _, tok := range strings.Fields(argstr) {
		if k, v, ok := strings.Cut(tok, "="); ok && named[k] == "" && k != "" && placeholderName(k) {
			named[k] = v
			continue
		}
		rest = append(rest, tok)
	}
	named["args"] = strings.Join(rest, " ")

	var missing []string
	out := placeholderRe.ReplaceAllStringFunc(t.Content, func(ph string) string {
		key := placeholderRe.FindStringSubmatch(ph)[1]
		if v, ok := named[key]; ok && v != "" {
			return v
		}
		if key == "args" {
			return "" // an empty catch-all is fine, not a hole
		}
		missing = append(missing, key)
		return ph
	})
	return strings.TrimSpace(out), missing
}

// placeholderName reports whether s could be a placeholder key, so that an
// = inside ordinary prose ("x=y in the code") is not eaten as a binding.
func placeholderName(s string) bool {
	for i := 0; i < len(s); i++ {
		c := s[i]
		if (c < 'a' || c > 'z') && (c < 'A' || c > 'Z') && (c < '0' || c > '9') && c != '_' && c != '-' {
			return false
		}
	}
	return len(s) > 0
}
