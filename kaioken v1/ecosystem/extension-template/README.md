# Kaioken Extension Template

The starting point for building a [Kaioken](https://github.com/babtix/kaioken)
extension. Full guides — manifest reference, all three tiers, packaging and
submission — live at <https://extensions.kaioken.dev/docs>. Use this
repository as a GitHub template, then:

1. Edit `extension.yaml` — set your `id` (`owner.name`, lowercase
   kebab-case), `name`, `version`, `repo`.
2. Replace `skills/hello-world/` with skills your extension actually
   contributes. One directory per skill, each holding a `SKILL.md` whose
   frontmatter `description` states when an agent should load it.

## Dev loop

Work against your local tree without publishing anything:

```
kaioken ext validate          # lint the manifest and skills
kaioken ext dev .             # install this working tree
```

Re-run `kaioken ext dev .` after editing to refresh. Kaioken's agent picks
the skills up immediately in every repository.

## Publishing

1. Bump `version:` in `extension.yaml` (strict `MAJOR.MINOR.PATCH`).
2. Tag and push: `git tag v0.1.0 && git push --tags`.
3. The release workflow checks the tag matches the manifest and publishes a
   GitHub release — that release is what `kaioken ext install owner/repo`
   downloads (the source zipball; no build artifacts needed for declarative
   extensions).
4. List it for discovery: the submit wizard at
   <https://extensions.kaioken.dev/submit> validates your repo and preps the
   PR into [kaioken-extensions](https://github.com/babtix/kaioken-extensions).

Users pin by version with `owner/repo@0.1.0`; updates never happen silently
on their machines.

## Going beyond skills

**MCP tier** — contribute live tools by declaring a server process
(runs unsandboxed; users must trust each version explicitly):

```yaml
type: mcp
mcp:
  command: node
  args: [server.js]
```

**WASM tier** — contribute sandboxed tools: no network, no filesystem
beyond declared permissions, memory-capped:

```yaml
type: wasm
wasm:
  entry: dist/plugin.wasm
permissions:
  - fs:read:workspace   # optional: mounts the user's repo read-only at /workspace
```

Build the module from Go with:

```
GOOS=wasip1 GOARCH=wasm go build -o dist/plugin.wasm .
```

The plugin is a WASI command speaking one-shot JSON on stdio:
`{"method":"list_tools"}` in, `{"tools":[…]}` out;
`{"method":"call_tool","name":…,"arguments":{…}}` in,
`{"content":"…","isError":false}` out. TinyGo and Rust work the same way.
