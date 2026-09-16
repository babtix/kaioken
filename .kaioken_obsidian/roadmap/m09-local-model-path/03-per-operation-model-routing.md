# M9-03 · Per-operation local and remote model routing

> Split model workloads by task purpose: route cheap, high-frequency operations (planning, scanning, compaction) to local models while routing deep chapter generation to strong remote models.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-tool-call-formatters-for-open-models`, `02-structured-output-fallback` |
| **Blocks** | `04-offline-profile` |
| **Touches** | `packages/model/src/router.ts`, `packages/model/src/index.ts`, `packages/model/test/router.test.ts`, `apps/cli/src/model.ts` |
| **Risk** | Low. Existing code already carries `ModelRequest.purpose`; this builds the routing dispatcher |
| **Gate-critical** | No — cost optimization and hybrid execution |

## Why this exists

Operating rule 1 states that the bottleneck is review, not generation. In end-to-end repository indexing (`kaioken wiki x3`), dozens of discrete model invocations take place: module decomposition (`plan`), knowledge card summarization (`cards`), transcript compaction (`compact`), and finally long-form chapter writing (`wiki`). 

Using an expensive frontier model (Claude 3.5 Sonnet, GPT-4o) for simple structural extraction or conversational compaction wastes money. Conversely, running a small 7B model for an entire 3,000-word architectural chapter yields shallow prose. The routing infrastructure was anticipated in the v2 engine design via `ModelRequest.purpose` (`packages/model/src/index.ts:13`). By wiring this field into a local/remote router, developers can execute 80% of pipeline calls on free local weights while reserving commercial models for high-leverage generation.

This leaf also addresses **Gap G-5**: reasoning-capable models (such as DeepSeek-R1, o1, or o3-mini) reject requests if reasoning is explicitly disabled. The router must manage endpoint-specific reasoning parameters (`reasoning: "minimal"`) cleanly across different routed targets.

## Current state

Verified in `kaioken_v2/packages/model/` and `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Purpose metadata exists on every request | `kaioken_v2/packages/model/src/index.ts:13` | `ModelRequest` interface specifies `purpose: string` |
| Single model client returned today | `kaioken_v2/apps/cli/src/model.ts:40-90` | `resolveModelClient(flags)` resolves exactly one model for the entire command |
| Gap G-5: Endpoint reasoning quirk | `kaioken_v2/apps/cli/src/model.ts:60-64` | *"Reasoning defaults to off, and some endpoints refuse to serve a reasoning model with it disabled. 'minimal' keeps it enabled..."* |
| Synthesized models lack exact caps | `kaioken_v2/apps/cli/src/model.ts:200-204` | Unrecognized local models borrow limits from closest catalog sibling (Gap G-4) |
| Multiplier scaling in place | `kaioken_v2/packages/model/src/index.ts:69-86` | `depthFor(multiplier)` controls token ceilings and pass counts across stages |

`UNVERIFIED:` whether managing simultaneous connection pools to both local Ollama and remote APIs creates memory pressure on low-spec developer machines.

## What done looks like

- [ ] New module `packages/model/src/router.ts` defining:
  - `ModelRouteConfig`: mapping of stage prefixes (`plan`, `scan`, `compact`, `card`, `wiki`, `skill`) to model spec strings.
  - `createRoutedClient(routes: ModelRouteConfig, resolver: (spec: string) => Promise<ModelClient>): ModelClient`
- [ ] Declarative routing configuration in `.kaioken/model.json`:
  ```json
  {
    "model": "anthropic/claude-3-5-sonnet",
    "routes": {
      "plan": "ollama/qwen2.5-coder:14b",
      "compact": "ollama/qwen2.5-coder:7b",
      "card": "ollama/qwen2.5-coder:14b",
      "wiki": "anthropic/claude-3-5-sonnet"
    }
  }
  ```
- [ ] Resilient handling of Gap G-5:
  - Router passes appropriate reasoning constraints (`reasoning: "minimal"` or provider-specific flags) based on each target model's advertised capabilities.
- [ ] Graceful fallback: if a routed local model endpoint is unreachable, fallback to the default model client with a warning rather than failing the run.
- [ ] Unit tests in `packages/model/test/router.test.ts` verifying request dispatch based on `request.purpose`.

## Steps

1. **Implement Model Router (`packages/model/src/router.ts`):**
   - Define interface `ModelRouteConfig`: `{ default: string; routes?: Record<string, string> }`.
   - Implement `createRoutedClient`:
     - Maintains a client cache keyed by model spec string.
     - For each `complete(request: ModelRequest)`:
       1. Match `request.purpose` against configured route prefixes (e.g. `"plan"` matches `"plan module auth"`).
       2. Resolve target model spec (or fall back to `default`).
       3. Dispatch call to the cached target client.
2. **Handle Endpoint Quirks & Gap G-5:**
   - Detect if the target model for a route supports or requires reasoning tokens.
   - Inject `reasoning: "minimal"` where necessary, avoiding invalid parameter rejections.
3. **Update CLI Model Resolution (`apps/cli/src/model.ts`):**
   - In `readRepoModel(root)`: read optional `routes` block from `.kaioken/model.json`.
   - In `resolveModelClient(flags)`: if routes are present, wrap clients in `createRoutedClient`.
4. **Testing (`packages/model/test/router.test.ts`):**
   - Mock multiple `ModelClient` instances (`localClient`, `remoteClient`).
   - Verify requests with `purpose: "plan auth"` dispatch to `localClient`.
   - Verify requests with `purpose: "wiki architecture"` dispatch to `remoteClient`.
   - Verify unknown purposes fall back to `default`.

## In scope

- `kaioken_v2/packages/model/src/router.ts`
- `kaioken_v2/packages/model/src/index.ts`
- `kaioken_v2/packages/model/test/router.test.ts`
- Model resolution updates in `kaioken_v2/apps/cli/src/model.ts`

## Out of scope

- Dynamic load balancing or latency-based auto-routing.
- Real-time token arbitrage or spot-price routing.
- Modifying generative stage prompts.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/model/test/router.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Rebuilding client connections per request | Cache resolved `ModelClient` instances in a map inside `createRoutedClient` |
| Route prefix mismatch (e.g. `wiki_section` vs `wiki`) | Normalize purpose matching using lowercase prefix and word boundary checks |
| Gap G-5: Local reasoning models failing on `reasoning: undefined` | Query model capability flags and ensure `reasoning: "minimal"` is passed when required |
| Local server offline breaking remote workflows | If local endpoint connection throws `ECONNREFUSED`, log a warning and fall back to `default` client |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/model/, implement per-operation local and remote model routing, allowing cheap local models to handle planning, scanning, and compaction while strong remote models handle deep chapter generation.

Current state:
- packages/model/src/index.ts defines ModelRequest with `purpose: string` at line 13, designed for stage-based routing.
- apps/cli/src/model.ts resolves only a single ModelClient per execution.
- Gap G-5 is documented in apps/cli/src/model.ts:60-64: reasoning models reject requests if reasoning is improperly configured.

1. Implement kaioken_v2/packages/model/src/router.ts:
   - Define interface RouteTable: { default: string; routes?: Record<string, string> }.
   - Implement createRoutedClient(table: RouteTable, clientResolver: (spec: string) => Promise<ModelClient>): ModelClient:
     - Lazily caches resolved ModelClient instances per model spec.
     - On complete(request: ModelRequest):
       - Inspects request.purpose (e.g. "plan", "card", "compact", "wiki", "skill").
       - Matches the leading purpose keyword against table.routes.
       - Dispatches to the matched client, or falls back to table.default.
       - If the selected local client fails with network connection refused, logs a fallback warning and retries against the default client.
2. Address Gap G-5:
   - Ensure the client wrapper accounts for per-model reasoning requirements, setting reasoning to "minimal" for reasoning-capable models.
3. Re-export createRoutedClient from packages/model/src/index.ts.
4. Update apps/cli/src/model.ts:
   - In readRepoModel(), parse optional `routes` object from .kaioken/model.json.
   - If routes exist, wrap resolved clients using createRoutedClient.
5. Add unit tests in packages/model/test/router.test.ts:
   - Verify purpose "plan" routes to local mock client.
   - Verify purpose "wiki" routes to remote mock client.
   - Verify fallback to default client when purpose is unmapped.
   - Verify fallback when local client throws connection error.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/model/test/router.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/model/src/router.ts, packages/model/src/index.ts, packages/model/test/router.test.ts, and apps/cli/src/model.ts.
</verification_loop>

<missing_context_gating>
Do not invent new routing schemas. Use the existing ModelRequest.purpose field. Maintain backwards compatibility when no routes table is configured.
</missing_context_gating>

<action_safety>
Scope strictly to packages/model/ and apps/cli/src/model.ts. Do not modify packages/wiki or packages/plan. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of model router implementation and purpose matching.
2. Exact files touched in packages/model/ and apps/cli/.
3. Vitest test results and counts.
4. Confirmation of Gap G-5 handling across routed endpoints.
</structured_output_contract>
```
