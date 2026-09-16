# M11-02 · PR-triggered incremental update

> Trigger scoped documentation updates from pull request diffs, regenerating only the specific chapters and cards invalidated by changed files rather than paying for full repository regeneration.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [M1-01](../m01-green-everywhere/01-retarget-ci-workflow.md), `packages/provenance`, `packages/impact`, `apps/cli/src/commands/update.ts` |
| **Blocks** | `03-pr-review-bot.md` |
| **Touches** | `kaioken_v2/packages/provenance/`, `kaioken_v2/packages/impact/`, `kaioken_v2/apps/cli/src/commands/update.ts` |
| **Risk** | Medium. Over-eager invalidation burns LLM tokens and delays PR checks; under-eager invalidation leaves documentation drifted. |
| **Gate-critical** | No |

## Why this exists

Regenerating an entire repository wiki (`kaioken wiki x3`) on every pull request is economically and computationally impossible: for a multi-thousand-file repository, full generation takes minutes to hours and consumes millions of tokens.

A continuous integration workflow requires **surgical incrementality**: when a PR modifies three files in a specific module, only the module card describing that boundary and the wiki chapter detailing those files should be refreshed.

Kaioken already contains the machinery to accomplish this:
1. `packages/provenance` (`computeStaleness` in [`staleness.ts:15`](file:///D:/project/ai_now_know/kaioken_v2/packages/provenance/src/staleness.ts#L15)) deterministically identifies which generated cards and chapters have had their recorded source file hashes invalidated.
2. `packages/impact` (`predict` in [`predict.ts:24`](file:///D:/project/ai_now_know/kaioken_v2/packages/impact/src/predict.ts#L24)) predicts which modules and documentation chapters are affected by changes to specific declarations.
3. `kaioken update` ([`update.ts:35`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/commands/update.ts#L35)) already selectively invokes the model only for stale or orphaned items.

Crucially, **`impact` is DOCUMENTATION impact only, not a call graph.** As documented in gap **G-2** ([README §6](../README.md#6-known-gaps-in-v2--documented-not-scheduled)), Kaioken has no reference index to build a semantic call graph from; it matches declarations to mentions and documentation pages. Attempting to treat `impact` as an AST caller/callee analyzer will lead to confident, incorrect assertions. Scoping PR updates must strictly operate within documentation boundaries.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Staleness derivation derives changed and deleted files | `kaioken_v2/packages/provenance/src/staleness.ts:15` (`computeStaleness`) |
| Impact analysis predicts affected documentation | `kaioken_v2/packages/impact/src/predict.ts:24` (`ImpactReport` contains `modules` and `documents`) |
| Impact is explicitly documentation impact only | `roadmap/README.md:322` (gap G-2: "impact reports documentation impact only... there is no reference index to build a call graph from") |
| Update command runs deterministic hash check before invoking model | `kaioken_v2/apps/cli/src/commands/update.ts:53` (`const report = computeStaleness(records, scanResult)`) |
| Update generates only affected cards and chapters | `kaioken_v2/apps/cli/src/commands/update.ts:54` (`const affected = [...report.stale, ...report.orphaned]`) |

`UNVERIFIED:` The token cost savings of PR-scoped updates versus full regeneration across diverse repository sizes.

## What done looks like

- [ ] A dedicated PR update mode is added to `kaioken update` (e.g. `kaioken update --pr-diff <base-ref>`) that derives the file change list directly from git.
- [ ] The command accepts git revision ranges (e.g. `origin/main...HEAD`) and scopes scan comparisons to the modified paths.
- [ ] `packages/impact` identifies which cards (`.kaioken/cards/*.json`) and chapters (`.kaioken/wiki/*.md`) reference the modified paths.
- [ ] If no documentation is impacted, the command exits immediately with code 0 and logs `"No documentation impacted by PR diff — skipping generation"`.
- [ ] If documentation is impacted, only the affected cards and chapters are rewritten, committing updated artifacts to the PR branch or publishing preview artifacts.
- [ ] Unit and integration tests verify that modifying a single file in a subpackage regenerates exactly one card/chapter, leaving unrelated documentation files untouched.

## Steps

1. **Add PR Diff Scope Detection.**
   - In `kaioken_v2/packages/gitops/src/`, add `getChangedFiles(root: string, baseRef: string): Promise<string[]>`.
   - Wire this into `apps/cli/src/commands/update.ts` via an optional `--base <ref>` flag.
2. **Integrate with `packages/impact`.**
   - In `update.ts`, when a base ref is provided, filter the scan or run `predict()` to find the blast radius of the changed files.
   - Combine the hash-based staleness from `packages/provenance` with the documentation dependencies from `packages/impact`.
3. **Execute Targeted Regeneration.**
   - Pass only the impacted module IDs to `generateCards()` and impacted chapter IDs to `generateDocument()`.
   - Verify that unrelated documentation files retain their previous hashes and timestamps.
4. **Wire GitHub Action PR Step.**
   - In `action.yml` (from M11-01), expose a workflow step that runs `kaioken update --base origin/${{ github.base_ref }}` on pull request events.
5. **Add Safety Gate for Uncommitted PR Code.**
   - Ensure the process does not attempt to push commits without explicit credentials, outputting artifacts to a PR preview directory if git push permissions are absent.

## In scope

- Git diff change extraction in `kaioken_v2/packages/gitops/`.
- Scoped update execution in `kaioken_v2/apps/cli/src/commands/update.ts`.
- Documentation impact coordination with `packages/impact`.
- Vitest unit tests verifying minimal regeneration.

## Out of scope

- Building an AST reference index or call graph — gap G-2 remains deferred.
- Persistent database storage for PR runs — all operations run ephemerally in the CI runner.
- Generating new modules from scratch — that belongs to `kaioken plan`.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Test update scoping against a local branch:

```bash
node apps/cli/dist/bin.js update --help
```

## Traps

| Trap | Guard |
|---|---|
| Assuming `impact` can trace caller hierarchies | Respect gap G-2: `impact` is documentation impact, not a call graph. Only use it to find affected documentation, not to guarantee semantic blast radius. |
| Regenerating unchanged modules | If a PR only modifies `packages/scan`, never invoke LLM generation for `packages/model` or unrelated chapters. Verify touched artifact count. |
| Failing when no base branch is fetched | Shallow clones (`fetch-depth: 1` in `actions/checkout`) lack base commit history. The action documentation must specify `fetch-depth: 0`. |
| Burning tokens in failed CI runs | Run tests and linting BEFORE running the generative update step in CI. Never regenerate docs on code that fails typechecking. |
| Commercial licensing collision | License Zero Noncommercial 2.0.1 prevents commercial teams from using this PR update workflow. Flag this in documentation. |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement PR-triggered incremental documentation updates scoped to a git diff.

Full wiki regeneration in CI is cost-prohibitive. This task scopes "kaioken update" so that it identifies the files changed in a pull request, resolves which documentation chapters and module cards are affected using packages/provenance and packages/impact, and regenerates ONLY those invalidated documents.

1. In kaioken_v2/packages/gitops/, implement gitDiffFiles(root: string, baseRef: string): Promise<string[]> returning the relative paths changed between baseRef and HEAD.
2. In kaioken_v2/apps/cli/src/commands/update.ts, add a "--base <ref>" flag:
   - If "--base" is passed, get changed files.
   - Use computeStaleness (packages/provenance/src/staleness.ts:15) to identify invalidated recorded hashes.
   - Consult packages/impact/src/predict.ts:24 to locate affected module cards and wiki chapters. NOTE: impact is DOCUMENTATION impact only, NOT a call graph (respect gap G-2).
   - Filter the regeneration target list to only those documents.
   - If no documents are affected, log "Everything current for this PR diff" and exit 0 without calling any model API.
3. If documents are affected, regenerate only the stale cards and chapters, updating their provenance records.
4. Write vitest unit tests in kaioken_v2/apps/cli/test/update-scoped.test.ts verifying that changes to a single file trigger regeneration only for its corresponding card/chapter.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Ensure that all existing tests in packages/provenance, packages/impact, and apps/cli continue to pass.
</verification_loop>

<missing_context_gating>
Do not try to build a code call graph. Respect gap G-2: impact predicts documentation and module card blast radius only.
Read packages/provenance/src/staleness.ts for computeStaleness and apps/cli/src/commands/update.ts for existing update logic.
</missing_context_gating>

<action_safety>
Scope strictly to gitops, update command, and associated tests. Do not touch unrelated CLI commands.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of diff-scoped update implementation, (2) files touched, (3) test suite output and counts, (4) how gap G-2 boundaries were maintained.
</structured_output_contract>
```
