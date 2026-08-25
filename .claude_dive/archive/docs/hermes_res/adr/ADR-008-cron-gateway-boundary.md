# ADR-008: Cron scheduler inside the daemon; gateway interface only

- **Status:** Accepted (D7, D5)
- **Date:** 2026-08-22 · v1.1

## Context

Hermes' differentiating platform capabilities include scheduled jobs and
multi-platform delivery. D2 chose the full platform trajectory; D7 selected
cron-in-daemon as in-scope and explicitly excluded gateway adapter skeletons.

## Decision

**Cron:** a scheduler lives inside the daemon — 60-second tick, file-locked
(Hermes' proven pattern), jobs persisted as `jobs.json`, delivery targets
resolved against currently-connected surfaces, scheduled deliveries landing in
dedicated sessions so main-transcript role alternation stays intact (Hermes
pattern). An ESTOP analog gates NEW dispatches at this layer only; in-flight
work is NEVER killed (Hermes' contract, re-affirmed by the adversarial pass on
backlog item 3).

**Gateway:** define the `PlatformAdapter` interface (deliver / receive / ack)
and stop. No adapters ship in v2. The daemon's event bus (SSE fan-out) and
session-per-conversation ownership are shaped so adapters attach later
additively — the platform trajectory (D2) is preserved by shape, not by code.

## Consequences

- Delegation records become durable (dispatch/completion persisted) so a
  restarted desktop recovers subagent results — cron and delegation share the
  daemon's job infrastructure.
- Daemon handlers stay partitioned by concern from day one; Hermes'
  31.3k-line `gateway/run.py` is the counter-example.
- `-race` gate applies once the scheduler runs concurrent with runs.
