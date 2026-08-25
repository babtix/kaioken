---
name: build-the-binary
description: Compile the kaioken executable. Load this skill after modifying source code to produce an updated binary.
sources:
    - Makefile
    - cmd/kaioken/main.go
generated_at: 2026-07-26T04:10:19.3189201Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Build the kaioken binary

Compiles the kaioken executable from the source in ./cmd/kaioken and outputs it as kaioken.exe.

## Prerequisites
Go toolchain must be installed and configured (version 1.19 or later).

## Steps
1. Ensure you are in the root directory of the kaioken repository.
2. Run the command: `go build -o kaioken.exe ./cmd/kaioken`

## Conventions to follow
The command explicitly names the output file as `kaioken.exe` (with the .exe suffix) regardless of the platform, matching the Makefile's build target. The build command targets only the main package in ./cmd/kaioken, not the entire repository.

## Verification
Check that the file `kaioken.exe` exists in the current directory and is executable. Run `./kaioken.exe version` to confirm it prints the version information without errors.

## Common mistakes
- Running the command from a subdirectory (the path `./cmd/kaioken` must be correct relative to the current directory).
- Omitting the `-o` flag, which would produce a binary named after the directory or main package (not `kaioken.exe`).
- Using `go build ./...` instead, which builds all packages but does not produce the named executable.