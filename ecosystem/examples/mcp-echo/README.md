# MCP Echo — example Kaioken extension

A minimal [Kaioken](https://github.com/babtix/kaioken) **mcp** extension: a
dependency-free Node stdio server that contributes two tools to the agent.

| Tool | What it does |
|------|--------------|
| `echo` | Returns the `text` argument prefixed with `echo:`. |
| `now`  | Returns the current UTC time (ISO 8601). |

## How it works

`extension.yaml` declares `type: mcp` and the command Kaioken runs:

```yaml
type: mcp
mcp:
  command: node
  args: [server.js]
```

[`server.js`](./server.js) speaks newline-delimited JSON-RPC 2.0 over stdio
(MCP protocol `2024-11-05`): `initialize`, `tools/list`, `tools/call`. It has
no dependencies, so there is no build or install step.

## Trust and safety

An mcp server runs **unsandboxed** on the user's machine. Kaioken installs it
inert: nothing runs until the user explicitly trusts the exact installed
version (`kaioken ext trust babtix.mcp-echo`), the trust prompt shows the
exact command line, and every tool call still goes through the normal
approval prompt. Updating the extension revokes trust until re-granted.

## Try it locally

```
kaioken ext validate .
kaioken ext dev .
kaioken ext trust babtix.mcp-echo
```

## Publishing

Tag a release whose tag matches `version:` in `extension.yaml`; Kaioken
installs the source zipball. See the
[developer guide](https://github.com/babtix/kaioken) for the full flow.
