# M6-01 · Audit and benchmark incremental updates

> Measure and verify the core incremental claim: prove that modifying a single file triggers an update run completing in seconds with single-digit API calls, for both cards and wiki chapters.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | M1 (`01-retarget-ci-workflow` for CI baseline) |
| **Blocks** | `02-versioned-wiki-snapshots`, `03-custom-card-schemas`, `04-export-target-coverage` |
| **Touches** | `packages/provenance/test/benchmark.test.ts`, `packages/provenance/BENCHMARK.md` |
| **Risk** | Low technical risk, high evidential value: turns an unverified marketing claim into an automated benchmark |
| **Gate-critical** | **Yes** |

## Why this exists

The original definition of "done" for milestone M6 was: *"One-file change → seconds, single-digit API calls."* The TypeScript rewrite shipped the machinery to satisfy this claim:
- `packages/provenance/src/staleness.ts:15` computes which documents moved by comparing recorded SHA-256 hashes against a fresh scan.
- `apps/cli/src/commands/update.ts:98, 127` filters card and wiki generation to only the specific stale targets (`only: live` for cards, and one-by-one generation for `staleDocs`).

However, this performance claim has never been formally measured or recorded. In an agent-driven development environment, claiming that incrementality is "fast" without an automated benchmark risks silent regressions: an innocent change to provenance gathering could inadvertently mark every document stale, causing silent full regenerations and high API costs. This leaf builds an automated benchmark harness that measures wall-clock time and API call counts under controlled single-file changes, recording the authoritative numbers in `packages/provenance/BENCHMARK.md`.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Staleness computation is deterministic and offline | `packages/provenance/src/staleness.ts:15` `computeStaleness()` runs in milliseconds with zero network calls |
| Card updates are scoped to stale modules | `apps/cli/src/commands/update.ts:98` passes `only: live` to `generateCards()`, skipping fresh modules |
| Wiki updates iterate strictly over stale documents | `apps/cli/src/commands/update.ts:127` iterates only over `staleDocs`, skipping unaffected chapters |
| Dry-run reports planned work without model calls | `apps/cli/src/commands/update.ts:63` returns planned regenerations immediately when `--dry-run` is passed |
| Zero API calls when repo is fresh | `apps/cli/src/commands/update.ts:56` exits immediately with 0 if `affected.length === 0` |
| No automated benchmark exists | Grep across `packages/provenance/test/` shows unit tests for hash comparison, but no timed update benchmark |

## What done looks like

- [ ] An automated benchmark test is implemented at `packages/provenance/test/benchmark.test.ts`.
- [ ] The test constructs a synthetic multi-module repository with 5 modules, 15 files, 5 cards, and 5 wiki documents.
- [ ] An instrumented `MockModelClient` records the exact count of API calls dispatched during generation.
- [ ] Modifying a single file owned by Module 1:
  - Triggers `computeStaleness()`, which identifies exactly 1 stale card and 1 stale wiki chapter.
  - Triggers `runUpdate()`, which dispatches **≤ 2 model calls** (1 for the card, 1 for the chapter) — satisfying the "single-digit API calls" condition.
  - Completes in **< 3 seconds** of local computation (excluding model network latency).
- [ ] Running `runUpdate()` on an unchanged repo dispatches **0 model calls** and completes in < 50ms.
- [ ] Authoritative measurements are committed in `packages/provenance/BENCHMARK.md`.

## Steps

1. **Build the Benchmark Harness in `packages/provenance/test/benchmark.test.ts`**:
   - Create a synthetic repository fixture using `mkdtemp`:
     - 5 modules: `auth`, `data`, `api`, `utils`, `cli`.
     - 3 files per module with known content hashes.
     - 5 pre-generated cards in `.kaioken/cards/` with recorded `sources`.
     - 5 pre-generated wiki chapters in `.kaioken/wiki/` with recorded provenance in `.kaioken/provenance.json`.
   - Implement `CountingModelClient`: wraps model dispatch and counts every prompt call.

2. **Benchmark Unchanged State**:
   - Run `computeStaleness()` and `update` logic against the clean repository.
   - Assert: `affected.length === 0`.
   - Assert: API call count = 0.
   - Assert: wall-clock duration < 50ms.

3. **Benchmark Single-File Mutation**:
   - Append a line to a single source file in module `auth`.
   - Re-scan and execute update logic.
   - Assert: `staleCards` has exactly `['auth']`.
   - Assert: `staleDocs` has exactly `['auth.md']`.
   - Assert: Total model calls dispatched = 2 (single-digit).
   - Assert: Total local computation time < 3 seconds.

4. **Document Authoritative Baseline**:
   - Write `packages/provenance/BENCHMARK.md`:
     - Methodology and test repository topology.
     - Exact API call counts (unchanged vs 1-file change vs full regeneration).
     - Execution timing breakdown (scan, hash diffing, AST extraction).
     - Confirmation of the M6 done-condition.

## In scope

- `packages/provenance/test/benchmark.test.ts`
- `packages/provenance/BENCHMARK.md`

## Out of scope

- Modifying `packages/provenance/src/staleness.ts` algorithms.
- Changing `apps/cli/src/commands/update.ts` logic.
- Adding versioned snapshots (that is leaf `02`).

## Gates

From `kaioken_v2/`:

```bash
npm run build
npx vitest run packages/provenance/test/benchmark.test.ts
npm test
npm run typecheck
```

Working tree must show only new benchmark files in `packages/provenance`.

## Traps

| Trap | Guard |
|---|---|
| Relying on live LLM APIs for the benchmark | The benchmark must use an instrumented `CountingModelClient` to measure call counts deterministically offline |
| Flaky timing on slow CI machines | Measure local processing time (scanning, hashing, routing) separately from simulated LLM turnaround |
| Overlooking AGENTS.md refresh | Ensure `refreshKnowledgeBlock()` is accounted for in the update lifecycle |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Benchmark and prove the incremental update performance claim: a single-file change triggers
an update run completing in seconds and single-digit API calls, for cards and wiki.

Current state:
- packages/provenance/src/staleness.ts:15 implements computeStaleness().
- apps/cli/src/commands/update.ts:35 implements runUpdate(), scoping generation to stale targets.
- The claim has never been measured or verified in an automated test.

Required changes:
1. Create packages/provenance/test/benchmark.test.ts:
   - Set up a synthetic multi-module repository with 5 modules, 15 files, 5 cards, and 5 wiki docs.
   - Implement CountingModelClient to track model invocations.
   - Test 1 (clean repo): assert 0 model calls and <50ms elapsed time.
   - Test 2 (1-file change in 1 module): assert exactly 1 stale card and 1 stale wiki chapter detected,
     assert total model invocations <= 2, assert local computation completes in <3s.
2. Create packages/provenance/BENCHMARK.md:
   - Record test methodology, topology, exact API call counts, and execution timings.
   - Formally sign off on the M6 done-condition.

Do NOT modify the staleness computation or update logic.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npx vitest run packages/provenance/test/benchmark.test.ts
  npm test
  npm run typecheck
Confirm working tree shows only new files in packages/provenance.
</verification_loop>

<action_safety>
Scope strictly to packages/provenance/test/benchmark.test.ts and packages/provenance/BENCHMARK.md.
Do NOT modify runtime engine code in packages/provenance/src/ or apps/cli/src/commands/update.ts.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) measured API call counts for clean vs 1-file modified states, (2) timing figures
for scan and staleness computation, (3) files added, (4) confirmation of vitest pass.
</structured_output_contract>
```
