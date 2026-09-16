# M1-05 · Decide the contract-version guard: build or retire

> Determine whether the v1 desktop sidecar ContractVersion guard is rendered obsolete by Theia's
> in-process engine architecture or remains necessary for daemon mode, gated on open question Q1.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | S |
| **Depends on** | `roadmap/README.md` §9 Open Question Q1 (Theia vs Code-OSS Studio fork) |
| **Blocks** | None |
| **Touches** | Documentation only; potentially `kaioken_v2/apps/cli/src/commands/daemon.ts` when unblocked |
| **Risk** | Low. Decision-only leaf; does not alter engine code |
| **Gate-critical** | **No** |

## Why this exists

In v1, the Tauri desktop ran as a web frontend communicating over IPC with a spawned Go sidecar
binary. If the desktop was updated without updating the sidecar (or vice versa), API payloads could
silently desynchronize, causing corruption or crashes. The v1 roadmap (`.kaioken_v1/ROADMAP.md:58`)
therefore planned a "Contract-version guard" where the frontend blocked with a clear dialog whenever
the sidecar's `ContractVersion` differed from expected.

In v2, the Theia desktop shell runs the `@kaioken/*` packages **in-process** via
`RpcConnectionHandler` and runtime path resolution (`theia-ide-kaioken-ext`). In-process execution
guarantees that the UI and the backend run the exact same workspace code, completely eliminating the
mismatched-sidecar failure class. However, `kaioken daemon` (`apps/cli/src/commands/daemon.ts:38`)
still exports `const CONTRACT_VERSION = 4`. Whether this guard is retired or retained depends
directly on Open Question Q1: which Studio fork ships, and does it consume an external daemon?

## Current state

Verified against the repository and roadmap records.

| Fact | Evidence |
|---|---|
| Historical contract version | `.kaioken_v1/cli/internal/version/version.go:12` defined `const ContractVersion = 4` |
| v1 roadmap requirement | `.kaioken_v1/ROADMAP.md:58` ("Desktop blocks with a clear message when sidecar ContractVersion mismatches") |
| Master roadmap verdict | `roadmap/README.md` §3 ("Theia in-process RPC removes the sidecar-mismatch class entirely; guard is obsolete") |
| Active daemon still carries contract version | `kaioken_v2/apps/cli/src/commands/daemon.ts:38` defines `const CONTRACT_VERSION = 4; const DAEMON_VERSION = "2.0.0";` |
| Theia loads engine in-process | `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts:42-54` |
| Open question Q1 unresolved | `roadmap/README.md` §9 Q1 ("Two Studio forks... which one ships?") |

`UNVERIFIED:` whether the parallel `ide_kaioken/kaioken_studio/` (Code-OSS fork) launches the CLI as a subprocess
or imports the engine directly.

## What done looks like

- [ ] A formal architectural decision is recorded in `roadmap/decisions/contract-version-guard.md`.
- [ ] If Theia (in-process) is chosen: the contract-version guard is formally marked `retired` as obsolete, and any remnant guard code in the frontend is removed.
- [ ] If Code-OSS or a daemon subprocess model is chosen: a protocol specification is approved defining a handshake on `/api/v1/system/version` that halts the frontend if `CONTRACT_VERSION` differs.
- [ ] The status of this leaf transitions from `blocked` to `done`.

## Steps

1. **Audit transport architecture against Studio choice:**
   - When Q1 is resolved, inspect the chosen client's IPC mechanism.
   - If Theia (in-process): proceed with Path A (Retire guard).
   - If Code-OSS or external daemon: proceed with Path B (Build guard).
2. **Evaluate Path A (In-Process Engine — Theia Blueprint):**
   - **Mechanism:** Studio directly loads `@kaioken/scan`, `@kaioken/index`, `@kaioken/wiki`, and `@kaioken/agent` into the Node/Electron backend process.
   - **Verdict:** Guard is **obsolete**. There is no separate binary, no network boundary, and no independent version skew.
   - **Action:** Delete `CONTRACT_VERSION` checks in UI; retain version string solely for diagnostic telemetry.
3. **Evaluate Path B (Subprocess / Standalone Daemon — `kaioken daemon`):**
   - **Mechanism:** Studio or third-party IDE extensions interact with `kaioken daemon` over HTTP and Server-Sent Events (port 0 or socket).
   - **Verdict:** Guard is **required**. The UI might be built against API v5 while an older daemon on the user's PATH runs API v4.
   - **Action:** Build a client handshake:
     1. UI queries `GET /api/v1/status` on connect.
     2. If `res.contract !== CLIENT_CONTRACT_VERSION`, render a modal: *"Kaioken daemon version mismatch (daemon: v4, UI: v5). Please restart Kaioken."*
     3. All workspace interactions are gated behind this check.
4. **Author Decision Record:**
   - Commit the resulting decision to `roadmap/decisions/contract-version-guard.md` and transition this leaf to `done`.


## In scope

- Architectural decision documentation regarding IPC vs in-process contract versioning.
- Specifications for the handshake protocol if Path B is chosen.

## Out of scope

- Implementing GUI dialog components in Studio (covered in M3 / Studio v0.1).
- Modifying engine packaging or build configs before Q1 is resolved.

## Gates

None (decision milestone). Unblocked only when Open Question Q1 is answered by the human maintainer.

## Traps

| Trap | Guard |
|---|---|
| Spending time building a sidecar handshake for an in-process app | Theia runs in-process; an IPC handshake would check a process against itself |
| Deleting `CONTRACT_VERSION` while the daemon command is still active | Even if Theia is in-process, `apps/cli/src/commands/daemon.ts` is an HTTP daemon that external clients could call |
| Unblocking this leaf without a committed answer to Q1 | Maintainer must decide the Studio fork first |

## Open questions

1. **Q1: Which Studio fork is canonical?** Does Kaioken commit to `ide_kaioken/kaioken_studio_theia` or `kaioken_studio`?
2. **Will Studio ever talk to a remote daemon?** If Studio is strictly a local desktop IDE, in-process is sufficient. If Studio supports remote SSH / container workspaces, a daemon protocol with a contract guard may be required.

## Session brief

```xml
<task>
This leaf is BLOCKED pending a human decision on Open Question Q1 (Theia vs Code-OSS fork).

Do NOT implement a contract-version guard in code during this session.
Your task is to record the decision criteria and document the protocol requirements:
1. Review the in-process architecture in
   ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts
   and the standalone daemon in kaioken_v2/apps/cli/src/commands/daemon.ts.
2. Draft the decision record at roadmap/decisions/contract-version-guard.md laying out:
   - Why Theia in-process renders the sidecar guard obsolete.
   - When a contract guard is still needed (daemon mode / remote workspace).
   - The required JSON handshake payload if daemon mode is retained:
     { "version": "2.0.0", "contract_version": 4, "min_compatible_contract": 4 }
3. Keep this leaf's status as `blocked` until the maintainer commits an answer to Q1.
</task>

<verification_loop>
Confirm that roadmap/decisions/contract-version-guard.md exists and accurately reflects the current
codebase state.
Confirm that no code changes were made to kaioken_v2/ or the Studio forks.
</verification_loop>

<missing_context_gating>
Do not invent an answer to Q1. The decision belongs exclusively to the maintainer.
Cite real lines: daemon.ts:38 for CONTRACT_VERSION = 4 and kaioken-engine.ts for in-process loading.
</missing_context_gating>

<action_safety>
Do not modify any source code or workflows. Do NOT run git add or git commit.
Leave all notes uncommitted in the working tree for review.
</action_safety>

<structured_output_contract>
End with: (1) confirmation of decision document created, (2) summary of Path A vs Path B trade-offs,
(3) explicit statement of what is needed from the maintainer to unblock this leaf.
</structured_output_contract>
```
