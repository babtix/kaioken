# Task 09: Improve `@kaioken/verifycore`

## Target Package
`kaioken/verifycore`

## Files to Inspect & Modify
- [kaioken/verifycore/src/verify.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verifycore/src/verify.ts)
- [kaioken/verifycore/src/claims.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verifycore/src/claims.ts)
- [kaioken/verifycore/src/types.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verifycore/src/types.ts)
- [kaioken/wiki/src/verify.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/wiki/src/verify.ts)
- [kaioken/verifycore/test/verifycore.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verifycore/test/verifycore.test.ts)

---

## Problem Description

1. **Massive Code Duplication between `verifycore` and `wiki`**:
   The code in `verifycore/src/verify.ts` and `verifycore/src/claims.ts` is 90% identical to `wiki/src/verify.ts` and `wiki/src/claims.ts`.
   Two copies of the same verification logic exist in the codebase, creating maintenance overhead, divergence, and potential desynchronization bugs.
   - *Fix needed*: Consolidate all mechanical verification logic into `@kaioken/verifycore`. Have `@kaioken/wiki` import `verifyDocument`, `extractClaims`, etc., directly from `@kaioken/verifycore`.

2. **Loose Substring False Grounding**:
   In `verify.ts` (lines 55–59):
   ```ts
   case "file": {
       if (input.knownFiles.has(claim.text)) return null;
       const base = claim.text.slice(claim.text.lastIndexOf("/") + 1);
       for (const known of input.knownFiles) {
           if (known.endsWith(`/${base}`) || known === base) return null;
       }
       if (scopeText.includes(base)) return null;
   ```
   If a document mentions a fabricated file like `src/controllers/index.ts` or `lib/utils.ts`, and `scopeText` contains the word `"index.ts"` or `"utils.ts"`, the check returns `null` (deemed valid/grounded)!
   - *Fix needed*: Restrict basename matching to actual existing repository files, and disallow generic filenames (`index.ts`, `types.ts`, `mod.rs`, `main.go`) from matching solely because the substring appears in source text.

3. **$O(N)$ Linear File Lookups**:
   `namesAKnownFile` and the `known.endsWith(`/${base}`)` loops execute sequentially for every claim against `knownFiles`.
   - *Fix needed*: Pre-index a map of basename -> matching relative paths during initialization for $O(1)$ lookups.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/verifycore` and `npm test -w kaioken/wiki` and verify all tests pass.
- Confirm that `wiki/src/verify.ts` uses `@kaioken/verifycore` without duplicate logic.
- Add test verifying that common filenames like `index.ts` with invalid parent directories are not falsely marked as grounded.
