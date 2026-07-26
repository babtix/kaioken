---
name: run-the-test-suite
description: Execute all unit tests for the project. Load this skill before committing changes or when verifying fixes.
sources:
    - Makefile
    - internal/agent/agent_test.go
generated_at: 2026-07-26T04:10:08.0715561Z
model: nvidia/nemotron-3-super-120b-a12b
---

# Run the test suite

Execute all unit tests for the project using the Makefile target.

## Prerequisites
None.

## Steps
1. Run `make test` to execute the test suite via the Makefile target.

## Conventions to follow
The project uses a Makefile target `test` that runs `go test ./... -count=1` to disable test caching and ensure all tests are executed.

## Verification
After running `make test`, the command should complete with exit status 0 if all tests pass. Output will show test results for each package.

## Common mistakes
- Running from a subdirectory instead of the repository root (the Makefile assumes execution at the project root).
- Ignoring test failures; the `make test` target will fail if any test fails, requiring fixes before proceeding.