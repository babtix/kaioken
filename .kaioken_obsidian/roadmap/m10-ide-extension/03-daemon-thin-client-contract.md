# M10-03 · Daemon thin-client protocol and contract

> Define a frozen JSON-RPC/WebSocket protocol and reinstate the ContractVersion guard for out-of-process clients, preventing version skew between daemon and editor.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | `01-decide-extension-vs-studio.md` (decision on out-of-process client), [M1-05](../m01-green-everywhere/05-contract-version-guard.md) |
| **Blocks** | Third-party IDE extensions, remote daemon integrations |
| **Touches** | `kaioken_v2/apps/cli/src/commands/daemon.ts`, `kaioken_v2/packages/serve/` |
| **Risk** | High. An out-of-process client deliberately reintroduces the version mismatch defect class that Studio in-process eliminated. |
| **Gate-critical** | No |

## Why this exists

In Kaioken Studio, packages run in-process within Theia. This architectural choice led the master roadmap to assume the `ContractVersion` guard was obsolete ([README §3](../README.md#3-translation-layer--v1-artifact--v2-equivalent) and [M1-05](../m01-green-everywhere/05-contract-version-guard.md)): when the GUI and the engine share the same Node process, contract version skew cannot occur.

That reasoning holds for Studio, but the daemon has its own live contract regardless of what Studio does. **The contract guard is not obsolete; it simply belongs to the daemon rather than to a desktop sidecar.** In the TypeScript CLI, `CONTRACT_VERSION = 4` is defined at [`kaioken_v2/apps/cli/src/commands/daemon.ts:38`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/commands/daemon.ts#L38) and actively checked and emitted at line 820 (in the `/status` JSON response) and line 1913 (in the startup handshake payload).

If any out-of-process client ships — such as a thin VS Code, Cursor, or JetBrains extension connecting to `kaioken daemon` over WebSocket or HTTP — that brings the entire mismatch class back, deliberately. A user updating their VS Code extension without updating the background CLI binary (or vice versa) will experience silent payload corruptions, missing fields, or hung requests. Therefore, shipping any out-of-process client strictly requires reinstating a rigid contract handshake: the daemon and client must negotiate versions on connection and abort cleanly if incompatible.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Daemon defines an explicit contract version constant | `kaioken_v2/apps/cli/src/commands/daemon.ts:38` (`const CONTRACT_VERSION = 4;`) |
| Daemon status endpoint reports contract version | `kaioken_v2/apps/cli/src/commands/daemon.ts:820` (`contract: CONTRACT_VERSION`) |
| Daemon startup handshake emits contract version | `kaioken_v2/apps/cli/src/commands/daemon.ts:1913` (`contract: CONTRACT_VERSION`) |
| Daemon defines its runtime version | `kaioken_v2/apps/cli/src/commands/daemon.ts:39` (`const DAEMON_VERSION = "2.0.0";`) |
| Master roadmap assumed guard obsolete for Studio | `roadmap/README.md:114` — holds for in-process Theia, but daemon has its own live contract |
| M1-05 tracks the contract guard decision | `roadmap/m01-green-everywhere/README.md:33` |
| Daemon command implementation is currently uncommitted | `git status` shows `?? kaioken_v2/apps/cli/src/commands/daemon.ts` |
| HTTP/serve package provides HTTP server endpoints | `kaioken_v2/packages/serve/src/index.ts` |

`UNVERIFIED:` The exact WebSocket frame format expected by the uncommitted daemon command, as `daemon.ts` is 1,900+ lines and currently unlanded.

## What done looks like

- [ ] A formal contract specification document is created detailing the handshake sequence, message framing, error codes, and supported methods.
- [ ] The handshake requires the client to send `{ clientVersion: string, contractVersion: number }` immediately upon WebSocket connection.
- [ ] If `contractVersion !== CONTRACT_VERSION`, the daemon immediately rejects the connection with code `4409 Version Mismatch` and a clear error message detailing how to update both components.
- [ ] Methods for symbol hover, status check, incremental update, and chat streaming are typed and versioned.
- [ ] Integration tests verify that: (1) matching contract versions connect successfully, (2) mismatched versions are rejected with actionable error messages, (3) malformed payloads return structured error frames.

## Steps

1. **Audit `apps/cli/src/commands/daemon.ts`.** Inspect the uncommitted daemon implementation (lines 38–60) to understand existing route handlers and WebSocket setup.
2. **Define the Protocol Schema.** Create `kaioken_v2/packages/serve/src/protocol.ts` defining:
   - Request/response envelopes.
   - Streaming event types (e.g. `run_progress`, `tool_call`, `diff_hunk`).
   - The initial `Hello` / `Handshake` packet.
3. **Implement Strict Version Handshake.**
   - Enforce that no business RPCs can be dispatched until the client sends a valid `Handshake` with `contractVersion === CONTRACT_VERSION`.
   - Return structured error `{ error: "CONTRACT_VERSION_MISMATCH", expected: CONTRACT_VERSION, received: clientVersion }`.
4. **Cross-Reference M1-05.** Reconcile this implementation with `roadmap/m01-green-everywhere/05-contract-version-guard.md`, ensuring the contract rules align.
5. **Add Automated Protocol Tests.** Write vitest integration tests verifying handshake validation, ping/pong heartbeats, and payload deserialization.

## In scope

- Protocol schema definition in `kaioken_v2/packages/serve/`.
- Handshake and version guard logic in `kaioken_v2/apps/cli/src/commands/daemon.ts`.
- Automated tests verifying version incompatibility handling.

## Out of scope

- Building the VS Code extension UI itself (depends on M10-01).
- Modifying InversifyJS bindings in Theia (`ide_kaioken/kaioken_studio_theia/`).
- Engine core logic (`packages/index`, `packages/wiki`).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verify daemon starts and reports contract version:

```bash
node apps/cli/dist/bin.js daemon --port 8765 --help
```

## Traps

| Trap | Guard |
|---|---|
| Permissive version matching (e.g. ignoring patch versions) | `CONTRACT_VERSION` is an integer incremented on ANY breaking protocol change. Handshake must check exact integer equality. |
| Forgetting heartbeat / connection drop detection | Out-of-process clients crash or disconnect without closing sockets. Protocol must include ping/pong frames and dead connection cleanup. |
| Building this before deciding M10-01 | If Studio-only is chosen in M10-01, this entire leaf is rendered unnecessary. Keep status `blocked` until M10-01 resolves. |
| Neglecting License Zero constraints | An out-of-process client protocol enables third-party commercial tools to integrate with Kaioken, conflicting with License Zero Noncommercial 2.0.1. |

## Open questions

1. **Client Strategy Decision (outcome of M10-01):** This leaf is blocked exclusively on the client strategy decision in [`01-decide-extension-vs-studio.md`](./01-decide-extension-vs-studio.md). If the maintainer decides on a Studio-only architecture, no out-of-process client ships and this protocol leaf is rendered obsolete. If an external extension or dual-client strategy is chosen, this leaf unblocks immediately.

## Session brief

```xml
<task>
In kaioken_v2/, formalize the daemon thin-client communication contract and handshake guard.

When an out-of-process client (such as an external IDE extension) connects to "kaioken daemon", version skew between the daemon binary and client extension is an immediate hazard. This leaf reinstates the ContractVersion guard retired for Studio in-process execution (cross-reference roadmap/m01-green-everywhere/05-contract-version-guard.md).

1. In kaioken_v2/packages/serve/src/ (or apps/cli/src/commands/daemon.ts), formalize the client handshake:
   - Inspect CONTRACT_VERSION = 4 and DAEMON_VERSION in apps/cli/src/commands/daemon.ts:38.
   - Implement an initial mandatory Handshake payload exchange over WebSocket/HTTP.
   - If the client's contract version does not match CONTRACT_VERSION, reject the connection immediately with status code 4409 and a descriptive payload: "Daemon contract version mismatch. Expected v4, received vX. Please update kaioken CLI and your IDE extension."
2. Structure the core RPC method contracts:
   - "status": returns staleness and freshness report.
   - "hover": accepts { path, symbol } and returns resolved symbol/wiki data.
   - "update": triggers scoped regeneration.
   - "chat": bidirectional streaming for agent conversations.
3. Write vitest unit tests in packages/serve/test/protocol.test.ts verifying handshake success on identical versions and immediate rejection on version mismatch.

Do not write editor UI code. Focus solely on the protocol contract and handshake guard.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm that all tests pass, the handshake validation functions correctly, and no unhandled exceptions occur on malformed JSON payloads.
</verification_loop>

<action_safety>
Scope strictly to packages/serve/ and apps/cli/src/commands/daemon.ts. Do not modify core index, scan, or wiki generation packages. Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of the contract handshake implementation, (2) files touched, (3) test suite output, (4) how version mismatch is communicated to out-of-process clients.
</structured_output_contract>
```
