# Kaioken Community Extensions

This repository is the community extension index for
[Kaioken](https://github.com/babtix/kaioken): one JSON file that powers
`kaioken ext search`, the TUI's `/ext browse` picker, the desktop app's
Extensions screen, and the registry website at
<https://extensions.kaioken.dev>.

The registry stores **pointers, never code**. An extension always downloads
from its author's own GitHub releases; listing here only makes it
discoverable. Hosting costs nothing and ownership stays with authors.

## Submitting an extension

**The front door is the submit wizard: <https://extensions.kaioken.dev/submit>.**
Paste your `owner/repo`, it validates the release with the same rules
`kaioken ext validate` applies, and hands you the exact JSON entry plus the
PR link.

Prefer doing it by hand? Open a pull request adding one entry to
`community-extensions.json`:

```json
{
  "id": "you.your-extension",
  "repo": "you/kaioken-your-extension",
  "name": "Your Extension",
  "description": "One sentence a user reads in the picker.",
  "author": "you",
  "type": "declarative",
  "tags": ["example"]
}
```

Field reference (schema v2 — `type`, `tags`, `permissions`, `homepage` are
optional; older entries without them remain valid):

- `id` — `owner.name`, two lowercase kebab-case segments, unique in the
  file, matching your `extension.yaml`.
- `repo` — the `owner/name` GitHub repository, unique in the file, with at
  least one published release (Kaioken installs the release zipball).
- `name` / `description` — non-empty; the description is one honest
  sentence, not marketing.
- `type` — `declarative` (default), `mcp` or `wasm`.
- `tags` — max 5, lowercase kebab-case; powers filtering everywhere.
- `permissions` — wasm only, must equal the manifest's set exactly.
- `homepage` — optional `https://` URL.

Start from the template: <https://github.com/babtix/kaioken-extension-template>.
Review criteria live in [MODERATION.md](MODERATION.md).

## Extension tiers

- `declarative` — skills/documents only; never runs code.
- `mcp` — runs an MCP server subprocess, **unsandboxed**; users must trust
  the exact version before it ever launches.
- `wasm` — runs a sandboxed WASI module (no network, no filesystem beyond
  declared permissions); also requires explicit trust.

Executable tiers get extra scrutiny in review. Say clearly in your README
what the server or module does.

## Moderation flags

Entries may carry a `flags` array. `"malicious"` is the kill switch: every
Kaioken client refuses to install or browse a flagged extension, and update
checks refuse flagged versions. `"deprecated"` shows a warning but keeps
installs working. Report a malicious extension by opening an issue titled
`takedown: <id>`; the process is documented in
[MODERATION.md](MODERATION.md).

## Validation

CI runs on every pull request:

```
go test ./validate/       # the validator's own tests
go run ./validate         # structural rules
go run ./validate -deep   # + fetches every repo's latest release and
                          #   cross-checks its extension.yaml (id, type,
                          #   permissions) against the index entry
```

Structural rules: the JSON parses; ids and repos are unique and well-formed;
names and descriptions are present; types, tags, permissions, homepages and
flags obey the field reference above. This module is standalone — it is not
part of the Kaioken build.
