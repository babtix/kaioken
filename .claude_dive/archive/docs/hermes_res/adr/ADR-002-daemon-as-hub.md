# ADR-002: Daemon-as-hub topology

- **Status:** Accepted (D2, D5)
- **Date:** 2026-08-22 · v1.1

## Context

D2 chose the full platform trajectory; D5 chose who owns agent instances and
sessions. Options: daemon-as-hub with all thin clients (opencode-style server
core), a separate Hermes-style gateway process, or dual-mode pragmatic (TUI
embeds the agent, daemon only for desktop).

## Decision

The HTTP daemon becomes the **single owner of agent instances, sessions,
runs, jobs, and delegation records**. TUI, desktop sidecar, and any future
surface are thin clients over local HTTP + SSE.

Zero-setup UX is preserved: the TUI auto-spawns the daemon on a localhost
socket when none is running. One binary, hub ownership — no separate
gateway process, no embedded-agent fork of the session logic.

Persistence consolidates here too: transcripts are owned by the daemon, with
**crash-safe incremental flush during turns** (doc_final N2) — a killed
process loses at most the current stream chunk, not the turn.

## Alternatives considered

- **Separate gateway process (Hermes-style):** rejected — two long-running
  processes to ship, and Hermes' gateway (`gateway/run.py`, 31.3k lines) is
  its biggest structural liability. The daemon + `PlatformAdapter` interface
  (ADR-008) achieves the same trajectory with one process.
- **Dual-mode (TUI embeds agent):** rejected — two code paths for session
  ownership is exactly the seam-class defect the logic audit warns about.

## Consequences

- Daemon handlers partitioned by concern from day one: runs / jobs / events /
  approvals. File-size budget enforced in review.
- TUI gains daemon lifecycle management (spawn, health-check, reconnect).
- Desktop plan (`desktop/`) simplifies: it already treats the cli as sidecar;
  v2 makes that the only mode.
