# ADR-008: Cron scheduler inside the daemon; gateway interface only

- **Status:** Accepted (L7 + L2/L5) · re-verified 2026-08-23
- **Supersedes:** `docs/hermes_res/adr/ADR-008`

## Context

Hermes' differentiating platform capabilities include scheduled jobs and
multi-platform delivery. L2 chose the platform trajectory; L7 selected
cron-in-daemon in scope and excluded gateway adapter skeletons.

## Decision

**Cron:** scheduler lives inside the daemon — 60-second tick, file-locked
(Hermes' proven pattern), jobs persisted as `jobs.json`, delivery targets
resolved against currently-connected surfaces, scheduled deliveries landing in
DEDICATED sessions so main-transcript role alternation stays intact. An ESTOP
analog gates NEW dispatches at this layer only; in-flight work is NEVER killed
(Hermes' contract, reaffirmed by backlog item 3's adversarial re-scope — this
partially supersedes doc_final D11's "dropped" verdict).

**Gateway:** define the `PlatformAdapter` interface (deliver / receive / ack)
and stop. No adapters ship in v2. Event bus (SSE fan-out) and
session-per-conversation ownership are shaped so adapters attach later
additively — trajectory preserved by shape, not code.

## Consequences

- Delegation records become durable (dispatch/completion persisted) so a
  restarted desktop recovers subagent results — cron and delegation share the
  daemon's job infrastructure.
- Daemon handlers partitioned by concern day one; Hermes' 31.3k-line
  `gateway/run.py` is the counter-example.
- `-race` gate applies once the scheduler runs concurrent with live runs.
