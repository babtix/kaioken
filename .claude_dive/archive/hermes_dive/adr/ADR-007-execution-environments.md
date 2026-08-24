# ADR-007: Execution environments — interface now, Docker only

- **Status:** Accepted (L7) · re-verified 2026-08-23
- **Supersedes:** `docs/hermes_res/adr/ADR-007`

## Context

Hermes ships seven execution backends and distinguishes connection-level
failures from ordinary command failures (a degraded connection is worth
retrying; a failed command is not). L7 selected the abstraction + Docker-first.

## Decision

Extract an `Environment` interface over existing `proc_unix.go` /
`proc_windows.go` behaviour: start / exec / stream / teardown, with snapshot
semantics for undo integration. Local process stays the default
implementation; add exactly one more backend in v2: **Docker**.

Adopt Hermes' error taxonomy: connection-level failures surface as a distinct
error type (`EnvironmentConnectionError` class) that retry logic treats
differently from command failures.

## Alternatives considered

- SSH/remote/serverless backends: deferred — the interface leaves them
  attachable, v2 builds none. YAGNI until a user scenario demands it.
- No abstraction (keep direct proc calls): rejected — PTC (#22), git-snapshot
  undo (#25), and any future remote story all want this seam.

## Consequences

- Wave placement: P3, alongside PTC; both touch the same seam.
- Git-snapshot undo (#25) plugs into the snapshot semantics; per-file
  `UndoEntry` remains the fast path for write/edit (it is blind to
  `run_command`, which is exactly why tree snapshots are needed — D10).
