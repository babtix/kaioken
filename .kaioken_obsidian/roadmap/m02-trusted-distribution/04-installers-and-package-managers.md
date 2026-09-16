# M2-04 · Package for Scoop, Winget, and Homebrew

> Deliver automated package manager manifests for Scoop and Winget first, followed by Homebrew,
> prioritizing the Windows maintainer platform and providing one-command CLI installation.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-decide-the-distribution-model`, `03-release-workflow-retarget` |
| **Blocks** | None |
| **Touches** | Package manifests under `packaging/` (or dedicated tap/bucket repos) |
| **Risk** | Low. Package manifests wrap release artifacts without touching engine internals |
| **Gate-critical** | **No** |

## Why this exists

A knowledge engine intended for external adoption cannot require end-users to clone the monorepo,
install devDependencies, and run `tsc --build`. Users expect a standard one-line install command.

Because the maintainer operates on Windows (`D:\project\ai_now_know`), Windows package managers come
first: **Scoop** (the de-facto developer CLI package manager on Windows) and **Winget** (Microsoft's
official Windows Package Manager). **Homebrew** follows for macOS and Linux users. Historically,
v1 carried secrets for all three in `.github/workflows/release.yaml:51-53` (`HOMEBREW_TAP_TOKEN`,
`SCOOP_BUCKET_TOKEN`, `WINGET_TOKEN`). In v2, these manifests must be adapted to install the
Node-based CLI or its standalone distribution shims.

## Current state

Verified against repository records.

| Fact | Evidence |
|---|---|
| Maintainer host OS | Windows 11 (`D:\project\ai_now_know`) |
| Historical package secrets | `.github/workflows/release.yaml:51-53` defined tokens for Homebrew tap, Scoop bucket, and Winget |
| v1 roadmap priority order | `.kaioken_v1/ROADMAP.md:77` ("Scoop + winget manifests first (your platform), Homebrew tap second") |
| CLI executable entry point | `kaioken_v2/apps/cli/dist/bin.js` |
| Node engine requirement | Node >= 22 required (`kaioken_v2/package.json:10`) |

`UNVERIFIED:` whether the maintainer has an existing public GitHub repository configured as a Scoop
bucket (e.g. `babtix/scoop-bucket`).

## What done looks like

- [ ] A Scoop JSON manifest (`packaging/scoop/kaioken.json`) is authored:
  - Points to the release tarball or npm pack release.
  - Generates a shim for `kaioken` pointing to the entrypoint.
  - Declares `nodejs` as a runtime dependency (or bundles the standalone binary if Model B).
- [ ] A Winget manifest package (YAML) is generated using `wingetcreate` or authored under `packaging/winget/`.
- [ ] A Homebrew formula (`packaging/homebrew/kaioken.rb`) is authored with `depends_on "node@22"`.
- [ ] Manual test: running `scoop install ./packaging/scoop/kaioken.json` on the Windows host successfully places `kaioken` on the PATH.
- [ ] Running `kaioken scan --root .` from the installed package runs offline and exits 0.

## Manifest specifications

### 1. Scoop Manifest (`packaging/scoop/kaioken.json`)
For a Node CLI package, Scoop allows wrapping an npm tarball and creating an execution shim:
```json
{
  "version": "2.0.0",
  "description": "A repository knowledge engine",
  "homepage": "https://github.com/babtix/kaioken",
  "license": "LicenseRef-Noncommercial-2.0.1",
  "suggest": {
    "node": "nodejs-lts"
  },
  "url": "https://registry.npmjs.org/@kaioken/cli/-/@kaioken/cli-2.0.0.tgz",
  "hash": "<sha256-of-tarball>",
  "bin": "bin/kaioken.cmd",
  "checkver": {
    "npm": "@kaioken/cli"
  },
  "autoupdate": {
    "url": "https://registry.npmjs.org/@kaioken/cli/-/@kaioken/cli-$version.tgz"
  }
}
```

### 2. Winget Manifest (`packaging/winget/babtix.kaioken.yaml`)
Winget manifest declaring package identifiers, installer URLs, and silent installation arguments.

### 3. Homebrew Formula (`packaging/homebrew/kaioken.rb`)
```ruby
class Kaioken < Formula
  desc "A repository knowledge engine"
  homepage "https://github.com/babtix/kaioken"
  url "https://registry.npmjs.org/@kaioken/cli/-/@kaioken/cli-2.0.0.tgz"
  sha256 "<sha256-checksum>"
  license "Noncommercial-2.0.1"

  depends_on "node@22"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/kaioken", "--version"
  end
end
```

## Steps

1. **Create manifest template directory:**
   - Create `packaging/scoop/`, `packaging/winget/`, and `packaging/homebrew/`.
2. **Draft Scoop manifest:**
   - Implement shim script for Windows (`kaioken.cmd`) invoking `node "%~dp0\..\dist\bin.js" %*`.
   - Test locally using `scoop install ./packaging/scoop/kaioken.json`.
3. **Draft Winget manifest:**
   - Use `wingetcreate` pointing to the packaged release artifact once published.
4. **Draft Homebrew formula:**
   - Implement Ruby formula verifying node version and bin symlink.
5. **Add manifest updater script:**
   - Add a lightweight script (`packaging/update-manifests.mjs`) that calculates SHA-256 hashes of new releases and updates manifest URLs.

## In scope

- Manifest templates under `packaging/` for Scoop, Winget, and Homebrew.
- Local verification on Windows using Scoop.

## Out of scope

- Submitting pull requests to `microsoft/winget-pkgs` or `Homebrew/homebrew-core` (can be maintained in custom taps/buckets first).
- Building graphical MSI/EXE installers (handled by Studio packaging).

## Gates

From repo root on Windows:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

Verify manifest JSON/YAML syntax:

```bash
node -e "JSON.parse(require('fs').readFileSync('packaging/scoop/kaioken.json'))"
```

## Traps

| Trap | Guard |
|---|---|
| Assuming `node` is globally on PATH in Scoop | Use `suggest: { "node": "nodejs" }` in Scoop so users are prompted to install Node |
| Windows path escaping in `bin` shims | In `.cmd` batch files, quote all file paths (`"%~dp0..."`) to avoid spaces-in-path bugs |
| Submitting to Homebrew core with License Zero | Homebrew core only accepts OSI-approved licenses. Maintain a dedicated tap (`babtix/homebrew-kaioken`) |
| Stale SHA-256 checksums in manifests | Automate checksum calculation using `crypto.createHash('sha256')` in release automation |

## Open questions

None.

## Session brief

```xml
<task>
Author package manager installation manifests for Kaioken v2, prioritizing Windows (Scoop and Winget),
followed by macOS/Linux (Homebrew).

Targets:
1. Create directory packaging/scoop/ and write packaging/scoop/kaioken.json:
   - Provide clean configuration for installing the @kaioken/cli npm tarball or standalone release.
   - Configure bin shim for Windows command prompt and PowerShell.
2. Create packaging/winget/babtix.kaioken.yaml with standard Windows Package Manager schema.
3. Create packaging/homebrew/kaioken.rb with depends_on "node@22" and symlink installation.
4. Provide a small update script packaging/update-manifests.mjs that takes a version and tarball path,
   computes the SHA-256 hash, and updates the manifests in place.

Test the Scoop manifest locally on Windows if Scoop is available.
Do NOT modify any files inside kaioken_v2/.
</task>

<verification_loop>
Verify that packaging/scoop/kaioken.json parses with JSON.parse.
Verify that packaging/homebrew/kaioken.rb is syntactically valid Ruby.
Verify that packaging/update-manifests.mjs compiles with node.
Confirm git status shows only files created under packaging/.
</verification_loop>

<missing_context_gating>
Do not submit pull requests to upstream public package manager repositories. Keep manifests local
in packaging/ until the release workflow has run its first public tag.
</missing_context_gating>

<action_safety>
Modify only files in packaging/. Do not touch engine packages. Do NOT run git add or git commit.
Leave all files uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) manifests created, (2) explanation of the Windows shim mechanism, (3) results of
syntax verification, (4) instructions for setting up personal tap/bucket repositories.
</structured_output_contract>
```
