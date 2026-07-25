# Understanding the Repository Structure

This chapter explains how to infer the project's directory layout and generated files by examining the `Makefile` and `.gitignore`. These files reveal build artifacts, local-only state, and key directories that shape the repository structure.

## Table of Contents
- [Makefile Analysis](#makefile-analysis)
- [.gitignore Analysis](#gitignore-analysis)
- [Inferred Directory Layout](#inferred-directory-layout)
- [Generated Files and Artifacts](#generated-files-and-artifacts)
- [Referenced Files](#referenced-files)

## Makefile Analysis

The `Makefile` defines common development tasks and reveals how the project is built and cleaned.

### Targets Overview

| Target | Description | Command |
|--------|-------------|---------|
| `test` | Runs all unit tests | `go test ./...` |
| `vet` | Executes Go static analysis | `go vet ./...` |
| `lint` | Runs `golangci-lint` if available | `golangci-lint run ./...` |
| `check` | Combines `test` and `vet` | `test vet` |
| `build` | Compiles the binary | `go build ./...`<br>`go build -o kaioken.exe ./cmd/kaioken` |
| `clean` | Removes build artifacts | `rm -f kaioken.exe` (Unix)<br>`del kaioken.exe` (Windows) |

### Key Inferences
- The `build` target produces `kaioken.exe` in the repository root (from `./cmd/kaioken`).
- The `clean` target removes `kaioken.exe` and attempts to handle Windows-style deletions.
- The presence of `go test ./...` and `go vet ./...` indicates a standard Go project layout with packages in subdirectories.
- The `lint` target checks for `golangci-lint` availability before running, suggesting optional linting.

`Makefile:19-22` shows the build process:
```
## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```

`Makefile:24-26` shows the cleanup routine:
```
## clean: remove build artifacts
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
```

## .gitignore Analysis

The `.gitignore` file specifies intentionally untracked files that Git should ignore, highlighting build artifacts, local state, and OS-specific files, and user-specific data.

### Ignored Patterns

| Pattern | Purpose | Inferred Meaning |
|---------|---------|------------------|
| `kaioken.exe`<br>`kaioken.exe.old`<br>`kaioken.exe~` | Build artifacts | Primary executable and backups |
| `.kaioken/sessions/`<br>.kaioken/config.yaml` | Session and state | Local-only configuration and chat history |
| `Thumbs.db`<br>`.DS_Store` | OS files | Windows/macOS system files |

### Key Inferences
- The `.kaioken/` directory stores runtime state:
  - `sessions/` contains persisted chat sessions (not committed).
  - `config.yaml` holds per-repo configuration (not committed).
- Build artifacts (`kaioken.exe` and variants) are excluded from version control.
- OS-specific temporary files are ignored globally.

`.gitignore:1-12` captures the full ignore rules:
```
# Build artifacts
kaioken.exe
kaioken.exe.old
kaioken.exe~

# Session and state (local-only)
.kaioken/sessions/
.kaioken/config.yaml

# OS files
Thumbs.db
.DS_Store
```

## Inferred Directory Layout

Based on the `Makefile` and `.gitignore`, we can deduce the following repository structure:

```
repository-root/
├── Makefile
├── .gitignore
├── cmd/
│   └── kaioken/          # Contains main application (inferred from build target)
│       └── ...           # Likely main.go and command definitions
├── .kaioken/             # Local state directory (ignored)
│   ├── sessions/         # Chat session storage
│   └── config.yaml       # Per-repo configuration
└── [other source directories]  # Inferred from go ./... commands (e.g., internal/, pkg/)
```

### Evidence
- `Makefile:22` references `./cmd/kaioken`, confirming a `cmd/kaioken` directory.
- `.gitignore:7-8` references `.kaioken/sessions/` and `.kaioken/config.yaml`, confirming the `.kaioken` directory structure.
- The `go build ./...` and `go test ./...` commands imply multiple Go packages exist in subdirectories (consistent with the architecture brief's `internal/` packages).

## Generated Files and Artifacts

The following files and directories are generated during development and should not be committed:

| Artifact | Source | Description |
|----------|--------|-------------|
| `kaioken.exe` | `make build` | Primary executable (Unix/Windows) |
| `kaioken.exe.old`<br>`kaioken.exe~` | Build process | Backup executables |
| `.kaioken/sessions/` | Runtime | Persisted chat sessions |
| `.kaioken/config.yaml` | Runtime | Per-repo configuration overrides |
| `Thumbs.db`<br>`.DS_Store` | OS | System-generated thumbnail/store files |

### Workflow Implications
1. **Building**: Running `make build` produces `kaioken.exe` in the root.
2. **Cleaning**: `make clean` removes the executable and backups.
3. **Local State**: The `.kaioken/` directory is created at runtime for sessions and config, explaining its absence in the repository.
4. **Cross-Platform**: The `clean` target handles both Unix (`rm`) and Windows (`del`) commands, indicating cross-platform support.

## Referenced Files
- `Makefile:19-22`
- `Makefile:24-26`
- `.gitignore:1-12`

<!-- kaioken:files .gitignore,Makefile -->
