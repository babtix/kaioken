package generate

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
	"kaioken/internal/gitx"
	"kaioken/internal/llm"
	"kaioken/internal/plan"
	"kaioken/internal/scan"
)

// gitRepo builds a throwaway git repo with an initial commit of the given
// files, returning the path and the commit SHA. Skips when git is missing.
func gitRepo(t *testing.T, files map[string]string) (string, string) {
	t.Helper()
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("git not on PATH")
	}
	repo := t.TempDir()
	for rel, body := range files {
		writeFile(t, repo, rel, body)
	}
	git(t, repo, "init", "-q")
	git(t, repo, "config", "user.email", "k@example.com")
	git(t, repo, "config", "user.name", "k")
	git(t, repo, "add", ".")
	git(t, repo, "commit", "-qm", "initial")
	head, err := gitx.Head(context.Background(), repo)
	if err != nil {
		t.Fatal(err)
	}
	return repo, head
}

func git(t *testing.T, repo string, args ...string) {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", repo}, args...)...)
	cmd.Env = append(os.Environ(),
		"GIT_AUTHOR_NAME=k", "GIT_AUTHOR_EMAIL=k@example.com",
		"GIT_COMMITTER_NAME=k", "GIT_COMMITTER_EMAIL=k@example.com")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("git %s: %v\n%s", strings.Join(args, " "), err, out)
	}
}

func writeFile(t *testing.T, repo, rel, body string) {
	t.Helper()
	p := filepath.Join(repo, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
		t.Fatal(err)
	}
}

func modFiles(paths ...string) []scan.File {
	var out []scan.File
	for _, p := range paths {
		out = append(out, scan.File{Path: p})
	}
	return out
}

func TestReviseWorthwhile(t *testing.T) {
	ctx := context.Background()
	repo, head := gitRepo(t, map[string]string{
		"core/a.go": "package core // a\n",
		"core/b.go": "package core // b\n",
		"core/c.go": "package core // c\n",
		"core/d.go": "package core // d\n",
		"core/e.go": "package core // e\n",
	})
	fm := plan.FlatModule{ID: "core", Module: plan.Module{Scope: []string{"core"}}}
	files := modFiles("core/a.go", "core/b.go", "core/c.go", "core/d.go", "core/e.go")

	// No baseline / unresolvable baseline / non-git repo → full rebuild.
	if _, ok := reviseWorthwhile(ctx, repo, "", fm, files); ok {
		t.Error("empty baseline must not be revisable")
	}
	if _, ok := reviseWorthwhile(ctx, repo, strings.Repeat("a", 40), fm, files); ok {
		t.Error("unresolvable baseline must not be revisable")
	}
	if _, ok := reviseWorthwhile(ctx, t.TempDir(), head, fm, files); ok {
		t.Error("non-git repo must not be revisable")
	}

	// Nothing committed since the baseline → nothing to diff.
	if _, ok := reviseWorthwhile(ctx, repo, head, fm, files); ok {
		t.Error("no commits since baseline must not be revisable")
	}

	// One committed change inside the module → revisable, names the file.
	writeFile(t, repo, "core/a.go", "package core // a changed\n")
	git(t, repo, "commit", "-aqm", "touch a")
	changed, ok := reviseWorthwhile(ctx, repo, head, fm, files)
	if !ok || len(changed) != 1 || changed[0] != "core/a.go" {
		t.Fatalf("changed = %v, ok = %v; want [core/a.go], true", changed, ok)
	}

	// A change outside the module's scope does not count.
	other := plan.FlatModule{ID: "web", Module: plan.Module{Scope: []string{"web"}}}
	if _, ok := reviseWorthwhile(ctx, repo, head, other, modFiles("web/x.go")); ok {
		t.Error("change outside the module must not be revisable")
	}

	// A deleted file is claimed via scope even though it left the file set.
	git(t, repo, "rm", "-q", "core/b.go")
	git(t, repo, "commit", "-qm", "drop b")
	changed, ok = reviseWorthwhile(ctx, repo, head, fm,
		modFiles("core/a.go", "core/c.go", "core/d.go", "core/e.go"))
	if !ok || len(changed) != 2 {
		t.Fatalf("after deletion: changed = %v, ok = %v", changed, ok)
	}

	// More than half the module changed → full rebuild is cheaper.
	writeFile(t, repo, "core/c.go", "package core // c2\n")
	writeFile(t, repo, "core/d.go", "package core // d2\n")
	git(t, repo, "commit", "-aqm", "touch most")
	if _, ok := reviseWorthwhile(ctx, repo, head, fm,
		modFiles("core/a.go", "core/c.go", "core/d.go", "core/e.go")); ok {
		t.Error(">50% of files changed must fall back to a full rebuild")
	}
}

func TestReadExistingCards(t *testing.T) {
	repo := t.TempDir()
	dir := filepath.Join(repo, config.Dir, "knowledge", "core")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	// Missing required cards → not revisable.
	if _, err := readExistingCards(repo, "core"); err == nil {
		t.Error("missing overview must refuse revision")
	}
	os.WriteFile(filepath.Join(dir, "overview.md"), []byte("Over.\n"), 0o644)
	os.WriteFile(filepath.Join(dir, "architecture.md"), []byte("Arch.\n"), 0o644)
	got, err := readExistingCards(repo, "core")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "--- overview ---\nOver.") ||
		!strings.Contains(got, "--- architecture ---\nArch.") {
		t.Errorf("assembled cards:\n%s", got)
	}
}

// The happy path: a changed module gets revised — the prompt carries the old
// cards, the diff and only the changed file; the reply lands on disk.
func TestReviseModuleHappyPath(t *testing.T) {
	repo, head := gitRepo(t, map[string]string{
		"core/a.go": "package core\nfunc Old() {}\n",
		"core/b.go": "package core // untouched\n",
		"core/c.go": "package core // untouched too\n",
	})
	writeFile(t, repo, ".kaioken/knowledge/core/overview.md", "Core module overview.\n")
	writeFile(t, repo, ".kaioken/knowledge/core/architecture.md", "Built around Old().\n")

	writeFile(t, repo, "core/a.go", "package core\nfunc New() {}\n")
	git(t, repo, "commit", "-aqm", "rename Old to New")

	var prompt string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			Messages []struct {
				Content string `json:"content"`
			} `json:"messages"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err == nil && len(body.Messages) > 1 {
			prompt = body.Messages[1].Content
		}
		w.Write([]byte(`{"choices":[{"message":{"content":
			"{\"overview\":\"Core module overview.\",\"architecture\":\"Built around New().\",` +
			`\"conventions\":\"- keep it small\",\"tech_stack\":\"Go.\",\"setup_commands\":\"\"}"}}]}`))
	}))
	defer srv.Close()

	cfg := config.Default()
	client := &llm.Client{APIKey: "k", BaseURL: srv.URL, Model: "m", HTTP: srv.Client()}
	fm := plan.FlatModule{ID: "core", Module: plan.Module{Title: "Core", Scope: []string{"core"}}}
	files := modFiles("core/a.go", "core/b.go", "core/c.go")
	res := &scan.Result{Root: repo, Files: files}

	changed, ok := reviseWorthwhile(context.Background(), repo, head, fm, files)
	if !ok {
		t.Fatal("expected the module to be revisable")
	}
	if err := reviseModule(context.Background(), repo, cfg, client, fm, files, changed, head, res); err != nil {
		t.Fatal(err)
	}

	for _, want := range []string{
		"CURRENT CARDS", "Built around Old().", // the old cards
		"GIT DIFF", "func New() {}", // the diff
		"core/a.go", // the changed file's contents
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("revision prompt missing %q", want)
		}
	}
	if strings.Contains(prompt, "untouched too") {
		t.Error("unchanged file contents leaked into the revision prompt")
	}

	arch, err := os.ReadFile(filepath.Join(repo, config.Dir, "knowledge", "core", "architecture.md"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(arch), "Built around New().") {
		t.Errorf("architecture card not revised: %s", arch)
	}
}
