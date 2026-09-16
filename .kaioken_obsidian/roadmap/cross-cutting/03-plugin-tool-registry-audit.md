# CROSS-03 · Audit the plugin and tool registry in packages/ext

> Audit the shipped `packages/ext` implementation, verify its extension loading mechanisms against the
> codebase, and document the frozen manifest contract that Milestone M12's Extension SDK GA depends on.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | Milestone M12 (Ecosystem GA & Extension SDK v1 freeze) |
| **Touches** | Documentation and characterisation tests in `kaioken_v2/packages/ext/` |
| **Risk** | Low — read-mostly audit and test characterisation |
| **Gate-critical** | No |

## Why this exists

The master roadmap ([`roadmap/README.md:307`](../README.md#L307)) marks the "Plugin / tool registry"
architectural enabler as **SHIPPED** via `packages/ext`.

Before Milestone M12 can declare the Extension SDK v1 frozen with an immutable `extension.yaml` schema,
that claim must be audited against real code. We must document what the extension surface actually
supports, verify which extension types (MCP, WASM, Declarative) are fully functional, and ensure
characterisation tests lock the contract so future work does not silently break third-party
extensions.

## Current state

Verified against [`kaioken_v2/packages/ext/src/index.ts:1-45`](../../kaioken_v2/packages/ext/src/index.ts#L1-L45)
and [`kaioken_v2/packages/ext/src/manifest.ts`](../../kaioken_v2/packages/ext/src/manifest.ts):

| Fact | Evidence |
|---|---|
| Shipped exports | `packages/ext/src/index.ts` exports manifest validation, semver, lockfile management, installation, WASM runners, MCP calling, and registry fetching |
| Supported extension types | `manifest.ts:5-7` defines `TYPE_DECLARATIVE = "declarative"`, `TYPE_MCP = "mcp"`, `TYPE_WASM = "wasm"` |
| Lockfile management | `lock.ts` manages `.kaioken/extensions.json` tracking installed plugins, enabled state, and trust flags |
| MCP integration | `mcp.ts` implements `callMcpTool` and `listMcpTools` over stdio transport |
| WASM command execution | `wasm.ts` implements `runWasmCommand` using Node's WebAssembly runtime |
| Registry client | `registry.ts` interfaces with `registry-web` (default registry endpoint) |
| CLI command | `apps/cli/src/commands/ext.ts` ships `kaioken ext list`, `install`, `remove`, `update`, `trust` |

## What done looks like

- [ ] A written audit report detailing the exact API surface of `packages/ext` across all 7 source files.
- [ ] Verification that all three extension types (declarative skills, MCP servers, and WASM binaries)
      have passing test fixtures in `packages/ext/test/`.
- [ ] Explicit documentation of the manifest schema (`extension.yaml`) to serve as the candidate for
      M12's frozen SDK specification.
- [ ] Identification of any gaps between the CLI commands (`kaioken ext ...`) and the programmatic API.

## Steps

1. **Audit Source Files in `packages/ext`:**
   - Review `manifest.ts`: inspect validation rules, schema requirements, and required fields.
   - Review `mcp.ts`: check how MCP server child processes are spawned, authenticated, and terminated.
   - Review `wasm.ts`: check memory limits, sandbox constraints, and supported imports for WASM commands.
   - Review `lock.ts` & `install.ts`: check tarball extraction, trust prompt mechanics, and file isolation.
2. **Review Existing Test Coverage:**
   - Run `vitest run packages/ext/test/` from `kaioken_v2/`.
   - Ensure edge cases (corrupted manifests, malicious path traversal in tarballs via `safeJoin`,
     untrusted extension execution) are tested.
3. **Draft the Frozen Extension Specification:**
   - Record the exact structure of `Manifest`, `McpConfig`, `WasmConfig`, and `CommandDecl` as
     the formal contract for M12.
4. **Publish Audit Findings:**
   - Commit the audit document under `roadmap/cross-cutting/` or `kaioken_v2/packages/ext/README.md`.

## In scope

- `kaioken_v2/packages/ext/`
- `kaioken_v2/apps/cli/src/commands/ext.ts`

## Out of scope

- Developing new features for `registry-web` — that is M12.
- Writing new extension types (e.g. native dynamic libraries).
- Breaking changes to `extension.yaml` schema.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npx vitest run packages/ext/test/
```

All extension tests must pass, confirming manifest parsing, semver comparisons, and tarball extraction safety.

## Traps

| Trap | Guard |
|---|---|
| Assuming MCP tools run in-process | MCP tools run as external subprocesses communicating over JSON-RPC stdio. Ensure process teardown is verified. |
| Path traversal vulnerabilities during extension installation | Verify `packages/ext/src/archive.ts` enforces `safeJoin` to prevent tar-slip attacks (`../../etc/passwd`). |
| Unpinned dependency versions in extension locks | Verify `lock.ts` pins exact content hashes or commit SHAs, not loose semver ranges. |

## Open questions

None. The code is already written and shipped in `packages/ext/`.

## Session brief

```xml
<task>
In kaioken_v2/, perform a thorough code audit of packages/ext/ to formalise the extension contract
for Milestone M12:

1. Read all files under packages/ext/src/:
   - manifest.ts: Document the exact Manifest interface and validation rules.
   - lock.ts: Document how .kaioken/extensions.json is structured and mutated.
   - mcp.ts: Document the MCP client lifecycle, timeout handling, and tool conversion.
   - wasm.ts: Document WASM execution limits, memory bounds, and IO channels.
   - install.ts & archive.ts: Verify archive safety (safeJoin prevents directory traversal).
   - registry.ts: Verify the protocol used to query registry-web.

2. Run the test suite:
   npx vitest run packages/ext/test/
   Check whether tests cover all three extension modes (declarative, mcp, wasm).

3. Create or update kaioken_v2/packages/ext/README.md with the canonical Extension Specification:
   - extension.yaml schema
   - Lifecycle hooks
   - Permission and trust model
   This document forms the baseline for the M12 SDK freeze.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npx vitest run packages/ext/test/
Confirm working tree is clean except for the audit documentation.
</verification_loop>

<action_safety>
Do not modify the runtime behaviour of packages/ext/. Keep changes strictly to documentation
and test characterisation. Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) detailed summary of the 3 supported extension types, (2) verification of security controls
(tar slip, untrusted code execution), (3) test suite execution numbers, (4) draft of the frozen
extension.yaml specification for M12.
</structured_output_contract>
```
