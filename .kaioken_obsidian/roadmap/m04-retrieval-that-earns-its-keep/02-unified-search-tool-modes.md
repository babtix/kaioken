# M4-02 · Unify search tool modes

> Replace fragmented agent search tools with a single unified `search` tool offering `substring`, `regex`, `symbol`, and `semantic` modes, guarded by RE2-style linear-time regex safety.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-retrieval-eval-harness` (must measure against the committed baseline) |
| **Blocks** | `04-rag-over-wiki-with-citations` |
| **Touches** | `packages/search/src/`, `packages/agent/src/tools.ts`, `apps/cli/src/commands/search.ts` |
| **Risk** | Medium: regex evaluation without ReDoS protection can freeze the engine on crafted input |
| **Gate-critical** | No |

## Why this exists

Currently, an agent navigating Kaioken must choose between fragmented tools: `symbol_lookup` for declarations and `wiki_search` for BM25 corpus search (`packages/agent/src/tools.ts:22`). Neither tool can perform exact substring matching across code, nor can they execute structural regex queries (e.g. finding error-handling signatures or import statements). When an agent needs to find a specific code pattern, it is forced to perform multiple exploratory `read_file` or directory listing calls.

Maintaining separate tools for every retrieval strategy bloats tool declarations in system prompts and confuses model tool selection. This leaf unifies all retrieval strategies into a single `search` tool with four distinct operational modes: `substring`, `regex`, `symbol`, and `semantic`. The model specifies the `mode` appropriate for its intent. Crucially, regex search includes an RE2-style safety check that rejects pathological patterns prone to catastrophic backtracking (ReDoS).

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Agent tools are fragmented | `packages/agent/src/tools.ts:22` lists `symbolLookup()` and `wikiSearch()` as separate tools |
| Search package only supports BM25 query text | `packages/search/src/index-store.ts:144` takes `SearchQuery` with `text: string` and runs BM25 |
| CLI search command lacks mode selection | `apps/cli/src/commands/search.ts:13` accepts positional query and `--kind` flag only |
| Symbol oracle exists in index package | `packages/index/src/oracle.ts:17` `SymbolOracle` provides `lookup(name)` and `lookupIn(path, name)` |
| No regex safety guard exists | V8's default `RegExp` engine is backtracking; unvetted user/agent regexes risk CPU lockup |

## What done looks like

- [ ] `SearchIndex` in `packages/search` supports four query modes:
  - `substring`: Fast literal string search across all scanned source files and indexed documents.
  - `regex`: Regular expression search validated against catastrophic backtracking patterns.
  - `symbol`: Exact declaration lookup delegating to `SymbolOracle`.
  - `semantic`: Vector embedding retrieval with fallback to BM25 lexical ranking when unvectorized.
- [ ] Safe regex analyzer rejects patterns with nested repetition quantifiers (e.g. `(a+)+`, `(a|b+)+`, `(x+)*`).
- [ ] In `packages/agent/src/tools.ts`, a unified `search` tool replaces `wiki_search` and `symbol_lookup`:
  ```json
  {
    "name": "search",
    "description": "Search repository code, symbols, documentation, and cards.",
    "parameters": {
      "query": { "type": "string" },
      "mode": { "type": "string", "enum": ["substring", "regex", "symbol", "semantic"], "default": "substring" },
      "kind": { "type": "string", "enum": ["wiki", "card", "skill", "symbol"] },
      "limit": { "type": "number", "default": 10 }
    }
  }
  ```
- [ ] `kaioken search` CLI supports `--mode <substring|regex|symbol|semantic>`.
- [ ] The retrieval eval harness (`packages/search/test/eval/`) confirms the unified search passes all 30 questions and improves overall MRR.

## Steps

1. **Implement Safe Regex Validation in `packages/search`**:
   Create `packages/search/src/safe-regex.ts`:
   - Checks regular expressions for dangerous exponential constructs before compilation.
   - Detects nested quantifiers (`+`, `*`, `{n,}`) inside parenthesized groups with repetitive qualifiers.
   - Rejects vulnerable patterns with a clean error message (`"regex rejected: pattern contains potentially catastrophic backtracking"`).

2. **Add Search Modes to `packages/search/src/index-store.ts`**:
   - Extend `SearchQuery` with `mode?: "substring" | "regex" | "symbol" | "semantic"`.
   - In `search()`:
     - If `mode === "substring"`: perform literal substring scanning over raw chunk text / source files.
     - If `mode === "regex"`: validate pattern safety, compile `RegExp`, and collect matching lines with line numbers.
     - If `mode === "symbol"`: delegate directly to `SymbolOracle` (via leaf M4-03 integration).
     - If `mode === "semantic"` (or default): execute current hybrid BM25 + vector ranking.

3. **Unify Agent Tools in `packages/agent/src/tools.ts`**:
   - Replace `wikiSearch()` and `symbolLookup()` with `unifiedSearch()`.
   - Map tool execution arguments directly to `ctx.search.search({ text: query, mode, ... })`.
   - Format output consistently: include hit path, line number, matched kind, and concise snippet.

4. **Update CLI in `apps/cli/src/commands/search.ts`**:
   - Add `--mode` flag parsing (`flags.mode ?? "substring"`).
   - Wire `--mode regex` to display pattern matches and `--mode symbol` to display declarations.

5. **Verify with Eval Harness**:
   - Run `packages/search/test/eval/eval.test.ts`.
   - Confirm symbol and phrase questions score higher with targeted modes enabled.

## In scope

- `packages/search/src/safe-regex.ts`
- `packages/search/src/index-store.ts`
- `packages/search/src/index.ts` (the package's types live here — there is no `types.ts`)
- `packages/agent/src/tools.ts`
- `apps/cli/src/commands/search.ts`
- Tests under `packages/search/test/` and `packages/agent/test/`

## Out of scope

- Adding heavy external C++ or WASM dependencies for RE2 (use pure-TS linear-time safety checks).
- Re-architecting `packages/index/src/extract.ts` or modifying tree-sitter grammars.
- Modifying wiki generation or chapter schemas.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js search "computeStaleness" --mode symbol
node apps/cli/dist/bin.js search "export function.*run" --mode regex
```

Working tree must show only modified files in `packages/search`, `packages/agent`, and `apps/cli`.

## Traps

| Trap | Guard |
|---|---|
| Relying on V8 RegExp without checking for catastrophic backtracking | Implement `safe-regex.ts` to reject nested quantifier patterns before execution |
| Breaking backwards compatibility for existing CLI search calls | Default `mode` to `semantic` or `substring` when not explicitly specified |
| Forgetting to return 1-based line numbers in regex and substring hits | Verify line offset calculation matches 1-based editor line expectations |
| Regressing offline eval harness scores | Re-run `packages/search/test/eval/eval.test.ts` to confirm metrics improve or hold steady |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Unify search tools across packages/search, packages/agent, and apps/cli into a single tool
supporting four modes: "substring", "regex", "symbol", and "semantic".

Current state:
- packages/agent/src/tools.ts:22 separates "symbol_lookup" (line 41) and "wiki_search" (line 131).
- packages/search/src/index-store.ts:144 only supports BM25 text queries.
- apps/cli/src/commands/search.ts only runs text queries without mode flags.

Required changes:
1. Create packages/search/src/safe-regex.ts to validate regex patterns and prevent ReDoS
   (reject patterns with nested quantifiers like `(a+)+` or `(x|y+)*`).
2. Update packages/search/src/index-store.ts to accept `mode?: "substring" | "regex" | "symbol" | "semantic"`
   in SearchQuery, implementing substring matching, safe regex matching, symbol delegation to
   SymbolOracle, and semantic/BM25 ranking.
3. Update packages/agent/src/tools.ts to replace `wiki_search` and `symbol_lookup` with a single
   `search` tool accepting `query`, `mode`, `kind`, and `limit`.
4. Update apps/cli/src/commands/search.ts to accept `--mode <substring|regex|symbol|semantic>`.
5. Add unit tests for safe-regex and multi-mode search under packages/search/test/.

Leave packages/prism and packages/index extraction code untouched.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js search "computeStaleness" --mode symbol
  node apps/cli/dist/bin.js search "export function.*run" --mode regex
Confirm working tree shows only modified files in packages/search, packages/agent, and apps/cli.
</verification_loop>

<action_safety>
Scope strictly to packages/search, packages/agent/src/tools.ts, and apps/cli/src/commands/search.ts.
Do NOT modify tree-sitter grammars or packages/index/src/extract.ts.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) explanation of changes across search, agent, and CLI, (2) list of touched files,
(3) results of unit tests and regex safety checks, (4) eval harness score comparison against BASELINE.md.
</structured_output_contract>
```
