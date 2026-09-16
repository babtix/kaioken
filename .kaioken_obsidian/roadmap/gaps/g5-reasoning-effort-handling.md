# GAP-05 · Per-endpoint reasoning effort parameter handling

> Reasoning effort is requested at `minimal` for any reasoning-capable model because some endpoints
> refuse requests when reasoning is disabled. Formalise per-endpoint quirk handling to feed Milestone M9.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | Milestone M9 (Local-model path & provider quirks) |
| **Touches** | `kaioken_v2/packages/model/`, `kaioken_v2/apps/cli/src/model.ts`, `apps/cli/src/commands/chat.ts` |
| **Risk** | Low — isolated provider parameter translation |
| **Gate-critical** | No |

## Why this exists

Quoted directly from [`kaioken_v2/README.md:381-382`](../../kaioken_v2/README.md#L381-L382):

> *Reasoning is requested at "minimal" for any model marked as reasoning-capable, because some endpoints
> refuse to serve one with reasoning disabled.*

Provider implementations of extended reasoning / "thinking" (DeepSeek-R1, OpenAI o1/o3-mini, Anthropic
Claude 3.7 Sonnet Extended Thinking, Gemini 2.0 Flash Thinking) vary drastically across API gateways:
- Some OpenAI endpoints reject `reasoning_effort: "none"` or `max_completion_tokens` errors if reasoning
  is turned off.
- Certain OpenRouter proxy endpoints return HTTP 400 if `thinking: { type: "disabled" }` is passed to a
  reasoning-distilled model.
- Other providers require explicit integer token budgets (`thinking: { budget_tokens: 1024 }`), while
  some accept only categorical strings (`low`, `medium`, `high`).

To prevent crashes on live runs, `kaioken_v2` hardcoded a defensive default: always requesting
`minimal` reasoning whenever a model is flagged reasoning-capable. While this avoids gateway 400
errors, it forces unexpected latency and cost on users who want instantaneous, non-reasoning responses.
Milestone M9 (Local-model path) requires a robust, per-endpoint translation adapter to handle these
quirks cleanly.

## Current state

Verified against [`kaioken_v2/apps/cli/src/commands/chat.ts:100-102`](../../kaioken_v2/apps/cli/src/commands/chat.ts#L100-L102)
and [`kaioken_v2/apps/cli/src/model.ts`](../../kaioken_v2/apps/cli/src/model.ts):

| Fact | Evidence |
|---|---|
| Thinking flag supported in CLI | `apps/cli/src/commands/chat.ts:101` accepts `thinking?: string` ("off", "minimal", "low", "medium", "high", "max") |
| Defensive minimal default | If `thinking` is omitted or set to `off`, reasoning-capable models are clamped to `minimal` to avoid provider rejections |
| Provider variance | OpenRouter, Anthropic direct, and Ollama handle reasoning parameters under completely different JSON schemas |
| Feeds M9 | Milestone M9 requires custom tool-call formatters and parameter adaptation for open and local models |

## What done looks like

- [ ] A dedicated `normalizeThinkingOptions(provider, model, requestedEffort)` adapter in `packages/model`
      or `apps/cli/src/model.ts`.
- [ ] Explicit endpoint mapping:
  - **Anthropic:** Translates `thinking: "off"` to omitted parameter; `thinking: "medium"` to `thinking: { type: "enabled", budget_tokens: 2048 }`.
  - **OpenAI (o1/o3):** Translates to `reasoning_effort: "low" | "medium" | "high"`.
  - **OpenRouter:** Detects models that refuse disabled reasoning and safely falls back to lowest supported token budget.
  - **Ollama / Local:** Omits proprietary reasoning keys; passes prompt-level system instructions.
- [ ] Users passing `--thinking off` get genuine non-reasoning execution whenever the underlying
      endpoint supports it, saving tokens and response latency.

## Steps

1. **Catalog Endpoint Quirks:**
   - Document the specific error payloads from OpenRouter, DeepSeek direct, and Anthropic when
     reasoning parameters are varied.
2. **Implement Parameter Normalizer:**
   - In `apps/cli/src/model.ts`, create `resolveThinkingConfig(provider: string, modelId: string, level: string)`.
   - Map `level: "off"` to safe schemas per provider.
3. **Add Tests for Provider Mapping:**
   - In `apps/cli/test/model.test.ts`, add test matrix verifying output request payloads for:
     - Anthropic `claude-3-7-sonnet` (budget tokens)
     - OpenAI `o3-mini` (reasoning_effort string)
     - OpenRouter `deepseek/deepseek-r1` (minimal fallback)
     - Ollama `deepseek-r1:7b` (local handling)

## In scope

- `kaioken_v2/apps/cli/src/model.ts`
- `kaioken_v2/apps/cli/src/commands/chat.ts`
- `kaioken_v2/apps/cli/test/model.test.ts`

## Out of scope

- Prompt engineering to suppress chain-of-thought in pure open-weights models.
- Training custom reasoning token filters.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

All model resolution tests must pass, confirming correct thinking parameter translation for each provider family.

## Traps

| Trap | Guard |
|---|---|
| Sending `reasoning_effort: "none"` to OpenAI o1 | o1 endpoints return 400 Bad Request if reasoning is set to none or disabled. For o1, reasoning cannot be completely disabled. |
| Budget tokens lower than Anthropic minimum | Anthropic requires `budget_tokens >= 1024`. Setting `budget_tokens: 100` throws API error. Clamp to minimum 1024. |

## Open questions

None. The provider API specifications are publicly documented.

## Session brief

```xml
<task>
In kaioken_v2/, close Gap G-5 by formalising per-endpoint reasoning effort parameter handling in
apps/cli/src/model.ts:

1. In apps/cli/src/model.ts, implement resolveThinkingConfig(provider: string, modelId: string, level?: string):
   - Map levels ("off", "minimal", "low", "medium", "high", "max") into provider-specific payloads:
     - Anthropic: { type: "enabled", budget_tokens: N } (clamping N >= 1024). If "off", omit parameter.
     - OpenAI / o-series: reasoning_effort ("low" | "medium" | "high").
     - OpenRouter: inspect model prefix; use minimal budget only when endpoint rejects "disabled".
     - Local/Ollama: strip reasoning parameters to prevent unknown parameter rejections.

2. In apps/cli/src/commands/chat.ts, route flags.thinking through resolveThinkingConfig() before
   calling the model client.

3. Add unit tests in apps/cli/test/model.test.ts asserting that each provider generates valid
   parameters without throwing 400 errors.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm all offline unit tests pass.
</verification_loop>

<action_safety>
Do not make live network calls in unit tests. Mock provider configurations offline.
Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) provider mapping logic implemented in model.ts, (2) unit test matrix outcomes,
(3) confirmation that --thinking off is respected where endpoints allow.
</structured_output_contract>
```
