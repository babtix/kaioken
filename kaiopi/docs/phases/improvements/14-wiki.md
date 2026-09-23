# Task 14: Improve `@kaioken/wiki`

## Target Package
`kaioken/wiki`

## Files to Inspect & Modify
- [kaioken/wiki/src/verify.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/wiki/src/verify.ts)
- [kaioken/wiki/src/run.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/wiki/src/run.ts)
- [kaioken/wiki/src/generate.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/wiki/src/generate.ts)
- [kaioken/wiki/test/wiki.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/wiki/test/wiki.test.ts)

---

## Problem Description

1. **Verification Logic Duplication**:
   `wiki/src/verify.ts` and `wiki/src/claims.ts` duplicate the code in `@kaioken/verifycore`.
   - *Fix needed*: Replace the duplicated files in `kaioken/wiki` with direct imports from `@kaioken/verifycore`.

2. **Context Window Overflow on Large Chapters**:
   When a chapter spans dozens of files with many declarations, `gatherModuleEvidence` produces an evidence prompt that exceeds LLM context budgets (e.g. 30,000+ tokens), resulting in API truncation or context length errors.
   - *Fix needed*: Ration evidence hierarchically: pass top-level exported symbols first, and only include detailed function signatures for entry point files.

3. **Missing Cross-Chapter Relative Link Verification**:
   The wiki generator verifies symbol names and code anchors, but it does not verify relative markdown links between chapters (e.g. `[Architecture](../architecture/index.md)`). Broken or non-existent chapter links are generated without being flagged as defects.
   - *Fix needed*: Add a link validation check in the verification pass to confirm relative links point to existing or planned wiki documents.

4. **No Resume Capability on Partial Failures**:
   If a 12-chapter wiki run fails at chapter 9, restarting `runWiki()` re-executes all chapters from scratch, wasting tokens and time.
   - *Fix needed*: Check for existing valid, verified chapters on disk and allow resuming or skipping clean chapters.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/wiki` and verify all tests pass.
- Verify that `wiki` imports from `@kaioken/verifycore`.
- Add test verifying that broken markdown links between chapters are caught as verification defects.
