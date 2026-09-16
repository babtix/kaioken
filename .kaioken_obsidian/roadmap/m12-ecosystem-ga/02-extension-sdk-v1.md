# M12-02 · Extension SDK v1 and schema freeze

> Freeze the extension.yaml manifest schema, export an authoritative JSON Schema, and publish the Extension SDK with a formal backwards compatibility promise for the v2.x lifecycle.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | `packages/ext` (manifest parser and validator), [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md), [`roadmap/decisions/d2-version-base.md`](../decisions/d2-version-base.md) |
| **Blocks** | `01-registry-launch.md`, `05-v2-release-checklist.md` |
| **Touches** | `kaioken_v2/packages/ext/src/manifest.ts`, `kaioken_v2/packages/ext/schema/` |
| **Risk** | High. Freezing a schema is a one-way door. Any field mistake or omission cannot be altered without a breaking v3 major release. |
| **Gate-critical** | Yes |

## Why this exists

Third-party developers cannot build an ecosystem on top of a moving target. If extension authors write an `extension.yaml` manifest that works today, but breaks after the next minor CLI update, the ecosystem will collapse before it begins.

Freezing the schema is a **one-way architectural door**:
- The manifest schema (`packages/ext/src/manifest.ts:16`) defines the security boundaries, execution types (`declarative`, `mcp`, `wasm`), and permission models for all extensions.
- Once frozen, the project makes an explicit **compatibility promise**: any valid `extension.yaml` conforming to schema version 1 will continue to parse, install, and execute without deprecation breaks across the entire `v2.x` release lifecycle.
- Minor releases of Kaioken may only introduce optional, backward-compatible fields; required fields cannot be added, and existing fields cannot change their types or semantics.

This leaf formalizes that promise: it exports a standalone JSON Schema file (`extension.v1.json`), writes automated schema regression tests, and documents the SDK guidelines for extension authors.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Extension manifest parser is implemented | `kaioken_v2/packages/ext/src/manifest.ts:16` (`export const MANIFEST_NAME = "extension.yaml"`) |
| Supported extension types defined | `kaioken_v2/packages/ext/src/manifest.ts:19-25` (`"declarative" | "mcp" | "wasm"`) |
| Permission scopes restricted | `kaioken_v2/packages/ext/src/manifest.ts:70` (`const KNOWN_PERMISSIONS = new Set(["read_repo", "network"])`) |
| Manifest interface fields defined | `kaioken_v2/packages/ext/src/manifest.ts:44-61` (`id`, `name`, `version`, `type`, `mcp`, `wasm`, `permissions`) |
| Version numbering is an open blocker (Q2) | `roadmap/README.md:370` — "Version numbering... Does the TS engine inherit the v1.x line, or re-base?" |

`UNVERIFIED:` Whether future extensions will require access to write files in `.kaioken/` or if declarative schema contributions remain sufficient.

## What done looks like

- [ ] A canonical JSON Schema file `kaioken_v2/packages/ext/schema/extension.v1.json` is generated and committed.
- [ ] An explicit `schemaVersion: 1` field is added to `extension.yaml` specification.
- [ ] A written compatibility promise is published in `packages/ext/README.md` guaranteeing:
  - Any v1 manifest will parse cleanly on any `2.x.x` engine version.
  - Zero breaking field changes during the v2 line.
  - Additive changes in minor versions must be optional.
- [ ] Schema validation tests run in vitest, validating valid and invalid test fixtures against the JSON Schema.
- [ ] `registry-web/api/_lib/manifest.ts` imports and validates against this identical schema file.
- [ ] TypeScript types in `packages/ext/src/manifest.ts` are verified to match the JSON Schema 1:1.

## Steps

1. **Resolve Version Base (Q2).** Confirm whether the engine versioning is re-basing to v2.0.0, establishing `minKaiokenVersion: "2.0.0"` as the baseline.
2. **Draft Schema Version Field.**
   - Update `packages/ext/src/manifest.ts` to support `schemaVersion?: number` (defaulting to 1).
3. **Generate Authoritative JSON Schema.**
   - Create `packages/ext/schema/extension.v1.json` utilizing draft-07 or 2020-12 standard.
   - Specify strict definitions for `id` (regex `^[a-z0-9-]+(\.[a-z0-9-]+)+$`), `version` (strict SemVer), and extension types.
   - Restrict `permissions` strictly to `enum: ["read_repo", "network"]`.
4. **Author the Compatibility Guarantee.**
   - In `packages/ext/README.md`, document the **Kaioken Extension Compatibility Charter**:
     *"The v1 extension schema is frozen. For the entire duration of the Kaioken 2.x lifecycle, all valid v1 manifests remain forwards-compatible. No required properties will be introduced; no existing properties will be deprecated without a major version increment."*
5. **Add Automated Schema Fixture Tests.**
   - In `packages/ext/test/schema.test.ts`, validate 10 positive test fixtures and 10 negative test fixtures (e.g. unknown permissions, invalid IDs, missing command strings) against `extension.v1.json`.

## In scope

- JSON Schema generation in `kaioken_v2/packages/ext/schema/`.
- Manifest parser updates in `kaioken_v2/packages/ext/src/manifest.ts`.
- Compatibility documentation in `kaioken_v2/packages/ext/README.md`.
- Vitest schema conformance tests.

## Out of scope

- Dynamic plugin loading of arbitrary Node modules — execution is strictly constrained to MCP and WASM.
- Payment, licensing, or DRM enforcement in extensions (refused non-goals).
- Changes to registry web presentation.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verify schema validation tests:

```bash
npx vitest run packages/ext/test/schema.test.ts
```

## Traps

| Trap | Guard |
|---|---|
| Adding permissions later without schema version bump | If an extension needs a new capability, it must be introduced as an optional enum value or require a v2 schema. |
| Forgetting `minKaiokenVersion` compatibility | Manifests must declare `minKaiokenVersion` so the CLI can prevent running a modern extension on an older engine build. |
| Permissive regex for extension IDs | Keep ID validation strict (`owner.name` in lowercase kebab-case); allowing uppercase or special characters causes filesystem clashes on Windows. |
| Commercial licensing collision | Third-party developers cannot build an ecosystem under License Zero Noncommercial 2.0.1. Resolve the license before inviting external SDK developers. |

## Open questions

1. **Version Base Decision for Compatibility Promise:** Resolved by [`roadmap/decisions/d2-version-base.md`](../decisions/d2-version-base.md). Freezing a schema is a one-way door; the compatibility charter promises stability for the `v2.x` line, which cannot be formalized until it is decided whether the engine inherits the v1.x line or re-bases to clean semver v2.0.0.
2. **Licensing for Third-Party Extension Authors:** Resolved by [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md). Third-party developers cannot build a commercial ecosystem under License Zero Noncommercial 2.0.1. A resolution between Path A, B, or C is required before inviting external SDK developers.

## Session brief

```xml
<task>
In kaioken_v2/packages/ext/, freeze the extension.yaml manifest schema and establish the Extension SDK v1 compatibility guarantee.

Freezing a manifest schema is a one-way door: once published, all v1 manifests must be supported throughout the entire 2.x lifecycle.

1. In kaioken_v2/packages/ext/schema/extension.v1.json, author a complete JSON Schema defining:
   - id: string, pattern "^[a-z0-9-]+(\\.[a-z0-9-]+)+$"
   - name: string
   - version: string (semver)
   - type: enum ["declarative", "mcp", "wasm"]
   - mcp: object with required "command", optional "args" and "env"
   - wasm: object with required "entry"
   - permissions: array with items enum ["read_repo", "network"]
   - minKaiokenVersion: string
   - commands: array of { name, description }
   - additionalProperties: false
2. In kaioken_v2/packages/ext/src/manifest.ts, reconcile the TypeScript Manifest interface with the JSON Schema.
3. In kaioken_v2/packages/ext/README.md, write the formal Compatibility Charter explaining what is promised and for how long:
   - Any valid v1 manifest will remain valid across all Kaioken 2.x releases.
   - Minor releases may only add optional properties.
4. In kaioken_v2/packages/ext/test/schema.test.ts, write vitest tests validating positive fixtures (valid declarative, mcp, wasm manifests) and negative fixtures (unknown fields, disallowed permissions, invalid ids) against the schema.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Ensure that packages/ext tests pass completely and the JSON Schema parses validly with Ajv or vitest schema matchers.
</verification_loop>

<missing_context_gating>
Read packages/ext/src/manifest.ts:16-70 for the existing manifest validation logic. Do not invent new extension types or permissions.
</missing_context_gating>

<action_safety>
Scope strictly to packages/ext/. Do not modify packages/scan, packages/index, or packages/wiki.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) details of the frozen extension schema, (2) files touched, (3) test suite output, (4) the exact compatibility commitment made to extension developers.
</structured_output_contract>
```
