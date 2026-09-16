# GAP-06 · CI workflow is dead (pointer to M1-01)

> Every CI job points at `kaioken v1/`, a directory that no longer exists, causing all jobs to fail
> before running a test. This gap is actively resolved by leaf M1-01.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `roadmap/m01-green-everywhere/06-land-in-flight-work.md` |
| **Blocks** | Every milestone in the repository, via operating rule 2 |
| **Touches** | `.github/workflows/ci.yml` |
| **Risk** | Low |
| **Gate-critical** | **Yes — P0 gate for the entire roadmap** |

## Why this exists

Quoted directly from [`roadmap/README.md:326`](../README.md#L326):

> *CI is dead. All four jobs (`go-test`, `frontend`, `clippy`, `tauri-build`) set `working-directory`
> to `kaioken v1/…`, a path that no longer exists. Fallout from archiving v1. Small and urgent — the
> M1 gate cannot exist until this is retargeted at `kaioken_v2`.*

This pointer file exists so that the known gaps inventory is complete and nobody concludes that gap
G-6 was overlooked or dropped.

## The resolution: Leaf M1-01

The complete technical specification, step-by-step implementation guide, and session brief for fixing
this gap already exist in:

👉 **[`roadmap/m01-green-everywhere/01-retarget-ci-workflow.md`](../m01-green-everywhere/01-retarget-ci-workflow.md)**

Do **not** duplicate that content here. Execute leaf M1-01 to retarget `.github/workflows/ci.yml`
at `kaioken_v2` and close this gap.

## Current state

Verified against [`.github/workflows/ci.yml:10-81`](../../.github/workflows/ci.yml#L10-L81):

| Fact | Evidence |
|---|---|
| All four jobs dead | `.github/workflows/ci.yml` lines 21, 39, 75, 104 reference `kaioken v1/` |
| Directory missing | `kaioken v1/` was archived to `.kaioken_v1/` by commit `e46fe1b5` and is out of tracking |
| Target fix | Rebuild CI workflow around Node 22, `npm ci`, `npm run typecheck`, and `npm test` |

## What done looks like

- [ ] Execute [`roadmap/m01-green-everywhere/01-retarget-ci-workflow.md`](../m01-green-everywhere/01-retarget-ci-workflow.md).
- [ ] GitHub Actions runs against `kaioken_v2` and reports green on commits to `master`.

## Steps

Refer to [`roadmap/m01-green-everywhere/01-retarget-ci-workflow.md`](../m01-green-everywhere/01-retarget-ci-workflow.md) §Steps.

## In scope

- `.github/workflows/ci.yml` (handled in M1-01).

## Out of scope

- All other files (handled in M1-01).

## Gates

From repo root:

```bash
cd kaioken_v2 && npm ci && npm run typecheck && npm test
node apps/cli/dist/bin.js scan --root .
```

## Traps

See [`roadmap/m01-green-everywhere/01-retarget-ci-workflow.md`](../m01-green-everywhere/01-retarget-ci-workflow.md) §Traps.

## Open questions

None. Fully specified in M1-01.

## Session brief

```xml
<task>
This file is a pointer to roadmap/m01-green-everywhere/01-retarget-ci-workflow.md.
Do NOT execute work from this file. Open and execute 01-retarget-ci-workflow.md directly.
</task>

<verification_loop>
Refer to roadmap/m01-green-everywhere/01-retarget-ci-workflow.md.
</verification_loop>

<action_safety>
Refer to roadmap/m01-green-everywhere/01-retarget-ci-workflow.md.
</action_safety>

<structured_output_contract>
Refer to roadmap/m01-green-everywhere/01-retarget-ci-workflow.md.
</structured_output_contract>
```
