# M4-04 · Implement RAG over wiki with citations

> Automatically retrieve relevant wiki passages into chat and agent prompt context using parent-child retrieval from `packages/prism`, formatted with direct markdown citation links to source documents.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-retrieval-eval-harness` (gated on harness baseline existing first), `02-unified-search-tool-modes` |
| **Blocks** | M10 (Studio chat pane and wiki reader integration) |
| **Touches** | `packages/prism/src/`, `packages/agent/src/prompt.ts`, `apps/cli/src/commands/chat.ts` |
| **Risk** | Medium: unpruned or low-relevance context injection bloats prompts and degrades reasoning |
| **Gate-critical** | No |

## Why this exists

Kaioken generates high-quality, verified markdown documentation in `.kaioken/wiki/` and structured cards in `.kaioken/cards/`. However, currently neither the agent loop (`packages/agent/src/prompt.ts:15`) nor the interactive chat command (`apps/cli/src/commands/chat.ts`) automatically retrieves relevant documentation when a user asks a question. Instead, the agent is expected to know that a topic exists and manually invoke search tools across multiple round-trips.

`packages/prism` already ships parent-child chunking (`packages/prism/src/chunk.ts:22`) and grounded retrieval (`packages/prism/src/retrieve.ts:46`). What is missing is the bridge: automatically retrieving relevant chapter passages for the user's incoming query, injecting them as a compact grounding context block before the agent runs, and formatting every passage with verifiable citation links back to the source markdown files (e.g. `[wiki/architecture.md:45](file:///.kaioken/wiki/architecture.md#L45)`). Gating this on leaf 01's eval harness ensures that injected passages measurably improve answer quality without polluting context windows.

## Current state

Verified against the working tree:

| Fact | Evidence |
|---|---|
| Parent-child chunking is implemented in Prism | `packages/prism/src/chunk.ts:22` `chunkParentChild()` decouples retrieval window from context window |
| Prism retrieval and grounded answering exist | `packages/prism/src/retrieve.ts:46` and `packages/prism/src/ask.ts:49` retrieve passages and format numbered citations |
| Agent system prompt deliberately excludes wiki | `packages/agent/src/prompt.ts:15-18` notes wiki is kept out of initial prompt to save context |
| Chat command lacks auto-retrieval | `apps/cli/src/commands/chat.ts:60-120` runs turn loops without pre-retrieving knowledge context |
| Wiki documents have stable file paths | `packages/wiki/src/artifact.ts:16, 144` writes chapters to `.kaioken/wiki/<path>` |

## What done looks like

- [ ] A dedicated RAG context retriever function `retrieveWikiContext(root: string, query: string, maxTokens?: number)` is exported from `packages/prism`.
- [ ] Retrieval segments use Prism parent-child chunking: child segments are scored for relevance, and their parent section text is returned with 1-based start line numbers.
- [ ] Injected passages include explicit markdown citation headers:
  ```markdown
  ### Context: [wiki/core/retrieval.md:35](file:///path/to/.kaioken/wiki/core/retrieval.md#L35)
  > Passage excerpt...
  ```
- [ ] In `apps/cli/src/commands/chat.ts`, incoming user messages retrieve top-k (default 3) relevant passages into the conversational turn context when `.kaioken/wiki/` exists.
- [ ] The agent system prompt instruct the model: *"When citing architecture or module behavior, cite the source wiki document link provided in the grounding context."*
- [ ] The eval harness (`packages/search/test/eval/`) scores conceptual question recall with RAG enabled, confirming a measurable gain over the BM25 baseline.

## Steps

1. **Build Wiki Passage Retriever in `packages/prism`**:
   In `packages/prism/src/wiki-rag.ts`:
   - Implement `indexWikiDocuments(root: string)`: reads all files in `.kaioken/wiki/`, applies `chunkParentChild()`, and indexes them in a transient or cached Prism store.
   - Implement `retrieveWikiContext(root: string, query: string, options?: { maxPassages?: number; maxTokens?: number })`:
     - Runs `retrieve()` over the indexed wiki modules.
     - Formats hits with relative path and 1-based line anchors: `[${doc.path}:${startLine}]`.
     - Clamps total injected text to `maxTokens` (default 1,500 tokens) to prevent prompt exhaustion.

2. **Integrate into Agent Prompt & Chat Command**:
   - In `packages/agent/src/prompt.ts`: add optional `ragContext?: string` to `PromptOptions`. When present, format under `## Relevant Documentation`.
   - In `apps/cli/src/commands/chat.ts`: before dispatching user turns to the model, call `retrieveWikiContext(root, userTurn)`. If relevant passages score above threshold, inject into turn context.

3. **Verify Citation Formatting & Link Integrity**:
   - Write unit tests in `packages/prism/test/wiki-rag.test.ts` verifying:
     - Correct parent-child chunking over multi-heading markdown.
     - Accurate 1-based line numbers generated for citation anchors.
     - Token clamping drops lower-ranked passages rather than truncating mid-sentence.

4. **Measure Impact Against Eval Harness**:
   - Run `packages/search/test/eval/eval.test.ts` on conceptual questions to verify that the RAG pipeline correctly surfaces expected chapters.

## In scope

- `packages/prism/src/wiki-rag.ts`
- `packages/prism/src/index.ts`
- `packages/prism/test/wiki-rag.test.ts`
- `packages/agent/src/prompt.ts`
- `apps/cli/src/commands/chat.ts`

## Out of scope

- Regenerating wiki chapters or altering `packages/wiki/src/generate.ts`.
- Storing vectors in external cloud databases.
- Modifying `SymbolOracle` declaration lookups.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
node apps/cli/dist/bin.js chat --help
```

Working tree must show only modifications to `packages/prism`, `packages/agent`, and `apps/cli`.

## Traps

| Trap | Guard |
|---|---|
| Injecting low-confidence passages that mislead the model | Apply a minimum similarity/BM25 threshold; if no passage qualifies, inject zero context rather than noise |
| Context blowup from unpruned parent chunks | Enforce strict `maxTokens` clamping (1,500 tokens maximum) across all injected passages combined |
| Stale line citations | Derive line numbers dynamically from the on-disk markdown files rather than relying on stale cache offsets |
| Running without the eval harness baseline | Prerequisite check: leaf 01 MUST have committed `BASELINE.md` before this work begins |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Implement RAG over generated wiki chapters with markdown citation links, backed by packages/prism.

Current state:
- packages/prism/src/chunk.ts:22 provides `chunkParentChild()` for parent-child chunking.
- packages/prism/src/retrieve.ts:46 provides `retrieve()` for grounded passage retrieval.
- Neither packages/agent/src/prompt.ts nor apps/cli/src/commands/chat.ts automatically retrieves
  wiki context; the wiki is only available if the model explicitly decides to run a search tool.

Required changes:
1. In packages/prism/src/wiki-rag.ts:
   - Implement `retrieveWikiContext(root: string, query: string, options?: { maxPassages?: number; maxTokens?: number })`.
   - Ingest files from .kaioken/wiki/ using parent-child chunking.
   - Return formatted passages with clickable file/line citations: `[wiki/<doc.path>:<line>]`.
   - Export this from packages/prism/src/index.ts.
2. In packages/agent/src/prompt.ts:
   - Accept optional `ragContext?: string` in PromptOptions and render it under `## Relevant Documentation`.
3. In apps/cli/src/commands/chat.ts:
   - Before executing a chat turn, call `retrieveWikiContext` with the user query and inject retrieved
     passages into the turn if confidence exceeds the threshold.
4. Add comprehensive unit tests in packages/prism/test/wiki-rag.test.ts.

Verify that all tests run offline without network access or API credentials.
</task>

<verification_loop>
Run these from kaioken_v2/ and fix what they surface:
  npm run build
  npm run typecheck
  npm test
Confirm working tree shows only modified files in packages/prism, packages/agent, and apps/cli.
</verification_loop>

<action_safety>
Scope strictly to packages/prism, packages/agent/src/prompt.ts, and apps/cli/src/commands/chat.ts.
Do NOT modify packages/wiki chapter generation code.
Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed in Prism and Agent/CLI, (2) touched files, (3) test outcomes for wiki-rag
and token-clamping tests, (4) eval harness metric comparison on conceptual questions.
</structured_output_contract>
```
