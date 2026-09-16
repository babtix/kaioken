# M10-02 · Knowledge on hover: symbol-to-wiki resolution

> Deliver the demo that sells the whole project: hover any symbol in the editor to resolve its declaration through the index into the generated wiki, with live staleness surfaced prominently.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `packages/index` (tree-sitter, oracle, anchors), `packages/provenance` (staleness), `packages/wiki` |
| **Blocks** | Studio v0.1 editor experience, `03-daemon-thin-client-contract.md` |
| **Touches** | `kaioken_v2/packages/index/`, `kaioken_v2/packages/serve/`, `kaioken_v2/packages/provenance/`, Studio hover provider |
| **Risk** | Medium. Presenting stale documentation as current destroys developer trust. Staleness must be surfaced, never hidden. |
| **Gate-critical** | Yes |

## Why this exists

In the original v1 roadmap, "Knowledge on hover" was designated as *"the demo that sells the whole project."* Code navigation in conventional IDEs provides type signatures and definitions, but rarely answers the questions engineers actually ask: *Why was this built this way? What architectural boundary does it belong to? What decisions constrain it?*

Kaioken already computes these answers: `packages/index` builds a tree-sitter symbol index and declaration oracle, `packages/plan` produces module cards, and `packages/wiki` generates deep narrative chapters. But today, reading that documentation requires switching away from the editor to browse `.kaioken/wiki/` or run CLI commands.

Hover resolution bridges the gap: hovering over an identifier in an open file resolves that symbol against `@kaioken/index`, locates the module card and wiki chapter that describe it, checks its freshness via `@kaioken/provenance`, and renders a rich hover tooltip directly above the code.

Crucially, **staleness must be surfaced, not hidden**. A hover that presents a stale wiki chapter without saying so is worse than no hover at all: it presents decayed assumptions as current truth. Because `packages/provenance` and `status --check` already compute staleness deterministically and offline, the hover provider has immediate access to freshness data and must badge stale content explicitly.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Symbol oracle provides definitive existence checks | `kaioken_v2/packages/index/src/oracle.ts:17` (`SymbolOracle.has`, `lookup`, `lookupIn`) |
| Anchors resolve quotes to exact line ranges | `kaioken_v2/packages/index/src/anchors.ts:35` (`resolveExcerpt` returning `AnchorResolution`) |
| Staleness is computed deterministically and offline | `kaioken_v2/packages/provenance/src/staleness.ts:15` (`computeStaleness` deriving `StalenessReport`) |
| Provenance records exist per generated document | `kaioken_v2/packages/wiki/src/locate.ts` and `kaioken_v2/apps/cli/src/commands/status.ts:23` (`gatherProvenance`) |
| Status check returns binary freshness exit code | `kaioken_v2/apps/cli/src/commands/status.ts:44` (`flags.check ? (report.ok ? 0 : 1) : 0`) |
| Tree-sitter query files are copied during build | `kaioken_v2/packages/index/scripts/copy-queries.mjs` (copies `.scm` for go, js, ts, python, rust) |

`UNVERIFIED:` The exact hover provider API of the final chosen Studio shell (Theia Monaco HoverProvider vs Code-OSS HoverProvider), pending resolution of M10-01 / Q1. The core resolution library, however, is purely engine-level and editor-agnostic.

## What done looks like

- [ ] A dedicated hover resolution function is implemented (e.g. in `@kaioken/serve` or a dedicated module) accepting `(root: string, filePath: string, symbolName: string)` and returning a structured hover payload.
- [ ] The resolver queries `SymbolOracle` from `@kaioken/index` to confirm the symbol exists in the repository.
- [ ] If the symbol exists, the resolver maps the declaring file to its module card (`.kaioken/cards/<module>.json`) and corresponding wiki chapter (`.kaioken/wiki/<chapter>.md`).
- [ ] The resolver calls `computeStaleness` from `@kaioken/provenance` to verify the freshness of the associated documentation.
- [ ] If the document is stale or orphaned, the hover response includes a prominent freshness badge:
  `⚠️ Stale Documentation (Code modified since last generation — run kaioken update)`.
- [ ] If the document is fresh, the hover displays the module overview, symbol purpose, architectural context, and a deep link to view the complete wiki chapter in Studio.
- [ ] Unit tests cover: (1) known fresh symbol, (2) known stale symbol, (3) symbol with no wiki coverage, (4) nonexistent symbol.
- [ ] All engine gates pass: `npm test` and `npm run typecheck` run clean from `kaioken_v2/`.

## Steps

1. **Design the Hover Payload Schema.** Define a clean TypeScript interface in `@kaioken/serve` (or `@kaioken/index`):
   ```typescript
   export interface SymbolHoverResult {
     found: boolean;
     symbol?: { name: string; kind: string; file: string; line: number };
     module?: { id: string; name: string; summary: string };
     chapter?: { slug: string; title: string; excerpt: string };
     freshness: "current" | "stale" | "orphaned" | "undocumented";
     warning?: string;
   }
   ```
2. **Implement Symbol-to-Document Mapping.**
   - In `packages/serve/src/hover.ts` (or package equivalent), load the scan artifact and index artifact.
   - Use `SymbolOracle.lookupIn(filePath, symbolName)` or `SymbolOracle.lookup(symbolName)`.
   - Read `.kaioken/modules.json` and `.kaioken/wiki/plan.json` to find which chapter covers the symbol's declaring file.
3. **Wire Provenance Check.**
   - Load the `Provenance` record for the target chapter.
   - Run `computeStaleness([record], scanResult)`.
   - Set `freshness: "stale"` or `"orphaned"` if the hash check fails, attaching the list of modified source files.
4. **Format Markdown Hover Output.**
   - Format the header with the symbol name, declaration kind, and declaring file.
   - Insert staleness banner at the very top if `freshness !== "current"`.
   - Insert the concise module purpose from the module card.
   - Extract and anchor relevant chapter excerpts using `resolveExcerpt` from `packages/index/src/anchors.ts`.
   - Provide a Studio URI link to open the full chapter in the wiki reader.
5. **Write Comprehensive Characterization Tests.**
   - Create `packages/serve/test/hover.test.ts` with mock fixtures covering fresh, stale, and undocumented symbols.
6. **Connect to Editor Hover Provider.**
   - In Studio (`ide_kaioken/`), register a Monaco `HoverProvider` that delegates to this resolution function.

## In scope

- `kaioken_v2/packages/serve/` or `kaioken_v2/packages/index/` hover resolution logic.
- Staleness status badging in hover content using `computeStaleness`.
- Unit tests verifying hover payload generation across all freshness states.
- Definition of the editor-agnostic hover response contract.

## Out of scope

- Direct modifications to VS Code Marketplace extension packaging until M10-01 is resolved.
- Full wiki generation (`packages/wiki`) — this leaf reads existing artifacts, it does not generate them.
- Modifications to `tree-sitter` grammar files or queries (`packages/index/queries/*.scm`).
- Live file system watchers — staleness is computed on demand from the scan artifact.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Run CLI smoke verification from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js status --check
```

Working tree must show clean tests for the new hover module.

## Traps

| Trap | Guard |
|---|---|
| Hiding documentation decay to make the demo look "clean" | Never omit the staleness warning. A stale hover without a warning is worse than no hover. Display the warning prominently at the top of the tooltip. |
| Fuzzy-matching symbol names in the oracle | `SymbolOracle` is exact by design (`oracle.ts:34`). Do not add fuzzy fallbacks that can match the wrong declaration. |
| Slowing down editor cursor movement | Hover resolution must be synchronous or near-instant (<50ms). Do not run a full disk re-scan during hover; compare against the in-memory or cached scan artifact. |
| Calling LLMs on hover | Hover resolution is 100% deterministic and offline. It queries pre-computed index, cards, and wiki artifacts. Never introduce a model call in the hover loop. |

## Open questions

1. **License Constraint:** How does shipping hover functionality inside an IDE extension or Studio impact commercial users under License Zero Noncommercial 2.0.1? (Cross-reference [roadmap/decisions/](../decisions/)).

## Session brief

```xml
<task>
In kaioken_v2/, implement the core "Knowledge on Hover" resolution pipeline — the single most valuable interaction in the project.

Hovering an identifier in the editor must resolve through the symbol index to its generated wiki documentation and module card, while surfacing documentation staleness prominently rather than hiding it.

Create the resolution logic in kaioken_v2/packages/serve/src/hover.ts (or expose it cleanly via packages/index/):
1. Input: repository root, file path, symbol name.
2. Symbol Resolution: Use SymbolOracle from @kaioken/index (packages/index/src/oracle.ts) to verify the symbol's existence and locate its declaration.
3. Document Association: Inspect .kaioken/cards/ and .kaioken/wiki/ to identify the module and wiki chapter covering the declaring file.
4. Freshness Gate: Call computeStaleness from @kaioken/provenance (packages/provenance/src/staleness.ts). If the chapter's recorded source hashes differ from the current scan, flag it as STALE or ORPHANED.
5. Content Rendering: Assemble a clean Markdown hover response:
   - If STALE: Prepend a prominent warning: "⚠️ Stale Documentation: source code was modified since this chapter was generated. Run `kaioken update` to refresh."
   - Symbol signature and declaration line.
   - Architectural summary from the module card.
   - Relevant chapter excerpt, anchored via resolveExcerpt (packages/index/src/anchors.ts).
   - Navigation link to open the chapter.
6. Deterministic & Offline: The entire pipeline must run with zero network calls and zero model API requests.

Write comprehensive vitest unit tests in kaioken_v2/packages/serve/test/hover.test.ts testing fresh, stale, undocumented, and nonexistent symbols.
</task>

<verification_loop>
Run these commands from kaioken_v2/ and fix any issues:
  npm run typecheck
  npm test
Note: npm test executes "npm run build && vitest run", which runs packages/index/scripts/copy-queries.mjs. Do not run vitest directly without building.
Confirm that the hover tests pass and git status shows only intended additions in packages/serve/.
</verification_loop>

<missing_context_gating>
Do not invent symbol lookup methods. Read packages/index/src/oracle.ts for SymbolOracle methods (has, lookup, lookupIn) and packages/provenance/src/staleness.ts for computeStaleness input/output shapes. If any schema detail is unclear, read packages/wiki/src/types.ts and packages/plan/src/types.ts.
</missing_context_gating>

<action_safety>
Scope strictly to the hover resolution module and its unit tests. Do not alter existing tree-sitter grammars or wiki generation logic. Do NOT run git add or git commit — leave all changes uncommitted in the working tree for the orchestrator to review.
</action_safety>

<structured_output_contract>
End with: (1) summary of the hover resolution implementation, (2) files touched, (3) test suite output and counts, (4) how staleness is represented in the hover payload.
</structured_output_contract>
```
