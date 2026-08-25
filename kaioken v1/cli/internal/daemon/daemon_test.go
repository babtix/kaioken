package daemon

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

const testToken = "test-token-value"

// newTestServer builds an httptest server over the real mux with a fixed
// token, mirroring 08-testing.md's newTestServer helper. cancel defaults to a
// no-op; tests that care override it via a fresh *Server.
func newTestServer(t *testing.T, srv *Server) *httptest.Server {
	t.Helper()
	if srv == nil {
		srv = &Server{opts: Options{Token: testToken, Quiet: true}, started: time.Now(), cancel: func() {}, hub: NewHub(), mgr: NewManager()}
		srv.runs = NewRuns(srv.hub)
		srv.approvals = NewApprovals()
	}
	ts := httptest.NewServer(newMux(srv))
	t.Cleanup(ts.Close)
	return ts
}

func doRequest(t *testing.T, method, url, token, origin string) *http.Response {
	t.Helper()
	req, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatal(err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	if origin != "" {
		req.Header.Set("Origin", origin)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { resp.Body.Close() })
	return resp
}

// TestAuth is the table from 08-testing.md §8.1: token x origin x expected
// status, run against /v1/health as the representative endpoint.
func TestAuth(t *testing.T) {
	ts := newTestServer(t, nil)

	cases := []struct {
		name   string
		token  string
		origin string
		want   int
	}{
		{"absent token", "", "", http.StatusUnauthorized},
		{"wrong token", "not-the-token", "", http.StatusUnauthorized},
		{"right token, no origin", testToken, "", http.StatusOK},
		{"right token, tauri origin", testToken, "tauri://localhost", http.StatusOK},
		{"right token, dev origin", testToken, "http://localhost:1420", http.StatusOK},
		{"right token, hostile origin", testToken, "http://evil.example", http.StatusForbidden},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp := doRequest(t, http.MethodGet, ts.URL+"/v1/health", tc.token, tc.origin)
			if resp.StatusCode != tc.want {
				t.Errorf("status = %d, want %d", resp.StatusCode, tc.want)
			}
			if tc.origin != "" && tc.want != http.StatusForbidden {
				if got := resp.Header.Get("Access-Control-Allow-Origin"); got != tc.origin {
					t.Errorf("Access-Control-Allow-Origin = %q, want %q", got, tc.origin)
				}
			}
		})
	}
}

// TestCORSPreflight asserts an OPTIONS request from an allow-listed origin —
// which never carries the bearer token, since browsers strip it from
// preflights — is answered without auth, with the headers a real fetch()
// needs to not fail with "Failed to fetch" (see the originGuard doc comment).
func TestCORSPreflight(t *testing.T) {
	ts := newTestServer(t, nil)
	resp := doRequest(t, http.MethodOptions, ts.URL+"/v1/health", "", "http://localhost:1420")
	if resp.StatusCode != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:1420" {
		t.Errorf("Access-Control-Allow-Origin = %q, want http://localhost:1420", got)
	}
	if got := resp.Header.Get("Access-Control-Allow-Headers"); !strings.Contains(got, "Authorization") {
		t.Errorf("Access-Control-Allow-Headers = %q, want it to include Authorization", got)
	}
}

// TestErrorEnvelope asserts the §2.1 shape: {"error":{"code","message"}}.
func TestErrorEnvelope(t *testing.T) {
	ts := newTestServer(t, nil)
	resp := doRequest(t, http.MethodGet, ts.URL+"/v1/health", "", "")
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}

	var body struct {
		Error struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding error envelope: %v", err)
	}
	if body.Error.Code != codeUnauthorized {
		t.Errorf("error.code = %q, want %q", body.Error.Code, codeUnauthorized)
	}
	if body.Error.Message == "" {
		t.Error("error.message is empty")
	}
}

// TestHealth asserts the §2.2 payload shape and that a fresh server reports
// no open workspaces or active runs.
func TestHealth(t *testing.T) {
	ts := newTestServer(t, nil)
	resp := doRequest(t, http.MethodGet, ts.URL+"/v1/health", testToken, "")
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body healthResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decoding health response: %v", err)
	}
	if body.Status != "ok" {
		t.Errorf("status = %q, want ok", body.Status)
	}
	if body.WorkspacesOpen != 0 || body.RunsActive != 0 {
		t.Errorf("expected zero workspaces/runs on a fresh server, got %+v", body)
	}
}

// TestShutdown asserts 202 and that the root context's cancel is invoked —
// the handler defers the actual cancel to a goroutine so this response has a
// chance to flush first.
func TestShutdown(t *testing.T) {
	cancelled := make(chan struct{})
	srv := &Server{
		opts:    Options{Token: testToken, Quiet: true},
		started: time.Now(),
		cancel:  func() { close(cancelled) },
		hub:     NewHub(),
	}
	ts := newTestServer(t, srv)

	resp := doRequest(t, http.MethodPost, ts.URL+"/v1/shutdown", testToken, "")
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status = %d, want 202", resp.StatusCode)
	}

	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Error("cancel was not invoked within 1s")
	}
}

// TestRecoverer asserts a panicking handler becomes a 500 engine_error
// instead of taking the process down.
func TestRecoverer(t *testing.T) {
	h := recoverer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		panic("boom")
	}))
	ts := httptest.NewServer(h)
	defer ts.Close()

	resp, err := http.Get(ts.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", resp.StatusCode)
	}
	var body struct {
		Error struct{ Code string } `json:"error"`
	}
	json.NewDecoder(resp.Body).Decode(&body)
	if body.Error.Code != codeEngineError {
		t.Errorf("error.code = %q, want %q", body.Error.Code, codeEngineError)
	}
}
