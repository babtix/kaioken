# M1-03 · Identify and quarantine flaky tests, with written reasons

> Systematically re-identify intermittent test failures across the vitest suite, quarantine genuine
> flakes behind documented reasons and owners, and strictly prohibit adding credentials to mask flakes.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-retarget-ci-workflow` |
| **Blocks** | M1 done, `roadmap/m02-trusted-distribution/` |
| **Touches** | Test files under `kaioken_v2/packages/*/test/` and `kaioken_v2/apps/*/test/` |
| **Risk** | Medium. Over-quarantining silences real regressions; under-quarantining leaves CI flaky |
| **Gate-critical** | **Yes** |

## Why this exists

Operating rule 2 states that a green build is a precondition, not a milestone. In an agentic workflow,
a flaky test is lethal: an agent handed a red test run will invent code fixes for problems that exist
only in runner timing or filesystem race conditions.

Historically, `.kaioken_v1/ROADMAP.md:56` noted "fix the two known flaky tests". Those two tests were
written in Go inside the archived `.kaioken_v1/` codebase. They do not exist in `kaioken_v2`. The
TypeScript engine has 50 test files and over 400 tests. Any flakiness in the current engine must be
**empirically re-identified** under stress repetition, not assumed from obsolete Go notes.
Crucially, Phase 1 is deterministic and offline by design: granting a test network access or API
credentials to "stop it flaking" is strictly prohibited.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Historical flakes were Go tests | `.kaioken_v1/ROADMAP.md:56` — archived to `.kaioken_v1/` and out of tracking |
| Engine test runner is Vitest | `kaioken_v2/package.json:15` (`"test": "npm run build && vitest run"`) |
| Vitest version | `kaioken_v2/package.json:21` (`"vitest": "^2.1.0"`) |
| Documented test count | `kaioken_v2/README.md:323` cites "406 tests, all offline" |
| Test suite distribution | 50 test files across `kaioken_v2/packages/*/test/` and `kaioken_v2/apps/*/test/` |
| CLI tests stub network and auth | `kaioken_v2/apps/cli/test/cli.test.ts` stubs `fetch` and strips API keys from env |
| Agent host uses scripted stream | `kaioken_v2/apps/cli/test/agent-host.test.ts` tests tool calling without live providers |

`UNVERIFIED:` whether filesystem race conditions occur under high parallelism on Windows runners
in `packages/scan/test/scan.test.ts` or `packages/gitops/test/hook.test.ts`.

## What done looks like

- [ ] The full vitest suite is executed under repetition (at least 10 consecutive runs) across all packages.
- [ ] Any test failing intermittently is diagnosed to separate engine defects from environmental flakes.
- [ ] Genuine flakes that cannot be immediately fixed within the session are quarantined using `test.skip` or a dedicated quarantine config.
- [ ] Every quarantined test has an accompanying block comment containing:
  1. Exact reason for flakiness (e.g., timer precision, OS filesystem event latency).
  2. Issue/ticket tracking the root-cause fix.
  3. Designated owner.
- [ ] Zero tests are granted network tokens, API keys, or live external endpoints.
- [ ] `npm test` runs 100% green across consecutive invocations.

## Steps

1. **Stress-test the suite for flakes:**
   Run the test suite in a loop to detect intermittent failures:
   ```bash
   for i in {1..10}; do npm test || break; done
   ```
   Or via vitest directly (after `npm run build`):
   ```bash
   npx vitest run --repeat=10
   ```
2. **Classify failures:**
   - **Deterministic failures:** Not flakes. Must be resolved or reported as baseline regressions.
   - **Timing/Race condition flakes:** File watcher delays, subprocess spawning jitter, or temp directory cleanup races.
   - **Network/Credential attempts:** If any test fails because an API key is missing, that test is flawed by design. Rewrite it to use a scripted double or mock.
3. **Quarantine procedure:**
   If a flaky test cannot be cleanly fixed with a minor adjustment (such as proper async awaiting or unique temp directories), quarantine it in place:
   ```typescript
   // QUARANTINE: [M1-03] Flakes under high I/O concurrency on Windows due to temp dir locks.
   // Tracking: Issue #12. Owner: @maintainer
   test.skip("concurrent scan traversal during file churn", async () => { ... });
   ```
4. **Enforce offline contract:**
   Verify that no environment variables or test helper credentials were added.
5. **Run verification gates:**
   Confirm `npm test` passes cleanly with zero unhandled rejections or silent timeouts.

## In scope

- All test files under `kaioken_v2/packages/*/test/` and `kaioken_v2/apps/*/test/`.
- Vitest configurations if test grouping/quarantine tagging is introduced.

## Out of scope

- Archived v1 tests under `.kaioken_v1/`.
- Modifying core engine production logic under `src/` to work around bad tests (fix the test harness instead).
- Network mocking infrastructure for live LLM providers (engine testing is offline by design).

## Gates

Run from `kaioken_v2/`:

```bash
npm run build && npx vitest run --repeat=5
```

```bash
npm run typecheck
```

Working tree must show only modified test files with documented quarantine headers.

## Traps

| Trap | Guard |
|---|---|
| Assuming the v1 Go flaky tests ported over | The Go code was archived. The TS suite is completely distinct. Do not search for Go test names |
| Adding an API key to CI or `.env` to fix a test | Phase 1 is offline by design. A test requiring live credentials violates architecture |
| Quarantining a test with `test.skip` without reason/owner | Reject any quarantine missing the reason and owner header block |
| Running `vitest` without running `npm run build` first | `packages/index` requires `.scm` queries copied by `copy-queries.mjs`. Always run build first |
| Deleting a flaky test instead of quarantining | Quarantining preserves the test as a known defect to be repaired; deletion loses coverage silently |

## Open questions

None.

## Session brief

```xml
<task>
In kaioken_v2/, identify and quarantine any flaky tests across the vitest test suite.

Context & Rules:
- The historical "two flaky tests" mentioned in old v1 documentation belonged to Go packages and are
  archived. You must empirically detect flakiness in the current TypeScript test suite.
- Run the full suite repeatedly (e.g. npx vitest run --repeat=10 after npm run build) to surface
  race conditions, timing errors, or path-separator issues.
- If a test fails intermittently and cannot be trivially stabilized via proper async cleanup or
  temp-directory isolation, quarantine it using test.skip.
- Every quarantine MUST include a standardized comment directly above the test:
  // QUARANTINE: [M1-03] <Detailed explanation of flake trigger>
  // Tracking: <Issue or Leaf ID>
  // Owner: maintainer
- NEVER introduce credentials, API keys, or live external requests to make a test pass. The engine's
  Phase 1 test suite is strictly deterministic and offline.

Ensure that after quarantining or stabilizing, npm test passes reliably across multiple runs.
</task>

<verification_loop>
Run these from kaioken_v2/:
  npm run build
  npx vitest run --repeat=5
  npm run typecheck
Confirm that all active tests pass and that any skipped test has the required quarantine comment.
</verification_loop>

<missing_context_gating>
Do not guess which tests are flaky based on old commit messages. Run the tests.
All 19 packages and 2 apps in kaioken_v2 are subject to vitest.
</missing_context_gating>

<action_safety>
Modify only test files (*.test.ts) or test configurations. Do not refactor production engine code
under src/ directories. Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) number of test runs executed and total test count, (2) list of any flaky tests identified,
(3) actions taken (stabilized in-place vs quarantined with test.skip), (4) exact quarantine comments
added with reasons and owners.
</structured_output_contract>
```
