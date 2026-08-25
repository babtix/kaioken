package impact

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"kaioken/internal/config"
	"kaioken/internal/skills"
)

// Every run is persisted under .kaioken/impact/ so the intent and prediction
// survive the session — the provenance trail for "why did we think this was
// safe". The footer uses the same machine-readable format as wiki documents,
// so tooling that understands one understands both.

// storeDir is the report directory inside a repository.
func storeDir(repo string) string {
	return filepath.Join(repo, config.Dir, "impact")
}

// save writes the report and returns its repo-relative path.
func (r *Report) save(repo string) (string, error) {
	if err := os.MkdirAll(storeDir(repo), 0o755); err != nil {
		return "", err
	}
	stamp := r.GeneratedAt
	if stamp.IsZero() {
		stamp = time.Now()
	}
	name := stamp.Format("20060102-150405") + "-" + skills.Slug(r.Intent) + ".md"

	doc := r.Markdown()
	if paths := r.itemPaths(); len(paths) > 0 {
		doc = strings.TrimRight(doc, "\n") + "\n\n<!-- kaioken:files " +
			strings.Join(paths, ",") + " -->\n"
	}
	path := filepath.Join(storeDir(repo), name)
	if err := os.WriteFile(path, []byte(doc), 0o644); err != nil {
		return "", err
	}
	return filepath.ToSlash(filepath.Join(config.Dir, "impact", name)), nil
}

// itemPaths collects every verified repo path in the report, deduplicated.
func (r *Report) itemPaths() []string {
	seen := map[string]bool{}
	var out []string
	for _, it := range r.Items {
		if it.Path == "" || seen[it.Path] {
			continue
		}
		seen[it.Path] = true
		out = append(out, it.Path)
	}
	return out
}

// Counts summarizes the report for one-line status output.
func (r *Report) Counts() string {
	kinds, groups := r.ByKind()
	if len(kinds) == 0 {
		return "no affected items"
	}
	parts := make([]string, 0, len(kinds))
	for _, k := range kinds {
		parts = append(parts, fmt.Sprintf("%d %s", len(groups[k]), strings.ToLower(kindHeadings[k])))
	}
	return strings.Join(parts, " · ")
}
