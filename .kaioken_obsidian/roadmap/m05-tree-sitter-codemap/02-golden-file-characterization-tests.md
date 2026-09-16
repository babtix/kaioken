# M5-02 · Build golden-file characterization tests

> Invert the non-negotiable characterization test requirement from a pre-migration safety net into permanent golden-file regression protection for all five tree-sitter grammars.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-verify-what-shipped` |
| **Blocks** | Any future `.scm` query edits or parser updates |
| **Touches** | `packages/index/test/fixtures/golden/`, `packages/index/test/golden.test.ts` |
| **Risk** | Low technical risk; essential protection against silent AST extraction drift |
| **Gate-critical** | **Yes — mandated by Operating Rule 4** |

## Why this exists

The original 12-month roadmap stated in capital letters that golden-file characterization tests were **NON-NEGOTIABLE** before swapping regex parsers for tree-sitter. Because the v2 TypeScript rewrite absorbed tree-sitter from day one, that migration has already occurred.

**This inverts the task rather than eliminating it.** Operating rule 4 dictates: *characterization tests before every refactor.* In tree-sitter systems, a minor edit to a `.scm` pattern (such as tweaking an `@name` capture or adding an optional node quantifier) can silently break extraction for dozens of nested constructs. Currently, `packages/index/test/extract.test.ts` asserts against small, inline string arrays for basic samples. This leaf creates dedicated, comprehensive polyglot golden test fixtures and committed `.golden.json` snapshots for Go, JavaScript, TypeScript, Python, and Rust. Any future query or parser change will produce an immediate, readable diff against these goldens before landing.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Basic unit tests exist in index | `packages/index/test/extract.test.ts:35-53` asserts on `sample.go`, `sample.ts`, etc. |
| Test samples are minimal and inline | `packages/index/test/fixtures/langrepo/` has tiny 15-40 line files (`sample.go:634` bytes, `sample.py:343` bytes) |
| No dedicated golden snapshot files exist | No `.golden.json` or snapshot directory exists in `packages/index/test/` |
| Parser builds are coupled to query copying | `packages/index/package.json:24` runs `tsc --build && node scripts/copy-queries.mjs`; query files must stay synchronized with dist output |

## What done looks like

- [ ] A dedicated fixtures directory exists at `packages/index/test/fixtures/golden/`.
- [ ] Rich, realistic sample files covering advanced language features exist for all 5 languages:
  - `typescript.golden.ts`: Generics, interfaces, type unions, arrow consts, abstract classes, decorators, JSX fragments.
  - `javascript.golden.js`: ES modules, CommonJS exports, class fields, prototype methods, generator functions.
  - `python.golden.py`: Decorators, async def, typed parameters, dataclasses, module assignments, inner classes.
  - `go.golden.go`: Receiver methods, pointer receivers, grouped consts/vars, embedding, generic structs.
  - `rust.golden.rs`: Traits, impl blocks, associated types, macros, `pub(crate)` visibility, enums with payloads.
- [ ] Each fixture has a corresponding checked-in `<lang>.golden.json` capturing the full `SymbolRecord` array (name, kind, signature, startLine, endLine, exported, doc, parent).
- [ ] `packages/index/test/golden.test.ts` executes in `vitest`:
  - Parses each golden fixture using `extractFile()`.
  - Compares the extracted output against the committed `<lang>.golden.json`.
  - Supports an `--update` flag (`UPDATE_GOLDENS=1 npm test`) to safely re-record goldens when deliberate changes are made.

## Steps

1. **Author Comprehensive Golden Language Fixtures**:
   Create the 5 golden source files in `packages/index/test/fixtures/golden/`:
   - Include docstrings, edge-case comments, exported and unexported declarations, and deeply nested blocks.
   - Keep line counts realistic (~80-150 lines per language).

2. **Build the Golden Comparison Test Runner**:
   Create `packages/index/test/golden.test.ts`:
   - Load each language fixture from `packages/index/test/fixtures/golden/`.
   - Call `extractFile({ path: fixtureName, language, hash: "golden", source })`.
   - If process env `UPDATE_GOLDENS=1` is set, serialize `symbols` to `<lang>.golden.json` and exit.
   - Otherwise, read `<lang>.golden.json` and assert `expect(symbols).toEqual(goldenSymbols)`.

3. **Generate and Commit Initial Goldens**:
   - Run `UPDATE_GOLDENS=1 npm test` to generate the 5 baseline `.golden.json` files.
   - Inspect every entry in each `.golden.json` manually to ensure accuracy:
     - No blank signatures.
     - Accurate 1-based start and end lines.
     - Correct `exported: true/false` attribution.

4. **Verify Regression Resistance**:
   - Temporarily introduce a slight syntax variation in a query file, run `npm test`, and observe `vitest` outputting a clean JSON diff identifying the broken symbol.
   - Revert the temporary test mutation and ensure tests pass clean.

## In scope

- `packages/index/test/fixtures/golden/*.{ts,js,py,go,rs}`
- `packages/index/test/fixtures/golden/*.golden.json`
- `packages/index/test/golden.test.ts`

## Out of scope

- Modifying runtime query files in `packages/index/src/queries/`.
- Adding new language grammars.
- Modifying `extract.ts`.

## Gates

From `kaioken_v2/`:

```bash
npm run build
npm test
npm run typecheck
```

Vitest must report all 5 golden suites passing. Working tree must show only new files in `packages/index/test/fixtures/golden/` and `packages/index/test/golden.test.ts`.

## Traps

| Trap | Guard |
|---|---|
| Blindly running `UPDATE_GOLDENS=1` without manual review | Inspect every generated `.golden.json` line by line before committing; garbage in becomes frozen regression data |
| Line ending differences across Windows and Linux | Normalize `\r\n` to `\n` in fixtures before extracting and hashing |
| Skipping query copying during testing | Always run `npm test` or `npm run build` so `copy-queries.mjs` runs before tests execute |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Construct golden-file characterization tests for tree-sitter extraction in packages/index.
This fulfills Operating Rule 4 ("characterization tests before every refactor") and inverts the
v1 pre-migration requirement into permanent regression protection.

Current state:
- packages/index/test/extract.test.ts asserts on small inline sample strings.
- There are no committed golden snapshots for the 5 shipped languages.

Required changes:
1. Create packages/index/test/fixtures/golden/ containing comprehensive language fixtures:
   - typescript.golden.ts (interfaces, generics, exported const arrow functions, classes)
   - javascript.golden.js (ES module exports, CommonJS, classes, generators)
   - python.golden.py (decorators, type annotations, dataclasses, async functions, docstrings)
   - go.golden.go (structs, interfaces, pointer receiver methods, grouped const blocks)
   - rust.golden.rs (traits, impl blocks, visibility modifiers, enums with data)
2. Create packages/index/test/golden.test.ts:
   - For each language, extracts symbols with extractFile().
   - Compares result against committed <lang>.golden.json.
   - If process.env.UPDATE_GOLDENS is set, writes the golden JSON files to disk.
3. Generate and commit the initial 5 <lang>.golden.json files. Review each to ensure line numbers,
   signatures, and export flags are accurate.

Do NOT modify any query files in packages/index/src/queries/ or code in packages/index/src/extract.ts.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only new files under packages/index/test/fixtures/golden/ and
packages/index/test/golden.test.ts.
</verification_loop>

<action_safety>
Scope strictly to packages/index/test/. Do not touch engine code or AST queries.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) description of golden test cases created for each of the 5 languages,
(2) list of golden fixture and snapshot files created, (3) test outcome from vitest,
(4) confirmation of normalized newline handling across platforms.
</structured_output_contract>
```
