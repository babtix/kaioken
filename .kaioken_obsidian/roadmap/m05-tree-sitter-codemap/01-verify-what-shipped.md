# M5-01 · Verify what shipped against the promise

> Audit `packages/index` to document exactly which languages, AST node types, and symbol kinds shipped in the rewrite, producing an honest gap list against original roadmap promises.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | M1 (`01-retarget-ci-workflow` for baseline CI pass) |
| **Blocks** | `02-golden-file-characterization-tests`, `03-framework-detection` |
| **Touches** | `packages/index/AUDIT.md` (audit documentation) |
| **Risk** | Low: observational audit and documentation task; touches no runtime code |
| **Gate-critical** | No |

## Why this exists

The TypeScript rewrite completely absorbed the tree-sitter migration: `packages/index` already runs `web-tree-sitter` and uses declarative `.scm` queries. However, because the rewrite moved fast, no formal reconciliation was performed between what the code extracts and what the original roadmap promised in category 10 ([README §5.10](../README.md#10-extended-language-support)).

The original plan promised:
- **TypeScript / JavaScript**: interfaces, type aliases, React components, export maps.
- **Python**: classes, decorators, type hints, venv awareness.
- **Go**: structs, interfaces, methods, grouped const blocks.
- **Rust**: traits, impls, structs, enums, visibility modifiers.

Before adding new queries or making assumptions in downstream agents, we must establish an authoritative, verified record of what actually shipped and what remains open. This leaf inspects the AST queries and extraction engine, tests them against complex language constructs, and records the honest gap list.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| 5 languages bound to WASM grammars | `packages/index/src/grammars.ts:21-41` binds typescript, tsx, javascript, jsx, python, go, and rust |
| Closed set of 12 symbol kinds | `packages/index/src/types.ts:7-18` defines `SymbolKind`: `function`, `method`, `class`, `interface`, `type`, `struct`, `enum`, `trait`, `impl`, `const`, `var`, `module` |
| TypeScript interface & type alias extraction shipped | `packages/index/src/queries/typescript.scm:12, 14` captures `interface_declaration` and `type_alias_declaration` |
| React component tagging does not exist | React components are extracted as generic `function` or `const` (`typescript.scm:6, 33`); no component kind or JSX return type detection exists |
| Export maps are only ancestor keyword checks | `packages/index/src/extract.ts:249` checks `hasExportAncestor`; re-export statements (`export { x } from ...`) and package.json export maps are not indexed |
| Python decorators & type hints are not structured | `packages/index/src/queries/python.scm:7-18` captures functions and classes; decorators and type hints are preserved only as unparsed text in `signatureOf()` |
| Venv awareness is nonexistent in the index | `.venv` is filtered at the scan layer (`packages/scan/src/ignore.ts`); the index has no Python environment awareness |

## What done looks like

- [ ] An authoritative audit document is committed at `packages/index/AUDIT.md`.
- [ ] The audit covers all 5 languages, tabulating:
  - Language name and WASM grammar version (`packages/index/package.json:16-21`).
  - Tree-sitter query patterns and capture names in `packages/index/src/queries/*.scm`.
  - Resulting `SymbolRecord` properties (`kind`, `signature`, `doc`, `exported`, `parent`).
- [ ] The audit lists verified capabilities vs gaps:
  - **Delivered**: TS interfaces, TS type aliases, Go structs/interfaces/grouped consts, Rust traits/impls/visibility, Python classes/functions/docstrings.
  - **Identified Gaps**: React component tagging (missing), export maps / re-export graph (missing), Python structured decorators (missing), Python parameter type hint breakdown (missing), Python venv awareness (missing).
- [ ] Recommendations are made on whether each gap is worth closing or should be permanently refused (e.g. venv awareness belongs in tooling, not the AST index).

## Steps

1. **Audit TypeScript & JavaScript Extraction**:
   - Inspect `packages/index/src/queries/typescript.scm` and `javascript.scm`.
   - Test extraction on: arrow functions assigned to exported consts, default exports, re-exports (`export { foo } from "./foo"`), namespace exports, and JSX functional components.
   - Note that JSX components are captured as `function` or `const`, never as a dedicated `component` kind.

2. **Audit Python Extraction**:
   - Inspect `packages/index/src/queries/python.scm`.
   - Test extraction on: decorated functions (`@app.route`, `@staticmethod`), typed signatures (`def f(x: int) -> str:`), async functions, and class attributes.
   - Note that decorators are stripped or prepended in signatures but do not appear as symbols.

3. **Audit Go and Rust Extraction**:
   - Inspect `packages/index/src/queries/go.scm` and `rust.scm`.
   - Verify that grouped const blocks, receiver methods, trait implementations, and `pub(crate)` visibility modifiers extract with exact line numbers.

4. **Synthesize `packages/index/AUDIT.md`**:
   - Compile findings into a clean, tabular markdown report.
   - Commit `packages/index/AUDIT.md`.

## In scope

- `packages/index/AUDIT.md`
- Inspecting `packages/index/src/queries/*.scm`, `extract.ts`, `grammars.ts`, and `types.ts`

## Out of scope

- Modifying any `.scm` query or adding new dependencies to `packages/index/package.json`.
- Building golden characterization tests (that is leaf `02`).
- Implementing framework detection (that is leaf `03`).

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Working tree must show only `packages/index/AUDIT.md` created.

## Traps

| Trap | Guard |
|---|---|
| Papering over missing features | Be brutally honest: if React components are just parsed as functions, report that component extraction did NOT ship |
| Attempting to fix queries during the audit | Sizing discipline: this is an audit leaf. Record gaps in `AUDIT.md`; do not rewrite query files |
| Assuming features from Go v1 existed in v2 | Test real behavior against `packages/index/test/extract.test.ts` and inspect actual AST output |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Perform a comprehensive audit of tree-sitter AST extraction in packages/index and document the
findings in packages/index/AUDIT.md.

Read:
- packages/index/package.json (tree-sitter dependencies)
- packages/index/src/grammars.ts (grammar configurations)
- packages/index/src/types.ts (SymbolKind and SymbolRecord)
- packages/index/src/extract.ts (AST match processing, signatureOf, docOf, isExported)
- packages/index/src/queries/{go,javascript,typescript,python,rust}.scm

Compare what is actually extracted against the original roadmap category 10 promises:
1. TypeScript / JavaScript: Interfaces, type aliases, React components, export maps.
2. Python: Classes, decorators, type hints, venv awareness.
3. Go: Structs, interfaces, methods, grouped consts.
4. Rust: Structs, enums, traits, impls, visibility modifiers.

Produce packages/index/AUDIT.md with:
- Detailed breakdown per language (node types matched, symbols generated, line range accuracy).
- Direct comparison table: Promise vs Shipped vs Gap.
- Clear explanation of why gaps exist (e.g. React components captured as generic functions,
  decorators not extracted as distinct symbol kinds, export maps not graph-indexed).
- Recommendations for future work.

Do NOT modify any code in packages/index.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
Confirm working tree shows only packages/index/AUDIT.md created.
</verification_loop>

<action_safety>
Scope strictly to creating packages/index/AUDIT.md. No edits to query files, extract.ts, or grammars.ts.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) executive summary of what shipped vs gaps, (2) the complete Promise vs Reality table
from AUDIT.md, (3) confirmation of npm test pass.
</structured_output_contract>
```
