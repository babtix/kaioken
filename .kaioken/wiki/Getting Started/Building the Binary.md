# Building the Binary

This chapter explains how to compile the `kaioken` executable using the provided Makefile or the Go toolchain directly.

## Table of Contents
- [Building with Makefile](#building-with-makefile)
- [Building with Go Toolchain Directly](#building-with-go-toolchain-directly)
- [Cleaning Build Artifacts](#cleaning-build-artifacts)
- [Referenced Files](#referenced-files)

## Building with Makefile

The project includes a Makefile that automates the build process. The `build` target compiles the executable and places it in the current directory.

`Makefile:20-22`

```makefile
build:
	go build ./...
	go build -o kaioken.exe ./cmd/kaioken
```

This target performs two steps:
1. `go build ./...` builds all packages in the project to verify dependencies and catch compilation errors.
2. `go build -o kaioken.exe ./cmd/kaioken` builds the main command and outputs the binary as `kaioken.exe`.

> **Note**: The `.exe` suffix is used in the Makefile output, but the actual binary name adapts to the host platform (e.g., `kaioken` on Unix-like systems, `kaioken.exe` on Windows) when built via the Go toolchain directly. The Makefile's output is explicitly named `kaioken.exe` for consistency in the provided script.

## Building with Go Toolchain Directly

If you prefer to bypass Make, use the Go toolchain directly:

```bash
go build -o kaioken ./cmd/kaioken
```

This command builds the `kaioken` binary (with platform-appropriate naming) from the `cmd/kaioken` package. Omitting the intermediate `go build ./...` step is acceptable for most builds, but running it first (as in the Makefile) helps ensure dependency integrity.

## Cleaning Build Artifacts

Remove compiled binaries using the Makefile's `clean` target:

`Makefile:25-26`

```makefile
clean:
	@rm -f kaioken.exe 2>/dev/null || del kaioken.exe 2>nul || true
```

This command attempts to delete `kaioken.exe` using platform-appropriate commands (`rm` for Unix-like systems, `del` for Windows), suppressing errors if the file doesn't exist.

## Referenced Files
- Makefile

<!-- kaioken:files Makefile,go.mod -->
