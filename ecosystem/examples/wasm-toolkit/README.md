# WASM Toolkit — example Kaioken extension

A minimal [Kaioken](https://github.com/babtix/kaioken) **wasm** extension: a
Go plugin compiled to a WASI module and executed inside Kaioken's wazero
sandbox.

| Tool | What it does |
|------|--------------|
| `word_count` | Counts words, lines and characters in a text argument. |
| `read_workspace_file` | Reads a text file from the user's repo — only works because the manifest declares `fs:read:workspace`. |

## How it works

`extension.yaml` declares the module and the one capability it needs:

```yaml
type: wasm
wasm:
  entry: dist/plugin.wasm
permissions:
  - fs:read:workspace   # mounts the user's repo read-only at /workspace
```

[`main.go`](./main.go) implements the one-shot stdio protocol: one JSON
request in, one JSON response out, fresh instantiation per call.

## Building

```
GOOS=wasip1 GOARCH=wasm go build -o dist/plugin.wasm .
```

**Commit `dist/plugin.wasm` before tagging a release.** Kaioken installs the
release *source zipball*, so the built module must be in the tree — this repo
intentionally has no `.gitignore` entry for `dist/`. The release workflow
rebuilds the module and fails if the committed artifact does not match, which
is what makes the build reproducible for reviewers.

## Sandbox and trust

The module runs with **no network, no environment, and no filesystem** except
the read-only `/workspace` mount its permission grants; memory is capped and
calls time out. Trust is still explicit and per-version
(`kaioken ext trust babtix.wasm-toolkit` shows the module and permissions),
because reading your repo is a grant worth an explicit yes.

## Try it locally

```
GOOS=wasip1 GOARCH=wasm go build -o dist/plugin.wasm .
kaioken ext validate .
kaioken ext dev .
kaioken ext trust babtix.wasm-toolkit
```
