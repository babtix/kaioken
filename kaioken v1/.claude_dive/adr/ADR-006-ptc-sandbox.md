# ADR-006: PTC sandbox — dual transport, untrusted child, Starlark runtime

- **Status:** Accepted (L7) · **rewritten 2026-08-24 — the child-runtime hole is closed**
- **Supersedes:** `archive/hermes_dive/adr/ADR-006`

## What changed in this revision, and why it matters

Every predecessor ADR in this corpus specified PTC's *transport* (verified correctly, see
below) and its *trust model*, but never named what language the child script runs in.
Hermes generates Python because its host is Python. Kaioken is Go, and ships as a single
static binary with `CGO_ENABLED=0` — the two options anyone actually proposed both break
that:

- **Require Python/Node on the host:** rejected — a new runtime dependency that silently
  disappears on any machine without it, contradicting the single-binary promise every other
  ADR in this set protects.
  A related, separate proposal in this corpus suggested embedding the model script directly
  in-process via the existing WASM plugin runtime
  ([ext/wasm.go](../../cli/internal/ext/wasm.go), wazero v1.12.0). That runtime's own header
  states *"wazero has no socket support at all"* and its ABI is one-shot stdio, fresh instance
  per call — a script making N tool callbacks needs a socket or a persistent instance, and
  this runtime offers neither. **Unimplementable as proposed**, not merely undesirable.
- **Shell/batch child:** rejected — too weak for the loops/conditionals that justify PTC
  existing at all.

## Decision

**Spawn the `kaioken` binary itself as the child**, running a generated **Starlark** script
via an embedded pure-Go interpreter (`go-starlark`, Apache-2.0, no cgo). This:

- Preserves the process-boundary trust model (the child is a real, untrusted OS process — not
  an in-memory interpreter sharing the parent's heap).
- Preserves the zero-runtime-dependency constraint (`adr/ADR-009`) — no Python, no Node, no
  host prerequisite beyond the binary that's already there.
- Starlark is deterministic and hermetic by default: no I/O except what the host explicitly
  exposes, which is exactly the tool-surface-only property the trust model wants, and it is
  Python-like enough for models to write fluently from training data.
- The generated stub is a set of Starlark function definitions mapping to RPC calls over
  `internal/rpc`, carrying request IDs.

Backlog #22 verified Hermes' transport reality: the "disabled on Windows" claim comes from a
stale module docstring (`code_execution_tool.py:27`); lines 53–59 and 1357 are authoritative
(`_use_tcp_rpc = _IS_WINDOWS` → loopback TCP). The stale-docstring incident is the standing
lesson: integration-test Windows behaviour, never assume it.

- **Transport:** AF_UNIX on POSIX; loopback TCP `127.0.0.1:0` (ephemeral port) on Windows.
  Both map directly onto Go's `net.Listen`. Note `internal/rpc` today is stdio-only
  ([rpc.go:87](../../cli/internal/rpc/rpc.go:87) takes `io.Reader`/`io.Writer`, zero
  occurrences of `net.`/`Listen`/`unix`/`tcp`) — "builds on `internal/rpc`" means reusing the
  *protocol* (request-ID framing), not an existing transport. Both listeners are new code;
  size the task accordingly.
- **Auth:** the loopback TCP listener is reachable by any local process — unlike an AF_UNIX
  socket's filesystem permissions, a listening TCP port has no ambient access control.
  Kaioken's version must carry a bearer token, mirroring Hermes' `HERMES_RPC_TOKEN` pattern.
  This is load-bearing, not optional hardening.
- **Trust model:** the child is UNTRUSTED — it gets the Starlark-exposed tool surface, NOT the
  filesystem or credentials directly; aggressive environment scrubbing at spawn (deny-list
  `KEY`/`TOKEN`/`SECRET`/`PASSWORD`/`AUTH`/`DSN`/`WEBHOOK`/`CREDS`/`BEARER`/`APIKEY`; allow-list
  `PATH`/`HOME`/`USER`/`LANG`/`XDG_*` plus Windows essentials
  `SYSTEMROOT`/`COMSPEC`/`PATHEXT`/`APPDATA`/`LOCALAPPDATA`). Tool authorization still applies
  per call — which is why PTC lands after the W1 approval enum (rich verdicts per call).
- Protocol carries request IDs (fixing the class of bug that forced Hermes' stub into a
  `_call_lock` because its protocol lacked them — verified at `code_execution_tool.py:510-520`).

## Unresolved, deliberately left for implementation

- Child-process cleanup on Windows (Job Objects) — same mechanism as `adr/ADR-002`'s daemon
  lifecycle; do not build a second pattern.
- Per-script timeout policy.

## Consequences

- Highest token-efficiency ceiling in the backlog.
- Windows behaviour integration-tested over TCP loopback, not assumed.
- Generated stubs must emit already-transformed schemas → WP (transform layer) lands before
  W4/P3.
- `go-starlark` becomes a new direct dependency — the one addition to `go.mod` this whole
  plan asks for, and it is pure Go, so it does not compromise `adr/ADR-009`.
