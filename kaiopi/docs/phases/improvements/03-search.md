# Task 03: Improve `@kaioken/search`

## Target Package
`kaioken/search`

## Files to Inspect & Modify
- [kaioken/search/src/bm25.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/search/src/bm25.ts)
- [kaioken/search/src/index-store.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/search/src/index-store.ts)
- [kaioken/search/src/corpus.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/search/src/corpus.ts)
- [kaioken/search/src/analyze.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/search/src/analyze.ts)
- [kaioken/search/test/index.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/search/test/index.test.ts)

---

## Problem Description

1. **Missing Inverted Index (Slow On-the-Fly BM25 Scoring)**:
   In `bm25.ts` (lines 53–68):
   ```ts
   score(queryTerms: readonly string[], docTokens: readonly string[]): number {
       const tf = new Map<string, number>();
       for (const token of docTokens) tf.set(token, (tf.get(token) ?? 0) + 1);
       ...
   }
   ```
   For every search query across thousands of indexed chunks, `score()` iterates over every single document's token array and allocates a `new Map()` to compute term frequencies dynamically.
   - *Fix needed*: Build an inverted index (`term -> [{docId, tf}]`) during index construction. A query should only look up postings for matching query terms, reducing search complexity from $O(\text{docs} \times \text{tokens})$ to $O(\sum \text{postings of query terms})$.

2. **Redundant Double Collection on Every `open()` Call**:
   In `index-store.ts` (lines 86–97):
   ```ts
   static async open(root: string, options: { force?: boolean } = {}): Promise<SearchIndex> {
       if (!options.force) {
           const existing = await SearchIndex.load(root);
           if (existing) {
               const current = await collect(root); // FULL DISK READ & HASH
               if (current.fingerprint === existing.fingerprint) return existing;
           }
       }
       const built = await SearchIndex.build(root); // RE-RUNS collect(root) AGAIN!
       await built.save(root);
       return built;
   }
   ```
   Every time `SearchIndex.open()` is called (including during every CLI search or serve request), it completely scans the wiki, cards, skills, and symbols on disk just to compare fingerprints. If the fingerprint has changed, `build()` immediately calls `collect(root)` a second time!
   - *Fix needed*: Pass the collected corpus to `build()`, or check fast stat/mtimes/artifact hashes before initiating a full corpus sweep.

3. **No Stemming or Lemmatization**:
   In `analyze.ts`, tokenization is limited to regex splitting on non-alphanumeric characters and lowercase mapping.
   - *Problem*: A search for "connecting" will not match "connection", "connect", or "connected".
   - *Fix needed*: Add a lightweight Porter stemmer or algorithmic word root normalization to improve recall for technical documentation searches.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/search` and ensure all tests pass.
- Verify that search queries use the inverted index and return equivalent or better ranked results.
- Add test verifying that search queries match stemmed variants of terms (e.g. "validations" matches "validation").
