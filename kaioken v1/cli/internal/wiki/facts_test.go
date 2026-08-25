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

// factsRepo writes a polyglot repo and returns its scan + index.
func factsRepo(t *testing.T) (*scan.Result, *codemap.Index) {
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

	write("api/routes.js", `
const router = express.Router();
router.get("/api/users", listUsers);
router.post("/api/users", createUser);
app.delete("/api/users/:id", removeUser);
`)
	write("api/views.py", `
@app.get("/health")
def health():
    return "ok"

@router.post("/v1/items")
def create_item():
    return None

class User(models.Model):
    name = CharField()
`)
	write("cfg/env.go", `package cfg

import "os"

func Load() string {
	key := os.Getenv("OPENROUTER_API_KEY")
	host := os.Getenv("DATABASE_URL")
	return key + host
}
`)
	res, err := scan.Repo(root, config.Default())
	if err != nil {
		t.Fatal(err)
	}
	// The cache is keyed by scan root; a fresh temp dir per test keeps them
	// independent.
	return res, codemap.Build(res)
}

func TestDetectRoutes(t *testing.T) {
	res, idx := factsRepo(t)
	f := detectFacts(res, idx)

	if !f.Any() {
		t.Fatal("nothing detected")
	}
	got := map[string]bool{}
	for _, r := range f.Routes {
		got[r.Value] = true
	}
	for _, want := range []string{
		"GET /api/users", "POST /api/users", "DELETE /api/users/:id",
		"GET /health", "POST /v1/items",
	} {
		if !got[want] {
			t.Errorf("route %q not detected; found %v", want, keysOf(got))
		}
	}
}

func TestDetectModelsAndEnv(t *testing.T) {
	res, idx := factsRepo(t)
	f := detectFacts(res, idx)

	var sawUser bool
	for _, m := range f.Models {
		if m.Value == "User" {
			sawUser = true
		}
	}
	if !sawUser {
		t.Errorf("Django model not detected: %+v", f.Models)
	}

	env := map[string]bool{}
	for _, e := range f.Env {
		env[e.Value] = true
	}
	if !env["OPENROUTER_API_KEY"] || !env["DATABASE_URL"] {
		t.Errorf("env vars not detected: %v", keysOf(env))
	}
}

// Facts must carry a real file and line, since the prompt cites them.
func TestFactsCarryLocation(t *testing.T) {
	res, idx := factsRepo(t)
	f := detectFacts(res, idx)
	for _, r := range f.Routes {
		if r.File == "" || r.Line <= 0 {
			t.Errorf("route %q has no location: %+v", r.Value, r)
		}
	}
}

func TestFactsSummaryAndScope(t *testing.T) {
	res, idx := factsRepo(t)
	f := detectFacts(res, idx)

	all := f.Summary(100)
	if !strings.Contains(all, "HTTP routes") || !strings.Contains(all, "/api/users") {
		t.Errorf("summary missing routes:\n%s", all)
	}

	// Scoping to one file must exclude the others' facts.
	scoped := f.ScopedSummary([]string{"api/views.py"}, 100)
	if !strings.Contains(scoped, "/health") {
		t.Errorf("scoped summary lost in-scope route:\n%s", scoped)
	}
	if strings.Contains(scoped, "/api/users") {
		t.Errorf("scoped summary leaked an out-of-scope route:\n%s", scoped)
	}
	if f.ScopedSummary([]string{"nothing/here.go"}, 10) != "" {
		t.Error("scoping to unrelated files should yield nothing")
	}
}

func TestFactsDeduped(t *testing.T) {
	f := &Facts{Routes: []Fact{
		{Kind: "route", Value: "GET /a", File: "x.js", Line: 1},
		{Kind: "route", Value: "GET /a", File: "y.js", Line: 9},
		{Kind: "route", Value: "GET /b", File: "x.js", Line: 2},
	}}
	dedupeFacts(f)
	if len(f.Routes) != 2 {
		t.Errorf("expected 2 unique routes, got %d", len(f.Routes))
	}
	// Sorted for stable prompts across runs.
	if f.Routes[0].Value > f.Routes[1].Value {
		t.Errorf("routes not sorted: %+v", f.Routes)
	}
}

func TestEmptyFacts(t *testing.T) {
	var f Facts
	if f.Any() {
		t.Error("an empty Facts should report nothing")
	}
	if f.Summary(10) != "" {
		t.Errorf("empty summary should be blank, got %q", f.Summary(10))
	}
}

func keysOf(m map[string]bool) []string {
	var out []string
	for k := range m {
		out = append(out, k)
	}
	return out
}
