package daemon

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// prismFixture opens a workspace on a temp repo and returns the test server
// and the workspace id.
func prismFixture(t *testing.T) (*httpTestServer, string) {
	t.Helper()

	srv := &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(),
		cancel: func() {}, hub: NewHub(), mgr: NewManager()}
	srv.runs = NewRuns(srv.hub)
	srv.approvals = NewApprovals()

	repo := t.TempDir()
	ws, err := srv.mgr.Open(repo)
	if err != nil {
		t.Fatal(err)
	}
	return &httpTestServer{Server: newTestServer(t, srv), t: t}, ws.ID
}

type httpTestServer struct {
	*httptest.Server
	t *testing.T
}

func (h *httpTestServer) do(method, path string, body any) (*http.Response, map[string]any) {
	h.t.Helper()

	var rdr io.Reader
	if body != nil {
		raw, err := json.Marshal(body)
		if err != nil {
			h.t.Fatal(err)
		}
		rdr = bytes.NewReader(raw)
	}
	req, err := http.NewRequest(method, h.URL+path, rdr)
	if err != nil {
		h.t.Fatal(err)
	}
	req.Header.Set("Authorization", "Bearer "+testToken)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		h.t.Fatal(err)
	}
	h.t.Cleanup(func() { resp.Body.Close() })

	out := map[string]any{}
	raw, _ := io.ReadAll(resp.Body)
	_ = json.Unmarshal(raw, &out)
	return resp, out
}

func TestPrismModuleLifecycle(t *testing.T) {
	ts, id := prismFixture(t)
	base := "/v1/workspaces/" + id + "/prism"

	resp, body := ts.do(http.MethodPost, base+"/modules", map[string]any{
		"name": "Contract Law", "description": "clauses and precedent",
	})
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("create returned %d: %v", resp.StatusCode, body)
	}
	slug, _ := body["slug"].(string)
	if slug != "contract-law" {
		t.Errorf("slug = %q, want contract-law", slug)
	}

	resp, body = ts.do(http.MethodPost, base+"/modules", map[string]any{"name": "Contract Law"})
	if resp.StatusCode != http.StatusConflict {
		t.Errorf("duplicate slug returned %d, want 409", resp.StatusCode)
	}

	resp, body = ts.do(http.MethodPatch, base+"/modules/"+slug, map[string]any{
		"description": "updated",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("patch returned %d: %v", resp.StatusCode, body)
	}
	if body["description"] != "updated" {
		t.Errorf("description = %v after patch", body["description"])
	}

	resp, _ = ts.do(http.MethodDelete, base+"/modules/"+slug, nil)
	if resp.StatusCode != http.StatusOK {
		t.Errorf("delete returned %d", resp.StatusCode)
	}

	resp, _ = ts.do(http.MethodGet, base+"/modules/"+slug+"/documents", nil)
	if resp.StatusCode != http.StatusNotFound {
		t.Errorf("documents of a deleted module returned %d, want 404", resp.StatusCode)
	}
}

func TestPrismImportAndQuery(t *testing.T) {
	ts, id := prismFixture(t)
	base := "/v1/workspaces/" + id + "/prism"

	if resp, body := ts.do(http.MethodPost, base+"/modules", map[string]any{"name": "Notes"}); resp.StatusCode != http.StatusCreated {
		t.Fatalf("create returned %d: %v", resp.StatusCode, body)
	}

	resp, body := ts.do(http.MethodPost, base+"/modules/notes/documents", map[string]any{
		"filename": "retry.md",
		"text": "# Retry Policy\n\n" +
			strings.Repeat("Failed requests retry with exponential backoff and full jitter. ", 10),
	})
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("import returned %d: %v", resp.StatusCode, body)
	}
	if body["status"] != "processing" {
		t.Errorf("import status = %v, want processing", body["status"])
	}

	// Ingestion is detached from the request; the client polls the document
	// list, which carries the status the ingestor writes.
	deadline := time.Now().Add(10 * time.Second)
	var docs []any
	for time.Now().Before(deadline) {
		_, listed := ts.do(http.MethodGet, base+"/modules/notes/documents", nil)
		docs, _ = listed["documents"].([]any)
		if len(docs) > 0 {
			if d, ok := docs[0].(map[string]any); ok && d["status"] == "ready" {
				break
			}
		}
		time.Sleep(50 * time.Millisecond)
	}
	if len(docs) == 0 {
		t.Fatal("the imported document never appeared")
	}
	if d := docs[0].(map[string]any); d["status"] != "ready" {
		t.Fatalf("document status = %v, error = %v", d["status"], d["error"])
	}

	resp, body = ts.do(http.MethodPost, base+"/query", map[string]any{
		"query": "exponential backoff jitter", "module": "notes",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("query returned %d: %v", resp.StatusCode, body)
	}
	if body["source_found"] != true {
		t.Errorf("source_found = %v for a phrase in the corpus", body["source_found"])
	}
}

func TestPrismQueryReportsEachFlagSeparately(t *testing.T) {
	// A client that gets one boolean cannot tell an empty corpus from a broken
	// retriever, which is the whole reason these are three fields.
	ts, id := prismFixture(t)
	base := "/v1/workspaces/" + id + "/prism"

	ts.do(http.MethodPost, base+"/modules", map[string]any{"name": "Empty"})
	resp, body := ts.do(http.MethodPost, base+"/query", map[string]any{
		"query": "anything at all", "module": "empty",
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("query returned %d: %v", resp.StatusCode, body)
	}
	for _, field := range []string{"source_found", "graded", "degraded"} {
		if _, present := body[field]; !present {
			t.Errorf("response omits %q", field)
		}
	}
	if body["chunks"] == nil {
		t.Error("chunks is null; an empty answer is an empty list")
	}
}

func TestPrismQueryValidatesItsInput(t *testing.T) {
	ts, id := prismFixture(t)
	base := "/v1/workspaces/" + id + "/prism"

	for _, body := range []map[string]any{
		{"module": "notes"},
		{"query": "something"},
	} {
		if resp, _ := ts.do(http.MethodPost, base+"/query", body); resp.StatusCode != http.StatusBadRequest {
			t.Errorf("query %v returned %d, want 400", body, resp.StatusCode)
		}
	}

	if resp, _ := ts.do(http.MethodPost, base+"/query", map[string]any{
		"query": "q", "module": "ghost",
	}); resp.StatusCode != http.StatusNotFound {
		t.Errorf("query against a missing module returned %d, want 404", resp.StatusCode)
	}
}

func TestPrismImportRejectsUnsupportedFilesUpFront(t *testing.T) {
	// A 400 the caller can act on beats a background failure they have to go
	// looking for.
	ts, id := prismFixture(t)
	base := "/v1/workspaces/" + id + "/prism"
	ts.do(http.MethodPost, base+"/modules", map[string]any{"name": "Docs"})

	dir := t.TempDir()
	pdf := filepath.Join(dir, "book.pdf")
	if err := os.WriteFile(pdf, []byte("%PDF-1.4"), 0o644); err != nil {
		t.Fatal(err)
	}

	resp, body := ts.do(http.MethodPost, base+"/modules/docs/documents", map[string]any{"path": pdf})
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("PDF import returned %d: %v", resp.StatusCode, body)
	}
}

func TestPrismSettingsRoundTrip(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KAIOKEN_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)

	ts, _ := prismFixture(t)

	resp, body := ts.do(http.MethodPut, "/v1/settings/prism", map[string]any{
		"utility_model": "some/cheap-model",
		"variants":      3,
		"mode":          "agent",
		"grade":         false,
	})
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("put returned %d: %v", resp.StatusCode, body)
	}
	if body["utility_model"] != "some/cheap-model" {
		t.Errorf("utility_model = %v", body["utility_model"])
	}
	if body["mode"] != "agent" {
		t.Errorf("mode = %v", body["mode"])
	}
	if body["grade"] != false {
		t.Errorf("grade = %v, want false", body["grade"])
	}

	_, got := ts.do(http.MethodGet, "/v1/settings/prism", nil)
	if got["utility_model"] != "some/cheap-model" {
		t.Errorf("settings did not persist: %v", got)
	}
}

func TestPrismSettingsClampVariantsAndRejectBadMode(t *testing.T) {
	dir := t.TempDir()
	t.Setenv("KAIOKEN_HOME", dir)
	t.Setenv("HOME", dir)
	t.Setenv("USERPROFILE", dir)

	ts, _ := prismFixture(t)

	_, body := ts.do(http.MethodPut, "/v1/settings/prism", map[string]any{"variants": 99})
	max, _ := body["max_variants"].(float64)
	got, _ := body["variants"].(float64)
	if got > max {
		t.Errorf("variants = %v, ceiling is %v", got, max)
	}

	if resp, _ := ts.do(http.MethodPut, "/v1/settings/prism", map[string]any{"mode": "turbo"}); resp.StatusCode != http.StatusBadRequest {
		t.Errorf("an unknown mode returned %d, want 400", resp.StatusCode)
	}
}
