---
name: update-dependencies
description: Update Go dependencies to their latest versions and tidy the go.mod file. Load this skill when bringing in dependency updates.
sources:
    - go.mod
    - go.sum
generated_at: 2026-07-26T04:11:03.6993137Z
model: nvidia/nemotron-3-super-120b-a12b
---

# update-dependencies

Run `go get -u ./...` followed by `go mod tidy` to update Go dependencies to their latest versions and tidy the go.mod file.

## Prerequisites
None.

## Steps
1. Run `go get -u ./...` from the repository root to update all dependencies to their latest minor/patch versions.
2. Run `go mod tidy` from the repository root to remove unused dependencies and ensure go.sum matches go.mod.

## Conventions to follow
- Execute both commands in the repository root directory where go.mod is located.
- Do not skip `go mod tidy` after `go get -u` to avoid leaving unused dependencies in go.mod.
- Commit both go.mod and go.sum after running these commands to record dependency updates.

## Verification
Run `go list -m all` to verify dependencies are updated and `go mod verify` to confirm module integrity.

## Common mistakes
- Forgetting to run `go mod tidy` after `go get -u`, which leaves outdated or unused dependencies in go.mod.
- Running the commands from a subdirectory instead of the repository root, causing partial updates.