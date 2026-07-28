# User guide: discovering, installing and managing extensions

Extensions are **per-user**: install once, available in every repository you
open with Kaioken. They live in `~/.kaioken/extensions/`, pinned by a
lockfile that records the exact version, tag, commit and archive hash.

## Discovering

- **This site** — browse, filter by type/tag, read READMEs and trust panels.
- **CLI** — `kaioken ext search [term]`.
- **TUI** — `/ext browse` opens an interactive picker (enter installs,
  esc cancels); `/ext search <term>` prints matches.
- **Desktop app** — the Extensions screen (`Ctrl+8`) has a searchable
  registry panel with one-click install.

Everything the pickers show comes from the community index; extensions
flagged malicious are never offered.

## Installing

```
kaioken ext install owner/repo          # latest release
kaioken ext install owner/repo@1.2.0    # pin an exact version
```

Any GitHub repository with an `extension.yaml` and a release installs —
being listed in the registry is for discovery, not a gate. The install
output tells you exactly what the extension contributed (skills, and for
executable tiers, what trusting would run).

## The trust model, in plain language

The single most important thing about an extension is its **type**:

**declarative** — documents only. Skills the agent reads. Nothing to run,
nothing to trust. Installed = active.

**mcp** — declares a server program that runs **on your machine,
unsandboxed**, once you allow it. It installs inert. `kaioken ext trust <id>`
shows the exact command line and asks for an explicit yes. Even after
trusting, every tool call still goes through the normal approval prompt.

**wasm** — sandboxed plugin code: no network, no environment variables,
memory-capped, and no file access except what its declared permissions
grant (`fs:read:workspace` = your current repo, read-only, nothing else).
Still requires the same explicit per-version trust — reading your code is a
grant worth a deliberate yes.

**Trust is per version.** When an extension updates, its trust is revoked
automatically and the new version stays inert until you re-approve it. An
author who ships something new never gets to run it on your machine on the
strength of yesterday's yes.

## Managing

| Action | CLI | TUI |
|--------|-----|-----|
| List installed | `kaioken ext list` | `/ext` |
| Update all / one | `kaioken ext update [id]` | `/ext update [id]` |
| Disable (keep on disk) | `kaioken ext disable <id>` | `/ext disable <id>` |
| Re-enable | `kaioken ext enable <id>` | `/ext enable <id>` |
| Remove | `kaioken ext remove <id>` | `/ext remove <id>` |
| Trust / revoke | `kaioken ext trust <id>` / `untrust <id>` | `/ext trust <id>` (two-step) |
| See an extension's tools | `kaioken ext tools <id>` | `/ext tools <id>` |

`ext list` shows the trust state per extension (`trusted` / `UNTRUSTED` /
`-` for declarative). Updates print `old → new` and never happen silently.

## If something goes wrong

- `ext disable <id>` takes an extension out of the agent's context without
  uninstalling — the cheapest way to isolate a misbehaving one.
- Untrusting an mcp extension also stops its server process.
- If an extension turns out to be malicious, report it on the
  [registry repo](https://github.com/babtix/kaioken-extensions) (issue titled
  `takedown: <id>`). Once moderators flag it, every Kaioken client refuses to
  install or update it within a day.

## Pointing at a different registry

`ext_registry:` in `~/.kaioken/config.yaml` overrides the index URL — useful
for a company-internal index. The default is the public community index; the
hosted API mirror (`/api/index` on this site) also works and adds live
version/download data.
