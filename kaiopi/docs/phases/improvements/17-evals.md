# Task 17: Improve `@kaioken/evals`

## Target Package
`kaioken/evals`

## Files to Inspect & Modify
- [kaioken/evals/src/fixture.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/evals/src/fixture.ts)
- [kaioken/evals/src/probes.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/evals/src/probes.ts)
- [kaioken/evals/src/run.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/evals/src/run.ts)
- [kaioken/evals/test/evals.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/evals/test/evals.test.ts)

---

## Problem Description

1. **Tiny Synthetic TypeScript-Only Fixture**:
   In `fixture.ts`, the evaluation fixture is hardcoded to a tiny 2-file repository (`src/a.ts` and `src/b.ts`).
   - It does not test Python, Go, Rust, or multi-language projects.
   - It does not test complex AST hierarchies (classes with inheritance, interfaces, modules).
   - *Fix needed*: Expand the fixture to include multi-language files (`main.py`, `service.go`, `lib.rs`) and test cross-language grounding.

2. **Sparse Probe Suite (Only 4 Probes)**:
   The suite currently tests:
   - Probe 1: Non-existent symbol negative guarantee
   - Probe 2: Exact quote anchor accuracy
   - Probe 3: Native verify gate compliance
   - Probe 4: Card export coverage
   - *Missing Probes*:
     - Probe for SSRF resistance in research
     - Probe for drift detection after source file changes
     - Probe for impact prediction accuracy under renamed symbols
     - Probe for padding / generic boilerplate rejection
   - *Fix needed*: Implement probes for drift detection, impact accuracy, and padding rejection.

3. **No Direct Benchmark CLI against Real Checkouts**:
   `bin.mjs` only runs the synthetic in-memory fixture. There is no CLI option to run the eval suite against an arbitrary real git repository on disk to score grounding.
   - *Fix needed*: Add a `--repo <path>` option to `kaioken/evals/bin.mjs` to allow auditing arbitrary repositories.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/evals` and verify all tests pass.
- Run `node kaioken/evals/bin.mjs` and verify all probes execute and report clean metrics.
- Add test for multi-language AST grounding in probes.
