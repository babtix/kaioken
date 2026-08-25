# Repository Scanning

## Table of Contents
- [Overview](#overview)
- [Data Structures](#data-structures)
  - [File](#file)
  - [Result](#result)
  - [Manifest Names](#manifest-names)
  - [Binary Extensions](#binary-extensions)
  - [Max File Size](#max-file-size)
- [Scanning Process](#scanning-process)
  - [Configuration Integration](#configuration-integration)
  - [Ignore Rules](#ignore-rules)
  - [Binary File Detection](#binary-file-detection)
  - [Manifest Detection](#manifest-detection)
  - [Result Aggregation](#result-aggregation)
- [Helper Functions](#helper-functions)
  - [underAny](#underany)
  - [TreeSummary](#treesummary)
  - [ManifestContents](#manifestcontents)
  - [Stats](#stats)
- [Flow Diagram](#flow-diagram)
- [Referenced Files](#referenced-files)

---

## Overview
The `scan` package walks a repository, applies ignore rules (`.gitignore`, config‑based excludes, and default directory skips), filters out binary files, and builds a `scan.Result` that contains:
* an inventory of every non‑binary file (`File` struct)
* counts per file extension (`ByExt`)
* total size of all scanned files (`TotalSize`)
* paths of recognized manifest files (`Manifests`)

The result is used by the planner (`plan.Generate`) and the knowledge engine (`wiki.Run`) to understand the repository’s layout and tech stack.

---

## Data Structures

### File
`cli/internal/scan/scan.go:20-26`

```go
// File is one scanned source file.
type File struct {
	// Path is repo-relative with forward slashes.
	Path  string
	Size  int64
	Lines int
	Ext   string
}
```
* `Path` – repository‑relative path using `/` as separator.  
* `Size` – file size in bytes.  
* `Lines` – number of newline‑terminated lines (only set for files ≤ `maxFileBytes`).  
* `Ext` – lower‑cased file extension (including the leading dot).

### Result
`cli/internal/scan/scan.go:29-35`

```go
// Result holds everything the scanner learned about a repository.
type Result struct {
	Root      string
	Files     []File
	Manifests []string // repo-relative paths of recognized manifest files
	ByExt     map[string]int
	TotalSize int64
}
```
* `Root` – absolute path of the scanned repository.  
* `Files` – slice of all non‑binary files, sorted lexicographically by `Path`.  
* `Manifests` – list of manifest file paths (see Manifest Names).  
* `ByExt` – histogram of extensions (empty string for files without extension).  
* `TotalSize` – sum of `Size` across all `Files`.

### Manifest Names
`cli/internal/scan/scan.go:39-49`

```go
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
```
These files are always included in the scan (unless excluded by ignore rules) and are reported in `Result.Manifests` for the planner to prioritize.

### Binary Extensions
`cli/internal/scan/scan.go:52-60`

```go
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
```
Entries with value `true` are skipped outright; `.svg` is `false` because SVGs are text‑based and may be inspected.

### Max File Size
`cli/internal/scan/scan.go:62`

```go
const maxFileBytes = 2 << 20 // files larger than 2 MiB are inventoried but never bundled
```
Files larger than this limit are still added to `Result.Files` (so they appear in the inventory) but their contents are **not** read for line counting or binary sniffing.

---

## Scanning Process

### Configuration Integration
The scanner receives a `*config.Config` (`cfg`). Two slices from `cfg.Scope` drive inclusion/exclusion:
* `cfg.Scope.Exclude` – additional ignore patterns compiled with `github.com/sabhiram/go-gitignore`.
* `cfg.Scope.Include` – if non‑empty, a file must be under at least one of these prefixes (checked via `underAny`).

The global `config.DefaultExcludes` (hard‑coded directory names like `.git`, `node_modules`, etc.) are also applied to directories.

### Ignore Rules
1. **`.gitignore`** – if present, compiled into `gi`.  
2. **Config excludes** – if `cfg.Scope.Exclude` has entries, compiled into `extra`.  
3. **Directory pruning** – during `filepath.WalkDir`, directories matching any of the following are skipped with `filepath.SkipDir`:
   * a name in `config.DefaultExcludes`
   * matches `gi` with `gi.MatchesPath(rel+"/")`
   * matches with `extra.MatchesPath(rel+"/")`

### Binary File Detection
For each non‑directory entry:
1. Path is tested against `gi` and `extra`; if matched, the file is skipped.  
2. If `cfg.Scope.Include` is set, `underAny` must return true; otherwise the file is skipped.  
3. Extension is lower‑cased and looked up in `binaryExts`. If present and `true`, the file is skipped without further inspection.  
4. File stats are obtained via `d.Info()`.  
5. A `File` struct is created with `Path`, `Size`, and `Ext`.  
6. If `Size ≤ maxFileBytes`:
   * The file is read entirely.  
   * A null byte (`0x00`) scan (`bytes.IndexByte(raw, 0) != -1`) indicates binary content; the file is skipped.  
   * Otherwise, `Lines` is set to `bytes.Count(raw, []byte("\n")) + 1`.  
7. If `Size > maxFileBytes`, `Lines` remains zero (content not read).  
8. The `File` is appended to `res.Files`, extension count incremented, and total size accumulated.  
9. If the file’s base name exists in `manifestNames`, its repo‑relative path is added to `res.Manifests`.

After the walk, `res.Files` is sorted by `Path` for deterministic output.

### Manifest Detection
Manifest detection happens inline during the walk (see step 9 above). The full contents of all manifest files can later be retrieved via `Result.ManifestContents`.

### Result Aggregation
The `Result` fields are updated as follows:
* `Files` – appended for each accepted file.  
* `ByExt` – `res.ByExt[ext]++`.  
* `TotalSize` – `res.TotalSize += f.Size`.  
* `Manifests` – appended when `manifestNames[base]` is true.

---

## Helper Functions

### underAny
`cli/internal/scan/scan.go:151-159`

```go
func underAny(rel string, prefixes []string) bool {
	for _, p := range prefixes {
		p = strings.Trim(filepath.ToSlash(p), "/")
		if rel == p || strings.HasPrefix(rel, p+"/") {
			return true
		}
	}
	return false
}
```
Returns true if the repository‑relative path `rel` equals any prefix or is a child of that prefix (with a trailing `/`). Used to enforce `cfg.Scope.Include`.

### TreeSummary
`cli/internal/scan/scan.go:163-197`

```go
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
```
Produces a compact, indented tree view with per‑directory file counts and a limited number of example file names (useful for LLM prompts).

### ManifestContents
`cli/internal/scan/scan.go:201-214`

```go
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
```
Concatenates the contents of all manifest files, each truncated to `capBytes` bytes, separated by a header line. Used by the planner to surface tech‑stack signals.

### Stats
`cli/internal/scan/scan.go:217-239`

```go
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
```
One‑line summary showing total file count, total size in megabytes, and the top‑8 extensions by frequency.

---

## Flow Diagram
The following diagram illustrates the core logic of `Repo`.

```mermaid
flowchart TD
    A[Start Repo(root, cfg)] --> B[Get absolute root]
    B --> C[Load .gitignore → gi]
    C --> D[Compile extra ignore from cfg.Scope.Exclude → extra]
    D --> E[Initialize Result]
    E --> F[WalkDir root]
    F --> G{Is Dir?}
    G -->|Yes| H[Check default excludes, gi, extra → SkipDir if match]
    H --> I[Continue walk]
    G -->|No| J[Check gi, extra, Include → skip if match]
    J --> K[Get ext, check binaryExts → skip if binary]
    K --> L[Get file info]
    L --> M[Create File struct]
    M --> N{Size ≤ maxFileBytes?}
    N -->|Yes| O[Read file, check null byte → skip if binary]
    O --> P[Count lines]
    N -->|No| Q[Skip content reading]
    P --> R[Append File to Result, update ByExt, TotalSize]
    Q --> R
    R --> S[If manifestNames[base] add to Manifests]
    S --> T[End WalkDir]
    T --> U[Sort Files by Path]
    U --> V[Return Result, nil]
```

---

## Referenced Files
- `cli/internal/scan/scan.go`

<!-- kaioken:files internal/scan/scan.go -->
