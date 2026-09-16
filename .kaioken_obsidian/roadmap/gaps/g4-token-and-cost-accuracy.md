# GAP-04 · Token and cost accounting accuracy under provider variance

> Token and cost figures can be inaccurate or missing when a provider does not return usage accounting,
> requiring explicit honesty indicators and a fail-closed policy for financial safety limits.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | Studio v0.1 Cost Meter, Studio Multiplier Cost Preview, Milestone M7 Spend Ceiling |
| **Touches** | `kaioken_v2/apps/cli/src/model.ts`, `kaioken_v2/packages/model/`, `ide_kaioken/kaioken_studio_theia/` |
| **Risk** | **High — load-bearing safety control for financial spend limits** |
| **Gate-critical** | **Yes — blocks financial safety controls** |

## Why this exists

Quoted directly from [`kaioken_v2/README.md:378-380`](../../kaioken_v2/README.md#L378-L380):

> *pi-ai's bundled model catalog is a snapshot. A model it has not heard of is used anyway, with limits
> cloned from the nearest sibling of the same provider and a warning printed — token and cost figures
> may then be wrong.*

This gap is **load-bearing for three critical systems** across the roadmap:
1. **The Studio Cost Meter (`studio-v0.1/03-theme-and-status-bar.md`):** Displays cumulative dollar
   and token expenditure in the IDE status bar.
2. **The Multiplier Cost Preview (`studio-v0.1/README.md` & `studio-design-brief.md`):** Estimates
   queries, tokens, and dollars *before* execution as the user dials between ×1 and ×10.
3. **Milestone M7 Resource Ceilings (`roadmap/m07-permissions-and-sandboxing/`):** Implements an
   unattended spend ceiling (e.g. `$2.00` max per session).

> [!danger] The Fail-Closed Safety Mandate
> When model accounting is unavailable, an automated spend ceiling **MUST FAIL CLOSED**.
> If an agent cannot measure how much money it has spent, it must not assume the cost was `$0.00`
> and continue looping indefinitely. It must either stop execution or require explicit human
> confirmation for every subsequent turn. Pretending precision when blind is a catastrophic failure mode.

## Current state

Verified against [`kaioken_v2/apps/cli/src/model.ts`](../../kaioken_v2/apps/cli/src/model.ts)
and [`kaioken_v2/README.md:378-380`](../../kaioken_v2/README.md#L378-L380):

| Fact | Evidence |
|---|---|
| Model catalog is a static snapshot | Model specs, token limits, and pricing rates rely on hardcoded pricing tables and `@earendil-works/pi-ai` bundled definitions |
| Fallback clones nearest sibling | When an unrecognised model is requested (e.g. newly released OpenRouter endpoints), limits and prices are cloned from a sibling model with a warning printed |
| Missing usage in streaming responses | Some endpoints (e.g. local Ollama, vLLM, certain OpenRouter free models) omit token counts in streaming chunk chunks |
| Studio and M7 vulnerability | If cost calculations return `NaN`, `undefined`, or `0`, naive UI displays misleading `$0.000` costs, and spend ceiling checks fail open |

## What done looks like

- [ ] Every token and cost report distinguishes between:
  1. **Verified Accounting:** Provider returned exact prompt and completion token integers; pricing is known.
  2. **Estimated Accounting:** Model pricing is cloned from a sibling or local tokenizer estimated tokens; rendered with a `~` prefix and amber honesty warning.
  3. **Unmeasured:** Provider returned no usage metadata; rendered as `(usage unrecorded)` rather than `$0.00`.
- [ ] In the Studio UI status bar and chat transcript, unmeasured runs never display false precision.
- [ ] In Milestone M7 (Spend Ceiling), if cost accounting is unmeasured or estimated, the spend limit
      **fails closed**: execution halts immediately, prompting: `"Spend ceiling active, but model provider returned no cost accounting. Cannot verify spend. Halting."`
- [ ] A dynamic model pricing fetcher or user override table in `~/.kaioken/pricing.yaml` allows manual
      rate configuration for custom endpoints.

## Steps

1. **Formalise Accounting Metadata:**
   - In `packages/model` (or `apps/cli/src/model.ts`), define:
     ```ts
     export interface CostAccounting {
       inputTokens?: number;
       outputTokens?: number;
       totalCost?: number;
       accuracy: "verified" | "estimated" | "unmeasured";
       warning?: string;
     }
     ```
2. **Implement Fail-Closed Policy in Agent Host:**
   - In `apps/cli/src/agent-host.ts`, when checking turn limits and spend ceilings:
   - If `spendCeiling` is configured and `accuracy === 'unmeasured'`, abort the turn with a safety error.
3. **Update Status Bar and Multiplier Preview in Studio:**
   - In `theia-extensions/kaioken/src/browser/kaioken-status-bar-contribution.ts`, check `accuracy`.
   - If `estimated` or `unmeasured`, display amber warning icon with hover tooltip: `"Token accounting is approximate for this endpoint."`
4. **Unit Tests for Financial Safety:**
   - Write tests in `apps/cli/test/model-cost.test.ts` asserting that missing usage triggers fail-closed
     behaviour when a budget ceiling is set.

## In scope

- `kaioken_v2/apps/cli/src/model.ts`
- `kaioken_v2/apps/cli/src/agent-host.ts`
- `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/browser/kaioken-status-bar-contribution.ts` (Blueprint path `theia-extensions/kaioken/src/browser/kaioken-status-bar-contribution.ts`)

## Out of scope

- Real-time credit card billing integration.
- Querying third-party paid pricing APIs dynamically.

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Verification test:
Run agent turn with simulated missing token metadata under a `--spend-ceiling 1.00` flag. The engine must reject execution with an explicit fail-closed safety violation.

## Traps

| Trap | Guard |
|---|---|
| Failing open on missing accounting | Defaulting unmeasured turns to `$0.00` allows infinite loops to drain user API accounts. Always fail closed. |
| Over-confident UI formatting | Never format `totalCost ?? 0` as `$0.0000`. If cost is unknown, format as `—` or `unrecorded`. |
| Breaking offline local models | Local models (Ollama) have zero dollar cost. The fail-closed spend ceiling must only abort if a non-zero financial spend limit was configured. |

## Open questions

None. The fail-closed rule is an absolute safety requirement.

## Session brief

```xml
<task>
In kaioken_v2/ and ide_kaioken/kaioken_studio_theia/, close Gap G-4 by implementing honest token
accounting and enforcing the fail-closed spend ceiling rule:

1. In apps/cli/src/model.ts:
   - Introduce CostAccounting interface with accuracy: "verified" | "estimated" | "unmeasured".
   - When a model limits/rates are cloned from a sibling or missing from the catalog, flag accuracy
     as "estimated" and include the warning message.
   - When streaming chunks omit usage data, flag accuracy as "unmeasured".

2. In apps/cli/src/agent-host.ts:
   - When enforcing session spend ceilings (Milestone M7 precursor):
   - If accuracy === "unmeasured" and a dollar budget is set, FAIL CLOSED immediately: halt the agent
     and report that costs cannot be verified.

3. In ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/:
   - Update the status bar token accumulator: if accuracy !== "verified", render a "~" prefix and an
     amber warning icon, warning that provider usage metrics are unverified.

4. Add unit tests in apps/cli/test/model.test.ts verifying that unmeasured tokens fail closed under
   a spend limit and that estimates print warnings.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm all tests pass and that the fail-closed spend ceiling test rejects unmeasured turns.
</verification_loop>

<action_safety>
Never allow spend calculations to default silently to zero when data is missing.
Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) CostAccounting interface definition, (2) proof of fail-closed implementation in agent-host,
(3) UI honesty updates in Studio status bar, (4) test suite execution outcomes.
</structured_output_contract>
```
