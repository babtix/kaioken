# Developer guide: creating a Kaioken extension

A Kaioken extension is a GitHub repository with an `extension.yaml` at its
root. There is no build service and no upload step: Kaioken installs the
**source zipball of your GitHub release**, verifies it, and pins it in a
lockfile by version and archive hash.

The fastest start is the
[extension template](https://github.com/babtix/kaioken-extension-template) —
use it as a GitHub template, then edit.

## The manifest (`extension.yaml`)

```yaml
id: you.your-extension        # owner.name, lowercase kebab-case — required
name: Your Extension          # human-readable title — required
version: 0.1.0                # strict MAJOR.MINOR.PATCH — required
description: One honest sentence a user reads before installing.
author: you
repo: you/kaioken-your-extension
type: declarative             # declarative (default) | mcp | wasm
minKaiokenVersion: 0.1.0      # optional host pin
```

Field rules (enforced at install, by `kaioken ext validate`, and by the
submit wizard):

| Field | Rule |
|-------|------|
| `id` | `owner.name`: two lowercase kebab-case segments. It becomes the install directory name and must be unique in the registry. |
| `version` | Strict three-part semver, no pre-release tags. Must match your release tag (`v0.1.0` or `0.1.0`). |
| `type` | `declarative` (or empty), `mcp`, or `wasm`. Anything else refuses to install. |
| `permissions` | wasm only; every entry must be a capability the host knows (`fs:read:workspace`). Unknown permissions fail installation — never silently ungranted. |

## Tier 1: declarative — skills

The code-free tier. Every `skills/<name>/SKILL.md` directory in your repo is
a skill the agent loads across all repositories:

```markdown
---
name: git-flow
description: Use when creating branches or merging in a git-flow repository.
---

# Git flow

1. Which files to touch, in what order…
```

The frontmatter `description` is what the agent matches on — make it say
plainly *when* to load the skill. Declarative extensions never execute
anything, but their text does enter the agent's context; write it like the
prompt material it is.

## Tier 2: mcp — a tool server process

Declare a [Model Context Protocol](https://modelcontextprotocol.io) server
Kaioken runs as a child process (stdio transport, newline-delimited JSON-RPC
2.0, protocol `2024-11-05`):

```yaml
type: mcp
mcp:
  command: node          # PATH lookup, or a relative path inside the package
  args: [server.js]
  env: { LOG_LEVEL: info }   # optional, appended to the inherited env
```

Your server must answer `initialize`, `tools/list` and `tools/call`. See the
[mcp-echo example](https://github.com/babtix/kaioken-example-mcp) for a
complete dependency-free server in ~90 lines.

What the host guarantees users, and therefore expects of you:

- The server runs **unsandboxed** — installation is inert until the user
  trusts your exact version, and the trust prompt shows your exact command line.
- Every tool call passes Kaioken's approval prompt.
- Updates revoke trust automatically.
- Document in your README exactly what the command runs; reviewers read it.

An mcp extension may also ship `skills/` — contributions are unified.

## Tier 3: wasm — a sandboxed plugin

Ship a WASI command module; Kaioken executes it under
[wazero](https://wazero.io) with **no network, no environment, no
filesystem** beyond declared permissions, a memory cap, and enforced
timeouts:

```yaml
type: wasm
wasm:
  entry: dist/plugin.wasm     # relative, inside the package
permissions:
  - fs:read:workspace         # mounts the user's repo read-only at /workspace
```

The ABI is one-shot stdio: each call instantiates your module fresh, writes
one JSON request to stdin, reads one JSON response from stdout.

```json
→ {"method":"list_tools"}
← {"tools":[{"name":"echo","description":"…","inputSchema":{…}}]}
→ {"method":"call_tool","name":"echo","arguments":{…},"workspace":"/workspace"}
← {"content":"text result","isError":false}
```

Build from Go with `GOOS=wasip1 GOARCH=wasm go build -o dist/plugin.wasm .`
(TinyGo and Rust work the same way). **Commit the built `.wasm`** — Kaioken
installs the source zipball, so the artifact must be in the tree. See the
[wasm-toolkit example](https://github.com/babtix/kaioken-example-wasm).

## The dev loop

```
kaioken ext validate .     # lint manifest + skills, before anything else
kaioken ext dev .          # install this working tree (no release needed)
kaioken ext trust <id>     # mcp/wasm only — shows exactly what would run
```

Re-run `ext dev .` after editing to refresh. `ext update` deliberately skips
dev installs — they have no upstream.

Next: [Packaging & publishing](/docs/packaging-publishing).
