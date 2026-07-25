// Package scan walks a repository, filters it through .gitignore and config
// scope rules, and produces both a file inventory and a compact textual
// "repo map" suitable for LLM consumption.
package scan

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	ignore "github.com/sabhiram/go-gitignore"

	"kaioken/internal/config"
)

// File is one scanned source file.
type File struct {
	// Path is repo-relative with forward slashes.
	Path  string
	Size  int64
	Lines int
	Ext   string
}

// Result holds everything the scanner learned about a repository.
type Result struct {
	Root      string
	Files     []File
	Manifests []string // repo-relative paths of recognized manifest files
	ByExt     map[string]int
	TotalSize int64
}

// manifestNames are files that reveal the tech stack; they are surfaced to
// the planner in full and prioritized in module bundles.
var manifestNames = map[string]bool{
	"package.json": true, "pyproject.toml": true, "go.mod": true,
	"Cargo.toml": true, "pom.xml": true, "build.gradle": true,
	"composer.json": true, "Gemfile": true, "requirements.txt": true,
	"Dockerfile": true, "docker-compose.yml": true, "docker-compose.yaml": true,
	"pnpm-workspace.yaml": true, "vercel.json": true, "railway.toml": true,
	"Makefile": true, "CMakeLists.txt": true, "setup.py": true,
	"tsconfig.json": true, "vite.config.ts": true, "vite.config.js": true,
	"next.config.js": true, "next.config.ts": true, "CLAUDE.md": true,
	"AGENTS.md": true, "README.md": true,
}

// binaryExts are skipped without content inspection.
var binaryExts = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".ico": true, ".svg": false, ".pdf": true, ".zip": true, ".gz": true,
	".tar": true, ".7z": true, ".exe": true, ".dll": true, ".so": true,
	".dylib": true, ".woff": true, ".woff2": true, ".ttf": true, ".otf": true,
	".eot": true, ".mp3": true, ".mp4": true, ".webm": true, ".mov": true,
	".pyc": true, ".class": true, ".jar": true, ".wasm": true, ".bin": true,
	".glb": true, ".gltf": true, ".hdr": true, ".db": true, ".sqlite": true,
}

const maxFileBytes = 2 << 20 // files larger than 2 MiB are inventoried but never bundled

// Repo scans the repository rooted at root using cfg's scope rules.
func Repo(root string, cfg *config.Config) (*Result, error) {
	root, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}

	var gi *ignore.GitIgnore
	if raw, err := os.ReadFile(filepath.Join(root, ".gitignore")); err == nil {
		gi = ignore.CompileIgnoreLines(strings.Split(string(raw), "\n")...)
	}
	var extra *ignore.GitIgnore
	if len(cfg.Scope.Exclude) > 0 {
		extra = ignore.CompileIgnoreLines(cfg.Scope.Exclude...)
	}

	res := &Result{Root: root, ByExt: map[string]int{}}

	err = filepath.WalkDir(root, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return nil // unreadable entries are skipped, not fatal
		}
		rel, rerr := filepath.Rel(root, path)
		if rerr != nil || rel == "." {
			return nil
		}
		rel = filepath.ToSlash(rel)

		base := filepath.Base(path)
		if d.IsDir() {
			for _, ex := range config.DefaultExcludes {
				if base == ex {
					return filepath.SkipDir
				}
			}
			if gi != nil && gi.MatchesPath(rel+"/") {
				return filepath.SkipDir
			}
			if extra != nil && extra.MatchesPath(rel+"/") {
				return filepath.SkipDir
			}
			return nil
		}

		if gi != nil && gi.MatchesPath(rel) {
			return nil
		}
		if extra != nil && extra.MatchesPath(rel) {
			return nil
		}
		if len(cfg.Scope.Include) > 0 && !underAny(rel, cfg.Scope.Include) {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(base))
		if binaryExts[ext] {
			return nil
		}
		info, ierr := d.Info()
		if ierr != nil {
			return nil
		}

		f := File{Path: rel, Size: info.Size(), Ext: ext}
		if info.Size() <= maxFileBytes {
			if raw, rerr := os.ReadFile(path); rerr == nil {
				if bytes.IndexByte(raw, 0) != -1 {
					return nil // binary content sniffed
				}
				f.Lines = bytes.Count(raw, []byte("\n")) + 1
			}
		}
		res.Files = append(res.Files, f)
		res.ByExt[ext]++
		res.TotalSize += f.Size
		if manifestNames[base] {
			res.Manifests = append(res.Manifests, rel)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	sort.Slice(res.Files, func(i, j int) bool { return res.Files[i].Path < res.Files[j].Path })
	return res, nil
}

func underAny(rel string, prefixes []string) bool {
	for _, p := range prefixes {
		p = strings.Trim(filepath.ToSlash(p), "/")
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	return false
}

// TreeSummary renders a directory tree with per-directory file counts and a
// bounded number of representative file names — compact enough for a prompt.
func (r *Result) TreeSummary(maxFilesPerDir int) string {
	type dirInfo struct {
		files []string
		count int
	}
	dirs := map[string]*dirInfo{}
	var order []string
	for _, f := range r.Files {
		dir := "."
		if i := strings.LastIndex(f.Path, "/"); i >= 0 {
			dir = f.Path[:i]
		}
		di, ok := dirs[dir]
		if !ok {
			di = &dirInfo{}
			dirs[dir] = di
			order = append(order, dir)
		}
		di.count++
		if len(di.files) < maxFilesPerDir {
			di.files = append(di.files, filepath.Base(f.Path))
		}
	}
	sort.Strings(order)
	var b strings.Builder
	for _, dir := range order {
		di := dirs[dir]
		fmt.Fprintf(&b, "%s/ (%d files): %s", dir, di.count, strings.Join(di.files, ", "))
		if di.count > len(di.files) {
			fmt.Fprintf(&b, ", …")
		}
		b.WriteString("\n")
	}
	return b.String()
}

// ManifestContents returns the concatenated contents of recognized manifest
// files, each capped at capBytes.
func (r *Result) ManifestContents(capBytes int) string {
	var b strings.Builder
	for _, m := range r.Manifests {
		raw, err := os.ReadFile(filepath.Join(r.Root, filepath.FromSlash(m)))
		if err != nil {
			continue
		}
		if len(raw) > capBytes {
			raw = raw[:capBytes]
		}
		fmt.Fprintf(&b, "===== %s =====\n%s\n\n", m, raw)
	}
	return b.String()
}

// Stats renders a one-line summary of the scan.
func (r *Result) Stats() string {
	type kv struct {
		k string
		v int
	}
	var exts []kv
	for k, v := range r.ByExt {
		if k == "" {
			k = "(none)"
		}
		exts = append(exts, kv{k, v})
	}
	sort.Slice(exts, func(i, j int) bool { return exts[i].v > exts[j].v })
	var parts []string
	for i, e := range exts {
		if i == 8 {
			break
		}
		parts = append(parts, fmt.Sprintf("%s×%d", e.k, e.v))
	}
	return fmt.Sprintf("%d files, %.1f MB — %s", len(r.Files),
		float64(r.TotalSize)/(1<<20), strings.Join(parts, ", "))
}
