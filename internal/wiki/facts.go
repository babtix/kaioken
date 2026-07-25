package wiki

import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"

	"kaioken/internal/codemap"
	"kaioken/internal/scan"
)

// The scanner records path, size, lines and extension — nothing semantic. That
// leaves prompts to say "document the API" and hope. Extracting the concrete
// facts a framework leaves behind (routes, models, commands, env vars) lets a
// prompt say "these seventeen endpoints exist; cover them", which is the
// difference between generic prose and a real API reference.

// Fact is one extracted, verifiable statement about the system.
type Fact struct {
	Kind   string // route, model, command, env
	Value  string // "GET /api/users", "class User", "kaioken wiki"
	File   string // where it was found
	Line   int
	Detail string
}

// Facts groups extracted facts by kind.
type Facts struct {
	Routes   []Fact
	Models   []Fact
	Commands []Fact
	Env      []Fact
}

// Any reports whether anything was detected.
func (f *Facts) Any() bool {
	return len(f.Routes)+len(f.Models)+len(f.Commands)+len(f.Env) > 0
}

// Summary renders up to limit facts per kind.
func (f *Facts) Summary(limit int) string {
	var b strings.Builder
	write := func(label string, facts []Fact) {
		if len(facts) == 0 {
			return
		}
		fmt.Fprintf(&b, "%s (%d):\n", label, len(facts))
		for i, fact := range facts {
			if i >= limit {
				fmt.Fprintf(&b, "  … and %d more\n", len(facts)-limit)
				break
			}
			fmt.Fprintf(&b, "  %s  [%s:%d]\n", fact.Value, fact.File, fact.Line)
		}
	}
	write("HTTP routes", f.Routes)
	write("Data models", f.Models)
	write("CLI commands", f.Commands)
	write("Environment variables", f.Env)
	return b.String()
}

// ScopedSummary renders only facts found in the given files, which is what a
// single chapter should be held responsible for.
func (f *Facts) ScopedSummary(paths []string, limit int) string {
	in := make(map[string]bool, len(paths))
	for _, p := range paths {
		in[p] = true
	}
	filter := func(facts []Fact) []Fact {
		var out []Fact
		for _, fact := range facts {
			if in[fact.File] {
				out = append(out, fact)
			}
		}
		return out
	}
	scoped := &Facts{
		Routes: filter(f.Routes), Models: filter(f.Models),
		Commands: filter(f.Commands), Env: filter(f.Env),
	}
	if !scoped.Any() {
		return ""
	}
	return scoped.Summary(limit)
}

var (
	// Express / Fastify / Koa: app.get("/path", …), router.post('/x', …)
	reJSRoute = regexp.MustCompile(`(?:app|router|server)\.(get|post|put|patch|delete|all)\s*\(\s*['"` + "`" + `]([^'"` + "`" + `]+)`)
	// FastAPI / Flask: @app.get("/path"), @router.post("/x"), @app.route("/y")
	rePyRoute = regexp.MustCompile(`@(?:\w+)\.(get|post|put|patch|delete|route)\s*\(\s*['"]([^'"]+)`)
	// Spring: @GetMapping("/path"), @RequestMapping("/x")
	reJavaRoute = regexp.MustCompile(`@(Get|Post|Put|Patch|Delete|Request)Mapping\s*\(\s*(?:value\s*=\s*)?"([^"]+)`)
	// Go: r.Get("/path", …), mux.HandleFunc("/path", …), e.GET("/path", …)
	reGoRoute = regexp.MustCompile(`(?:\.(?:Get|Post|Put|Patch|Delete|GET|POST|PUT|PATCH|DELETE|Handle|HandleFunc))\s*\(\s*"([^"]+)"`)
	// Rails: get "path" => ..., resources :users
	reRubyRoute = regexp.MustCompile(`^\s*(get|post|put|patch|delete|resources)\s+['":]([^'",\s]+)`)

	// Django/SQLAlchemy/Peewee models, Mongoose schemas, TypeORM entities.
	rePyModel = regexp.MustCompile(`^\s*class\s+(\w+)\s*\(\s*(?:models\.Model|Base|db\.Model|BaseModel|SQLModel)`)
	reJSModel = regexp.MustCompile(`(?:mongoose\.model|new\s+Schema|@Entity)\s*\(?\s*['"]?(\w+)?`)
	reGoORM   = regexp.MustCompile(`gorm:"`)
	// os.Getenv("X"), process.env.X, os.environ["X"], os.environ.get("X"), ENV["X"]
	reEnvUsage = regexp.MustCompile(`(?:os\.Getenv\(|getenv\(|process\.env\.|os\.environ(?:\.get)?[\[(]|ENV\[)\s*['"]?([A-Z][A-Z0-9_]{2,})`)
)

// factsCache avoids re-scanning the repo for every prompt in a run.
var (
	factsMu    sync.Mutex
	factsCache = map[string]*Facts{}
)

// detectFacts extracts framework-level facts from a repository, caching per
// scan root so the many prompts in one run share the work.
func detectFacts(res *scan.Result, idx *codemap.Index) *Facts {
	factsMu.Lock()
	if f, ok := factsCache[res.Root]; ok {
		factsMu.Unlock()
		return f
	}
	factsMu.Unlock()

	f := &Facts{}
	for _, sf := range res.Files {
		lang := codemap.Lang(sf.Path)
		// Tests define fixture routes, models and env vars that do not exist in
		// the running system; documenting them would be actively wrong.
		if lang == "" || sf.Size > 512*1024 || isTestFile(sf.Path) {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(res.Root, filepath.FromSlash(sf.Path)))
		if err != nil {
			continue
		}
		scanFileFacts(f, sf.Path, lang, string(raw))
	}

	// Kaioken-style CLI commands come from the codemap, not regexes.
	if idx != nil {
		for path, fm := range idx.Files {
			if !strings.Contains(path, "cmd/") && !strings.HasSuffix(path, "main.go") {
				continue
			}
			for _, s := range fm.Symbols {
				if strings.HasPrefix(s.Name, "cmd") && len(s.Name) > 3 {
					f.Commands = append(f.Commands, Fact{
						Kind: "command", Value: strings.ToLower(s.Name[3:]),
						File: path, Line: s.Line, Detail: s.Signature,
					})
				}
			}
		}
	}

	dedupeFacts(f)
	factsMu.Lock()
	factsCache[res.Root] = f
	factsMu.Unlock()
	return f
}

func scanFileFacts(f *Facts, path, lang, content string) {
	for n, line := range strings.Split(content, "\n") {
		lineNo := n + 1
		if len(line) > 400 {
			continue
		}

		switch lang {
		case "javascript", "typescript":
			if m := reJSRoute.FindStringSubmatch(line); m != nil {
				f.Routes = append(f.Routes, Fact{Kind: "route",
					Value: strings.ToUpper(m[1]) + " " + m[2], File: path, Line: lineNo})
			}
			if m := reJSModel.FindStringSubmatch(line); m != nil && m[1] != "" {
				f.Models = append(f.Models, Fact{Kind: "model", Value: m[1], File: path, Line: lineNo})
			}
		case "python":
			if m := rePyRoute.FindStringSubmatch(line); m != nil {
				verb := strings.ToUpper(m[1])
				if verb == "ROUTE" {
					verb = "ANY"
				}
				f.Routes = append(f.Routes, Fact{Kind: "route",
					Value: verb + " " + m[2], File: path, Line: lineNo})
			}
			if m := rePyModel.FindStringSubmatch(line); m != nil {
				f.Models = append(f.Models, Fact{Kind: "model", Value: m[1], File: path, Line: lineNo})
			}
		case "java", "kotlin":
			if m := reJavaRoute.FindStringSubmatch(line); m != nil {
				verb := strings.ToUpper(m[1])
				if verb == "REQUEST" {
					verb = "ANY"
				}
				f.Routes = append(f.Routes, Fact{Kind: "route",
					Value: verb + " " + m[2], File: path, Line: lineNo})
			}
		case "go":
			if m := reGoRoute.FindStringSubmatch(line); m != nil && strings.HasPrefix(m[1], "/") {
				f.Routes = append(f.Routes, Fact{Kind: "route", Value: m[1], File: path, Line: lineNo})
			}
			if reGoORM.MatchString(line) {
				// The struct this field belongs to is a persisted model; record
				// the file once, since the codemap already names the types.
				f.Models = append(f.Models, Fact{Kind: "model",
					Value: "(gorm-mapped struct)", File: path, Line: lineNo})
			}
		case "ruby":
			if m := reRubyRoute.FindStringSubmatch(line); m != nil {
				f.Routes = append(f.Routes, Fact{Kind: "route",
					Value: strings.ToUpper(m[1]) + " " + m[2], File: path, Line: lineNo})
			}
		}

		if m := reEnvUsage.FindStringSubmatch(line); m != nil {
			f.Env = append(f.Env, Fact{Kind: "env", Value: m[1], File: path, Line: lineNo})
		}
	}
}

// isTestFile reports whether a path is test code across the common languages.
func isTestFile(path string) bool {
	p := strings.ToLower(path)
	base := strings.ToLower(filepath.Base(path))
	return strings.HasSuffix(base, "_test.go") ||
		strings.HasPrefix(base, "test_") ||
		strings.Contains(base, ".test.") ||
		strings.Contains(base, ".spec.") ||
		strings.HasPrefix(p, "test/") || strings.HasPrefix(p, "tests/") ||
		strings.Contains(p, "/test/") || strings.Contains(p, "/tests/") ||
		strings.Contains(p, "__tests__/")
}

// dedupeFacts collapses repeats and sorts each group for stable prompts.
func dedupeFacts(f *Facts) {
	clean := func(in []Fact) []Fact {
		seen := map[string]bool{}
		var out []Fact
		for _, fact := range in {
			key := fact.Kind + "|" + fact.Value
			if fact.Value == "" || seen[key] {
				continue
			}
			seen[key] = true
			out = append(out, fact)
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Value < out[j].Value })
		return out
	}
	f.Routes, f.Models = clean(f.Routes), clean(f.Models)
	f.Commands, f.Env = clean(f.Commands), clean(f.Env)
}
