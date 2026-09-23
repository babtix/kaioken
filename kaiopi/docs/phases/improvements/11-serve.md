# Task 11: Improve `@kaioken/serve`

## Target Package
`kaioken/serve`

## Files to Inspect & Modify
- [kaioken/serve/src/server.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/serve/src/server.ts)
- [kaioken/serve/src/pages.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/serve/src/pages.ts)
- [kaioken/serve/test/serve.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/serve/test/serve.test.ts)

---

## Problem Description

1. **No Hot-Reloading / File Watching**:
   In `server.ts` (lines 53–58):
   ```ts
   // Loaded once at start-up: serving is a read of what the pipeline already
   // wrote, never a build. Restarting is the refresh.
   const index = await readIndexArtifact(root);
   const search = await SearchIndex.open(root);
   const library = await readLibrary(root);
   ```
   When an agent or developer updates a wiki chapter, runs `/kaio-cards`, or modifies documentation while the preview server is running, the server serves stale, un-updated HTML until it is manually killed and restarted.
   - *Fix needed*: Add an optional file watcher (or timestamp check on requests) that reloads `library` and `index` when `.kaioken/` artifacts change, enabling live-refresh in the browser.

2. **Monolithic 64 KB `pages.ts` File**:
   [pages.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/serve/src/pages.ts) is a giant 64 KB file containing string-interpolated HTML, inline CSS, layout logic, navigation, and badges for every page type (wiki, cards, graph, files, search).
   - *Fix needed*: Modularize `pages.ts` into components (`layout.ts`, `wikiView.ts`, `cardsView.ts`, `graphView.ts`, `searchView.ts`) for maintainability.

3. **Search Page Synchronous Refresh**:
   Performing a search on `/search` causes a full page reload rather than providing a JSON search endpoint (`/api/search?q=...`) for instant, responsive query filtering in the UI.
   - *Fix needed*: Expose a lightweight `/api/search` endpoint and support client-side instant filtering.

4. **Fatal Crash on Missing Artifacts**:
   If index or library artifacts are corrupted or midway through writing when `serve()` starts, the server throws an unhandled error and exits rather than displaying a friendly status dashboard indicating that generation is required.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/serve` and ensure all tests pass.
- Verify that updated files on disk can be reflected without restarting the Node process.
- Confirm modular page generation without breaking layout or CSP policies.
