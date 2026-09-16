# M6-02 · Implement versioned wiki snapshots

> Create git-trackable wiki generation snapshots and diffing utilities so documentation evolution across runs and commits is auditable, comparable, and reviewable.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-audit-what-shipped` |
| **Blocks** | M11 (PR review bot and team steering notes) |
| **Touches** | `packages/wiki/src/snapshot.ts`, `packages/wiki/src/artifact.ts`, `apps/cli/src/commands/wiki.ts` |
| **Risk** | Low: operates beside existing wiki storage without disturbing current in-place reads |
| **Gate-critical** | No |

## Why this exists

Currently, Kaioken writes generated markdown documentation directly into `.kaioken/wiki/` (`packages/wiki/src/artifact.ts:144`). Because `.kaioken/` is listed in `.gitignore` (`kaioken_v2/.gitignore:4`), every documentation regeneration silently overwrites the previous version in place.

This creates three critical problems:
1. **No diff on review**: A human cannot review what changed in the documentation following an incremental update or refactor — there is no prior version to diff against.
2. **No Git tracking**: Documentation cannot be committed alongside code changes to preserve a permanent record of how architectural understanding evolved over time.
3. **No rollback**: If a hallucinated or degraded chapter is generated, reverting it requires re-running expensive LLM generation rather than checking out the previous snapshot.

This leaf is **genuinely open**. It implements snapshot management in `packages/wiki`, allowing generations to be preserved, exported to a git-trackable directory (e.g. `docs/wiki/` or `.kaioken/snapshots/`), and compared with unified diffs.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Wiki writes to a single in-place directory | `packages/wiki/src/artifact.ts:16, 144` writes directly to `.kaioken/wiki/<doc.path>` |
| `.kaioken/` is excluded from git tracking | `kaioken_v2/.gitignore:4` ignores `.kaioken/` |
| Provenance artifact stores only current state | `packages/wiki/src/artifact.ts:17` records current hashes in `provenance.json`; historical records are discarded |
| Public feature board promises versioned wiki with diffs | `website/src/data/roadmap.ts` / [README §5.05](../README.md#05-knowledge-management) lists "Versioned wiki with diffs: Git-trackable generations so doc evolution is comparable" as an open item |

## What done looks like

- [ ] `packages/wiki/src/snapshot.ts` implements snapshot creation, listing, and diffing:
  ```ts
  export interface WikiSnapshot {
    id: string; // ISO timestamp or user label
    commitSha?: string;
    generatedAt: string;
    multiplier: number;
    documents: Array<{ path: string; hash: string }>;
  }
  ```
- [ ] Running `kaioken wiki --snapshot [name]` or `kaioken update --snapshot` archives the current wiki state to `.kaioken/snapshots/<snapshot-id>/` before writing fresh documents.
- [ ] A new CLI command `kaioken wiki diff [snapshotA] [snapshotB] [docPath]` produces unified markdown diffs showing how chapters evolved between generations.
- [ ] A sync option `kaioken wiki --track [dir]` (defaulting to `docs/wiki/`) copies the active generation into a git-tracked directory with clean relative links, ready for `git commit`.
- [ ] Unit tests in `packages/wiki/test/snapshot.test.ts` verify snapshot creation, rotation (keeping last N snapshots), and unified diff generation.

## Steps

1. **Build Snapshot Storage & Manifest in `packages/wiki/src/snapshot.ts`**:
   - Define `SNAPSHOTS_DIR = join(KAIOKEN_DIR, "snapshots")`.
   - Implement `createSnapshot(root: string, label?: string): Promise<WikiSnapshot>`:
     - Reads all documents in `.kaioken/wiki/`.
     - Inspects current git HEAD SHA via simple child process or `gitops`.
     - Copies current `.kaioken/wiki/` into `.kaioken/snapshots/<id>/`.
     - Writes `manifest.json` recording document hashes, timestamp, and git SHA.
   - Implement `listSnapshots(root: string): Promise<WikiSnapshot[]>`.

2. **Implement Markdown Diff Engine**:
   - Implement `diffSnapshots(root: string, fromId: string, toId: string, docPath?: string): Promise<string>`:
     - Uses standard LCS (Longest Common Subsequence) diffing to compute line additions and deletions.
     - Formats output as GitHub-flavored markdown diffs (`+` green, `-` red) or unified diff text.

3. **Add Git-Tracking Sync**:
   - Implement `exportTrackedWiki(root: string, targetDir: string): Promise<number>`:
     - Copies current `.kaioken/wiki/` into a version-controlled folder (e.g. `docs/wiki/`).
     - Rewrites any internal `.kaioken/` paths to relative markdown links.

4. **Integrate CLI Flags**:
   - In `apps/cli/src/commands/wiki.ts`:
     - Add `--snapshot [label]` flag to `wiki` and `update` commands.
     - Add `diff` subcommand: `kaioken wiki diff [options]`.
     - Add `snapshots` subcommand: `kaioken wiki snapshots` to list available generations.

5. **Write Unit Tests**:
   - In `packages/wiki/test/snapshot.test.ts`: test snapshot archiving, diff generation between two states, and git-export mirroring.

## In scope

- `packages/wiki/src/snapshot.ts`
- `packages/wiki/src/artifact.ts`
- `packages/wiki/src/index.ts`
- `packages/wiki/test/snapshot.test.ts`
- `apps/cli/src/commands/wiki.ts`

## Out of scope

- Direct git commit manipulation (operating rule: the human commits).
- Changing prompt templates or LLM generation logic in `packages/wiki/src/generate.ts`.
- WYSIWYG wiki editing (refused non-goal in README §7).

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js wiki snapshots
```

Working tree must show only modified files in `packages/wiki` and `apps/cli`.

## Traps

| Trap | Guard |
|---|---|
| Storing snapshots only inside `.kaioken/` | `.kaioken/` is gitignored; always provide the `--track <dir>` option so snapshots can live in git-tracked trees |
| Unlimited snapshot disk consumption | Implement rotation pruning: retain the last 10 snapshots by default unless a snapshot is pinned with a label |
| Diffing entire directory trees without document filtering | Support filtering diffs by single chapter/path so humans can review targeted changes in one sitting |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement versioned wiki snapshots and diffing in packages/wiki and apps/cli.

Current state:
- packages/wiki/src/artifact.ts:144 writes wiki documents directly to `.kaioken/wiki/<path>`.
- .kaioken/ is gitignored in kaioken_v2/.gitignore.
- Every generation overwrites previous documentation in place; there is no historical tracking,
  diffing, or rollback mechanism.

Required changes:
1. In packages/wiki/src/snapshot.ts:
   - Implement `createSnapshot(root: string, label?: string): Promise<WikiSnapshot>`: archives
     current `.kaioken/wiki/` into `.kaioken/snapshots/<id>/` with a `manifest.json`.
   - Implement `listSnapshots(root: string): Promise<WikiSnapshot[]>`.
   - Implement `diffSnapshots(root: string, fromId: string, toId: string, docPath?: string): Promise<string>`.
   - Implement `exportTrackedWiki(root: string, targetDir: string): Promise<string[]>`.
   - Export these from packages/wiki/src/index.ts.
2. In apps/cli/src/commands/wiki.ts:
   - Add `--snapshot` flag to create a snapshot before or after generation.
   - Add `kaioken wiki diff` subcommand to render unified diffs between snapshots.
   - Add `kaioken wiki snapshots` to list historical generations.
   - Add `kaioken wiki track <dir>` to sync active documentation to a git-trackable path.
3. Add unit tests in packages/wiki/test/snapshot.test.ts.

Do NOT alter the core chapter generation prompt or LLM orchestration.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified files in packages/wiki and apps/cli.
</verification_loop>

<action_safety>
Scope strictly to snapshotting and diffing utilities. Do NOT touch LLM generation logic
in packages/wiki/src/generate.ts.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) details of snapshot manifest schema, (2) files touched, (3) CLI diff examples,
(4) test suite results from vitest.
</structured_output_contract>
```
