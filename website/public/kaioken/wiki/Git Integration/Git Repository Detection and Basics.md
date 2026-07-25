# Git Repository Detection and Basics

This chapter explains how kaioken verifies a directory is a Git repository and retrieves fundamental Git information like the HEAD commit and commit resolution. These operations are handled by the `internal/gitx` package, which provides lightweight wrappers around essential Git plumbing commands.

## Table of Contents
- [Introduction](#introduction)
- [Core Functions](#core-functions)
  - [IsRepo: Checking for a Git Repository](#isrepo-checking-for-a-git-repository)
  - [Head: Retrieving the Current Commit](#head-retrieving-the-current-commit)
  - [Resolve: Resolving Revisions to Commits](#resolve-resolving-revisions-to-commits)
  - [HasCommit: Verifying Commit Existence](#hascommit-verifying-commit-existence)
- [Helper Functions](#helper-functions)
  - [Short: Abbreviating SHA](#short-abbreviating-sha)
  - [The run Helper](#the-run-helper)
- [Error Handling](#error-handling)
- [Referenced Files](#referenced-files)

## Introduction

Kaioken interacts with Git repositories to detect changes, generate diffs, and manage wiki updates. Before performing any Git operations, it must first confirm that a directory is a valid Git repository. Once confirmed, it retrieves the current HEAD commit to establish a baseline for change detection and resolves symbolic revisions (like branch names or tags) to concrete commit SHAs for precise history traversal.

All Git interactions in kaioken are implemented in `internal/gitx/gitx.go`. The package avoids direct Git library dependencies by shelling out to the `git` binary, ensuring compatibility with any Git installation available in the user's PATH.

## Core Functions

### IsRepo: Checking for a Git Repository

The `IsRepo` function determines whether a given directory resides inside a Git work tree. It executes `git rev-parse --is-inside-work-tree` within the target directory and checks for a successful exit code and the exact output `"true"` (after trimming whitespace).

`internal/gitx/gitx.go:44-47`
```go
func IsRepo(repo string) bool {
	out, err := run(context.Background(), repo, "rev-parse", "--is-inside-work-tree")
	return err == nil && strings.TrimSpace(out) == "true"
}
```

**Behavior:**
- Returns `true` only if the directory is part of a Git work tree (not a bare repository) and Git is accessible.
- Returns `false` for non-Git directories, bare repositories, or when Git is not installed/inaccessible.
- Uses `context.Background()` as the operation is synchronous and typically fast.

### Head: Retrieving the Current Commit

The `Head` function obtains the SHA-1 hash of the current HEAD commit by running `git rev-parse HEAD` in the specified repository.

`internal/gitx/gitx.go:50-52`
```go
func Head(ctx context.Context, repo string) (string, error) {
	return run(ctx, repo, "rev-parse", "HEAD")
}
```

**Behavior:**
- Returns the full 40-character hexadecimal SHA-1 string representing the HEAD commit.
- Returns an error if the directory is not a Git repository, HEAD is undefined (e.g., in an empty repo), or the git command fails.
- The returned SHA is used as a baseline for change detection in functions like `Changes` and `Patch`.

### Resolve: Resolving Revisions to Commits

The `Resolve` function converts a symbolic revision (branch name, tag, or abbreviated SHA) into a full commit SHA. It uses `git rev-parse --verify <rev>^{commit}` to ensure the revision points to a commit object (peeling any tag layers) and exists in the repository.

`internal/gitx/gitx.go:64-66`
```go
func Resolve(ctx context.Context, repo, rev string) (string, error) {
	return run(ctx, repo, "rev-parse", "--verify", rev+"^{commit}")
}
```

**Behavior:**
- Accepts any revision syntax understood by `git rev-parse` (e.g., `"main"`, `"v1.0"`, `"HEAD~3"`, `"abc123"`).
- Returns the full commit SHA if the revision resolves to a commit.
- Returns an error if the revision does not exist, is ambiguous, or points to a non-commit object (like a blob).
- The `^{commit}` suffix ensures tags are dereferenced to their target commit.

### HasCommit: Verifying Commit Existence

The `HasCommit` function checks whether a given revision still resolves to a commit in the repository. It is used to validate baselines recorded from previous runs (e.g., to detect if a branch was rebased).

`internal/gitx/gitx.go:70-73`
```go
func HasCommit(ctx context.Context, repo, rev string) bool {
	_, err := Resolve(ctx, repo, rev)
	return err == nil
}
```

**Behavior:**
- Returns `true` if `Resolve` succeeds (the revision names a commit in the current repo).
- Returns `false` if the revision cannot be resolved (e.g., due to rebasing, deletion, or repository mismatch).
- Efficiently reuses the `Resolve` logic without duplicating code.

## Helper Functions

### Short: Abbreviating SHA

The `Short` function truncates a commit SHA to its first 8 characters for concise display in logs or UI elements.

`internal/gitx/gitx.go:55-60`
```go
func Short(sha string) string {
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}
```

**Behavior:**
- Returns the input SHA unchanged if it is 8 characters or shorter.
- Otherwise, returns the first 8 characters.
- Used throughout kaioken for human-readable commit references (e.g., in status lines or diff summaries).

### The run Helper

The `run` function is the core utility that executes Git commands. It constructs a command with `-C <repo>` to change to the repository directory, runs it with the provided context, and captures stdout/stderr.

`internal/gitx/gitx.go:28-41`
```go
func run(ctx context.Context, repo string, args ...string) (string, error) {
	full := append([]string{"-C", repo}, args...)
	cmd := exec.CommandContext(ctx, "git", full...)
	var out, errb bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &errb
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(errb.String())
		if msg == "" {
			msg = err.Error()
		}
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), msg)
	}
	return strings.TrimRight(out.String(), "\r\n"), nil
}
```

**Behavior:**
- Sets the working directory via `-C <repo>` to ensure Git operations occur in the target repository.
- Merges stdout and stderr; if the command fails, it returns an error containing either stderr content or the generic error message.
- Trims trailing carriage returns and newlines from stdout before returning.
- Propagates the context for cancellation and timeout support.

## Error Handling

All Git functions in `gitx` return an `error` as their final return value when applicable:
- `IsRepo` returns a boolean and does not propagate errors (treats any failure as non-repository).
- `Head`, `Resolve`, and `Patch` return `(string, error)`; callers must check the error before using the result.
- `Changes` and `Subjects` return `([]Change, error)` and `([]string, error)` respectively.
- `HasCommit` returns a boolean and ignores errors from `Resolve` (treats any resolution failure as absence).

Errors typically indicate:
- The directory is not a Git repository.
- Git is not installed or not in PATH.
- The revision does not exist or is invalid.
- The repository is in a broken state (e.g., missing HEAD).
- Context cancellation or timeout.

Callers in higher-level packages (like `wiki` or `agent`) handle these errors by logging, returning them to the user, or falling back to safe defaults.

## Referenced Files

- internal/gitx/gitx.go

<!-- kaioken:files internal/gitx/gitx.go -->
