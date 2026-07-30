package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
)

func fixtureRepo(t *testing.T) string {
	t.Helper()
	repo := t.TempDir()
	write := func(rel, body string) {
		full := filepath.Join(repo, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write(config.Dir+"/wiki/networking/retries.md", `# Retry Policy

Failed requests retry with exponential backoff and full jitter, so a
struggling upstream is not hammered by a thundering herd.
`)
	write(config.Dir+"/skills/add-endpoint/SKILL.md", `---
name: add-endpoint
description: How to add a new HTTP endpoint to the gateway.
origin: learned
---

Register the handler in mux.go, then add a table-driven test.
`)
	write(config.Dir+"/config.yaml", "version: 1\nmodel: test/model\n")
	return repo
}

// roundTrip drives a server over the stdio transport and returns responses by id.
func roundTrip(t *testing.T, srv *Server, frames ...string) map[int]json.RawMessage {
	t.Helper()
	var in bytes.Buffer
	for _, f := range frames {
		in.WriteString(f + "\n")
	}
	var out bytes.Buffer
	if err := srv.ServeStdio(context.Background(), &in, &out); err != nil {
		t.Fatalf("ServeStdio: %v", err)
	}

	got := map[int]json.RawMessage{}
	dec := json.NewDecoder(&out)
	for dec.More() {
		var resp struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *rpcError       `json:"error"`
		}
		if err := dec.Decode(&resp); err != nil {
			t.Fatalf("decoding response: %v", err)
		}
		if resp.Error != nil {
			t.Fatalf("request %d errored: %s", resp.ID, resp.Error.Message)
		}
		got[resp.ID] = resp.Result
	}
	return got
}

func newTestServer(t *testing.T, repo string) *Server {
	t.Helper()
	srv, err := New(Options{Repo: repo})
	if err != nil {
		t.Fatal(err)
	}
	return srv
}

func TestInitializeHandshake(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05"}}`)

	var res initializeResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if res.ProtocolVersion != ProtocolVersion {
		t.Errorf("protocol = %q, want %q", res.ProtocolVersion, ProtocolVersion)
	}
	if res.ServerInfo.Name != "kaioken" {
		t.Errorf("server name = %q", res.ServerInfo.Name)
	}
	if res.Capabilities.Tools == nil || res.Capabilities.Resources == nil {
		t.Error("server did not advertise tools and resources")
	}
	if res.Instructions == "" {
		t.Error("no instructions — clients use these to decide whether to call this server at all")
	}
}

func TestNotificationGetsNoResponse(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	var in bytes.Buffer
	in.WriteString(`{"jsonrpc":"2.0","method":"notifications/initialized"}` + "\n")
	var out bytes.Buffer
	if err := srv.ServeStdio(context.Background(), &in, &out); err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(out.String()) != "" {
		t.Errorf("notification produced a response: %s", out.String())
	}
}

func TestToolsListIsStableAndSchemad(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv, `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`)

	var res toolsListResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if len(res.Tools) == 0 {
		t.Fatal("no tools advertised")
	}
	for _, tool := range res.Tools {
		if tool.Description == "" {
			t.Errorf("tool %s has no description", tool.Name)
		}
		if !json.Valid(tool.InputSchema) {
			t.Errorf("tool %s has an invalid schema", tool.Name)
		}
		var sc struct {
			Type       string         `json:"type"`
			Properties map[string]any `json:"properties"`
		}
		if err := json.Unmarshal(tool.InputSchema, &sc); err != nil || sc.Type != "object" {
			t.Errorf("tool %s schema is not an object schema", tool.Name)
		}
	}

	// research_run costs money and must stay off unless explicitly enabled.
	for _, tool := range res.Tools {
		if tool.Name == "research_run" {
			t.Error("research_run exposed without AllowResearch")
		}
	}
}

func TestResearchToolGatedOn(t *testing.T) {
	srv, err := New(Options{Repo: fixtureRepo(t), AllowResearch: true})
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, tool := range srv.Tools() {
		if tool.Name == "research_run" {
			found = true
		}
	}
	if !found {
		t.Error("research_run missing with AllowResearch set")
	}
}

func TestWikiSearchFindsGeneratedChapter(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wiki_search","arguments":{"query":"exponential backoff"}}}`)

	var res ToolResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("wiki_search failed: %s", res.Content[0].Text)
	}
	if !strings.Contains(res.Content[0].Text, "Retry Policy") {
		t.Errorf("expected the retry chapter, got:\n%s", res.Content[0].Text)
	}
}

func TestWikiReadRejectsTraversal(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wiki_read","arguments":{"path":"../../../../etc/passwd"}}}`)

	var res ToolResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Fatal("path traversal was not rejected")
	}
	if !strings.Contains(res.Content[0].Text, "escapes the workspace") {
		t.Errorf("unexpected rejection reason: %s", res.Content[0].Text)
	}
}

func TestWikiReadReturnsTOC(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wiki_read","arguments":{"path":"networking/retries.md"}}}`)

	var res ToolResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("wiki_read failed: %s", res.Content[0].Text)
	}
	structured, _ := json.Marshal(res.Structured)
	var doc struct {
		Title string     `json:"title"`
		TOC   []tocEntry `json:"toc"`
	}
	if err := json.Unmarshal(structured, &doc); err != nil {
		t.Fatal(err)
	}
	if doc.Title != "Retry Policy" {
		t.Errorf("title = %q", doc.Title)
	}
	if len(doc.TOC) == 0 {
		t.Error("no table of contents extracted")
	}
}

func TestSkillsListReportsOrigin(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"skills_list","arguments":{}}}`)

	var res ToolResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if res.IsError {
		t.Fatalf("skills_list failed: %s", res.Content[0].Text)
	}
	if !strings.Contains(res.Content[0].Text, "add-endpoint") {
		t.Errorf("skill missing from listing:\n%s", res.Content[0].Text)
	}
	if !strings.Contains(res.Content[0].Text, "learned") {
		t.Errorf("origin not reported:\n%s", res.Content[0].Text)
	}
}

func TestUnknownToolIsProtocolError(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	var in bytes.Buffer
	in.WriteString(`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"nope","arguments":{}}}` + "\n")
	var out bytes.Buffer
	if err := srv.ServeStdio(context.Background(), &in, &out); err != nil {
		t.Fatal(err)
	}
	var resp struct {
		Error *rpcError `json:"error"`
	}
	if err := json.Unmarshal(out.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != codeMethodNotFound {
		t.Errorf("want method-not-found, got %+v", resp.Error)
	}
}

func TestFailingToolIsModelFacingNotFatal(t *testing.T) {
	// A tool that errors must come back as isError content, not a JSON-RPC
	// failure: the model recovers from the former and the client gives up on
	// the latter.
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"skills_get","arguments":{"name":"does-not-exist"}}}`)

	var res ToolResult
	if err := json.Unmarshal(got[1], &res); err != nil {
		t.Fatal(err)
	}
	if !res.IsError {
		t.Error("missing skill did not set isError")
	}
	if !strings.Contains(res.Content[0].Text, "skills_list") {
		t.Errorf("error does not point at the recovery path: %s", res.Content[0].Text)
	}
}

func TestParseErrorReplies(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	var in bytes.Buffer
	in.WriteString("{not json\n")
	var out bytes.Buffer
	if err := srv.ServeStdio(context.Background(), &in, &out); err != nil {
		t.Fatal(err)
	}
	var resp struct {
		Error *rpcError `json:"error"`
	}
	if err := json.Unmarshal(out.Bytes(), &resp); err != nil {
		t.Fatal(err)
	}
	if resp.Error == nil || resp.Error.Code != codeParseError {
		t.Errorf("want parse error, got %+v", resp.Error)
	}
}

func TestResourcesListAndRead(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"resources/list"}`,
		`{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"wiki://networking/retries.md"}}`,
		`{"jsonrpc":"2.0","id":3,"method":"resources/read","params":{"uri":"skill://add-endpoint"}}`,
		`{"jsonrpc":"2.0","id":4,"method":"resources/read","params":{"uri":"config://workspace"}}`)

	var list resourcesListResult
	if err := json.Unmarshal(got[1], &list); err != nil {
		t.Fatal(err)
	}
	var sawWiki, sawSkill bool
	for _, r := range list.Resources {
		sawWiki = sawWiki || strings.HasPrefix(r.URI, "wiki://")
		sawSkill = sawSkill || strings.HasPrefix(r.URI, "skill://")
	}
	if !sawWiki || !sawSkill {
		t.Error("resource listing is missing wiki or skill entries")
	}

	for id, want := range map[int]string{
		2: "exponential backoff",
		3: "table-driven test",
		4: "test/model",
	} {
		var res readResourceResult
		if err := json.Unmarshal(got[id], &res); err != nil {
			t.Fatalf("id %d: %v", id, err)
		}
		if len(res.Contents) != 1 || !strings.Contains(res.Contents[0].Text, want) {
			t.Errorf("resource %d did not contain %q", id, want)
		}
	}
}

func TestResourceReadRejectsEscape(t *testing.T) {
	srv := newTestServer(t, fixtureRepo(t))
	var in bytes.Buffer
	in.WriteString(`{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"repo://../../secrets.txt"}}` + "\n")
	var out bytes.Buffer
	if err := srv.ServeStdio(context.Background(), &in, &out); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out.String(), "escapes the workspace") {
		t.Errorf("traversal not rejected: %s", out.String())
	}
}

func TestPromptsCarryRepoContext(t *testing.T) {
	repo := fixtureRepo(t)
	srv := newTestServer(t, repo)
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"prompts/list"}`,
		`{"jsonrpc":"2.0","id":2,"method":"prompts/get","params":{"name":"review","arguments":{"base":"main"}}}`)

	var list promptsListResult
	if err := json.Unmarshal(got[1], &list); err != nil {
		t.Fatal(err)
	}
	if len(list.Prompts) == 0 {
		t.Fatal("no prompts advertised")
	}

	var pr promptResult
	if err := json.Unmarshal(got[2], &pr); err != nil {
		t.Fatal(err)
	}
	text := pr.Messages[0].Content.Text
	if !strings.Contains(text, "main") {
		t.Error("prompt did not use the supplied base")
	}
	if !strings.Contains(text, "add-endpoint") {
		t.Error("review prompt did not name the repo's actual skills")
	}
}

func TestHTTPTransportRequiresToken(t *testing.T) {
	srv, err := New(Options{Repo: fixtureRepo(t), Token: "sekrit"})
	if err != nil {
		t.Fatal(err)
	}
	body := `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`

	for _, tc := range []struct {
		name   string
		header string
		want   int
	}{
		{"no token", "", http.StatusUnauthorized},
		{"wrong token", "Bearer nope", http.StatusUnauthorized},
		{"right token", "Bearer sekrit", http.StatusOK},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/mcp", strings.NewReader(body))
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			w := httptest.NewRecorder()
			srv.handleRPC(w, req)
			if w.Code != tc.want {
				t.Errorf("status = %d, want %d (body %s)", w.Code, tc.want, w.Body.String())
			}
		})
	}
}

func TestHTTPHealthNeedsNoToken(t *testing.T) {
	srv, err := New(Options{Repo: fixtureRepo(t), Token: "sekrit"})
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()
	srv.handleHealth(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("health status = %d", w.Code)
	}
	if !strings.Contains(w.Body.String(), ProtocolVersion) {
		t.Errorf("health does not report the protocol version: %s", w.Body.String())
	}
}

func TestManifestDescribesServer(t *testing.T) {
	repo := fixtureRepo(t)
	srv := newTestServer(t, repo)

	path, err := srv.WriteManifest("kaioken")
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	if len(m.Tools) != len(srv.Tools()) {
		t.Errorf("manifest lists %d tools, server has %d", len(m.Tools), len(srv.Tools()))
	}
	if m.Protocol != ProtocolVersion {
		t.Errorf("manifest protocol = %q", m.Protocol)
	}
	if !strings.Contains(m.ClientConfig(), "mcpServers") {
		t.Error("client config snippet is not an mcpServers block")
	}
}

func TestEnsureTokenPersists(t *testing.T) {
	repo := t.TempDir()
	first, err := EnsureToken(repo)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) < 32 {
		t.Errorf("token too short: %q", first)
	}
	second, err := EnsureToken(repo)
	if err != nil {
		t.Fatal(err)
	}
	if first != second {
		t.Error("token changed across calls — saved client configs would break on restart")
	}
}

func TestEmptyRepoStillAnswers(t *testing.T) {
	// A directory Kaioken has never touched must not crash the server; the
	// tools should say what to run instead.
	srv := newTestServer(t, t.TempDir())
	got := roundTrip(t, srv,
		`{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"wiki_search","arguments":{"query":"anything"}}}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"skills_list","arguments":{}}}`)

	for _, id := range []int{1, 2} {
		var res ToolResult
		if err := json.Unmarshal(got[id], &res); err != nil {
			t.Fatal(err)
		}
		if res.IsError {
			t.Errorf("id %d errored on an empty repo: %s", id, res.Content[0].Text)
		}
		if !strings.Contains(res.Content[0].Text, "kaioken") {
			t.Errorf("id %d does not tell the caller what to run: %s", id, res.Content[0].Text)
		}
	}
}
