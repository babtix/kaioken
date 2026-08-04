package verify

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"unicode/utf8"
)

func mkFiles(t *testing.T, dir string, files map[string]string) {
	t.Helper()
	for rel, body := range files {
		p := filepath.Join(dir, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
}

func TestDetect(t *testing.T) {
	cases := []struct {
		name  string
		files map[string]string
		want  []string
	}{
		{
			name:  "go module",
			files: map[string]string{"go.mod": "module x\n"},
			want:  []string{"go build ./...", "go test ./... -count=1"},
		},
		{
			name:  "makefile check wins",
			files: map[string]string{"go.mod": "module x\n", "Makefile": "check:\n\tgo test ./...\n"},
			want:  []string{"make check"},
		},
		{
			name:  "makefile without check falls through",
			files: map[string]string{"go.mod": "module x\n", "Makefile": "build:\n\tgo build ./...\n"},
			want:  []string{"go build ./...", "go test ./... -count=1"},
		},
		{
			name:  "npm test script",
			files: map[string]string{"package.json": `{"scripts":{"test":"vitest"}}`},
			want:  []string{"npm test"},
		},
		{
			name:  "package.json without test script",
			files: map[string]string{"package.json": `{"scripts":{"build":"vite build"}}`},
			want:  nil,
		},
		{
			name:  "go and npm combine",
			files: map[string]string{"go.mod": "module x\n", "package.json": `{"scripts":{"test":"vitest"}}`},
			want:  []string{"go build ./...", "go test ./... -count=1", "npm test"},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := t.TempDir()
			mkFiles(t, repo, tc.files)
			got, err := Detect(repo)
			if tc.want == nil {
				if err == nil {
					t.Errorf("expected an error, got %v", got)
				}
				return
			}
			if err != nil {
				t.Fatalf("Detect: %v", err)
			}
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("Detect = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestDetectEmptyRepo(t *testing.T) {
	if _, err := Detect(t.TempDir()); err == nil {
		t.Error("expected an error for a repo with no build markers")
	}
}

func TestPromptListsCommands(t *testing.T) {
	p := Prompt([]string{"go build ./...", "go test ./... -count=1"})
	for _, want := range []string{"go build ./...", "go test ./... -count=1", "3 full attempts"} {
		if !strings.Contains(p, want) {
			t.Errorf("prompt missing %q", want)
		}
	}
}

// The gate's word is final: a passing command reports OK, a failing one
// fails the whole gate.
func TestGate(t *testing.T) {
	repo := t.TempDir()

	results, err := Gate(context.Background(), repo, []string{"echo passing"})
	if err != nil {
		t.Fatalf("Gate: %v", err)
	}
	if len(results) != 1 || !results[0].OK || !strings.Contains(results[0].Output, "passing") {
		t.Errorf("results = %+v", results)
	}

	results, err = Gate(context.Background(), repo, []string{"echo first", "exit 1"})
	if err == nil {
		t.Fatal("expected the gate to fail when a command fails")
	}
	if len(results) != 2 || !results[0].OK || results[1].OK {
		t.Errorf("results = %+v", results)
	}
}

func TestTail(t *testing.T) {
	if got := tail("short", 100); got != "short" {
		t.Errorf("tail short = %q", got)
	}
	long := strings.Repeat("a", 3000)
	got := tail(long, 2000)
	// one ellipsis rune plus 2000 bytes of tail
	if utf8.RuneCountInString(got) != 2001 || !strings.HasPrefix(got, "…") {
		t.Errorf("tail long runes = %d", utf8.RuneCountInString(got))
	}
}
