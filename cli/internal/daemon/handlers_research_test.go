package daemon

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/research"
)

// TestResearchHistoryEndpoints covers the saved deep-search lifecycle over
// HTTP: a report seeded on disk is listed, reopened in full, and deleted.
func TestResearchHistoryEndpoints(t *testing.T) {
	home := t.TempDir()
	t.Setenv(config.HomeEnv, home)
	ts := newTestServer(t, nil)
	auth := "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)

	// Seed one saved report the way a finished run would.
	dir := filepath.Join(repo, config.Dir, "research")
	saved, err := research.Save(dir, &research.Report{
		Question: "Is solar cheaper than nuclear?",
		Markdown: "## Short answer\nYes [1].",
		Sources:  []research.Source{{N: 1, URL: "https://a.example", Title: "A"}},
		Searched: 6, Fetched: 4, Rounds: 2,
	}, config.Dir+"/research/is-solar-cheaper-than-nuclear.md", research.Provenance{})
	if err != nil {
		t.Fatal(err)
	}

	base := ts.URL + "/v1/workspaces/" + ws.ID + "/research"

	// List: one entry, markdown stripped.
	resp = doRequest(t, "GET", base, testToken, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("list: status %d", resp.StatusCode)
	}
	var list struct {
		Reports []research.SavedReport `json:"reports"`
	}
	decodeJSON(t, resp, &list)
	if len(list.Reports) != 1 || list.Reports[0].Slug != saved.Slug {
		t.Fatalf("list = %+v", list.Reports)
	}
	if list.Reports[0].Markdown != "" {
		t.Error("list should not carry report bodies")
	}

	// Get: the full body comes back.
	resp = doRequest(t, "GET", base+"/"+saved.Slug, testToken, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("get: status %d", resp.StatusCode)
	}
	var got research.SavedReport
	decodeJSON(t, resp, &got)
	if got.Markdown != "## Short answer\nYes [1]." || len(got.Sources) != 1 {
		t.Fatalf("get = %+v", got)
	}

	// A hostile slug is a 404, never a file read.
	resp = doRequest(t, "GET", base+"/..%2F..%2Fetc%2Fpasswd", testToken, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("hostile slug: status %d, want 404", resp.StatusCode)
	}

	// Export: an ordinary report renders to a PDF beside its markdown twin.
	// This is the desktop's Export button, and it has to work for every saved
	// report, not only the deep ones.
	resp = doRequest(t, "POST", base+"/"+saved.Slug+"/export", testToken, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("export: status %d", resp.StatusCode)
	}
	var exp struct {
		Path  string `json:"path"`
		Rel   string `json:"rel"`
		Pages int    `json:"pages"`
		Bytes int64  `json:"bytes"`
		Deep  bool   `json:"deep"`
	}
	decodeJSON(t, resp, &exp)
	if exp.Pages < 1 {
		t.Errorf("export reported %d pages", exp.Pages)
	}
	if exp.Deep {
		t.Error("an ordinary report was reported as a dossier")
	}
	if exp.Rel != config.Dir+"/research/"+saved.Slug+".pdf" {
		t.Errorf("Rel = %q, want the pdf beside the markdown", exp.Rel)
	}
	pdfBytes, err := os.ReadFile(filepath.Join(dir, saved.Slug+".pdf"))
	if err != nil {
		t.Fatalf("the export wrote no file: %v", err)
	}
	if len(pdfBytes) < 4 || string(pdfBytes[:5]) != "%PDF-" {
		t.Error("the exported file is not a PDF")
	}
	if exp.Bytes != int64(len(pdfBytes)) {
		t.Errorf("Bytes = %d, want %d", exp.Bytes, len(pdfBytes))
	}

	// Exporting something that was never researched is a 404, not a stray file.
	resp = doRequest(t, "POST", base+"/nothing-here/export", testToken, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("export of an unknown slug: status %d, want 404", resp.StatusCode)
	}

	// Delete, then the listing is empty again.
	resp = doRequest(t, "DELETE", base+"/"+saved.Slug, testToken, "")
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("delete: status %d", resp.StatusCode)
	}
	resp = doRequest(t, "DELETE", base+"/"+saved.Slug, testToken, "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("delete twice: status %d, want 404", resp.StatusCode)
	}
	resp = doRequest(t, "GET", base, testToken, "")
	decodeJSON(t, resp, &list)
	if len(list.Reports) != 0 {
		t.Fatalf("after delete, list = %+v", list.Reports)
	}
}
