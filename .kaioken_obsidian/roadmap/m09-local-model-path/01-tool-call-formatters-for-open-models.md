# M9-01 · Tool-call formatters for open models

> Implement Hermes-style and ChatML prompt formatters and extraction templates so open-weight models served by vLLM, Ollama, and llama.cpp can reliably invoke tools.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `M1-01` (green CI baseline) |
| **Blocks** | `02-structured-output-fallback`, `03-per-operation-model-routing`, `04-offline-profile` |
| **Touches** | `packages/model/src/formatters.ts`, `packages/model/src/index.ts`, `packages/model/test/formatters.test.ts`, `apps/cli/src/model.ts` |
| **Risk** | Medium. Must ensure prompt wrapping does not degrade base model reasoning |
| **Gate-critical** | Yes — foundation for all local model tool execution |

## Why this exists

Operating rule 1 reminds us that review capacity is the bottleneck. The largest obstacle to community adoption is the friction and expense of hosted API keys. Running locally on Ollama, vLLM, or llama.cpp removes this friction entirely.

However, open-weight models (such as Qwen 2.5 Coder, DeepSeek-R1-Distill, and Llama 3) do not interact with tools through the proprietary JSON schemas used by Anthropic or OpenAI. Instead, they expect prompt-level tool definitions formatted according to the **Hermes / ChatML** convention: tools declared inside `<tools>` blocks in the system prompt, and invocations emitted as `<tool_call>{"name": ..., "arguments": ...}</tool_call>`. Without dedicated formatters and extraction logic, open models emit raw text instead of structured calls, immediately breaking the agent loop.

## Current state

Verified in `kaioken_v2/packages/model/` and `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Model client interface is transport-agnostic | `kaioken_v2/packages/model/src/index.ts:20-22` | `ModelClient` defines `complete(request: ModelRequest): Promise<string>` |
| Model resolution depends on pi-ai provider catalog | `kaioken_v2/apps/cli/src/model.ts:107-135` | `resolveModel` relies on `@earendil-works/pi-ai` builtins; fails if provider is unconfigured |
| Runtime tool translation assumes native API schemas | `kaioken_v2/apps/cli/src/agent-host.ts:29-82` | `toRuntimeTools` maps `@kaioken/agent` tools directly into `TypeBox` JSON Schema |
| Open endpoints output tool calls in body text | `kaioken_v2/apps/cli/src/commands/chat.ts:240-275` | Local endpoints (Ollama / llama.cpp) frequently wrap tool calls in text tags rather than structured `tool_calls` fields |
| Zero open-model prompt formatters in tree | `kaioken_v2/packages/model/src/index.ts:1-22` | No Hermes or ChatML template engine exists in `@kaioken/model` |

`UNVERIFIED:` whether Ollama's native `/api/chat` OpenAI-compatibility endpoint supports native tool calls cleanly across all quantized versions of Qwen 2.5 Coder.

## What done looks like

- [ ] New module `packages/model/src/formatters.ts` providing:
  - `formatHermesTools(tools: readonly ToolSpec[]): string`: renders tool signatures into the standardized `<tools>` block.
  - `parseHermesToolCalls(text: string): ParsedToolCall[]`: extracts one or more tool calls from `<tool_call>` tags or raw JSON blocks.
  - `stripToolCallTags(text: string): string`: cleans assistant prose so user messages don't retain raw XML tags.
- [ ] Integration in `apps/cli/src/model.ts`:
  - When a model spec targets an open provider (`ollama/*`, `vllm/*`, `llamacpp/*`, or `local/*`), the client automatically attaches Hermes formatting to the system prompt and intercepts text replies.
  - Text-based tool calls are translated into first-class runtime tool executions.
- [ ] Full characterization tests in `packages/model/test/formatters.test.ts` testing:
  - Tool definition rendering.
  - Extraction of single and parallel tool calls inside `<tool_call>` tags.
  - Extraction of tool calls wrapped in markdown fences.

## Steps

1. **Implement Hermes Formatters (`packages/model/src/formatters.ts`):**
   - Define interfaces:
     ```ts
     export interface ToolSpec {
       name: string;
       description: string;
       parameters: Record<string, unknown>;
     }
     export interface ParsedToolCall {
       name: string;
       arguments: Record<string, unknown>;
       raw: string;
     }
     ```
   - Implement `formatHermesTools(tools)`:
     ```
     # Tools
     You have access to the following tools:
     <tools>
     {"name": "...", "description": "...", "parameters": {...}}
     </tools>
     To call a tool, respond with:
     <tool_call>
     {"name": "tool_name", "arguments": {...}}
     </tool_call>
     ```
   - Implement `parseHermesToolCalls(reply)`:
     - Regex match `<tool_call>([\s\S]*?)<\/tool_call>`.
     - Extract and parse JSON body.
     - Fallback: inspect for raw ```json ``` blocks with `"name"` and `"arguments"`.
2. **Re-export Formatters from `packages/model/src/index.ts`:**
   - Ensure clean access from `apps/cli`.
3. **Wire Local Provider Adapter in `apps/cli/src/model.ts`:**
   - Detect if provider is local (`ollama`, `vllm`, `llamacpp`, `localhost`).
   - If local, inject Hermes system prompt instructions and enable text-based tool call extraction.
4. **Comprehensive Unit Testing (`packages/model/test/formatters.test.ts`):**
   - Verify tool schema formatting.
   - Verify extraction of single and multiple tool calls.
   - Verify whitespace tolerance and raw text stripping.

## In scope

- `kaioken_v2/packages/model/src/formatters.ts`
- `kaioken_v2/packages/model/src/index.ts`
- `kaioken_v2/packages/model/test/formatters.test.ts`
- Local provider hook in `kaioken_v2/apps/cli/src/model.ts`

## Out of scope

- Deep AST repair of broken JSON syntax (that is M9-02).
- Automatic downloading or installation of Ollama binaries.
- Multi-model routing logic (that is M9-03).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/model/test/formatters.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Open models outputting tool calls in both message content and API fields | Check API structured tool calls first; only fallback to text extraction if structured calls are empty |
| Models wrapping tool call JSON inside markdown fences within the `<tool_call>` tag | Strip ```json ... ``` code fences inside `<tool_call>` tags before parsing |
| Model emitting conversational prose before `<tool_call>` | Extract tool calls without discarding preceding conversational text, retaining the reasoning chain |
| Hardcoding specific model names | Key behavior on provider family (`ollama`, `vllm`, `llamacpp`) or explicit `--template hermes` flag |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/model/, implement Hermes-style tool-call formatting and extraction templates for open-weight models served by vLLM, Ollama, and llama.cpp.

Current state:
- packages/model/src/index.ts defines ModelClient and multiplier helpers, but lacks open-model prompt formatters.
- Open models (Qwen 2.5 Coder, Llama 3, DeepSeek) expect Hermes/ChatML tool formatting (<tools> in prompt, <tool_call> in output) rather than proprietary provider APIs.
- apps/cli/src/model.ts routes all models through pi-ai provider builtins.

1. Implement kaioken_v2/packages/model/src/formatters.ts:
   - Define interface ToolSpec with name: string, description: string, parameters: Record<string, unknown>.
   - Define interface ParsedToolCall with name: string, arguments: Record<string, unknown>, raw: string.
   - Implement formatHermesTools(tools: readonly ToolSpec[]): string:
     - Formats standard Hermes prompt section with <tools> XML block containing one-line JSON tool schemas.
     - Adds usage instructions directing the model to emit <tool_call>{"name": "...", "arguments": {...}}</tool_call>.
   - Implement parseHermesToolCalls(reply: string): ParsedToolCall[]:
     - Extracts content between <tool_call> and </tool_call> tags.
     - Strips any accidental markdown code fences (```json) inside tags.
     - Parses JSON into { name, arguments, raw }.
     - Returns empty array if no tool calls exist.
   - Implement stripToolCallTags(reply: string): string:
     - Returns assistant prose with all <tool_call> blocks removed and whitespace trimmed.
2. Re-export formatting functions from kaioken_v2/packages/model/src/index.ts.
3. In kaioken_v2/apps/cli/src/model.ts:
   - When the resolved provider is local (provider is "ollama", "vllm", "llamacpp", or base URL is localhost), enable Hermes prompt formatting and parse text-based tool calls.
4. Add unit tests in kaioken_v2/packages/model/test/formatters.test.ts testing:
   - Tool schema prompt generation.
   - Extraction of single tool call.
   - Extraction of multiple parallel tool calls.
   - Extraction when model wraps JSON in markdown fences inside the XML tag.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/model/test/formatters.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/model/src/formatters.ts, packages/model/src/index.ts, packages/model/test/formatters.test.ts, and apps/cli/src/model.ts.
</verification_loop>

<missing_context_gating>
Do not guess Hermes XML tag syntax. Use the standard Hermes 2 / ChatML convention: <tools>...</tools> in system prompt and <tool_call>...</tool_call> in assistant response.
</missing_context_gating>

<action_safety>
Scope strictly to packages/model/ and apps/cli/src/model.ts. Do not touch packages/agent or packages/scan. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of Hermes formatting and extraction implementation.
2. Exact files touched in packages/model/ and apps/cli/.
3. Vitest test results and counts.
4. Confirmation of compatibility with Ollama and vLLM output conventions.
</structured_output_contract>
```
