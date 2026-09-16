# M2-03 · Retarget the release workflow at kaioken_v2

> Delete the defunct GoReleaser and setup-go steps from release.yaml and rebuild the release pipeline
> around kaioken_v2, Node 22, and npm provenance, referencing the pattern established in M1-01.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-decide-the-distribution-model`, `02-npm-provenance-and-signing`, `m01-green-everywhere/01-retarget-ci-workflow` |
| **Blocks** | `04-installers-and-package-managers`, `06-provenance-verification-docs` |
| **Touches** | `.github/workflows/release.yaml` only |
| **Risk** | Low. The existing workflow fails immediately because it references nonexistent paths |
| **Gate-critical** | **Yes — P0 for the release pipeline** |

## Why this exists

`.github/workflows/release.yaml` suffers from the exact same disease documented in M1-01 for
`ci.yml`: commit `e46fe1b5` archived the Go codebase into `.kaioken_v1/`, leaving the release
workflow targeting paths under `kaioken v1/` that no longer exist. Pushing a release tag today fails
at the checkout and Go setup steps before anything can be packaged.

While M1-01 resolved continuous integration, M2-03 addresses tagged distribution. Following the same
pattern as M1-01, the dead Go and GoReleaser jobs must be deleted, replaced by a streamlined Node 22
release job that validates gates, builds the workspace, and publishes with cryptographic provenance.

## Current state

Verified against `.github/workflows/release.yaml`.

| Fact | Evidence |
|---|---|
| Triggered on tag push and manual dispatch | `.github/workflows/release.yaml:3-9` (`tags: ['v*']`, `workflow_dispatch`) |
| Requests OIDC and write permissions | `release.yaml:11-13` (`contents: write`, `id-token: write`) |
| Dead GoReleaser job | `release.yaml:16-54` runs `setup-go@v5` pointing to `kaioken v1/cli/go.mod` (line 29) and `workdir: kaioken v1` (line 40) |
| Dead artifact upload path | `release.yaml:60-64` uploads `kaioken v1/dist/*.tar.gz` and `checksums.txt` |
| Dead signature verification job | `release.yaml:70-94` (`verify-signatures`) verifies cosign blob over GoReleaser's `checksums.txt` |
| Nonexistent directory | `ls "kaioken v1"` fails; v1 is archived at `.kaioken_v1/` out of tracking |

`UNVERIFIED:` whether publishing to the public npm registry requires an `NPM_TOKEN` secret in
GitHub repository secrets or if GitHub OIDC trusted publishing is already configured.

## What done looks like

- [ ] `.github/workflows/release.yaml` contains no references to Go, `setup-go`, `goreleaser`, or `kaioken v1/`.
- [ ] The workflow runs on tagged pushes (`refs/tags/v*`) and manual `workflow_dispatch`.
- [ ] Setup mirrors M1-01: `actions/setup-node@v4` with Node 22, `cache: npm`, and `cache-dependency-path: kaioken_v2/package-lock.json`.
- [ ] Steps execute in `working-directory: kaioken_v2`:
  1. `npm ci`
  2. `npm run typecheck`
  3. `npm test`
  4. `npm run build`
- [ ] If tagged release: publishes `@kaioken/cli` with `npm publish --provenance --access public`.
- [ ] If manual dispatch (snapshot run): executes `npm pack --dry-run` and uploads generated tarball artifacts for verification without publishing to npm.
- [ ] Verification step checks npm provenance or attestation rather than raw cosign checksums.

## Steps

1. **Delete defunct GoReleaser jobs:**
   - Remove `goreleaser` job (lines 16–65) and `verify-signatures` job (lines 70–94).
2. **Author new `release` job:**
   - `runs-on: ubuntu-latest`
   - `permissions: { contents: write, id-token: write }`
   - Setup Node 22 with npm cache pointing to `kaioken_v2/package-lock.json`.
3. **Add gate verification steps:**
   - Run `npm ci`, `npm run typecheck`, and `npm test` from `kaioken_v2/`. Operating rule 2: never release against an unverified build.
4. **Add publishing step:**
   - For tags (`startsWith(github.ref, 'refs/tags/v')`):
     ```yaml
     - name: Publish to npm with provenance
       run: npm publish --provenance --access public
       working-directory: kaioken_v2/apps/cli
       env:
         NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
     ```
   - For non-tag/manual runs:
     ```yaml
     - name: Pack snapshot tarball
       run: npm pack
       working-directory: kaioken_v2/apps/cli
     - uses: actions/upload-artifact@v4
       with:
         name: cli-snapshot
         path: kaioken_v2/apps/cli/*.tgz
     ```
5. **Verify YAML syntax:**
   - Ensure step names and indentation are valid.

## In scope

- `.github/workflows/release.yaml`

## Out of scope

- `.github/workflows/ci.yml` (handled in M1-01 and M1-02).
- Managing npm account credentials or registry permissions.
- Building standalone binary releases (unless selected in M2-01).

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck && npm test
```

From repo root, verify workflow file integrity:

```bash
git diff .github/workflows/release.yaml
```

Working tree must show only `.github/workflows/release.yaml` modified.

## Traps

| Trap | Guard |
|---|---|
| Leaving `kaioken v1/` paths in `release.yaml` | Verify every working directory points to `kaioken_v2` or `kaioken_v2/apps/cli` |
| Publishing without running `npm run build` | `npm test` builds, but skipping build step on separate publish action leaves queries uncopied |
| Burning release tags during test runs | Use `workflow_dispatch` with dry-run/pack mode to test release workflow syntax without tagging |
| Missing `id-token: write` permission | npm provenance generation will fail without GitHub Actions OIDC minting permissions |

## Open questions

None.

## Session brief

```xml
<task>
In this repository, retarget .github/workflows/release.yaml at kaioken_v2.

Context:
- The current workflow is dead: it invokes setup-go and GoReleaser targeting "kaioken v1/" (lines 29, 40).
- v1 was archived to .kaioken_v1/ by commit e46fe1b5 and is out of tracking.
- Rebuild the workflow following the Node 22 pattern established in M1-01:
  1. Keep triggers: push on tags 'v*' and workflow_dispatch.
  2. Retain permissions: contents: write, id-token: write.
  3. Replace the entire job with a single job "release" on ubuntu-latest.
  4. Checkout, setup Node 22 with npm cache on kaioken_v2/package-lock.json.
  5. Run npm ci, npm run typecheck, and npm test in kaioken_v2.
  6. On tag releases, run "npm publish --provenance --access public" in kaioken_v2/apps/cli
     using env.NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}.
  7. On manual workflow_dispatch (when not a tag), run npm pack and upload the resulting
     .tgz artifact via actions/upload-artifact@v4 for verification.

Do NOT modify any files under kaioken_v2/ or .github/workflows/ci.yml.
</task>

<verification_loop>
Verify that .github/workflows/release.yaml is valid YAML and contains no references to Go,
GoReleaser, or "kaioken v1".
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm git status shows only .github/workflows/release.yaml modified.
</verification_loop>

<missing_context_gating>
Do not invent GoReleaser bridges or hybrid scripts. Release is pure Node 22 targeting kaioken_v2.
</missing_context_gating>

<action_safety>
Scope strictly to .github/workflows/release.yaml. Do NOT run git add or git commit.
Leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed in release.yaml, (2) the new job steps and triggers, (3) confirmation of
the dry-run snapshot artifact step, (4) gate status.
</structured_output_contract>
```
