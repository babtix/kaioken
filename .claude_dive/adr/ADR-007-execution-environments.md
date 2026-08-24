# ADR-007: Execution environments — interface now, Docker only

- **Status:** Accepted (L7) · re-verified 2026-08-24, one scope correction
- **Supersedes:** `archive/hermes_dive/adr/ADR-007`

## Context

Hermes ships seven execution backends and distinguishes connection-level failures from
ordinary command failures (a degraded connection is worth retrying; a failed command is
not). L7 selected the abstraction + Docker-first.

## Decision

Extract an `Environment` interface over existing `proc_unix.go` / `proc_windows.go`
behaviour: start / exec / stream / teardown, with snapshot semantics for *runtime* state
(container filesystem/process state). Local process stays the default implementation; add
exactly one more backend in v2: **Docker**. On Windows, Docker means Docker Desktop or WSL2 —
a heavy external dependency the single-binary story does not otherwise carry. State the
contract explicitly: local process is default, Docker is opt-in, and its absence degrades to
"unavailable," not a crash.

Adopt Hermes' error taxonomy: connection-level failures surface as a distinct error type
(`EnvironmentConnectionError` class) that retry logic treats differently from command
failures.

## Scope correction from the predecessor ADR

**Git-tree snapshot undo (#25) does not plug into this interface.** The predecessor ADR
routed it through `Environment` snapshot semantics; that conflates two different concerns.
Environment snapshots are a *runtime* concern — container or process state. Workspace undo
via `git write-tree`/`git read-tree` is a *repository* concern with no relationship to which
execution backend ran the command. Forcing #25 through this interface tangles an abstraction
that should stay simple. **Correct placement: `internal/gitx`, standalone, shadow-git style —
not gated behind or coupled to the Environment interface.** Per-file `UndoEntry` remains the
fast path for write/edit (it is blind to `run_command`, which is exactly why tree snapshots
are needed).

## Alternatives considered

- SSH/remote/serverless backends: deferred — the interface leaves them attachable, v2 builds
  none. YAGNI until a user scenario demands it.
- No abstraction (keep direct proc calls): rejected — PTC (`adr/ADR-006`) and any future
  remote story want this seam. (Git-snapshot undo does not — see correction above.)

## Consequences

- Wave placement: P3, alongside PTC; both touch the same seam.
- Docker on Windows uses a named pipe (`npipe:////./pipe/docker_engine`), not
  `/var/run/docker.sock` — the same class of AF_UNIX assumption `adr/ADR-006` was careful
  about; state which driver (Docker HTTP API vs CLI shell-out) before implementation, since a
  Go Docker SDK pulls a large dependency tree.
