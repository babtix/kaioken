# Task 05: Improve `@kaioken/impact`

## Target Package
`kaioken/impact`

## Files to Inspect & Modify
- [kaioken/impact/src/predict.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/impact/src/predict.ts)
- [kaioken/impact/src/render.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/impact/src/render.ts)
- [kaioken/impact/test/impact.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/impact/test/impact.test.ts)

---

## Problem Description

1. **Serial Disk Reads in `sweep()`**:
   In `predict.ts` (lines 189–200):
   ```ts
   for (const file of candidates) {
       if (swept >= MAX_FILES_SWEPT) { partial = true; break; }
       swept++;
       let content: string;
       try {
           content = await readFile(join(input.root, file.path), "utf8");
       } catch { continue; }
       ...
   }
   ```
   Up to 8,000 files (`MAX_FILES_SWEPT`) are read sequentially with `await readFile()` on every impact analysis. This causes severe I/O lag on large projects.
   - *Fix needed*: Batch file reads with bounded concurrency (e.g. `mapLimit` with concurrency of 16–32), or pre-read candidate content during the initial scan pass.

2. **Regex Word-Boundary False Positives**:
   In `predict.ts` (lines 173–176):
   ```ts
   pattern: new RegExp(`(?<![A-Za-z0-9_$])${escapeRegex(name)}(?![A-Za-z0-9_$])`)
   ```
   `sweep` checks candidate files using a raw regex match. If a symbol name is common (such as `id`, `name`, `status`, `config`, `result`, `error`, `run`, `validate`), it matches everywhere—in strings, comments, unrelated variable names, and JSON fields—causing massive false positive blast radius warnings.
   - *Fix needed*:
     - If the file is indexed by `@kaioken/index`, check whether the identifier occurs within import statements, function call sites, or type annotations.
     - Discriminate short or generic symbol names (filter or rank down matches that don't match import statements).

3. **No Integration with Dependency/Import Graph**:
   Impact analysis should be rooted in structural dependency links (`A` imports `B`). Currently, it completely ignores the AST import/export relationships and relies on raw text sweeping.
   - *Fix needed*: Cross-reference indexed file imports/exports before falling back to full text sweeping.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/impact` and ensure all tests pass.
- Verify that common symbol names (e.g., `id` or `status`) do not erroneously claim 100% of the repository as affected dependents.
- Benchmark and verify concurrent file reading performance in `sweep()`.
