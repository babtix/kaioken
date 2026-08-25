# ADR-006: PTC sandbox with dual transport, untrusted child

- **Status:** Accepted (D7)
- **Date:** 2026-08-22 · v1.1

## Context

PTC (programmatic tool calling — Hermes' `execute_code`) collapses N tool
round-trips into one zero-context-cost turn by letting a model-written script
call tools over RPC. Backlog #22 verified Hermes' transport reality: the
"disabled on Windows" claim comes from a stale docstring (`code_execution_tool.py:27`);
lines 53–56 and 1357 are authoritative (`_use_tcp_rpc = _IS_WINDOWS` → loopback TCP).

## Decision

Build an `execute_code` tool for Kaioken:

- Generates a stub exposing only sandbox-allowed, enabled tools as callable
  functions to a child script; builds on existing `internal/rpc`
  (verified present on master: `rpc.go`, `rpc_test.go`).
- **Transport:** AF_UNIX on POSIX; loopback TCP on `127.0.0.1:0` (ephemeral
  port) on Windows. Both map directly onto Go's `net.Listen`.
- **Trust model:** the child process is untrusted — it gets the tool surface,
  NOT the filesystem or credentials; aggressive environment scrubbing at spawn.
  Tool authorization still applies per call — which is why this lands after
  the W1 approval enum (rich verdicts per call).
- Protocol carries request IDs (fixing the class of bug Hermes hit where its
  stub needed a `_call_lock` because the protocol lacked them).

## Consequences

- Highest token-efficiency ceiling in the backlog.
- Windows behaviour must be integration-tested over TCP loopback, not assumed —
  the stale-docstring incident is the lesson.
- Generated stubs must emit already-transformed schemas → WP (transform layer)
  lands before W4/P3.
