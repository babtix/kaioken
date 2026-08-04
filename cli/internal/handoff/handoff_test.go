package handoff

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"kaioken/internal/llm"
	"kaioken/internal/session"
)

// scriptedLLM serves one canned completion and records what it was asked.
type scriptedLLM struct {
	reply string
	user  string
	calls int
}

func (s *scriptedLLM) server(t *testing.T) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Messages []struct {
				Role    string `json:"role"`
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Errorf("bad request: %v", err)
		}
		s.calls++
		for _, m := range req.Messages {
			if m.Role == "user" {
				s.user = m.Content
			}
		}
		raw, _ := json.Marshal(s.reply)
		w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":` + string(raw) + `}}]}`))
	}))
}

func newClient(base string) *llm.Client {
	return &llm.Client{APIKey: "test", BaseURL: base, Model: "m", HTTP: http.DefaultClient}
}

func TestBriefCapsAndGrounds(t *testing.T) {
	sess := &session.Session{ID: "s1", Title: "fix the parser"}
	// 50 messages: the first must be dropped by the cap, the last kept.
	for i := 0; i < 25; i++ {
		sess.Messages = append(sess.Messages,
			llm.Message{Role: "user", Content: "question number " + itoa(i)},
			llm.Message{Role: "assistant", Content: "answer number " + itoa(i)},
		)
	}

	llmSrv := &scriptedLLM{reply: "## Goal\n- fix the parser\n\n## Decisions\n- none recorded"}
	srv := llmSrv.server(t)
	defer srv.Close()

	out, err := Brief(context.Background(), newClient(srv.URL), sess)
	if err != nil {
		t.Fatalf("Brief: %v", err)
	}
	if !strings.Contains(out, "## Goal") {
		t.Errorf("output = %q", out)
	}
	if llmSrv.calls != 1 {
		t.Errorf("calls = %d, want 1", llmSrv.calls)
	}
	if !strings.Contains(llmSrv.user, "most recent 40 messages") {
		t.Errorf("prompt must announce the cap: %q", llmSrv.user[:80])
	}
	if strings.Contains(llmSrv.user, "question number 0") {
		t.Error("messages beyond the cap must not reach the model")
	}
	if !strings.Contains(llmSrv.user, "answer number 24") {
		t.Error("the most recent message must reach the model")
	}
	if !strings.Contains(llmSrv.user, "Session title: fix the parser") {
		t.Error("the session title must ground the brief")
	}
}

func TestBriefEmptySession(t *testing.T) {
	if _, err := Brief(context.Background(), newClient("http://unused"), &session.Session{}); err == nil {
		t.Error("expected an error for a session without messages")
	}
}

func TestTranscriptCollapsesTools(t *testing.T) {
	sess := &session.Session{Messages: []llm.Message{
		{Role: "system", Content: "secret system prompt"},
		{Role: "user", Content: "please edit the file"},
		{Role: "assistant", Content: "doing it", ToolCalls: []llm.ToolCall{
			{Function: llm.FunctionCall{Name: "edit_file", Arguments: "{}"}},
		}},
		{Role: "tool", Name: "edit_file", Content: strings.Repeat("x", 5000)},
	}}

	tr := Transcript(sess)
	for _, want := range []string{
		"**user**: please edit the file",
		"**assistant**: doing it",
		"*calls*: edit_file",
		"*edit_file result* (5000 chars)",
	} {
		if !strings.Contains(tr, want) {
			t.Errorf("transcript missing %q\n---\n%s", want, tr)
		}
	}
	if strings.Contains(tr, "secret system prompt") {
		t.Error("system prompts must not appear in the transcript")
	}
	if strings.Contains(tr, strings.Repeat("x", 100)) {
		t.Error("tool results must be collapsed, not replayed")
	}
}

func itoa(i int) string {
	return json.Number(strings.TrimSpace(jsonNumber(i))).String()
}

func jsonNumber(i int) string {
	raw, _ := json.Marshal(i)
	return string(raw)
}
