package gitdraft

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/config"
	"kaioken/internal/llm"
)

// scriptedLLM serves one canned completion and records what it was asked.
type scriptedLLM struct {
	reply  string
	system string
	user   string
	calls  int
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
			if m.Role == "system" {
				s.system = m.Content
			}
			if m.Role == "user" {
				s.user = m.Content
			}
		}
		w.Write([]byte(`{"choices":[{"message":{"role":"assistant","content":` +
			jsonString(s.reply) + `}}]}`))
	}))
}

func jsonString(s string) string {
	raw, _ := json.Marshal(s)
	return string(raw)
}

func newClient(base string) *llm.Client {
	return &llm.Client{APIKey: "test", BaseURL: base, Model: "m", HTTP: http.DefaultClient}
}

// newRepo builds a git repo with one commit; skipped when git is absent.
func newRepo(t *testing.T) string {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
		cmd.Env = append(os.Environ(),
			"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
			"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
		}
	}
	git("init", "-q")
	git("config", "user.email", "k@example.com")
	git("config", "user.name", "k")
	write(t, repo, "app.go", "package app\n")
	git("add", ".")
	git("commit", "-qm", "feat(app): initial import")
	return repo
}

func write(t *testing.T, repo, rel, body string) {
	t.Helper()
	p := filepath.Join(repo, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestDraftGroundsThePrompt(t *testing.T) {
	repo := newRepo(t)
	write(t, repo, "app.go", "package app\n\nfunc New() {}\n") // uncommitted change

	llmSrv := &scriptedLLM{reply: "## Commit message\nfeat(app): add New\n\n## PR description\nwhat/why/test"}
	srv := llmSrv.server(t)
	defer srv.Close()

	cfg := config.Default()
	cfg.Notes = []string{"always mention the test plan"}

	out, err := Draft(context.Background(), repo, cfg, newClient(srv.URL), "")
	if err != nil {
		t.Fatalf("Draft: %v", err)
	}
	if !strings.Contains(out, "feat(app): add New") {
		t.Errorf("output = %q", out)
	}
	if llmSrv.calls != 1 {
		t.Errorf("calls = %d, want exactly 1", llmSrv.calls)
	}
	// The grounding must reach the model: the diff, the house style, the notes.
	for _, want := range []string{
		"+func New()",                          // the actual change
		"feat(app): initial import",            // house style subject
		"always mention the test plan",         // steering notes
	} {
		if !strings.Contains(llmSrv.user, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
}

// Nothing changed, nothing to draft — and no tokens may be spent finding out.
func TestDraftEmptyDiff(t *testing.T) {
	repo := newRepo(t)

	llmSrv := &scriptedLLM{reply: "should never be served"}
	srv := llmSrv.server(t)
	defer srv.Close()

	if _, err := Draft(context.Background(), repo, config.Default(), newClient(srv.URL), ""); err == nil {
		t.Fatal("expected an error for an empty diff")
	}
	if llmSrv.calls != 0 {
		t.Errorf("an empty diff must not call the LLM, got %d call(s)", llmSrv.calls)
	}
}
