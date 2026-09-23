# Task 04: Improve `@kaioken/provenance`

## Target Package
`kaioken/provenance`

## Files to Inspect & Modify
- [kaioken/provenance/src/status.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/provenance/src/status.ts)
- [kaioken/provenance/src/staleness.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/provenance/src/staleness.ts)
- [kaioken/provenance/src/types.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/provenance/src/types.ts)
- [kaioken/provenance/test/staleness.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/provenance/test/staleness.test.ts)

---

## Problem Description

1. **Hardcoded Directory Paths**:
   In `status.ts` (lines 8 and 20):
   ```ts
   for (const loc of [join(root, ".kaioken", "wiki", "provenance.json"), join(root, ".kaioken", "provenance.json")])
   const cardsDir = join(root, ".kaioken", "cards");
   ```
   `".kaioken"` is hardcoded as a magic string instead of using the exported `KAIOKEN_DIR` constant from `@kaioken/scan`. If `KAIOKEN_DIR` is altered or configured, provenance resolution breaks.
   - *Fix needed*: Import `KAIOKEN_DIR` from `@kaioken/scan` and use it consistently.

2. **Overly Aggressive `undocumentedFiles` Calculation**:
   In `staleness.ts` (lines 39–43):
   ```ts
   const undocumentedFiles = scan.files
       .filter((file) => !file.binary && !documented.has(file.path))
       .map((file) => file.path)
       .sort();
   ```
   `undocumentedFiles` includes *every* non-binary file in the repository that is not directly cited in a wiki chapter or knowledge card. This includes:
   - Config files (`tsconfig.json`, `biome.json`, `.eslintrc`, `.prettierrc`)
   - Test files (`*.test.ts`, `*.spec.ts`)
   - Tooling scripts (`scripts/sync.js`, build scripts)
   - Fixtures and mocks
   This causes healthy repositories to report hundreds of "undocumented" files and drags `freshness` down to near zero.
   - *Fix needed*: Filter out standard test patterns (`test/`, `__tests__/`, `*.test.*`), config files, and build scripts from the `undocumentedFiles` metric, or provide a filter option.

3. **Coarse File-Level Staleness Invalidation**:
   In `staleness.ts`, staleness is evaluated purely based on `file.hash` (SHA-256 of the whole file). A non-functional change (such as adding a comment, fixing a typo, or modifying an unrelated function at the bottom of a 1,500-line file) immediately flags all chapters and cards citing that file as `stale`.
   - *Fix needed*: Introduce symbol-aware provenance options where documentation can bind to specific symbols or line hashes rather than entire file hashes.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/provenance` and verify all tests pass.
- Verify that `KAIOKEN_DIR` is used for all artifact lookups.
- Add test verifying that tests and config files can be excluded from `undocumentedFiles` without corrupting source freshness tracking.
