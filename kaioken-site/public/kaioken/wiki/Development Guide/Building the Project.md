# Building the Project

This chapter details the build process and available build targets in the Makefile for the Kaioken project. It explains how to compile the binary, run tests, perform static analysis, lint the codebase, and clean build artifacts.

## Table of Contents
- [Overview](#overview)
- [Test Target](#test-target)
- [Vet Target](#vet-target)
- [Lint Target](#lint-target)
- [Check Target](#check-target)
- [Build Target](#build-target)
- [Clean Target](#clean-target)

## Overview

The Makefile provides a set of standard development targets for building, testing, and verifying the Kaioken project. All targets are declared as `.PHONY` to prevent conflicts with files of the same name.

`Makefile:1-1`
```makefile
.PHONY: test vet lint check build clean
```

## Test Target

The `test` target runs all unit tests across the project using Go's testing framework.

`Makefile:3-5`
```makefile
## test: run all unit tests
test:
	go test ./...
```

This target executes `go test ./...` which discovers and runs all `_test.go` files in the current directory and subdirectories.

## Vet Target

The `vet` target runs Go's static analysis tool to detect suspicious constructs.

`Makefile:7-9`
```makefile
## vet: run go vet static analysis
vet:
	go vet ./...
```

This executes `go vet ./...` which analyzes Go source code and reports potential errors.

## Lint Target

The `lint` target runs `golangci-lint` if it is installed in the system. If the linter is not available, it skips execution without error.

`Makefile:11-14`
```makefile
## lint: run golangci-lint (if installed)
lint:
	@command -v golangci-lint >/dev/null 2>&1 || { echo "golangci-lint not installed; skipping"; exit 0; }
	golangci-lint run ./...
```

The target first checks for the presence of `golangci-lint` using `command -v`. If found, it runs `golangci-lint run ./...` to perform linting across all packages. If not found, it prints a message and exits successfully.

## Check Target

The `check` target is a composite target that runs both `test` and `vet` targets sequentially, providing a quick verification gate.

`Makefile:16-17`
```makefile
## check: run all verification gates (test + vet)
check: test vet
```

Invoking `make check` will first run unit tests, then static analysis. If either step fails, the process stops.

## Build Target

The `build` target compiles the Kaioken binary. It performs two steps:
1. Builds all packages in the project to catch compilation errors early
2. Builds the main command specifically and outputs it as `kaioken.exe`

`Makefile:19-22`
```makefile
## build: compile the binary
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```

The first command `go build ./...` builds all Go packages (excluding tests). The second command builds the main application located in `./cmd/kaioken` and outputs the executable as `kaioken.exe` in the current directory.

## Clean Target

The `clean` target removes the compiled binary artifact. It uses platform-specific commands to handle both Unix-like systems (`rm`) and Windows (`del`), suppressing error messages if the file doesn't exist.

`Makefile:24-26`
```makefile
## clean: remove build artifacts
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
```

This target attempts to remove `kaioken.exe` using `rm -f` (Unix) or `del` (Windows). The `@` prefix suppresses the command echo, and error redirection ensures the command succeeds even if the file is absent.

<!-- kaioken:files Makefile -->
