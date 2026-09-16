# M6-04 · Audit and expand export target coverage

> Audit existing export capabilities against promised targets (`claude-md`, `agents-md`, `cursor`, `qoder`), document known gap G-1 (omission of research docs), and implement target-specific export formatters.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-audit-what-shipped` |
| **Blocks** | M11 (CI/CD integration), M12 (ecosystem GA) |
| **Touches** | `apps/cli/src/commands/export.ts`, `packages/agentsmd/src/` |
| **Risk** | Low: formatting and serialization changes only |
| **Gate-critical** | No |

## Why this exists

The original 12-month roadmap promised `--export claude-md, agents-md, cursor, qoder` to allow Kaioken knowledge to be consumed by other AI environments without requiring a local Kaioken runtime.

The TypeScript rewrite shipped two related mechanisms:
- `apps/cli/src/commands/export.ts:28` exports a fixed-layout bundle to `.kaioken/export/` containing raw markdown chapters, cards JSON, skills, `graph.json`, and `knowledge.md`.
- `packages/agentsmd` provides `generateAgents()` and `refreshKnowledgeBlock()` to maintain an `AGENTS.md` file in the repository root.

However, the specific named targets (`claude-md`, `cursor`, `qoder`) are **not yet implemented as export formats**, and `AGENTS.md` exists as a separate command rather than an integrated export target. Furthermore, **known gap G-1** ([README §6](../README.md#6-known-gaps-in-v2--documented-not-scheduled)) directly impacts export: because research documents use external URLs rather than local scanned file paths, they are excluded from the shared provenance index, and as a result `export` does not see or export research documents at all. This leaf audits what shipped, documents gap G-1 honestly in CLI output, and builds the missing target formatters.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Export command exports a single fixed bundle | `apps/cli/src/commands/export.ts:89-110` writes fixed `wiki/`, `cards/`, `skills/`, `graph.json`, and `knowledge.md` |
| No `--format` or `--target` flag exists | `apps/cli/src/commands/export.ts:32` treats positional arguments as output directories, with no format selection |
| AGENTS.md exists as a separate package | `packages/agentsmd/src/generate.ts:10` generates `AGENTS.md`, but is separate from `kaioken export` |
| Gap G-1 excludes research documents | `apps/cli/src/commands/export.ts:51-56` reads cards, wiki, and skills; `.kaioken/research/` is never read or packaged |
| Cursor and Claude formats do not exist | No generator exists in the repository for `.cursorrules`, `.cursor/rules/`, Claude Projects bundle, or Qoder context |

## What done looks like

- [ ] `kaioken export` supports `--format <bundle | claude-md | agents-md | cursor | qoder>` (default: `bundle`).
- [ ] Format outputs:
  - `bundle`: Current multi-file directory layout (`wiki/`, `cards/`, `skills/`, `graph.json`, `knowledge.md`).
  - `claude-md`: A single concatenated markdown file (`claude-project.md`) optimized for Claude.ai Project Knowledge uploads, containing architecture, wiki chapters, and skills with clear section dividers.
  - `agents-md`: Directly runs `packages/agentsmd` generator and outputs to target path or `AGENTS.md`.
  - `cursor`: Generates `.cursor/rules/kaioken.mdc` or root `.cursorrules` with concise repo architecture rules and index entrypoints.
  - `qoder`: Formats context rules suitable for Qoder agent configuration.
- [ ] Gap G-1 handling: If research documents exist in `.kaioken/research/`, `kaioken export` prints an honest notice:
  `notice: research documents in .kaioken/research/ are omitted from export (gap G-1: research is not aged)`
- [ ] Unit tests verify that each export formatter produces valid syntax and correct file layouts.

## Steps

1. **Add Target Format Handlers in `packages/graph` or `packages/agentsmd`**:
   - `renderClaudeMarkdown(cards, wikiFiles, skills, graph)`: merges knowledge into a single clean markdown document with a table of contents and token-efficient section headings.
   - `renderCursorRules(cards, skills, graph)`: renders concise instructions for Cursor's rule format (`.cursorrules` or `.cursor/rules/kaioken.mdc`).
   - `renderQoderRules(cards, skills, graph)`: renders context block for Qoder.

2. **Update `apps/cli/src/commands/export.ts`**:
   - Parse `flags.format` (`"bundle" | "claude-md" | "agents-md" | "cursor" | "qoder"`).
   - Check if `.kaioken/research/` contains files; if so, print the G-1 notice to stderr.
   - Switch on format and dispatch to the corresponding renderer.
   - Write files to target destination and output summary counts.

3. **Add Unit Tests**:
   - Add tests in `packages/agentsmd/test/` or `packages/graph/test/` verifying:
     - `claude-md` concatenation integrity and absence of broken links.
     - `cursor` rule formatting.
     - Gap G-1 warning generation when research files exist.

## In scope

- `apps/cli/src/commands/export.ts`
- `packages/agentsmd/src/` or `packages/graph/src/render-export.ts`
- Tests covering export target formatting

## Out of scope

- Closing gap G-1 (re-architecting web research with re-fetch capabilities is a separate architectural task).
- Modifying `buildGraph()` in `packages/graph/src/build.ts`.
- Altering the core bundle structure for default exports.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js export --help
```

Working tree must show only modified files in `apps/cli` and export packages.

## Traps

| Trap | Guard |
|---|---|
| Hiding gap G-1 | State plainly in stdout/stderr when research files are detected: research documents cannot be exported until G-1 is resolved |
| Exceeding token limits in `claude-md` | Do not include raw JSON dumps of graphs or duplicate card bodies in single-file markdown exports; summarize entrypoints cleanly |
| Overwriting custom user `.cursorrules` without warning | Check if `.cursorrules` exists before overwriting, or output to `.kaioken/export/cursorrules` when a custom destination is specified |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement multi-target export formatters in apps/cli/src/commands/export.ts and document gap G-1.

Current state:
- apps/cli/src/commands/export.ts:28 exports a single fixed bundle layout.
- The original ship list promised --export claude-md, agents-md, cursor, and qoder.
- Gap G-1 means research documents in .kaioken/research/ are omitted from exports without notice.

Required changes:
1. In apps/cli/src/commands/export.ts:
   - Accept `--format <bundle|claude-md|agents-md|cursor|qoder>` (default: "bundle").
   - If .kaioken/research/ exists, print a notice to stderr explaining gap G-1:
     "notice: research documents in .kaioken/research/ omitted from export (known gap G-1: research is not aged)".
   - Implement format renderers:
     * `claude-md`: creates a single clean markdown file (e.g. `claude-project.md`) combining architecture,
       wiki chapters, and skills.
     * `agents-md`: calls packages/agentsmd to generate standard AGENTS.md.
     * `cursor`: writes concise `.cursorrules` or `.cursor/rules/kaioken.mdc`.
     * `qoder`: writes `qoder.md` context instructions.
2. Add unit tests for each export format renderer verifying file outputs and content integrity.

Verify that default `kaioken export` remains 100% backward-compatible.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified files in apps/cli and export packages.
</verification_loop>

<action_safety>
Scope strictly to export formatting and CLI flags. Do NOT attempt to close gap G-1 in this task.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) description of the 4 new export format outputs, (2) files touched,
(3) example output of the G-1 research notice, (4) test suite outcomes from vitest.
</structured_output_contract>
```
