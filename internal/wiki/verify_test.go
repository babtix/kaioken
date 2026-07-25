package wiki

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"kaioken/internal/codemap"
	"kaioken/internal/config"
	"kaioken/internal/scan"
)

// verifyRepo writes real files and returns an index over them, so verification
// is tested against genuine parsed structure rather than a hand-built stub.
func verifyRepo(t *testing.T) (string, *codemap.Index, *scan.Result) {
	t.Helper()
	root := t.TempDir()
	write := func(rel, body string) {
		t.Helper()
		p := filepath.Join(root, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(p, []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	write("internal/core/engine.go", `package core

// Engine runs things.
type Engine struct {
	Name string
}

func NewEngine(name string) *Engine {
	return &Engine{Name: name}
}

func (e *Engine) Start() error {
	return nil
}
`)
	write("internal/core/util.go", "package core\n\nfunc HelperFunc() int { return 1 }\n")

	res, err := scan.Repo(root, config.Default())
	if err != nil {
		t.Fatal(err)
	}
	return root, codemap.Build(res), res
}

func TestVerifyCleanDocument(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "# Core\n\nThe `internal/core/engine.go` file declares `Engine` and `NewEngine`.\n" +
		"Startup goes through `Start`.\n"

	rep := verify(doc, idx, res.Files)
	if !rep.Clean() {
		t.Errorf("expected a clean report, got: %s", rep.Detail(10))
	}
	if rep.FilesChecked == 0 || rep.SymbolsChecked == 0 {
		t.Errorf("nothing was actually checked: %+v", rep)
	}
	if !strings.Contains(rep.Summary(), "grounding OK") {
		t.Errorf("summary = %q", rep.Summary())
	}
}

// The whole point: a confidently-stated but fabricated API must be caught.
func TestVerifyCatchesInventedSymbolsAndFiles(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "# Core\n\nCall `ShutdownGracefully` from `internal/core/lifecycle.go` to stop it.\n"

	rep := verify(doc, idx, res.Files)
	if rep.Clean() {
		t.Fatal("hallucinated file and symbol were not caught")
	}
	var sawFile, sawSymbol bool
	for _, p := range rep.Problems {
		switch p.Kind {
		case claimFile:
			if p.Claim == "internal/core/lifecycle.go" {
				sawFile = true
			}
		case claimSymbol:
			if p.Claim == "ShutdownGracefully" {
				sawSymbol = true
			}
		}
	}
	if !sawFile {
		t.Errorf("invented file not reported: %s", rep.Detail(10))
	}
	if !sawSymbol {
		t.Errorf("invented symbol not reported: %s", rep.Detail(10))
	}
}

func TestVerifyCatchesOutOfRangeAnchor(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "See `internal/core/util.go:900-950` for details.\n"

	rep := verify(doc, idx, res.Files)
	found := false
	for _, p := range rep.Problems {
		if p.Kind == claimAnchor {
			found = true
		}
	}
	if !found {
		t.Errorf("anchor past end of file not caught: %s", rep.Detail(10))
	}
}

// A quoted excerpt that does not appear at the cited lines is a fabrication
// even though both the file and the line range exist.
func TestVerifyCatchesFabricatedExcerpt(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "Startup:\n\n`internal/core/engine.go:8-10`\n\n```go\n" +
		"func NewEngine(name string, opts ...Option) (*Engine, error) {\n" +
		"\treturn buildEngineWithDefaults(name, opts)\n" +
		"}\n```\n"

	rep := verify(doc, idx, res.Files)
	found := false
	for _, p := range rep.Problems {
		if p.Kind == claimExcerpt {
			found = true
		}
	}
	if !found {
		t.Errorf("fabricated excerpt not caught: %s", rep.Detail(10))
	}
}

// A genuine verbatim excerpt at the right lines must pass.
func TestVerifyAcceptsRealExcerpt(t *testing.T) {
	root, idx, res := verifyRepo(t)
	raw, err := os.ReadFile(filepath.Join(root, "internal", "core", "engine.go"))
	if err != nil {
		t.Fatal(err)
	}
	lines := strings.Split(string(raw), "\n")
	// Quote the NewEngine declaration exactly, with its real anchor.
	var start int
	for i, l := range lines {
		if strings.HasPrefix(l, "func NewEngine") {
			start = i + 1
			break
		}
	}
	if start == 0 {
		t.Fatal("could not locate NewEngine in the fixture")
	}
	end := start + 2
	excerpt := strings.Join(lines[start-1:end], "\n")
	doc := "Construction:\n\n`internal/core/engine.go:" + itoa(start) + "-" + itoa(end) +
		"`\n\n```go\n" + excerpt + "\n```\n"

	rep := verify(doc, idx, res.Files)
	for _, p := range rep.Problems {
		if p.Kind == claimExcerpt {
			t.Errorf("a genuine excerpt was rejected: %s\ndoc:\n%s", p, doc)
		}
	}
}

// Generic words must not be checked as symbols, or every document would drown
// in false positives.
func TestVerifyIgnoresGenericIdentifiers(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "It returns `error`, takes a `string`, reads `config`, and stores `data`.\n"

	rep := verify(doc, idx, res.Files)
	if !rep.Clean() {
		t.Errorf("generic words were flagged as invented symbols: %s", rep.Detail(10))
	}
}

// Third-party paths are not the repo's responsibility.
func TestVerifyIgnoresExternalPaths(t *testing.T) {
	_, idx, res := verifyRepo(t)
	doc := "Depends on `node_modules/react/index.js` and `vendor/foo/bar.go`.\n"

	rep := verify(doc, idx, res.Files)
	for _, p := range rep.Problems {
		if p.Kind == claimFile {
			t.Errorf("external path flagged: %s", p)
		}
	}
}

func TestWorthChecking(t *testing.T) {
	for _, name := range []string{"NewEngine", "handle_request", "ApiClient"} {
		if !worthChecking(name) {
			t.Errorf("%q should be checked", name)
		}
	}
	for _, name := range []string{"error", "data", "int", "abc", "json", "config"} {
		if worthChecking(name) {
			t.Errorf("%q is too generic to check", name)
		}
	}
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var d []byte
	for n > 0 {
		d = append([]byte{byte('0' + n%10)}, d...)
		n /= 10
	}
	return string(d)
}
