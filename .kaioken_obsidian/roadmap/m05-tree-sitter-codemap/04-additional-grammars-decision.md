# M5-04 · Decide additional grammar support

> Formally refuse the 40-language tree-sitter long tail and frame the narrow decision of whether any specific sixth language is justified by real-world use.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | S |
| **Depends on** | `01-verify-what-shipped` |
| **Blocks** | Any expansion of `packages/index/src/grammars.ts` |
| **Touches** | `packages/index/src/grammars.ts` (decision record) |
| **Risk** | High scope-creep risk: adding grammars without proven demand creates an unmaintained maintenance tail |
| **Gate-critical** | No |

## Why this exists

Category 10 of the original public feature board proposed expanding tree-sitter support across dozens of languages. However, the master roadmap explicitly marked **"40-language tree-sitter support" as a refused non-goal** ([README §7](../README.md#7-deliberately-not-on-the-roadmap)), noting: *"M5 does the languages actually used. The rest is a long tail with a long-tail payoff."*

Five languages already ship in `packages/index`: Go, JavaScript, TypeScript, Python, and Rust (`packages/index/src/grammars.ts:21-41`). Each added language incurs a permanent maintenance burden:
1. Bundling and distributing a prebuilt WASM grammar binary.
2. Authoring and maintaining declarative `.scm` query capture patterns.
3. Defining language-specific export visibility rules (`packages/index/src/extract.ts:204`).
4. Maintaining golden-file characterization fixtures and test assertions.

This leaf exists to prevent speculative grammar additions. It refuses the general expansion case and frames the narrow, blocking decision: **is any single sixth language (such as Java, C#, or C/C++) justified by actual adoption or dogfooding demand?**

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| 5 core languages supported | `packages/index/src/grammars.ts:21-41` binds typescript, tsx, javascript, jsx, python, go, rust |
| 40-language expansion is a refused non-goal | Master roadmap [README §7](../README.md#7-deliberately-not-on-the-roadmap) explicitly refuses 40-language support |
| Grammars require web-tree-sitter WASM modules | `packages/index/package.json:16-21` lists direct npm dependencies on `tree-sitter-*` WASM packages |
| Unparsed languages are handled gracefully | `packages/index/src/extract.ts:49-58` flags unparsed files cleanly (`unparsed: true`) without crashing |

## What done looks like

- [ ] A formal decision document records that the general "40-language tree-sitter" goal is permanently refused.
- [ ] Explicit criteria are established for when a new language grammar is permitted to land:
  - Proven demand from at least 3 active repositories.
  - A stable, prebuilt `web-tree-sitter` compatible WASM distribution available on npm.
  - An owner committed to maintaining the `.scm` query file and golden fixtures.
- [ ] If a specific sixth language is approved by the human maintainer, it is scheduled as an isolated single-package session; otherwise, the grammar set remains frozen at the 5 shipped languages.

## Steps

1. **Review Maintenance Cost of Shipped Grammars**:
   Audit the overhead of the existing 5 grammars in `packages/index`: binary bundle size, `.scm` query line counts, and test execution time.

2. **Evaluate Candidate Sixth Languages**:
   Assess the three most common candidate requests against Kaioken's architectural sweet spot:
   - **Java**: Common in enterprise; large AST, verbose grammar, heavy query needs.
   - **C#**: Common in enterprise; similar characteristics to Java.
   - **C / C++**: Header/source dichotomy, preprocessor complexity makes pure AST declaration mapping difficult.

3. **Present Decision to the Orchestrator**:
   Submit the criteria and recommendations to the maintainer.
   Record the decision in `roadmap/decisions/` or update this leaf upon resolution.

## In scope

- Evaluating grammar addition criteria and recording the maintenance cost analysis.

## Out of scope

- Adding new WASM dependencies to `packages/index/package.json`.
- Authoring new `.scm` queries.
- Modifying `supportedLanguages()` in `packages/index/src/grammars.ts`.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

No code modifications permitted in this leaf until the decision is unblocked.

## Traps

| Trap | Guard |
|---|---|
| Adding a language "because tree-sitter already has a grammar for it" | The grammar WASM is only 10% of the work; writing query captures, export rules, and goldens is the real cost |
| Degrading `npm test` startup time with massive WASM loading | WASM parsing in `web-tree-sitter` requires memory initialization; keep the active grammar set lean |
| Attempting to support languages without clear declaration syntax | Languages heavily dependent on preprocessor macros (like C/C++) fail cleanly in AST queries unless heavily preprocessed |

## Open questions

This leaf is **`blocked`** on the following maintainer decisions:

1. **Which specific sixth language, if any, is justified?**
   Candidates are Java (for enterprise adoption) or C/C++ (for systems codebases). If neither is actively used by the maintainer or early testers, the answer is **"None — keep the five shipped languages frozen."**
   *Unblocked by:* Written maintainer decision on target user base.

2. **What is the maximum allowable binary size for `packages/index`?**
   Each WASM grammar adds 1-3 MB to the index package bundle. Does bundling additional grammars conflict with Studio distribution constraints?
   *Unblocked by:* Maintainer guidance on package distribution targets.

## Session brief

```xml
<task>
Resolve the additional grammar support decision for packages/index.
This leaf is BLOCKED pending human decision on Open Questions 1 and 2.

Do NOT implement any new grammar or add dependencies to packages/index/package.json until
the human orchestrator provides explicit approval on which sixth language, if any, is justified.

Once unblocked:
1. If the decision is to freeze:
   - Update this file status to `done` and record the permanent freeze decision.
   - Update packages/index/AUDIT.md with the refusal of the 40-language non-goal.
2. If a specific language (e.g. Java) is approved:
   - Add the specific tree-sitter WASM dependency.
   - Add the .scm query file under packages/index/src/queries/<lang>.scm.
   - Register the grammar in packages/index/src/grammars.ts.
   - Add golden test fixtures and characterization snapshots.
</task>

<verification_loop>
Run these from kaioken_v2/:
  npm run typecheck
  npm test
Confirm working tree is clean or contains only the decision record.
</verification_loop>

<action_safety>
Status is BLOCKED. Do not edit packages/index/package.json or add tree-sitter dependencies
without explicit instruction.
</action_safety>

<structured_output_contract>
End with: (1) maintainer decision recorded, (2) rationale for freezing or adopting a specific 6th
language, (3) impact on package bundle size and test suite execution time.
</structured_output_contract>
```
