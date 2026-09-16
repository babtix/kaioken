# M4-01 · Build the retrieval eval harness

> Create an offline, deterministic evaluation suite of 30 hand-written codebase questions with known-correct ground truth, scoring baseline MRR and Recall before any retrieval change is attempted.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | M1 (`01-retarget-ci-workflow` for green build preconditions) |
| **Blocks** | `02-unified-search-tool-modes`, `03-symbol-lookup-off-the-index`, `04-rag-over-wiki-with-citations`, `05-fuzzy-file-finder` |
| **Touches** | `packages/search/test/eval/` (fixtures, harness runner, test, and baseline record) |
| **Risk** | Low technical risk, high discipline risk: without committed baseline numbers, future retrieval work cannot prove value |
| **Gate-critical** | **Yes — Priority P2 for the entire roadmap** |

## Why this exists

Operating rule 4 states: *characterization tests before every refactor.* In retrieval systems, this rule is absolute. Without an objective benchmark, changes to BM25 parameters, tokenizers, or chunking strategies are guided entirely by vibes — an implementer tweaks weights until one pet query succeeds, blind to five other queries regressing.

The master roadmap explicitly marks the retrieval eval harness as **Priority P2 for the whole roadmap** ([README §12](../README.md#12-suggested-next-block)) and insists it must be built **FIRST, in bold**. Phase 1 of Kaioken is deterministic and offline by design: no external vector database, no OpenAI/Anthropic API calls, no network flakiness in CI. This leaf constructs that missing foundation: 30 concrete, hand-written questions about Kaioken's own codebase with verified ground truth targets, an automated scoring harness calculating MRR and Recall, and a checked-in baseline document that every future retrieval leaf must measure against.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Search index is lexical BM25 | `packages/search/src/index-store.ts:144` `search()` runs BM25 via `this.lexicon.score()` |
| Semantic ranking hook exists but is optional | `packages/search/src/index-store.ts:169` `semanticRank()` runs only when `provider` is supplied |
| Corpus indexes four kinds | `packages/search/src/corpus.ts:15` `export type Kind = "wiki" \| "card" \| "skill" \| "symbol"` |
| Current tests are minimal unit tests | `packages/search/test/index.test.ts:45-70` asserts on synthetic dummy files; no real-code eval exists |
| No evaluation harness exists | Grep across repo for `eval` yields no retrieval benchmarks or ground truth datasets |
| Phase 1 offline requirement | Phase 1 runs fully offline without credentials (`kaioken_v2/package.json:15` `vitest run`) |

## What done looks like

- [ ] A dedicated evaluation directory exists at `packages/search/test/eval/`.
- [ ] `packages/search/test/eval/questions.json` contains exactly 30 hand-written questions targeting Kaioken's own repository.
- [ ] Questions are categorized into 4 real-world retrieval modes:
  - 10 Symbol declaration lookups (e.g. locate `SymbolOracle`, `computeStaleness`, `chunkParentChild`).
  - 10 Architectural / conceptual queries (e.g. "how does staleness detection work", "parent child chunking strategy").
  - 5 Exact file path discoveries (e.g. locate tree-sitter queries for Python, CLI export implementation).
  - 5 Exact text / phrase matches (e.g. "License Zero Noncommercial Public License 2.0.1", "topN candidates").
- [ ] Ground truth targets in `questions.json` specify target `path`, expected `kind`, and optionally target `symbol` or `line`.
- [ ] `packages/search/test/eval/runner.ts` executes the query set against the real scanned index and calculates:
  - **MRR (Mean Reciprocal Rank)**
  - **Recall@1** (hit in top 1)
  - **Recall@3** (hit in top 3)
  - **Recall@5** (hit in top 5)
- [ ] An automated test at `packages/search/test/eval/eval.test.ts` runs in <5 seconds offline as part of `npm test`.
- [ ] Initial scores are documented and committed in `packages/search/test/eval/BASELINE.md`.

## Steps

1. **Define the Question Schema**:
   Create `packages/search/test/eval/types.ts` defining:
   ```ts
   export interface EvalTarget {
     path: string;
     kind: "wiki" | "card" | "skill" | "symbol";
     symbol?: string;
     minLine?: number;
     maxLine?: number;
   }
   export interface EvalQuestion {
     id: string;
     query: string;
     category: "symbol" | "concept" | "path" | "phrase";
     expected: EvalTarget[];
   }
   export interface EvalMetrics {
     total: number;
     mrr: number;
     recallAt1: number;
     recallAt3: number;
     recallAt5: number;
     categoryBreakdown: Record<string, { mrr: number; recallAt1: number }>;
   }
   ```

2. **Author the 30 Hand-Written Questions**:
   Populate `packages/search/test/eval/questions.json` with 30 ground-truth questions grounded in real repo files:
   - Symbols: `SymbolOracle` (`packages/index/src/oracle.ts`), `extractFile` (`packages/index/src/extract.ts`), `computeStaleness` (`packages/provenance/src/staleness.ts`), `chunkParentChild` (`packages/prism/src/chunk.ts`), `runUpdate` (`apps/cli/src/commands/update.ts`), `loadTemplate` (`packages/templates/src/index.ts`), `buildGraph` (`packages/graph/src/build.ts`), `scan` (`packages/scan/src/scan.ts`), `resolveModelClient` (`apps/cli/src/model.ts`), `writeWikiPlan` (`packages/wiki/src/artifact.ts`).
   - Concepts: "module plan checkpoint", "staleness hash comparison", "parent-child chunking", "BM25 reciprocal rank fusion", "tree sitter wasm loading", "in process theia bridge", "license zero constraint", "risk flagging scan", "cli smoke test", "export bundle layout".
   - Paths: `packages/index/src/queries/python.scm`, `apps/cli/src/commands/export.ts`, `packages/search/src/bm25.ts`, `packages/agent/src/tools.ts`, `packages/provenance/src/types.ts`.
   - Phrases: "License Zero Noncommercial Public License 2.0.1", "topN", "phase 1 is deterministic", "two clients is one too many", "copy-queries.mjs".

3. **Build the Scoring Harness**:
   Create `packages/search/test/eval/runner.ts`:
   - Indexes the repository using `SearchIndex.build(repoRoot)`.
   - Runs each question through `index.search({ text: q.query, limit: 10 })`.
   - Determines hit rank: a hit matches if `hit.path === expected.path` and matches the expected `kind` (and symbol if specified).
   - Computes reciprocal rank (`1 / (rank + 1)`) and recall thresholds.

4. **Add the Vitest Gate**:
   Create `packages/search/test/eval/eval.test.ts`:
   - Runs the evaluation suite offline.
   - Asserts that all 30 questions execute without runtime error.
   - Asserts that metrics are computed and non-zero.

5. **Commit the Baseline**:
   Run the harness against `ai_now_know/kaioken_v2` and write `packages/search/test/eval/BASELINE.md` recording:
   - Date and commit SHA.
   - Overall MRR, Recall@1, Recall@3, Recall@5.
   - Breakdown by category.
   - List of failing queries (queries with Recall@5 = 0) to guide leaves M4-02 through M4-05.

## In scope

- `packages/search/test/eval/types.ts`
- `packages/search/test/eval/questions.json`
- `packages/search/test/eval/runner.ts`
- `packages/search/test/eval/eval.test.ts`
- `packages/search/test/eval/BASELINE.md`

## Out of scope

- Touching `packages/search/src/index-store.ts`, `bm25.ts`, `analyze.ts`, or `corpus.ts`.
- Implementing regex or fuzzy matching (leaves `02` and `05`).
- Calling external OpenAI/Anthropic embedding endpoints.
- Modifying engine code outside `packages/search/test/eval/`.

## Gates

From `kaioken_v2/`:

```bash
npm run build && npx vitest run packages/search/test/eval/eval.test.ts
```

```bash
npm test
npm run typecheck
```

Working tree must show only new test/eval files added under `packages/search/test/eval/`.

## Traps

| Trap | Guard |
|---|---|
| Tuning BM25 parameters during this task to get higher initial numbers | Strict out-of-scope rule: do NOT edit `packages/search/src/`. The point of a baseline is to record the truth, warts and all |
| Writing vague questions with multiple subjective answers | Ground every question in an exact path and symbol in the Kaioken repo |
| Requiring an active internet connection or API key | The eval suite must run in CI using offline local fixtures and the local file scanner |
| Forgetting to commit `BASELINE.md` | The done checklist strictly requires `BASELINE.md` with real numbers committed |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Build the retrieval evaluation harness for Kaioken under packages/search/test/eval/.
This is PRIORITY P2 for the whole roadmap. It must be built FIRST before any retrieval
enhancements can be attempted.

Currently, packages/search has only BM25 lexical search (packages/search/src/bm25.ts,
index-store.ts) and minimal unit tests (packages/search/test/index.test.ts). There is NO
evaluation suite and NO benchmark dataset.

Create:
1. packages/search/test/eval/types.ts:
   Export EvalTarget, EvalQuestion, EvalMetrics interfaces.
2. packages/search/test/eval/questions.json:
   Exactly 30 hand-written questions grounded in Kaioken's actual codebase:
   - 10 Symbol declaration lookups
   - 10 Architectural/conceptual questions
   - 5 Specific file path targets
   - 5 Exact phrase or snippet matches
3. packages/search/test/eval/runner.ts:
   An evaluator function `evaluateRetrieval(root: string): Promise<EvalMetrics>` that loads or builds
   SearchIndex, executes each query with limit: 10, scores rank against expected targets, and computes
   MRR, Recall@1, Recall@3, and Recall@5.
4. packages/search/test/eval/eval.test.ts:
   Vitest test file executing evaluateRetrieval() and asserting that all 30 questions evaluate and
   output valid metrics.
5. packages/search/test/eval/BASELINE.md:
   Generate and commit the exact baseline figures from running against the current repository state.

Do NOT modify any file under packages/search/src/. Do not "improve" the search algorithm in this task.
The entire objective is to honestly characterize and record what the current search engine scores today.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing and fix what they surface — do not just report it:
  npm run build && npx vitest run packages/search/test/eval/eval.test.ts
  npm test
  npm run typecheck
Confirm the working tree shows only files under packages/search/test/eval/.
</verification_loop>

<action_safety>
Scope strictly to packages/search/test/eval/. No engine code edits in packages/search/src/ or any other
package. Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<missing_context_gating>
Do not invent question targets. Verify every path, symbol, and phrase used in questions.json against
actual files in kaioken_v2/ (such as packages/index/src/oracle.ts, packages/prism/src/chunk.ts, etc.).
Phase 1 is offline by design: never add an API key or remote embedding network call.
</missing_context_gating>

<structured_output_contract>
End with: (1) summary of the 30 authored questions and category breakdown, (2) files created under
packages/search/test/eval/, (3) the exact baseline metrics pasted directly from the test run
(MRR, Recall@1, Recall@3, Recall@5), (4) list of top queries that failed to retrieve their target in
the top 5, as guidance for leaf M4-02.
</structured_output_contract>
```
