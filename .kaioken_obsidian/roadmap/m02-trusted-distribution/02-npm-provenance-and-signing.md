# M2-02 · Configure npm provenance and Sigstore signing

> Establish keyless cryptographic provenance and Sigstore attestations for Kaioken packages,
> ensuring every distributed artifact links immutably back to its GitHub Actions build execution.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-decide-the-distribution-model` |
| **Blocks** | `03-release-workflow-retarget`, `06-provenance-verification-docs` |
| **Touches** | `kaioken_v2/apps/cli/package.json`, `kaioken_v2/packages/*/package.json`, `.github/workflows/release.yaml` |
| **Risk** | Low. Provenance generation is natively supported by npm and GitHub Actions OIDC |
| **Gate-critical** | **Yes** |

## Why this exists

Operating rule 2 and the thesis of M2 demand verifiable distribution. In v1, provenance was
established using Cosign keyless signatures over GoReleaser binary checksums, anchored in the Rekor
transparency log (`.kaioken_v1/ROADMAP.md:73`).

In the Node ecosystem, the equivalent gold standard is **npm provenance** backed by Sigstore.
When published from GitHub Actions with an OpenID Connect (OIDC) token, npm generates a SLSA
(Supply-chain Levels for Software Artifacts) provenance attestation. This attestation publicly
binds the published tarball to the exact commit SHA, workflow run, and repository URL. Anyone
running `npm audit signatures` or inspecting the package on npmjs.com can verify that the code was
built directly from source in CI and not tampered with on a developer laptop.

## Current state

Verified against the working tree and workflows.

| Fact | Evidence |
|---|---|
| Release workflow already requests OIDC tokens | `.github/workflows/release.yaml:13` sets `permissions: id-token: write` |
| Root package.json is private | `kaioken_v2/package.json:3` (`"private": true`) |
| CLI package metadata | `kaioken_v2/apps/cli/package.json` is currently private and lacks `repository`, `homepage`, and `publishConfig` |
| Engine packages are private | All 19 packages under `kaioken_v2/packages/*/package.json` have `"private": true` |
| Tree-sitter query assets | `packages/index` requires `.scm` files copied to `dist/` before publishing |

`UNVERIFIED:` whether publishing scoped packages under `@kaioken` requires prior organization
creation and payment plan on npmjs.com.

## What done looks like

- [ ] `kaioken_v2/apps/cli/package.json` contains valid distribution metadata:
  - `name`: `@kaioken/cli` (or un-scoped `kaioken-cli` if unreserved).
  - `repository`: pointing to `github.com/babtix/kaioken` (or the canonical remote).
  - `publishConfig`: `{ "access": "public", "provenance": true }`.
  - `files`: explicitly limiting published contents to `dist/`, `README.md`, `LICENSE`.
- [ ] Any shared library packages intended for publishing (e.g. `@kaioken/scan`, `@kaioken/index`) have matching `repository` and `publishConfig` declarations.
- [ ] `.github/workflows/release.yaml` includes an npm publish step with `--provenance` authenticated via `NODE_AUTH_TOKEN` and `id-token: write`.
- [ ] Tarballs generated via `npm pack --dry-run` include all compiled JS, type definitions, and queries, with zero source tests or scratch files.

## Steps

1. **Configure CLI package manifest (`kaioken_v2/apps/cli/package.json`):**
   - Set `"private": false` (or remove `"private"`).
   - Define canonical repository and bugs URLs:
     ```json
     "repository": {
       "type": "git",
       "url": "https://github.com/babtix/kaioken.git",
       "directory": "kaioken_v2/apps/cli"
     },
     "publishConfig": {
       "access": "public",
       "provenance": true
     }
     ```
   - Define strict package whitelist:
     ```json
     "files": ["dist", "bin"]
     ```
2. **Audit build artifacts before publish:**
   - Ensure `npm run build` runs `copy-queries.mjs` so `packages/index` carries `.scm` files into `dist/`.
3. **Configure GitHub Actions OIDC permissions:**
   - In `.github/workflows/release.yaml`, ensure:
     ```yaml
     permissions:
       contents: write
       id-token: write
     ```
4. **Test packaging locally:**
   - In `kaioken_v2/apps/cli`, run:
     ```bash
     npm pack --dry-run
     ```
   - Verify that only compiled output, license, and queries are bundled.
5. **Verify Sigstore attestation configuration:**
   - Ensure the workflow runs `npm publish --provenance --access public`.

## In scope

- `kaioken_v2/apps/cli/package.json`
- `kaioken_v2/packages/*/package.json` (for packages published alongside the CLI)
- Release configuration in `.github/workflows/release.yaml`

## Out of scope

- Setting up npm organization billing or user account creation on npmjs.org.
- Retargeting the entire release job structure (covered in M2-03).
- Cosign signing for standalone native binaries (only relevant if Model B was selected in M2-01).

## Gates

From `kaioken_v2/apps/cli`:

```bash
npm pack --dry-run
```

Ensure output lists `dist/bin.js` and required runtime assets without warnings.

From `kaioken_v2/`:

```bash
npm run typecheck && npm test
```

## Traps

| Trap | Guard |
|---|---|
| Publishing with `--provenance` from local machine | Provenance generation relies on GitHub Actions OIDC runtime. It fails if invoked from a local terminal |
| Missing `repository` field in `package.json` | npm rejects `--provenance` if the manifest does not declare a repository URL matching the CI origin |
| Publishing `private: true` packages | npm publish exits with error if the workspace package is marked private. Explicitly manage the publish target |
| Leaking test files and fixtures into the npm tarball | Use an explicit `"files"` whitelist in `package.json` instead of relying on `.npmignore` |

## Open questions

None.

## Session brief

```xml
<task>
Configure npm provenance metadata and Sigstore attestation prerequisites for Kaioken v2.

Actions:
1. Update kaioken_v2/apps/cli/package.json:
   - Configure public distribution name (e.g. @kaioken/cli).
   - Add repository block linking to the git origin with the directory subpath.
   - Add publishConfig with "access": "public" and "provenance": true.
   - Configure "files": ["dist", "bin"] to prevent leaking tests or markdown notes.
2. Verify that packages/index/package.json includes dist/ and queries/ in its files array.
3. Verify that .github/workflows/release.yaml declares permissions: id-token: write and
   contents: write so that Sigstore OIDC tokens can be minted during release runs.
4. Run npm pack --dry-run in apps/cli to inspect the tarball manifest and ensure no extraneous files
   are included.
</task>

<verification_loop>
Run from kaioken_v2/apps/cli:
  npm pack --dry-run
Verify that the output contains dist/ and package.json, and does not contain test/ or src/.
Run from kaioken_v2/:
  npm run typecheck
Confirm working tree shows only package.json modifications.
</verification_loop>

<missing_context_gating>
Do not guess repository URLs. Inspect git remote -v or roadmap/README.md to identify canonical remote.
</missing_context_gating>

<action_safety>
Modify only package.json files and release workflow permissions. Do NOT run npm publish or git commit.
Leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) changes made to package.json, (2) npm pack file listing, (3) verification of OIDC
permissions in release.yaml, (4) instructions for orchestrator before triggering a release.
</structured_output_contract>
```
