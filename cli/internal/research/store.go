package research

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"
)

// A finished run is worth keeping: the report cost real searches, fetches and
// model calls, and the user will want it again. The rendered markdown is the
// human artifact; this store keeps the structured twin — question, body,
// numbered sources, counters — as <slug>.json beside it, so a client can
// rebuild the full answer surface (citation chips included) without
// re-parsing prose.

// SavedReport is the durable form of a Report.
type SavedReport struct {
	Slug       string        `json:"slug"`
	Question   string        `json:"question"`
	Markdown   string        `json:"markdown,omitempty"`
	Sources    []SavedSource `json:"sources"`
	Rounds     int           `json:"rounds"`
	Searched   int           `json:"searched"`
	Fetched    int           `json:"fetched"`
	Incomplete bool          `json:"incomplete"`
	// ReportPath is the repo-relative path of the rendered markdown.
	ReportPath string    `json:"report_path,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// SavedSource mirrors Source with the wire-format field names the desktop's
// answer surface expects.
type SavedSource struct {
	N     int    `json:"n"`
	URL   string `json:"url"`
	Title string `json:"title"`
}

// Slug turns a question into a filename stem: filesystem-safe, lower-case,
// dash-separated, capped so a long question cannot exceed path limits.
func Slug(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
			dash = false
		default:
			if !dash && b.Len() > 0 {
				b.WriteByte('-')
				dash = true
			}
		}
		if b.Len() >= 60 {
			break
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "research"
	}
	return out
}

// validSlug guards Load and Delete: a slug is only ever the output of Slug,
// so anything else — separators, dots, drive letters — is a hostile path.
func validSlug(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}

// Save persists rep as <slug>.json in dir, creating dir if needed. A rerun
// of the same question overwrites its predecessor — the newest answer is the
// one the user meant to keep.
func Save(dir string, rep *Report, reportPath string) (*SavedReport, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}
	sources := make([]SavedSource, 0, len(rep.Sources))
	for _, s := range rep.Sources {
		sources = append(sources, SavedSource{N: s.N, URL: s.URL, Title: s.Title})
	}
	saved := &SavedReport{
		Slug:       Slug(rep.Question),
		Question:   rep.Question,
		Markdown:   rep.Markdown,
		Sources:    sources,
		Rounds:     rep.Rounds,
		Searched:   rep.Searched,
		Fetched:    rep.Fetched,
		Incomplete: rep.Incomplete,
		ReportPath: reportPath,
		CreatedAt:  time.Now().UTC(),
	}
	data, err := json.MarshalIndent(saved, "", "  ")
	if err != nil {
		return nil, err
	}
	if err := os.WriteFile(filepath.Join(dir, saved.Slug+".json"), data, 0o644); err != nil {
		return nil, err
	}
	return saved, nil
}

// List returns every saved report in dir, newest first, markdown stripped —
// a history listing needs questions and counters, not whole reports. Files
// that fail to parse are skipped rather than sinking the listing.
func List(dir string) []*SavedReport {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var out []*SavedReport
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		saved, err := Load(dir, strings.TrimSuffix(e.Name(), ".json"))
		if err != nil {
			continue
		}
		saved.Markdown = ""
		out = append(out, saved)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	return out
}

// Load reads one saved report by slug.
func Load(dir, slug string) (*SavedReport, error) {
	if !validSlug(slug) {
		return nil, fmt.Errorf("invalid research slug %q", slug)
	}
	data, err := os.ReadFile(filepath.Join(dir, slug+".json"))
	if err != nil {
		return nil, err
	}
	var saved SavedReport
	if err := json.Unmarshal(data, &saved); err != nil {
		return nil, err
	}
	if saved.Slug == "" {
		saved.Slug = slug
	}
	return &saved, nil
}

// Delete removes a saved report and its rendered markdown twin.
func Delete(dir, slug string) error {
	if !validSlug(slug) {
		return fmt.Errorf("invalid research slug %q", slug)
	}
	if err := os.Remove(filepath.Join(dir, slug+".json")); err != nil {
		return err
	}
	// The markdown may have been renamed or written elsewhere via -out;
	// its absence is not an error.
	_ = os.Remove(filepath.Join(dir, slug+".md"))
	return nil
}
