# M4-05 · Add global fuzzy file finder

> Build a global, fzf-style fuzzy path matching engine over the scanner's canonical file inventory, collapsing multi-turn directory exploration chains into a single instant lookup.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-retrieval-eval-harness`, `02-unified-search-tool-modes` |
| **Blocks** | M10 (Studio quick-open command palette) |
| **Touches** | `packages/search/src/fuzzy.ts`, `packages/agent/src/tools.ts`, `apps/cli/src/commands/find.ts` |
| **Risk** | Very low: pure deterministic algorithm over the in-memory scan inventory |
| **Gate-critical** | No |

## Why this exists

A primary source of wasted latency and context exhaustion in agent sessions is sequential directory traversal. When an agent needs to locate a file whose path it does not know exactly (e.g. looking for the Python query grammar `python.scm` or the staleness tests), it typically calls directory listing tools 3 to 5 times in sequence: listing `packages/`, then `packages/index/`, then `packages/index/src/`, and so on.

`packages/scan` already produces a canonical inventory of all repository files (`packages/scan/src/scan.ts:35`). What is missing is a global fzf-style fuzzy matching function that evaluates abbreviations (e.g. `pyscm` -> `packages/index/src/queries/python.scm`, `staletest` -> `packages/provenance/test/staleness.test.ts`) across all repository paths in under 10 milliseconds. Exposing this through search tools allows agents and CLI users to locate target files in a single step.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Canonical file inventory is already collected | `packages/scan/src/scan.ts:35` produces `ScanResult.files` with repo-relative POSIX paths |
| Scan artifact is persisted locally | `packages/scan/src/artifact.ts:12` writes `.kaioken/scan.json` |
| Search index contains documents, but no path fuzzy finder | `packages/search/src/corpus.ts:15` indexes content chunks, but has no path subsequence scorer |
| Agent must inspect paths via exploratory reads | `packages/agent/src/tools.ts:27` only provides `read_file`, forcing agents to guess directory structures |

## What done looks like

- [ ] A pure-TypeScript fuzzy path scorer is implemented at `packages/search/src/fuzzy.ts`.
- [ ] Scoring rewards:
  - Exact prefix and contiguous substring matches.
  - Characters matched immediately after path separators (`/`), dots (`.`), underscores (`_`), or hyphens (`-`).
  - Matches in the basename/filename over directory segments.
  - Shorter total candidate path lengths.
- [ ] Execution completes in <10ms for repositories with up to 20,000 files.
- [ ] A `find_file` tool (or `mode: "file"` in the unified `search` tool) is exposed to the agent in `packages/agent/src/tools.ts`.
- [ ] A fast CLI command `kaioken find <query>` returns ranked relative paths instantly.
- [ ] Eval harness path questions (from M4-01) achieve 100% Recall@1.

## Steps

1. **Implement Fuzzy Path Matcher in `packages/search/src/fuzzy.ts`**:
   - Write `fuzzyMatch(pattern: string, target: string): { matched: boolean; score: number }`.
   - Algorithm:
     - Case-insensitive subsequence check. If pattern characters do not appear in order, return `{ matched: false, score: 0 }`.
     - Compute bonuses: consecutive characters (+5), boundary characters after `/`, `.`, `_`, `-` (+10), uppercase CamelCase boundaries (+8), basename match bonus (+15).
     - Penalize gaps between matched indices and overall path length.
   - Export `fuzzyFind(paths: string[], pattern: string, limit = 10): Array<{ path: string; score: number }>`.

2. **Add CLI Command in `apps/cli/src/commands/find.ts`**:
   - Register `find` in `apps/cli/src/main.ts`.
   - Reads `scanOrRead(root)` from `apps/cli/src/commands/status.ts:70`.
   - Executes `fuzzyFind(scanResult.files.map(f => f.path), query, flags.limit ?? 10)`.
   - Prints ranked matching paths to stdout (or JSON with `--json`).

3. **Expose to Agent in `packages/agent/src/tools.ts`**:
   - Add `find_file` tool taking `{ pattern: string, limit?: number }`.
   - Returns ranked paths, allowing the model to find target files in one tool call.

4. **Add Unit Tests**:
   - Create `packages/search/test/fuzzy.test.ts`.
   - Test tricky abbreviations: `pyscm` matching `packages/index/src/queries/python.scm`, `tsconfig` matching root and workspace tsconfigs, `ci` matching `.github/workflows/ci.yml`.
   - Benchmark 10,000 paths to guarantee execution <10ms.

## In scope

- `packages/search/src/fuzzy.ts`
- `packages/search/src/index.ts`
- `packages/search/test/fuzzy.test.ts`
- `apps/cli/src/commands/find.ts`
- `apps/cli/src/main.ts` (command registration)
- `packages/agent/src/tools.ts`

## Out of scope

- Pulling in external dependencies like `fzf` or `minisearch` (maintain zero-dependency discipline in `packages/search`).
- Searching inside file content (that is substring/regex search in leaf `02`).
- Modifying `packages/scan` traversal logic.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js find "pyscm"
node apps/cli/dist/bin.js find "ci.yml"
```

Working tree must show only modified files in `packages/search`, `packages/agent`, and `apps/cli`.

## Traps

| Trap | Guard |
|---|---|
| Adding heavy npm dependencies for fuzzy matching | Implement a lightweight (sub-100 line) Smith-Waterman or subsequence scoring function in pure TypeScript |
| Normalizing paths incorrectly across operating systems | Always normalize path separators to POSIX `/` before fuzzy matching |
| Returning un-ranked boolean matches | Always calculate a score and sort candidates descending so top matches appear first |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement a fast, zero-dependency global fuzzy file path finder in packages/search and expose it
via CLI and agent tools.

Current state:
- packages/scan/src/scan.ts:35 produces the complete list of repository files in ScanResult.files.
- packages/agent/src/tools.ts only provides `read_file`, forcing agents to guess directory structures
  or perform multiple directory scans to find specific files.
- There is no fzf-style path lookup anywhere in Kaioken.

Required changes:
1. Create packages/search/src/fuzzy.ts:
   - Implement `fuzzyMatch(pattern: string, target: string): { matched: boolean; score: number }`
     using character subsequence scoring with bonuses for word boundaries (`/`, `.`, `-`, `_`),
     consecutive characters, and basename matches.
   - Implement `fuzzyFind(paths: string[], pattern: string, limit?: number): string[]`.
   - Export these from packages/search/src/index.ts.
2. Create apps/cli/src/commands/find.ts and register `find` in apps/cli/src/main.ts:
   - Runs `fuzzyFind` against the scanned repository paths and outputs ranked results.
3. In packages/agent/src/tools.ts:
   - Add `find_file` tool taking `{ pattern: string, limit?: number }` backed by `fuzzyFind`.
4. Add unit tests in packages/search/test/fuzzy.test.ts testing edge-case acronyms and path abbreviations.

Ensure the fuzzy finder runs in <10ms on thousands of paths and requires zero external dependencies.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js find "pyscm"
  node apps/cli/dist/bin.js find "ci"
Confirm working tree shows only modified files in packages/search, packages/agent, and apps/cli.
</verification_loop>

<action_safety>
Scope strictly to packages/search/src/fuzzy.ts, apps/cli/src/commands/find.ts, and packages/agent/src/tools.ts.
Do NOT modify packages/scan or packages/index.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) details of fuzzy scoring algorithm implemented, (2) files touched and created,
(3) benchmark timing on repository file list, (4) test results from packages/search/test/fuzzy.test.ts.
</structured_output_contract>
```
