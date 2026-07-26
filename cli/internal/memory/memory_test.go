package memory

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadProjectMissingIsEmpty(t *testing.T) {
	if got := LoadProject(t.TempDir()); got != "" {
		t.Errorf("missing memory should be empty, got %q", got)
	}
}

func TestRememberAppendsDatedBullet(t *testing.T) {
	repo := t.TempDir()
	res, err := Remember(repo, "tests live under cli/internal/x and run with make test", false, true)
	if err != nil {
		t.Fatal(err)
	}
	if !res.Changed {
		t.Fatal("Remember should have written disk")
	}
	content, _ := os.ReadFile(ProjectPath(repo))
	if !strings.HasPrefix(string(content), "# Project memory") {
		t.Errorf("first remember should seed the header, got:\n%s", content)
	}
	if !strings.Contains(string(content), "- ") {
		t.Errorf("missing the bullet, got:\n%s", content)
	}
	if !strings.Contains(string(content), "make test") {
		t.Errorf("fact not recorded, got:\n%s", content)
	}
}

func TestRememberAppendsToExisting(t *testing.T) {
	repo := t.TempDir()
	if _, err := Remember(repo, "first fact", false, true); err != nil {
		t.Fatal(err)
	}
	if _, err := Remember(repo, "second fact", false, true); err != nil {
		t.Fatal(err)
	}
	content, _ := os.ReadFile(ProjectPath(repo))
	if got, want := strings.Count(string(content), "- "), 2; got != want {
		t.Errorf("expected %d bullets, got %d:\n%s", want, got, content)
	}
}

func TestRememberRefusesAppendPastCap(t *testing.T) {
	repo := t.TempDir()
	// Seed near the file cap with a rewrite, then an append must be refused.
	big := strings.Repeat("x", MaxMemoryFileBytes-50)
	if _, err := Remember(repo, big, true, true); err != nil {
		t.Fatal(err)
	}
	_, err := Remember(repo, "one more fact that should not fit because the cap is the feature", false, true)
	if err != ErrMemoryFull {
		t.Fatalf("expected ErrMemoryFull, got %v", err)
	}
}

func TestRememberRewriteReplaces(t *testing.T) {
	repo := t.TempDir()
	if _, err := Remember(repo, "old fact", false, true); err != nil {
		t.Fatal(err)
	}
	if _, err := Remember(repo, "consolidated single fact", true, true); err != nil {
		t.Fatal(err)
	}
	content, _ := os.ReadFile(ProjectPath(repo))
	if strings.Contains(string(content), "old fact") {
		t.Errorf("rewrite should have replaced old content, got:\n%s", content)
	}
	if !strings.Contains(string(content), "consolidated single fact") {
		t.Errorf("rewrite content missing, got:\n%s", content)
	}
}

func TestRememberEmptyFactIsError(t *testing.T) {
	if _, err := Remember(t.TempDir(), "   ", false, true); err == nil {
		t.Fatal("empty fact should error")
	}
}

func TestRememberDryRunDoesNotWrite(t *testing.T) {
	repo := t.TempDir()
	res, err := Remember(repo, "a fact", false, false)
	if err != nil {
		t.Fatal(err)
	}
	if res.Changed {
		t.Error("dry run reported it changed disk")
	}
	if _, statErr := os.Stat(ProjectPath(repo)); statErr == nil {
		t.Error("dry run wrote a file")
	}
}

func TestRenderProjectEmptyRepo(t *testing.T) {
	if got := RenderProject(t.TempDir()); got != "" {
		t.Errorf("empty repo should render nothing, got %q", got)
	}
}

func TestRenderProjectInjectsAndCaps(t *testing.T) {
	repo := t.TempDir()
	// Larger than the prompt cap but smaller than the file cap, so the file is
	// kept in full and the prompt truncates it with a marker.
	big := strings.Repeat("x", MaxMemoryBytes+200)
	if _, err := Remember(repo, big, true, true); err != nil {
		t.Fatal(err)
	}
	got := RenderProject(repo)
	if !strings.Contains(got, "[memory truncated") {
		t.Errorf("expected truncation marker, got prefix:\n%s", got[:200])
	}
}

func TestUserPathUsesConfigHome(t *testing.T) {
	// UserPath resolves through config.GlobalDir, which honors KAIOKEN_HOME.
	// The test sandbox sets that env in config package TestMain; here we just
	// assert the path ends with USER.md and lives under .kaioken.
	p := UserPath()
	if !strings.HasSuffix(filepath.ToSlash(p), "/.kaioken/USER.md") && !strings.HasSuffix(p, "USER.md") {
		t.Errorf("UserPath looks wrong: %q", p)
	}
}
