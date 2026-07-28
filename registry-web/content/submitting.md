# Submitting to the registry

The community index at
[babtix/kaioken-extensions](https://github.com/babtix/kaioken-extensions) is
how `kaioken ext search`, the TUI's `/ext browse`, the desktop's browse
panel, and this site discover extensions. The index stores **pointers, never
code** — an extension always downloads from its author's own GitHub releases.

## The entry format

```json
{
  "id": "you.your-extension",
  "repo": "you/kaioken-your-extension",
  "name": "Your Extension",
  "description": "One honest sentence a user reads in the picker.",
  "author": "you",
  "type": "wasm",
  "tags": ["tools", "sandbox"],
  "permissions": ["fs:read:workspace"]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `id` | yes | `owner.name` — must match your `extension.yaml` and be unique in the index. |
| `repo` | yes | `owner/repo` — the repository users install from. Unique in the index. |
| `name` | yes | The human-readable title. |
| `description` | yes | One sentence. Shown in install/browse UIs everywhere. |
| `author` | yes | Display name. |
| `type` | optional | `declarative` (default), `mcp` or `wasm`. |
| `tags` | optional | Max 5, lowercase kebab-case. Powers the browse filter chips. |
| `permissions` | for wasm | Must match the manifest — CI deep-checks this. |
| `homepage` | optional | Must be an `https://` URL. |

## Use the submit wizard

The fastest path: paste `owner/repo` in the [submit page](/submit). It
validates the repo with the same rules `kaioken ext validate` applies, shows
the validation report (fix any errors before proceeding), and when it
passes, hands you:

- the ready-to-paste JSON entry,
- a direct link to edit the index file on GitHub (which forks the repo for
  you), and
- the PR submission checklist.

Alternatively, hand-write the entry and PR it directly.

## What CI checks on your pull request

- Structural rules (the same ones the submit wizard runs): id format,
  uniqueness, known types, tag limits, permission allowlist.
- **Deep check** (`-deep` flag): CI fetches your repo's latest release and
  cross-checks the `extension.yaml` it ships against your index entry — id,
  type and permissions must match. A listing claiming to be declarative while
  the release declares an mcp server blocks the merge.

## Review criteria

All PRs are reviewed by humans before merging. The review checklist is tier-
dependent — `MODERATION.md` in the registry repo has the full detail, but
the highlights:

- **declarative**: skills are read for prompt-injection attempts.
- **mcp** (highest scrutiny): the command and server source are reviewed.
- **wasm**: the permission set is reviewed and justified.

## After merging

Within 24 hours (the CLI's registry cache TTL), your extension appears in:

- `kaioken ext search` (CLI)
- `/ext browse` (TUI)
- the desktop app's Extensions screen
- this site's browse page

Direct install (`kaioken ext install you/your-extension`) works immediately
for anyone, independent of the registry — listing only adds discoverability.

Next: [User guide](/docs/user-guide).
