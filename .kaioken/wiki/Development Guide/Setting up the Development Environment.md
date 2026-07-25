# Setting up the Development Environment

This chapter explains how to initialize the Go module and install dependencies for the Kaioken project using the provided `go.mod` file.

## Table of Contents
- [Initializing the Go Module](#initializing-the-go-module)
- [Installing Dependencies](#installing-dependencies)

## Initializing the Go Module

The Kaioken project uses Go modules for dependency management. The `go.mod` file in the repository root defines the module path and dependency versions. To initialize the module in a fresh environment, run:

```bash
go mod init kaioken
```

This command creates a `go.mod` file if one does not exist, setting the module name to `kaioken` as specified in the repository's source. If the file already exists (as in the provided repository), this step is typically unnecessary unless reinitializing after deletion.

## Installing Dependencies

Dependencies listed in `go.mod` are installed using the Go toolchain. To download all dependencies into the local module cache, execute:

```bash
go mod download
```

This command reads the `go.mod` file and fetches the exact versions of all direct and indirect dependencies. Alternatively, running `go build` or `go test` will automatically download missing dependencies as needed.

The `go.mod` file specifies:
- Module path: `kaioken`
- Go version: 1.24.2
- Direct dependencies (e.g., `github.com/atotto/clipboard`, `github.com/charmbracelet/bubbles`)
- Indirect dependencies (automatically included, such as various `golang.org/x/*` and `github.com/charmbracelet/*` packages)

No further configuration is required to begin development. The dependencies are now available for building, testing, and running the project.

## Referenced Files
- go.mod

<!-- kaioken:files go.mod -->
