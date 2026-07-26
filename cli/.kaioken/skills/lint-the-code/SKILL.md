---
name: lint-the-code
description: Run golangci-lint to check for style issues and potential bugs. Load this skill as part of code quality checks.
sources:
    - Makefile
generated_at: 2026-07-26T04:10:57.9909743Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Lint the Go code

Run `golangci-lint run ./...` via the project's Makefile to check for style issues and potential bugs in the Go source code.

## Prerequisites
None.

## Steps
1. Run `make lint` from the repository root.

## Conventions to follow
Execute this command from the repository root (where the Makefile is located) to ensure the entire codebase is linted. The Makefile target handles checking for the presence of `golangci-lint` and skips execution if not installed.

## Verification
After running `make lint`, observe the output:
- If `golangci-lint` is not installed, the command prints "golangci-lint not installed; skipping" and exits with status 0.
- If installed, the command lints all Go packages and exits with status 0 if no issues are found, or non-zero if linting errors are reported.

## Common mistakes
- Running the command from a subdirectory, which limits linting to that subtree instead of the entire repository.
- Misinterpreting a skip message (when `golangci-lint` is missing) as a failure; the Makefile intentionally exits 0 in this case to avoid breaking workflows.