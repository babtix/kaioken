# M2-06 · Document provenance verification and attestation limits

> Author user-facing documentation detailing how to cryptographically verify Kaioken installations,
> accompanied by an honest declaration of what is and is not attested.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `02-npm-provenance-and-signing`, `03-release-workflow-retarget` |
| **Blocks** | None |
| **Touches** | User documentation under `docs/provenance-verification.md` (and website docs) |
| **Risk** | Low. Documentation leaf |
| **Gate-critical** | **No** |

## Why this exists

A security attestation that users cannot verify is security theater. In v1, `.kaioken_v1/ROADMAP.md:78`
candidly observed: "Rekor inclusion proof: currently skipped, and `verify.go` says so honestly. Close
it or document permanently why not."

Trust in Kaioken stems from radical transparency: telling the user exactly what cryptographic
guarantees exist, how to verify them locally, and what lies outside the trust boundary. This leaf
produces the user-facing verification guide that accompanies every release, providing copy-paste
verification commands for npm packages, GitHub releases, and package managers.

## Current state

Verified against repository architecture.

| Fact | Evidence |
|---|---|
| Historical transparency admission | `.kaioken_v1/ROADMAP.md:78` (candidly noted Rekor proof was skipped) |
| GitHub Actions OIDC release config | `.github/workflows/release.yaml:13` configured for keyless attestations |
| npm provenance support | npm >= 9.5.0 supports `npm audit signatures` natively |
| GitHub CLI attestation extension | `gh attestation verify` is standard for GitHub Actions build attestations |
| Third-party dependencies present | `kaioken_v2/packages/index/package.json:16-21` imports third-party tree-sitter wasm modules |

`UNVERIFIED:` whether `npm audit signatures` on Windows PowerShell requires special flag handling
when inspecting scoped packages.

## What done looks like

- [ ] A dedicated guide is published at `docs/provenance-verification.md`.
- [ ] Includes copy-pasteable verification commands for:
  1. **npm installations:** using `npm audit signatures`.
  2. **GitHub release tarballs:** using `gh attestation verify` or `cosign`.
  3. **Local package inspection:** unpacking and comparing SHA-256 sums.
- [ ] Contains a prominent, honest statement detailing **What is attested** vs **What is NOT attested**:
  - **What IS attested:**
    - The release artifact was built in an isolated GitHub Actions virtual environment.
    - The artifact was produced from a specific commit on the canonical repository.
    - The cryptographic signature was recorded in the public Sigstore transparency log.
  - **What is NOT attested:**
    - Third-party dependencies (e.g. `web-tree-sitter` binaries) are not re-compiled or re-attested from source.
    - An attestation does not guarantee code correctness, model safety, or the absence of bugs.
    - No Apple Developer ID notarization or Windows Authenticode certificate is applied (unless configured in M3).

## Verification guide specification

The document at `docs/provenance-verification.md` must provide exact steps:

### Verifying an npm install
```bash
# Verify all installed package signatures against the Sigstore transparency log
npm audit signatures
```

### Verifying a downloaded release asset
```bash
# Using GitHub CLI to verify build provenance
gh attestation verify kaioken-cli-2.0.0.tgz --owner babtix
```

### Verifying checksums manually
```bash
# On Linux/macOS:
sha256sum -c checksums.txt
# On Windows (PowerShell):
Get-FileHash .\kaioken-cli-2.0.0.tgz -Algorithm SHA256
```

## Steps

1. **Draft `docs/provenance-verification.md`:**
   - Write clear introduction explaining supply chain security for AI tools.
   - Author step-by-step instructions for each package manager (npm, Scoop, Homebrew).
2. **Draft the Attestation Limits section:**
   - Clearly delineate the boundaries of Sigstore and npm provenance.
   - Note the presence of pre-compiled wasm grammars in `@kaioken/index`.
3. **Review against operating rule 5 (Dogfooding):**
   - Execute the verification commands against a test release or packed tarball on the maintainer machine.
4. **Link documentation:**
   - Add reference link to `docs/provenance-verification.md` in `kaioken_v2/README.md`.

## In scope

- `docs/provenance-verification.md`
- Documentation link updates in `kaioken_v2/README.md`

## Out of scope

- Setting up private signing keys or buying code signing certificates.
- Writing workflow files (handled in M2-02 and M2-03).

## Gates

Markdown linter or link checker:

```bash
node -e "const fs = require('fs'); fs.readFileSync('docs/provenance-verification.md', 'utf8'); console.log('Markdown readable');"
```

## Traps

| Trap | Guard |
|---|---|
| Claiming an attestation guarantees security | Attestation only proves *provenance* (who built it and where), not *safety*. Explicitly state this difference |
| Providing outdated verification commands | Test `npm audit signatures` and `gh attestation verify` commands directly before documenting |
| Glossing over native dependencies | Acknowledge that `tree-sitter` wasm files originate from upstream npm packages |

## Open questions

None.

## Session brief

```xml
<task>
Author the user-facing verification guide at docs/provenance-verification.md.

The guide must explain how any user can verify the cryptographic integrity of Kaioken:
1. Provide exact, copy-paste verification instructions for:
   - npm installations (npm audit signatures).
   - Release tarballs (gh attestation verify <file> --owner babtix).
   - Checksum verification on Windows (PowerShell Get-FileHash) and Unix (sha256sum).
2. Include the section "What is and is not attested":
   - Honestly detail that provenance proves the artifact was built in GitHub Actions from a specific
     commit and recorded in Sigstore.
   - Honestly disclose that third-party dependencies (such as web-tree-sitter wasm files) are
     consumed from upstream npm registries and are not independently re-attested.
   - Disclose that no proprietary Authenticode or Apple Developer notarization is provided for CLI
     releases.
3. Add a cross-reference in kaioken_v2/README.md pointing to this verification guide.
</task>

<verification_loop>
Verify that docs/provenance-verification.md exists, has proper markdown structure, and includes all
required verification commands.
Confirm git status shows only docs/provenance-verification.md created and README updated.
</verification_loop>

<missing_context_gating>
Do not cite unverified third-party verification tools. Stick to standard npm and GitHub CLI tooling.
</missing_context_gating>

<action_safety>
Documentation only. Do NOT run git add or git commit. Leave the documentation uncommitted in the
working tree.
</action_safety>

<structured_output_contract>
End with: (1) document summary, (2) verification commands documented, (3) text of the attestation
boundary disclaimer, (4) git status.
</structured_output_contract>
```
