# Listing a new extension

- **id**: `` `owner.name` ``
- **repo**: `owner/repo`
- **type**: declarative / mcp / wasm

## Author checklist

- [ ] `kaioken ext validate` passes against the repository root
- [ ] A GitHub release is tagged and its tag matches `version:` in `extension.yaml`
- [ ] The index entry's `id` and `type` match `extension.yaml` exactly
- [ ] For `wasm`: the entry's `permissions` list every permission the manifest declares — no more, no less
- [ ] For `mcp`: the README documents what the server command runs and why (reviewers read it — mcp servers run unsandboxed on users' machines)
- [ ] `description` is one honest sentence a user reads before installing
- [ ] Tags (max 5) are lowercase kebab-case and actually descriptive

CI runs the structural checks plus a deep check that downloads your latest
release and compares its `extension.yaml` against this entry. A mismatch
blocks the merge.

By submitting, you confirm you own or maintain the listed repository and
accept the review criteria in [MODERATION.md](../MODERATION.md).
