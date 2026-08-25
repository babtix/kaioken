# ADR-006: PTC sandbox — dual transport, untrusted child

- **Status:** Accepted (L7) · re-verified 2026-08-23
- **Supersedes:** `docs/hermes_res/adr/ADR-006`

## Context

PTC (programmatic tool calling — Hermes' `execute_code`) collapses N tool
round-trips into one zero-context-cost turn by letting a model-written script
call tools over RPC. Backlog #22 verified Hermes' transport reality: the
"disabled on Windows" claim comes from a stale module docstring
(`code_execution_tool.py:27`); lines 53–56 and 1357 are authoritative
(`_use_tcp_rpc = _IS_WINDOWS` → loopback TCP). The stale-docstring incident is
the standing lesson: integration-test Windows behaviour, never assume it.

## Decision

Build an `execute_code` tool for Kaioken:

- Generates a stub exposing only sandbox-allowed, enabled tools as callable
  functions to a child script; builds on existing `internal/rpc` (verified
  present on master).
- **Transport:** AF_UNIX on POSIX; loopback TCP `127.0.0.1:0` (ephemeral port)
  on Windows. Both map directly onto Go's `net.Listen`.
- **Trust model:** the child is UNTRUSTED — it gets the tool surface, NOT the
  filesystem or credentials; aggressive environment scrubbing at spawn.
  Tool authorization still applies per call — which is why PTC lands after
  the W1 approval enum (rich verdicts per call).
- Protocol carries request IDs (fixing the class of bug that forced Hermes'
  stub into a `_call_lock` because its protocol lacked them).

## Consequences

- Highest token-efficiency ceiling in the backlog.
- Windows behaviour integration-tested over TCP loopback, not assumed.
- Generated stubs must emit already-transformed schemas → WP (transform layer)
  lands before W4/P3 (D1 conflict resolution retained).
