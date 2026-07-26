# Linting and Code Quality

This chapter outlines the linting and code quality tools configured for the Kaioken project and explains how to run them to maintain code standards.

## Table of Contents
- [Overview](#overview)
- [Running the Tools](#running-the-tools)
  - [go vet](#go-vet)
  - [golangci-lint](#golangci-lint)
  - [go test](#go-test)
  - [check](#check)
- [Tool Details](#tool-details)
  - [go vet Details](#go-vet-details)
  - [golangci-lint Details](#golangci-lint-details)
- [Development Workflow](#development-workflow)

## Overview

Kaioken uses a combination of Go's built-in tooling and third-party linters to enforce code quality:
- **`go vet`**: Official Go static analyzer for detecting suspicious constructs
- **`golangci-lint`**: Comprehensive Go linter that aggregates multiple linters
- **`go test`**: Unit test suite (included in verification gates)

These tools are accessible via Makefile targets and form the project's verification pipeline.

## Running the Tools

All code quality tools are executed through the project's Makefile. Run them from the repository root.

### go vet

`go vet` examines Go source code and reports suspicious patterns.

`Makefile:12-14`

```makefile
## vet: run go vet static analysis
vet:
	go vet ./...
```

Execute with:
```sh
make vet
```

### golangci-lint

`golangci-lint` runs a configurable set of linters (including staticcheck, errcheck, govet, etc.). The target includes an installation check.

`Makefile:16-20`

```makefile
## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...
```

Execute with:
```sh
make lint
```

*Note: If golangci-lint is not installed, the target prints a message and exits successfully without running.*

### go test

The unit test suite validates functional correctness.

`Makefile:6-8`

```makefile
## test: run all unit tests
test:
	go test ./...
```

Execute with:
```sh
make test
```

### check

The `check` target combines unit tests and `go vet` as a pre-commit verification gate.

`Makefile:22-24`

```makefile
## check: run all verification gates (test + vet)
check: test vet
```

Execute with:
```sh
make check
```

*Note: `check` does **not** run `golangci-lint` by default. Run `make lint` separately for comprehensive linting.*

## Tool Details

### go vet Details

The `go vet` command analyzes Go source code for:
- Printf format string mismatches
- Unreachable code
- Suspicious nil comparisons
- Struct tag validation
- Loop variable closure issues
- And other common mistakes

It operates on all packages in the current module (`./...`). Errors indicate code that may compile but likely behaves incorrectly.

### golangci-lint Details

When installed, `golangci-lint` runs with the project's default configuration (implicitly using `.golangci.yml` if present, otherwise built-in defaults). It executes multiple linters including:
- **staticcheck**: Detects bugs and performance issues
- **errcheck**: Checks error handling
- **govet**: Runs `go vet` internally
- **ineffassign**: Detects ineffective assignments
- **unused**: Reports unused code
- And many others

The linter returns a non-zero exit code if any issues are found, causing the `make lint` target to fail.

## Development Workflow

Integrate these tools into your development process:

1. **Local Development**:
   - Run `make check` before committing to catch basic issues
   - Run `make lint` periodically for comprehensive style and bug detection
   - Fix all reported issues before submitting code

2. **Continuous Integration**:
   - CI pipelines should run `make check` and `make lint` as verification steps
   - The `lint` target's installation check ensures it doesn't break builds in environments without golangci-lint

3. **Installing golangci-lint**:
   ```sh
   # Using Go
   go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
   
   # Or via package managers (brew, apt, etc.)
   ```

4. **Addressing Issues**:
   - `go vet` errors typically require code changes to fix logical issues
   - `golangci-lint` warnings may include:
     - Style fixes (run `golangci-lint run --fix` for auto-fixable issues)
     - Dependency updates
     - Removal of unused code
     - Error handling improvements

By consistently applying these tools, contributors maintain the codebase's readability, correctness, and adherence to Go best practices.

<!-- kaioken:files Makefile -->
