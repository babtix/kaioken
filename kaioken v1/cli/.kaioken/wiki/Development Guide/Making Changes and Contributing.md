# Making Changes and Contributing

This chapter provides a step-by-step workflow for modifying the kaioken codebase, running tests, linting, building, and preparing contributions.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Setting Up the Development Environment](#setting-up-the-development-environment)
- [Making Changes](#making-changes)
- [Running Tests](#running-tests)
- [Running Static Analysis](#running-static-analysis)
- [Building the Project](#building-the-project)
- [Cleaning Build Artifacts](#cleaning-build-artifacts)
- [Preparing a Contribution](#preparing-a-contribution)
- [Referenced Files](#referenced-files)

## Prerequisites
- Go 1.26 or later (as specified in `go.mod`)
- Access to the repository
- Optional: `golangci-lint` for linting (the `make lint` target checks for its presence)

## Setting Up the Development Environment
1. Clone the repository:
   ```sh
   git clone <repository-url>
   cd kaioken
   ```
2. Ensure Go 1.26 is installed (the version specified in `go.mod`):
   ```sh
   go version
   # Expected output: go version go1.26 linux/amd64
   ```
3. Fetch dependencies:
   ```sh
   go mod tidy
   ```

## Making Changes
1. Create a new branch for your feature or fix:
   ```sh
   git checkout -b feature/your-feature-name
   ```
2. Modify code in the appropriate packages (refer to the [Architecture Overview](../Architecture%20Overview.md) for package structure).
3. Follow existing code conventions:
   - Use `error` as the last return value for functions that can fail
   - Apply MixedCaps for structs and methods, ALL_CAPS for package-level constants
   - Ensure high-level layers (e.g., `cmd`, `tui`) depend only on lower-level layers (e.g., `internal/*`)

## Running Tests
Execute all unit tests with:
```sh
make test
```
This runs `go test ./... -count=1` across all packages.

### Test Target Details
`Makefile:3-5`
```makefile
## test: run all unit tests
test:
	go test ./... -count=1
```
```

## Running Static Analysis
### Go Vet
Run static analysis with:
```sh
make vet
```
This executes `go vet ./...` to detect suspicious constructs.

`Makefile:7-9`
```makefile
## vet: run go vet static analysis
vet:
	go vet ./...
```
```

### Linting
Run `golangci-lint` if installed:
```sh
make lint
```
The target checks for `golangci-lint` and skips gracefully if absent.

`Makefile:11-14`
```makefile
## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...
```
```

### All Verification Gates
Run both tests and vet:
```sh
make check
```
This combines `test` and `vet` targets.

`Makefile:16-17`
```makefile
## check: run all verification gates (test + vet)
check: test vet
```
```

## Building the Project
Compile the binary:
```sh
make build
```
This produces:
- `kaioken` (executable for current platform)
- `kaioken.exe` (explicit Windows build)

`Makefile:19-22`
```makefile
## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```
```

## Cleaning Build Artifacts
Remove compiled binaries:
```sh
make clean
```
This deletes `kaioken.exe` and handles cross-platform compatibility.

`Makefile:24-26`
```makefile
## clean: remove build artifacts
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
```
```

## Preparing a Contribution
1. Ensure changes pass verification:
   ```sh
   make check
   ```
2. Format code (optional but recommended):
   ```sh
   go fmt ./...
   ```
3. Add tests for new functionality.
4. Update documentation if applicable (e.g., new CLI flags, configuration options).
5. Commit changes with a clear, descriptive message:
   ```sh
   git commit -m "feat: add new LLM provider integration"
   ```
6. Push the branch and open a pull request against the main branch.

## What to Ignore
The `.gitignore` file specifies files and directories excluded from version control:
- Build artifacts (`kaioken.exe*`)
- Local-only state (`.kaioken/sessions/`, `.kaioken/config.yaml`)
- OS-specific files (Thumbs.db, .DS_Store)

`.gitignore:1-8`
```gitignore
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

## Referenced Files
- `go.mod`: Defines Go version and dependencies
- `Makefile`: Contains targets for testing, linting, building, and cleaning
- `.gitignore`: Specifies untracked files to ignore

These files are the sole references for the development workflow described in this chapter. All other aspects of the codebase (e.g., internal packages, CLI commands) are covered in sibling chapters such as [Architecture Overview](../Architecture%20Overview.md) and [Configuration](../Configuration.md).

<!-- kaioken:files Makefile,go.mod -->
