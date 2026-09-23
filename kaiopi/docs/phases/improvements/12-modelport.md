# Task 12: Improve `@kaioken/modelport`

## Target Package
`kaioken/modelport`

## Files to Inspect & Modify
- [kaioken/modelport/src/piai.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/modelport/src/piai.ts)
- [kaioken/modelport/src/spend.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/modelport/src/spend.ts)
- [kaioken/modelport/src/pool.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/modelport/src/pool.ts)
- [kaioken/modelport/test/spend.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/modelport/test/spend.test.ts)
- [kaioken/modelport/test/piai.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/modelport/test/piai.test.ts)

---

## Problem Description

1. **No Rate-Limit Resilience or Exponential Backoff**:
   In `piai.ts` (lines 85–93):
   ```ts
   if (message.stopReason === "error" || message.stopReason === "aborted") {
       throw new Error(`model call for stage "${request.purpose}" ended with ${message.stopReason}...`);
   }
   ```
   During a multi-chapter wiki run or card generation involving dozens of LLM calls, hitting a single HTTP 429 rate limit or transient network timeout immediately throws an unrecoverable error and halts the entire pipeline.
   - *Fix needed*: Add retry with exponential jittered backoff for rate limits and transient connection errors in `PiAiClient`.

2. **Inaccurate Static Spend Estimation**:
   In `spend.ts` (lines 43–50):
   ```ts
   export const STAGE_CONTEXT_TOKENS: Record<string, number> = {
       plan: 25_000,
       cards: 12_000,
       wiki: 30_000,
       update: 18_000,
       research: 40_000,
       skillgen: 15_000,
   };
   ```
   `STAGE_CONTEXT_TOKENS` assumes a single fixed token context for the entire stage.
   - If a project decomposes into 50 modules, the `cards` stage will run 50 LLM calls, but `estimateTokens("cards")` estimates the cost of 1 card (12,000 tokens).
   - The user is quoted $0.05, but actual execution generates 50 cards and costs $2.50.
   - *Fix needed*: Accept an optional `itemCount` or `unitCount` in `estimateTokens()` so costs are accurately multiplied across all planned documents/cards.

3. **No Streaming Support**:
   `ModelClient` only supports monolithic `complete()`. For large chapters (2,000–4,000 tokens), generating text can take 30–60 seconds with zero progress feedback.
   - *Fix needed*: Extend `ModelClient` to support optional streaming callbacks (`onChunk: (text: string) => void`) for real-time progress.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/modelport` and verify all tests pass.
- Add test verifying retry backoff behavior on simulated rate-limit errors.
- Add test verifying that spend estimation accurately scales with the number of generated units.
