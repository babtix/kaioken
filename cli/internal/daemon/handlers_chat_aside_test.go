package daemon

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/agent"
	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// asideTestWorkspace opens a workspace over a throwaway repo and returns the
// server, the auth header and the workspace id.
func asideTestWorkspace(t *testing.T) (url, auth, wsID string) {
	t.Helper()
	t.Setenv(config.HomeEnv, t.TempDir())
	ts := newTestServer(t, nil)
	auth = "Bearer " + testToken

	repo := t.TempDir()
	if err := os.MkdirAll(filepath.Join(repo, config.Dir), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := config.Default().Save(repo); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(repo, "main.go"), []byte("package main\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	resp := doPost(t, ts.URL+"/v1/workspaces", auth, pathBody(repo))
	var ws workspaceJSON
	decodeJSON(t, resp, &ws)
	return ts.URL, auth, ws.ID
}

// With no run in flight an aside lands in the saved conversation, framed as
// an aside, and no run is started — that is the whole point of /btw.
func TestAsideAppendsToSessionWithoutRunning(t *testing.T) {
	base, auth, wsID := asideTestWorkspace(t)

	resp := doPost(t, base+"/v1/workspaces/"+wsID+"/sessions", auth, "{}")
	var meta sessionMeta
	decodeJSON(t, resp, &meta)

	resp = doPost(t, base+"/v1/workspaces/"+wsID+"/sessions/"+meta.ID+"/aside", auth,
		`{"content":"  staging is down, ignore those failures  "}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("aside: status %d, want 200", resp.StatusCode)
	}
	var out struct {
		SessionID string `json:"session_id"`
		Queued    bool   `json:"queued"`
	}
	decodeJSON(t, resp, &out)
	if out.Queued {
		t.Error("queued = true with no run in flight, want false")
	}

	// A second aside must accumulate. Sessions are stored as a branch tree
	// with Messages as the view of the active branch, so an append that skips
	// Record is dropped on the next save — and only the second write shows it.
	resp = doPost(t, base+"/v1/workspaces/"+wsID+"/sessions/"+meta.ID+"/aside", auth,
		`{"content":"I renamed parseArgs to parseCLIArgs on disk"}`)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("second aside: status %d, want 200", resp.StatusCode)
	}

	resp = doGet(t, base+"/v1/workspaces/"+wsID+"/sessions/"+meta.ID, auth)
	var full struct {
		Title    string        `json:"title"`
		Messages []llm.Message `json:"messages"`
	}
	decodeJSON(t, resp, &full)
	if len(full.Messages) != 2 {
		t.Fatalf("session has %d messages, want 2", len(full.Messages))
	}
	wantBodies := []string{
		"staging is down, ignore those failures",
		"I renamed parseArgs to parseCLIArgs on disk",
	}
	for i, want := range wantBodies {
		got := full.Messages[i]
		if got.Role != "user" {
			t.Errorf("message %d role = %q, want user", i, got.Role)
		}
		body, ok := agent.AsideBody(got.Content)
		if !ok {
			t.Fatalf("message %d is not framed as an aside: %q", i, got.Content)
		}
		if body != want {
			t.Errorf("message %d body = %q, want %q", i, body, want)
		}
	}
	// The framing is machinery, not something to name a conversation after.
	if strings.HasPrefix(full.Title, "[aside") {
		t.Errorf("session title = %q — the aside marker leaked into it", full.Title)
	}
	if n := len(activeRuns(t, base, auth, wsID)); n != 0 {
		t.Errorf("%d runs started, want 0 — an aside must not spend a turn", n)
	}
}

// An empty aside is a client bug, not an empty note in the transcript.
func TestAsideRejectsBlankContent(t *testing.T) {
	base, auth, wsID := asideTestWorkspace(t)
	resp := doPost(t, base+"/v1/workspaces/"+wsID+"/sessions", auth, "{}")
	var meta sessionMeta
	decodeJSON(t, resp, &meta)

	resp = doPost(t, base+"/v1/workspaces/"+wsID+"/sessions/"+meta.ID+"/aside", auth, `{"content":"   "}`)
	if resp.StatusCode != http.StatusBadRequest {
		t.Errorf("blank aside: status %d, want 400", resp.StatusCode)
	}
}

// While a chat run owns the conversation the aside must reach the agent as
// steering — appending to the saved session would be overwritten by the
// history the run records when it finishes.
func TestSteerSessionReachesTheLiveChatRun(t *testing.T) {
	hub := NewHub()
	runs := NewRuns(hub)
	ws := &Workspace{ID: "ws_1", Path: t.TempDir()}

	release := make(chan struct{})
	done := make(chan struct{})
	ag := &agent.Agent{}
	runs.Start(ws, "chat", map[string]any{"session_id": "sess_1"}, func(ctx context.Context, rec *RunRecord) error {
		rec.SetSteer(ag.Steer)
		close(done)
		<-release
		return nil
	})
	<-done

	if !runs.SteerSession("ws_1", "sess_1", agent.Aside("the file moved")) {
		t.Fatal("SteerSession returned false while a chat run was live")
	}
	if n := ag.QueuedCount(); n != 1 {
		t.Errorf("agent has %d queued messages, want 1", n)
	}
	// Wrong session, and wrong workspace, must both miss.
	if runs.SteerSession("ws_1", "sess_2", "x") {
		t.Error("steered a session that has no run")
	}
	if runs.SteerSession("ws_2", "sess_1", "x") {
		t.Error("steered across workspaces")
	}
	close(release)
}

// hasSystemMessage is what lets an aside precede the first real turn without
// costing that session its system prompt.
func TestHasSystemMessage(t *testing.T) {
	if hasSystemMessage(nil) {
		t.Error("empty history reported as having a system message")
	}
	onlyAside := []llm.Message{{Role: "user", Content: agent.Aside("note")}}
	if hasSystemMessage(onlyAside) {
		t.Error("a session holding only an aside must still get its system prompt")
	}
	if !hasSystemMessage([]llm.Message{{Role: "system", Content: "you are"}, {Role: "user", Content: "hi"}}) {
		t.Error("system message not detected")
	}
}

// activeRuns lists the workspace's runs, active or not.
func activeRuns(t *testing.T, base, auth, wsID string) []map[string]any {
	t.Helper()
	resp := doGet(t, base+"/v1/workspaces/"+wsID+"/runs", auth)
	var out struct {
		Runs []map[string]any `json:"runs"`
	}
	decodeJSON(t, resp, &out)
	return out.Runs
}

// The prefix is a cross-language contract: desktop/src/lib/slash.ts matches
// on this literal to render asides. Keep them in step.
func TestAsidePrefixIsStable(t *testing.T) {
	if !strings.HasPrefix(agent.AsidePrefix, "[aside") {
		t.Errorf("AsidePrefix = %q — desktop/src/lib/slash.ts must be updated to match", agent.AsidePrefix)
	}
}
