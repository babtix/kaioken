# M4-03 · Wire O(1) symbol lookup off the index

> Connect `SymbolOracle` declaration indexing directly into the search substrate, replacing slow BM25 text chunk matching with O(1) exact and prefix declaration lookups.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-retrieval-eval-harness` |
| **Blocks** | `02-unified-search-tool-modes` (feeds the `mode: "symbol"` implementation) |
| **Touches** | `packages/index/src/oracle.ts`, `packages/search/src/index-store.ts` |
| **Risk** | Very low: `SymbolOracle` already exists and is well-tested |
| **Gate-critical** | No |

## Why this exists

When an agent or developer asks "where is `SymbolOracle` declared?", performing a full-text lexical search is the slowest and least reliable way to answer. In the current implementation, `packages/search/src/corpus.ts:59` converts the index artifact into text chunks with `kind: "symbol"`, and `packages/search/src/index-store.ts:154` runs BM25 term frequency scoring across thousands of chunks. This frequently ranks a mention in a wiki chapter or comment above the actual declaration.

Meanwhile, `packages/index/src/oracle.ts:17` already builds an in-memory `Map<string, SymbolLocation[]>` that answers "does this symbol exist?" in O(1) time. The adjacent question — "where is it declared and what is its signature?" — is already computed by `oracle.lookup(name)`, but was never wired directly into the search substrate. Wiring this lookup path directly gives the search engine instant O(1) declaration retrieval with exact file paths, line ranges, and signatures, without tokenization overhead.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| `SymbolOracle` maintains in-memory lookup maps | `packages/index/src/oracle.ts:18-19` has `byName = new Map<string, SymbolLocation[]>()` and `byPath = new Map<string, FileMap>()` |
| Exact declaration lookup is already implemented | `packages/index/src/oracle.ts:39` `lookup(name: string): SymbolLocation[]` returns matching locations |
| `SymbolLocation` carries full declaration details | `packages/index/src/oracle.ts:12-15` and `types.ts:21-35` provide `signature`, `startLine`, `endLine`, `doc`, `exported`, `kind`, `parent` |
| CLI `symbols` command uses `SymbolOracle` | `apps/cli/src/commands/symbols.ts:45` calls `oracle.lookup(target)` |
| Search corpus redundantly flattens symbols into BM25 chunks | `packages/search/src/corpus.ts:15, 33` indexes symbols as text chunks and subjects them to BM25 ranking |

## What done looks like

- [ ] `SymbolOracle` in `packages/index/src/oracle.ts` provides:
  - `lookup(name: string): SymbolLocation[]` (exact match, case-sensitive).
  - `lookupCaseInsensitive(name: string): SymbolLocation[]` (O(1) / O(k) case-normalized lookup).
  - `findPrefix(prefix: string, limit?: number): SymbolLocation[]` (fast trie or sorted index prefix lookup for autocomplete).
- [ ] `SearchIndex` in `packages/search/src/index-store.ts` integrates `SymbolOracle` for all `mode: "symbol"` queries, returning structured `SearchHit` records in O(1) without touching BM25 chunk tables.
- [ ] Hits returned by symbol lookup include exact `startLine`, declaration `kind`, signature in `snippet`, and docstring in `heading`.
- [ ] Eval harness symbol category questions (from M4-01) achieve 100% Recall@1.

## Steps

1. **Extend `SymbolOracle` with Case-Insensitive and Prefix Lookups**:
   In `packages/index/src/oracle.ts`:
   - Maintain a normalized `byLowerName = new Map<string, SymbolLocation[]>()` during constructor indexing.
   - Add `lookupCaseInsensitive(name: string): SymbolLocation[]`.
   - Add `findPrefix(prefix: string, limit = 10): SymbolLocation[]` using prefix matching over sorted keys.

2. **Integrate `SymbolOracle` into `SearchIndex`**:
   In `packages/search/src/index-store.ts`:
   - Store or construct a `SymbolOracle` instance alongside `PersistedIndex`.
   - In `search()`, when `query.mode === "symbol"` (or when query specifically targets declarations):
     - Query `oracle.lookup(query.text)`. If empty, fallback to `oracle.lookupCaseInsensitive(query.text)` or prefix.
     - Convert `SymbolLocation` matches into `SearchHit` objects with `kind: "symbol"`, `line: loc.symbol.startLine`, `heading: loc.symbol.doc`, `snippet: loc.symbol.signature`, and `via: ["symbol"]`.
     - Return immediately without running BM25 score calculations.

3. **Verify with Vitest**:
   - Add unit tests in `packages/index/test/oracle.test.ts` for case-insensitive and prefix lookups.
   - Add integration tests in `packages/search/test/index.test.ts` verifying symbol query resolution.
   - Run `packages/search/test/eval/eval.test.ts` to confirm symbol query recall.

## In scope

- `packages/index/src/oracle.ts`
- `packages/index/test/oracle.test.ts`
- `packages/search/src/index-store.ts`
- `packages/search/test/index.test.ts`

## Out of scope

- Changing tree-sitter grammars or the symbol extraction pipeline (`packages/index/src/extract.ts`).
- Modifying BM25 lexicon scoring in `packages/search/src/bm25.ts`.
- Changing CLI command flags in `apps/cli/src/commands/symbols.ts`.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js search "computeStaleness" --mode symbol
```

Working tree must show only modifications to `packages/index` and `packages/search`.

## Traps

| Trap | Guard |
|---|---|
| Re-scanning the repository inside `SymbolOracle` | `SymbolOracle` must receive the pre-parsed `IndexResult` from phase 1 artifacts; never invoke filesystem scans inside oracle |
| Allocating duplicate symbol records | `SymbolLocation` holds a reference to the existing `SymbolRecord`; do not clone or re-serialize |
| Case sensitivity mismatch | Users often query in lowercase (`symboloracle` for `SymbolOracle`); support case-insensitive fallback while preserving exact match priority |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Wire O(1) symbol declaration lookup off the structural index directly into packages/search.

Current state:
- packages/index/src/oracle.ts:17 defines `SymbolOracle`, which indexes declarations into
  `Map<string, SymbolLocation[]>` with `lookup(name)`.
- packages/search/src/corpus.ts and index-store.ts flatten symbols into text chunks and evaluate
  queries with BM25 text ranking, leading to inaccurate rankings and wasted cycles.

Required changes:
1. In packages/index/src/oracle.ts:
   - Add `lookupCaseInsensitive(name: string): SymbolLocation[]`.
   - Add `findPrefix(prefix: string, limit?: number): SymbolLocation[]`.
   - Add tests in packages/index/test/oracle.test.ts.
2. In packages/search/src/index-store.ts:
   - Allow SearchIndex to hold or load a SymbolOracle instance.
   - When a search is executed with `mode === "symbol"` (or targeting symbols), query SymbolOracle
     directly instead of scoring BM25 chunks.
   - Map SymbolLocation results into SearchHit objects with exact startLine, signature snippet,
     and visibility notes.
   - Add tests in packages/search/test/index.test.ts.

Leave the tree-sitter extraction logic in packages/index/src/extract.ts completely untouched.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified files in packages/index and packages/search.
</verification_loop>

<action_safety>
Scope strictly to packages/index/src/oracle.ts and packages/search/src/index-store.ts.
Do NOT touch tree-sitter grammars or AST queries.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed in SymbolOracle and SearchIndex, (2) touched files, (3) test outcomes
including new unit tests for case-insensitive and prefix lookup, (4) eval harness metric comparison.
</structured_output_contract>
```
