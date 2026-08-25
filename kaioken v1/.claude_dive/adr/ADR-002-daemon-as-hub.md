# ADR-002: Daemon-as-hub topology

- **Status:** Accepted in direction; mechanics under-specified · re-verified 2026-08-24
- **Supersedes:** `archive/hermes_dive/adr/ADR-002`

## Context

L2 chose the full platform trajectory; L5 chose who owns agent instances and sessions.
Options: daemon-as-hub with all thin clients (opencode-style server core), a separate
Hermes-style gateway process, or dual-mode pragmatic (TUI embeds the agent, daemon only for
desktop).

## Decision

The HTTP daemon becomes the **single owner of agent instances, sessions, runs, jobs, and
delegation records**. TUI, desktop sidecar, and future surfaces are thin clients over local
HTTP + SSE.

Zero-setup UX preserved: the TUI auto-spawns the daemon on a localhost socket when none is
running. One binary, hub ownership — no separate gateway process, no embedded-agent fork of
session logic.

Persistence consolidates here too: transcripts owned by the daemon, with **crash-safe
incremental flush during turns** (N2) — a killed process loses at most the current stream
chunk, not the turn. Note this is a real change of write mode, not just cadence:
`session.SaveForce` currently rewrites the whole JSONL file with `os.WriteFile` rather than
appending — the incremental-flush task must change *how* the file is written, not just *when*.

## Specified this revision (was left open)

The predecessor ADR named "auto-spawn on a localhost socket" without specifying transport,
port, auth, or lifecycle. Resolved:

- **Transport:** loopback TCP on an ephemeral port, not a named pipe or AF_UNIX socket —
  consistent with the PTC transport decision in `adr/ADR-006` and avoiding a second
  Windows-specific IPC mechanism in the same binary.
- **Auth:** a per-boot token file under `.kaioken/daemon/`, checked on every request — mirrors
  the token precedent set for PTC.
- **Orphan cleanup:** the child daemon is tied to the spawner's lifetime via a Windows Job
  Object (Windows) / process group (POSIX), so a killed TUI does not leave an orphaned daemon.
- **Version skew:** the daemon exposes a version endpoint; the TUI checks it on connect and
  restarts the daemon on mismatch rather than talking to a stale one.

## Alternatives considered

- **Separate gateway process (Hermes-style):** rejected — two long-running processes to ship,
  and Hermes' gateway (`gateway/run.py`, ~28.8k lines in the currently vendored checkout) is
  its biggest structural liability. Daemon + `PlatformAdapter` interface (`adr/ADR-008`)
  achieves the same trajectory with one process.
- **Dual-mode (TUI embeds agent):** rejected — two code paths for session ownership is
  exactly the seam-class defect the logic audit warns about. Note this seam is not yet fully
  closed even on `master`: the TUI still runs its own full pre-run compaction ladder
  (`tui.go:1278-1296`) immediately before calling `Run`, which now compacts internally too —
  P1 must delete the front-end copy, not just add the daemon-side owner.

## Consequences

- Daemon handlers partitioned by concern from day one: runs / jobs / events / approvals.
  File-size budget enforced in review. (Already true on master — 13 `handlers_*.go` files,
  largest under 750 lines. The actual god-file risk in this repo is `internal/tui/tui.go` at
  over 3,200 lines; P1's thin-client conversion is the natural place to start shrinking it,
  not the daemon.)
- TUI gains daemon lifecycle management (spawn, health-check, reconnect).
- **P1's gate is re-scoped**: "desktop sidecar path works against the same daemon API" is
  untestable today — `desktop/` is plan-only and the Rust toolchain is not installed in this
  environment. Gate instead on a headless client (`kaioken run -json --attach`) proving
  reconnect-after-restart and kill-9 recovery; desktop's own plan gets "validates the same
  API" as a task once it exists.
- No rollback story is specified if the thin-client conversion destabilises the TUI mid-wave.
  The dual-mode alternative rejected above is also the natural fallback — P1 should keep the
  embedded-agent path buildable (not necessarily shipped) until the daemon path has run for a
  release cycle.
