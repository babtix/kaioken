# M1-01 · Retarget the CI workflow at kaioken_v2

> Every CI job points at `kaioken v1/`, a directory that no longer exists, so all four fail before
> running a test. Delete the Go, Rust and Tauri jobs and rebuild the workflow around the TypeScript
> engine.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `06-land-in-flight-work` (land or revert the dirty tree first, or the first green run is meaningless) |
| **Blocks** | Every milestone in the tree, via operating rule 2 |
| **Touches** | `.github/workflows/ci.yml` only |
| **Risk** | Low. Nothing depends on the current workflow because it cannot succeed |
| **Gate-critical** | **Yes — this is P0 for the whole roadmap** |

## Why this exists

Operating rule 2: *a green build is a precondition, not a milestone.* In a fully vibe-coded project
that rule is the only thing standing between one bad session and a week of an agent "fixing" code
that was never broken — an agent handed a red build cannot tell your breakage from the pre-existing
kind, so it repairs both, and the second kind was imaginary.

The rule presently has nothing enforcing it. Commit `e46fe1b5` archived the Go implementation to
`.kaioken_v1/`, but the workflow was never retargeted, so CI has been failing at
`working-directory:` on every push since. This is recorded as gap **G-6** in
[README §6](../README.md#6-known-gaps-in-v2--documented-not-scheduled).

Until this leaf lands, no other leaf can honestly claim a gate.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| The workflow has four jobs | `.github/workflows/ci.yml:10` `go-test`, `:29` `frontend`, `:52` `clippy`, `:81` `tauri-build` |
| Every job sets `working-directory` under `kaioken v1/` | `ci.yml` lines 21, 26, 39, 46, 49, 75, 78, 104, 107, 110 |
| That directory does not exist | `ls -d "kaioken v1"` fails. v1 now lives at `.kaioken_v1/` and is out of tracking |
| The path was introduced, then invalidated | `ccebff63` moved content into `kaioken v1/`; `e46fe1b5` archived it out |
| The engine is a Node workspace | `kaioken_v2/package.json` — `workspaces: ["packages/*", "apps/*"]`, `engines.node: ">=22"` |
| Real scripts | `build`: `tsc --build && node packages/index/scripts/copy-queries.mjs` · `typecheck`: `tsc --build --force` · `test`: `npm run build && vitest run` |
| `release.yaml` is also dead | `.github/workflows/release.yaml:16` is a `goreleaser` job with `setup-go`. It belongs to M2 and is **out of scope here** |

`UNVERIFIED:` whether `kaioken_v2` currently passes its own gates on a clean checkout. Establishing
that is part of this leaf — see step 1.

## What done looks like

- [ ] `.github/workflows/ci.yml` contains no reference to `kaioken v1`, Go, Cargo, Clippy, or Tauri.
- [ ] The workflow runs `npm ci`, `npm run typecheck`, and `npm test` in `kaioken_v2/`.
- [ ] It pins Node 22 via `actions/setup-node` with npm caching keyed on
      `kaioken_v2/package-lock.json`.
- [ ] A CLI smoke step runs `node apps/cli/dist/bin.js scan --root .` and exits 0 — proving the
      offline path works without credentials.
- [ ] The job runs on `ubuntu-latest` **only** in this leaf; the three-OS matrix is `02`.
- [ ] Every step's `working-directory` names a path that exists in the repo.
- [ ] The gates pass locally before the session ends.

## Steps

1. **Establish the baseline first.** From `kaioken_v2/`, run `npm ci`, then `npm run typecheck`, then
   `npm test`. Record the counts. If any fail, **stop and report** — do not fix engine code in this
   leaf. A red baseline is a separate task (rule 2 cuts both ways: you may not build a gate around a
   build you just quietly repaired).
2. **Delete** the `go-test`, `clippy`, and `tauri-build` jobs outright. Do not port them, do not
   comment them out. The Go and Rust code they tested is archived and out of tracking.
3. **Replace** the `frontend` job with a single `engine` job:
   - `runs-on: ubuntu-latest`
   - `actions/checkout@v4`
   - `actions/setup-node@v4` with `node-version: 22`, `cache: npm`,
     `cache-dependency-path: kaioken_v2/package-lock.json`
   - Install: `npm ci`, `working-directory: kaioken_v2`
   - Typecheck: `npm run typecheck`
   - Test: `npm test`
   - Smoke: `node apps/cli/dist/bin.js scan --root .`
4. **Keep** the existing `on:` triggers (`push` and `pull_request` on `master`) unchanged.
5. **Re-run** the local gates and confirm `git status` shows only `ci.yml` modified.

## In scope

- `.github/workflows/ci.yml`

## Out of scope

Do not touch any of these, even if they look broken — each is another leaf's job:

- `.github/workflows/release.yaml` — dead in the same way, but it is **M2**.
- Any file under `kaioken_v2/` — this leaf changes CI, not the engine.
- Any file under `.kaioken_v1/` — archived, out of tracking, stays that way.
- The three-OS matrix, required-check settings, and branch protection — that is `02`.
- Flaky tests. If a test flakes during step 1, **record it for `03`**; do not quarantine it here.

## Gates

Run from `kaioken_v2/`:

```bash
npm ci && npm run typecheck && npm test
```

Then, from the repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

Working tree must show exactly one modified file.

## Traps

| Trap | Guard |
|---|---|
| Porting the Go job to `.kaioken_v1/` "so nothing is lost" | v1 is archived and out of tracking deliberately. Delete the job |
| Using `tsc --noEmit` instead of the `typecheck` script | The root `tsconfig.json` is a solution file with `"files": []`; `--noEmit` on it checks nothing. Use `npm run typecheck`, which is `tsc --build --force` |
| Running `vitest` directly and skipping the build | `npm test` is `npm run build && vitest run`. Skipping the build also skips `copy-queries.mjs`, so the tree-sitter `.scm` files never land and `packages/index` fails at runtime |
| Adding an API key or secret to make a test pass | Phase 1 is offline **by design**. A test that needs a network call is wrong by design, not under-configured |
| `cache-dependency-path` left pointing at the old lockfile | It must be `kaioken_v2/package-lock.json` |
| Quietly fixing engine breakage found in step 1 | Report it instead. Mixing a gate repair with an engine repair makes both unreviewable |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In this repository, .github/workflows/ci.yml is dead: all four of its jobs (go-test at line 10,
frontend at 29, clippy at 52, tauri-build at 81) set working-directory to a path under
"kaioken v1/", and that directory no longer exists — commit e46fe1b5 archived the Go implementation
to .kaioken_v1/ and it is out of tracking. Every job therefore fails before running a single test.

Rebuild the workflow around the TypeScript engine in kaioken_v2/:

- DELETE the go-test, clippy, and tauri-build jobs outright. Do not port them, do not comment them
  out — the Go and Rust code they tested is archived and gone.
- REPLACE the frontend job with a single job named "engine": runs-on ubuntu-latest,
  actions/checkout@v4, actions/setup-node@v4 with node-version 22, cache: npm, and
  cache-dependency-path: kaioken_v2/package-lock.json. Steps, all with
  working-directory: kaioken_v2 except the last — "npm ci", then "npm run typecheck", then
  "npm test", then a smoke step from the repo root running
  "node kaioken_v2/apps/cli/dist/bin.js scan --root .".
- KEEP the existing on: triggers (push and pull_request on master) exactly as they are.

Do not use ubuntu/macos/windows as a matrix in this task — a three-OS matrix is a separate,
later task. Single ubuntu-latest job only.

BEFORE editing anything, run the baseline from kaioken_v2/: npm ci, then npm run typecheck, then
npm test. Record the counts and report them. If any of them FAIL, stop and report the failure —
do NOT fix engine code, and do NOT modify anything under kaioken_v2/. Fixing a red baseline is a
separate task, and mixing it with this one makes both unreviewable.

Change ONLY .github/workflows/ci.yml. Leave .github/workflows/release.yaml completely untouched
even though it is dead in the same way — it is a separate task. Leave everything under kaioken_v2/
and .kaioken_v1/ untouched.
</task>

<verification_loop>
Run these and fix what they surface — do not just report it:
  cd kaioken_v2 && npm ci
  cd kaioken_v2 && npm run typecheck
  cd kaioken_v2 && npm test
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Note: npm test is "npm run build && vitest run" — do not run vitest directly, because skipping the
build also skips packages/index/scripts/copy-queries.mjs, and the tree-sitter .scm query files will
not be copied.
Note: use "npm run typecheck" (which is tsc --build --force), never "tsc --noEmit" — the root
tsconfig.json is a solution file with "files": [], so --noEmit on it checks nothing at all.
Afterwards confirm git status shows exactly one modified file: .github/workflows/ci.yml.
</verification_loop>

<missing_context_gating>
Do not guess repository facts. If you need to know how a script, path, or workspace is configured,
read the file — kaioken_v2/package.json has the real scripts and workspace globs. If something you
need cannot be found, say so explicitly in your report rather than inventing a plausible value.
Never add an API key, token, or secret to make a test pass: the phase-1 test suite is deterministic
and offline by design, so a test that wants the network is wrong by design, not under-configured.
</missing_context_gating>

<action_safety>
Scope strictly to .github/workflows/ci.yml. No unrelated refactors, renames, or cleanup. Do NOT run
git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the
working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed and why, (2) files touched, (3) the baseline typecheck and test counts
you recorded plus the final gate outcomes, pasted, (4) anything you deviated on, left open, or want
a decision on — including any test that flaked, which is being tracked separately.
</structured_output_contract>
```
