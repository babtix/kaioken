# GAP-02 · Reference index for real code impact analysis

> `kaioken impact` reports documentation impact rather than a semantic call graph because there is no
> reference index to build one from; closing this gap requires true symbol reference indexing.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | L |
| **Depends on** | Milestone M1 (Green everywhere), Milestone M5 (Tree-sitter codemap, already shipped) |
| **Blocks** | Milestone M4 (Advanced search / go-to-definition / find-references) |
| **Touches** | `kaioken_v2/packages/index/`, `kaioken_v2/packages/impact/`, `kaioken_v2/packages/search/` |
| **Risk** | High — constructing an accurate cross-file reference index across multiple languages |
| **Gate-critical** | No |

## Why this exists

Quoted directly from [`kaioken_v2/README.md:390-393`](../../kaioken_v2/README.md#L390-L393):

> *`impact` reports documentation impact — which chapters and cards a change invalidates — and says so.
> It is not a call graph; there is no reference index to build one from, and pretending otherwise would
> be the sort of confident wrong answer this engine exists to avoid.*

When a developer asks *"what breaks if I change this function?"*, they expect a precise call graph:
every caller, every implementation of the interface, and every downstream dependency. Currently,
`packages/impact/src/predict.ts` resolves declarations via `packages/index` and identifies mentions
via lexical scanning (`dependents: Array<{ path: string; mentions: string[] }>`). It then maps those
files to knowledge cards and wiki chapters.

It reports **documentation impact**, not semantic code impact. Pretending that a list of files
containing a token string constitutes a call graph would deceive coding agents into underestimating
blast radius. Closing this gap is directly adjacent to Milestone M4's symbol lookup, find-references,
and go-to-definition capabilities.

## Current state

Verified against [`kaioken_v2/packages/impact/src/predict.ts:24-42`](../../kaioken_v2/packages/impact/src/predict.ts#L24-L42)
and [`kaioken_v2/packages/index/src/oracle.ts`](../../kaioken_v2/packages/index/src/oracle.ts):

| Fact | Evidence |
|---|---|
| Index stores declarations only | `packages/index` parses tree-sitter grammars (Go, JS, TS, Python, Rust) and extracts declared symbols (`SymbolDeclaration`), not usages/references |
| Oracle answers existence | `SymbolOracle.has(name)` answers whether a symbol is declared in the repo; it has no index of where that symbol is referenced |
| Lexical mention sweep | `packages/impact/src/predict.ts:30-31` finds files that textually contain the symbol name as a word token |
| Public roadmap deferral | `roadmap/README.md:212` marks "Definition & references (`go_to_definition` / `find_references` via LSP or tree-sitter)" as open under Milestone M4 |

## What done looks like

- [ ] A new reference indexing pass in `packages/index` (e.g. `ReferenceIndex`) that records symbol
      usages (`call_expression`, `identifier_reference`, import specifiers) alongside declarations.
- [ ] `packages/index` outputs `.kaioken/references.json` mapping `symbolId -> Array<{ path, line, col, kind }>`.
- [ ] `packages/impact` differentiates between:
  1. **Documentation Impact:** Which wiki chapters, cards, and skills are invalidated (current behaviour).
  2. **Code Impact:** Verified callers, import chains, and call graph descendants backed by the reference index.
- [ ] CLI command `kaioken symbols <symbol> --references` returns exact reference locations.
- [ ] Precision guarantee: references are resolved within AST scope where possible, eliminating false
      positives from unrelated variables sharing common names (e.g. `id`, `name`, `run`).

## Steps

1. **Tree-Sitter Reference Queries:**
   - Author `.scm` reference queries for the 5 supported languages (`go`, `javascript`, `typescript`,
     `python`, `rust`) matching identifiers and call sites.
2. **Build the Inverted Reference Store:**
   - In `packages/index/src/references.ts`, index symbol references during `kaioken index`.
   - Store compact file-offset references in `.kaioken/references.json`.
3. **Upgrade `packages/impact`:**
   - In `predict.ts`, replace the lexical regex token sweep with a query against `ReferenceIndex`.
   - Distinguish direct callers (`direct_call`), type usages (`type_reference`), and lexical mentions.
4. **Expose in CLI and Studio:**
   - Add `kaioken symbols --refs <name>`.
   - Feed real references into Studio's editor hover and find-references provider.

## In scope

- `kaioken_v2/packages/index/` (reference extraction queries and indexing)
- `kaioken_v2/packages/impact/` (upgrading blast-radius prediction)
- `kaioken_v2/apps/cli/src/commands/symbols.ts`
- `kaioken_v2/apps/cli/src/commands/impact.ts`

## Out of scope

- Full LSP server integration (e.g. running `gopls` or `tsserver` in the background).
- Dynamic runtime tracing or execution profiling.
- Languages outside the 5 tree-sitter grammars shipped in `packages/index`.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification command:

```bash
node apps/cli/dist/bin.js impact "runGate" --root .
```

The output must list verified call sites in `agent-host.ts` and `chat.ts` with exact line numbers, rather than broad file-level lexical hits.

## Traps

| Trap | Guard |
|---|---|
| Trying to build a whole-program type-checker | Tree-sitter is syntactic, not semantic. Cross-file resolution must use heuristic import matching rather than full compiler type-checking to remain fast and offline. |
| Massive index file bloating | Storing every identifier reference across millions of lines of code will explode `.kaioken/index.json`. Index only references to declared symbols, not local block variables. |
| Faking call graph depth without evidence | If an import cannot be resolved disambiguated, report it as `possible_reference` rather than asserting a verified edge. |

## Open questions

None. The boundary between syntactic tree-sitter references and compiler LSPs is well established.

## Session brief

```xml
<task>
In kaioken_v2/, close Gap G-2 by adding a symbol reference index to packages/index/ and upgrading
packages/impact/ to report genuine code call-graphs alongside documentation impact:

1. In packages/index/:
   - Add reference queries (.scm) for typescript, javascript, go, python, and rust targeting
     call_expression and import_specifier nodes.
   - Extend the index pipeline to build an inverted ReferenceIndex (symbol -> occurrences).
   - Persist references in .kaioken/index.json or .kaioken/references.json.

2. In packages/impact/src/predict.ts:
   - Replace the brute-force lexical mention sweep with lookups against the ReferenceIndex.
   - Update ImpactReport to return structured references:
     callers: Array<{ symbol: string; path: string; line: number; kind: "call" | "type" | "import" }>
   - Retain documentation impact (cards, wiki documents, skills) as a separate, distinct section.

3. Update apps/cli/src/commands/impact.ts and symbols.ts to render the upgraded report.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Run smoke test:
  node apps/cli/dist/bin.js impact "buildSystemPrompt" --root .
Verify that output cites exact call sites (e.g., chat.ts line 4) rather than general file mentions.
</verification_loop>

<action_safety>
Do not make network calls or introduce external LSP daemons. Maintain the deterministic offline
guarantee of packages/index. Do NOT run git add or git commit. Leave changes uncommitted in the
working tree.
</action_safety>

<structured_output_contract>
End with: (1) details of tree-sitter reference queries added, (2) format of the new reference index,
(3) before-and-after comparison of impact report output, (4) test gate outcomes with pasted vitest
counts.
</structured_output_contract>
```
