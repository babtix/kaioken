# Task 13: Improve `@kaioken/plan`

## Target Package
`kaioken/plan`

## Files to Inspect & Modify
- [kaioken/plan/src/cards.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/plan/src/cards.ts)
- [kaioken/plan/src/propose.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/plan/src/propose.ts)
- [kaioken/plan/src/evidence.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/plan/src/evidence.ts)
- [kaioken/plan/test/cards.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/plan/test/cards.test.ts)
- [kaioken/plan/test/plan.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/plan/test/plan.test.ts)

---

## Problem Description

1. **Initial JSON Parse Fragility**:
   In `cards.ts` (line 64):
   ```ts
   const reply = await client.complete({...});
   let draft = parseCard(reply);
   ```
   If the LLM's initial reply contains slightly malformed JSON, a markdown wrap that `extractJson` fails to unwrap, or trailing commas, `parseCard()` immediately throws an unhandled error, failing card generation before the repair loop even begins.
   - During the repair loop (lines 79–90), errors are safely caught with `try { ... } catch { break; }`, but the initial parse lacks any error recovery.
   - *Fix needed*: Wrap initial draft parsing in a tolerant repair attempt or fallback to prompt correction before aborting.

2. **No Non-LLM Heuristic Module Decomposition**:
   In `propose.ts`, proposing modules is entirely reliant on an LLM completion. If no model is configured or if the LLM call fails, the entire pipeline is deadlocked.
   - *Fix needed*: Provide a deterministic structural clustering fallback (grouping files by top-level directories, packages, or component boundaries) when no model is available or when offline scaffolding is requested.

3. **Missing Incremental Card Updates**:
   When code changes, `generateCards` re-generates every single card rather than consulting `@kaioken/provenance` to regenerate only the cards whose source files were modified.
   - *Fix needed*: Support selective/incremental card generation driven by provenance staleness.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/plan` and verify all tests pass.
- Add test verifying that malformed initial JSON can trigger a correction pass instead of crashing fatally.
- Add test verifying structural clustering fallback when offline or without a model.
