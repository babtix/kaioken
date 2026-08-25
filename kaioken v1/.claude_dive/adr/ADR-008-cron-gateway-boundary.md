# ADR-008: Cron scheduler inside the daemon; gateway interface only

- **Status:** Accepted (L7 + L2/L5) · re-verified 2026-08-24, portability gap closed
- **Supersedes:** `archive/hermes_dive/adr/ADR-008`

## Context

Hermes' differentiating platform capabilities include scheduled jobs and multi-platform
delivery. L2 chose the platform trajectory; L7 selected cron-in-daemon in scope and excluded
gateway adapter skeletons.

## Decision

**Cron:** scheduler lives inside the daemon — 60-second tick, jobs persisted as `jobs.json`,
delivery targets resolved against currently-connected surfaces, scheduled deliveries landing
in DEDICATED sessions so main-transcript role alternation stays intact. An ESTOP analog gates
NEW dispatches at this layer only; in-flight work is NEVER killed (Hermes' contract,
reaffirmed by backlog item 3's adversarial re-scope).

**Locking, corrected:** the predecessor ADR specified "file-locked, Hermes' proven pattern" —
Hermes' pattern is `fcntl.flock`, POSIX-only, and this project's primary dev platform is
Windows. Go has no portable `flock`. Use `golang.org/x/sys/windows` `LockFileEx` on Windows
and `flock` via `golang.org/x/sys/unix` on POSIX behind a small platform-tagged wrapper, or
an atomic-rename lease file if a single cross-platform implementation is preferred over two
build-tagged ones.

**Gateway:** define the `PlatformAdapter` interface (deliver / receive / ack) and stop. No
adapters ship in v2. Event bus (SSE fan-out) and session-per-conversation ownership are
shaped so adapters attach later additively — trajectory preserved by shape, not code.

## Unresolved, deliberately left for implementation

- Zero-connected-surfaces delivery policy (queue until reconnect, or drop with a ledger
  entry?).
- `jobs.json` schema — syntax and timezone handling for schedules are named but not defined.
- Missed-job catch-up policy when the daemon is down at fire time — matters directly because
  the P2 gate below tests restart-resume.

## Consequences

- Delegation records become durable (dispatch/completion persisted) so a restarted desktop
  recovers subagent results — cron and delegation share the daemon's job infrastructure.
- Daemon handlers partitioned by concern day one (already true on master — see `adr/ADR-002`).
- `-race` gate applies once the scheduler runs concurrent with live runs.
