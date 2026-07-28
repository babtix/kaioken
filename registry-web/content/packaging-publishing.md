# Packaging & publishing

## What an install actually is

`kaioken ext install owner/repo` resolves your repository's **latest GitHub
release** (or an exact one with `@1.2.0`), downloads the **source zipball**,
and:

- caps the archive at 20 MB and rejects path-escaping entries,
- validates `extension.yaml` (all tier rules) and `minKaiokenVersion`,
- records version, tag, commit SHA and the archive's SHA-256 in a per-user
  lockfile,
- installs to `~/.kaioken/extensions/<id>/<version>/`.

No build artifacts are required for declarative and mcp extensions — the
zipball *is* the package. For wasm, the built module must be committed
(the zipball ships your tree, not your CI outputs).

## Versioning rules

- `version:` is strict `MAJOR.MINOR.PATCH`. No ranges, no pre-releases —
  the whole update model is "is the release tag newer than what's installed".
- The release tag must equal the version (`v1.2.0` or `1.2.0`). A mismatch
  installs with a warning; don't ship one.
- Bump the version for **every** release. Kaioken keeps the previous
  version's directory until the new install fully succeeds, so a broken
  release never strands users.

## Release flow

```
# 1. bump version: in extension.yaml, commit
# 2. tag and push
git tag v1.2.0 && git push --tags
```

Copy the release workflow from the
[template](https://github.com/babtix/kaioken-extension-template): it checks
the tag matches the manifest and publishes the GitHub release. The wasm
example's workflow additionally rebuilds the module and fails when the
committed artifact doesn't match the source — reproducibility reviewers can
check.

## How updates behave on users' machines

Nothing updates silently. `kaioken ext update` (CLI), `/ext update` (TUI)
and the desktop app all:

1. resolve your latest release,
2. semver-compare against the installed version,
3. install the newer one, print `old → new`, and prune the old directory
   only after success.

For mcp and wasm extensions an update also **revokes trust**: your new code
does not run until the user re-approves it. Design for that — a changelog in
your release notes is what users read at the re-trust prompt.

## Deprecating and unpublishing

- Stopping maintenance? PR `"flags": ["deprecated"]` onto your registry
  entry — clients show a warning but installs keep working.
- Registry entries are never deleted (deletion would only help stale caches
  reinstall); the `malicious` flag exists for actual kill-switch cases and
  is applied by moderators. See the registry's `MODERATION.md`.

Next: [Submitting to the registry](/docs/submitting).
