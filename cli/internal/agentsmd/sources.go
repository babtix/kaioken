package agentsmd

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"kaioken/internal/scan"
)

// AGENTS.md is written from executable sources of truth, not from prose. A
// README says what the project wishes were true; the CI workflow says what
// actually has to pass. So the collector goes after the files that encode
// commands and constraints — task runners, CI, linters, test config, existing
// instruction files — and hands them to the model verbatim.

const (
	// perFileBytes caps one source. Config files are small; the cap exists for
	// the occasional 4000-line lockfile-adjacent manifest.
	perFileBytes = 8000
	// totalBytes caps the whole evidence bundle, so a monorepo with forty CI
	// workflows cannot crowd out the manifests.
	totalBytes = 60000
)

// source is one file handed to the model as evidence.
type source struct {
	Path string
	Body string
	rank int
}

// exactNames are files whose presence is high signal wherever they sit. The
// rank orders the bundle: lower is more important, and the total-byte cap eats
// from the bottom.
var exactNames = map[string]int{
	// Existing agent instructions come first: they may encode team knowledge
	// that no config file states, and we are asked to preserve it.
	"agents.md": 0, "claude.md": 0, "cursorrules": 0, ".cursorrules": 0,
	"copilot-instructions.md": 0, "opencode.json": 0, "opencode.jsonc": 0,
	"contributing.md": 1, "readme.md": 1,

	// Task runners and package manifests: the real commands live here.
	"makefile": 2, "taskfile.yml": 2, "taskfile.yaml": 2, "justfile": 2,
	"package.json": 2, "go.mod": 2, "cargo.toml": 2, "pyproject.toml": 2,
	"gemfile": 3, "composer.json": 3, "build.gradle": 3, "build.gradle.kts": 3,
	"pom.xml": 3, "cmakelists.txt": 3, "mix.exs": 3, "deno.json": 3,
	"pnpm-workspace.yaml": 3, "lerna.json": 3, "nx.json": 3, "turbo.json": 3,
	"go.work": 3,

	// Quality gates. Their config states the order an agent must run them in.
	"tsconfig.json": 4, ".golangci.yml": 4, ".golangci.yaml": 4,
	".eslintrc.json": 4, ".eslintrc.js": 4, "eslint.config.js": 4,
	"eslint.config.mjs": 4, ".prettierrc": 4, "biome.json": 4,
	"ruff.toml": 4, ".ruff.toml": 4, "setup.cfg": 4, "tox.ini": 4,
	"pytest.ini": 4, "jest.config.js": 4, "jest.config.ts": 4,
	"vitest.config.ts": 4, "playwright.config.ts": 4,
	".pre-commit-config.yaml": 4, ".editorconfig": 5,

	// Runtime and deployment quirks an agent trips over.
	"dockerfile": 5, "docker-compose.yml": 5, "docker-compose.yaml": 5,
	".env.example": 5, ".env.sample": 5, "vercel.json": 5, "railway.toml": 5,
	"fly.toml": 5, "netlify.toml": 5, "procfile": 5,
}

// dirPrefixes are directories whose contents are collected wholesale, because
// the individual filenames vary but the content is always high signal.
var dirPrefixes = map[string]int{
	".github/workflows/": 2,
	".gitlab-ci.yml":     2,
	".cursor/rules/":     0,
}

// collect gathers the evidence bundle for one repository, most important first
// and capped in total size.
func collect(repo string, res *scan.Result) []source {
	var found []source
	for _, f := range res.Files {
		rank, ok := rankOf(f.Path)
		if !ok {
			continue
		}
		found = append(found, source{Path: f.Path, rank: rank})
	}

	sort.SliceStable(found, func(i, j int) bool {
		if found[i].rank != found[j].rank {
			return found[i].rank < found[j].rank
		}
		// Shallower files win ties: a root Makefile outranks a nested one.
		di, dj := strings.Count(found[i].Path, "/"), strings.Count(found[j].Path, "/")
		if di != dj {
			return di < dj
		}
		return found[i].Path < found[j].Path
	})

	var out []source
	budget := totalBytes
	for _, s := range found {
		if budget <= 0 {
			break
		}
		raw, err := os.ReadFile(filepath.Join(repo, filepath.FromSlash(s.Path)))
		if err != nil {
			continue
		}
		body := string(raw)
		if len(body) > perFileBytes {
			body = body[:perFileBytes] + "\n… [truncated]\n"
		}
		if len(body) > budget {
			body = body[:budget] + "\n… [truncated]\n"
		}
		budget -= len(body)
		s.Body = body
		out = append(out, s)
	}
	return out
}

// rankOf reports whether a repo-relative path is worth bundling, and how
// important it is.
func rankOf(path string) (int, bool) {
	lower := strings.ToLower(path)
	if strings.HasPrefix(lower, ".kaioken/") {
		return 0, false // generated documentation is passed in separately
	}
	for prefix, rank := range dirPrefixes {
		if strings.HasPrefix(lower, prefix) || lower == strings.TrimSuffix(prefix, "/") {
			return rank, true
		}
	}
	base := lower
	if i := strings.LastIndex(lower, "/"); i >= 0 {
		base = lower[i+1:]
	}
	if rank, ok := exactNames[base]; ok {
		return rank, true
	}
	// README variants: README.rst, README.dev.md, …
	if strings.HasPrefix(base, "readme") {
		return 1, true
	}
	return 0, false
}

// render writes the evidence bundle into the prompt.
func render(sources []source) string {
	var b strings.Builder
	for _, s := range sources {
		fmt.Fprintf(&b, "===== %s =====\n%s\n\n", s.Path, strings.TrimRight(s.Body, "\n"))
	}
	return b.String()
}

// paths lists what was bundled, for progress output.
func paths(sources []source) []string {
	out := make([]string, 0, len(sources))
	for _, s := range sources {
		out = append(out, s.Path)
	}
	return out
}
