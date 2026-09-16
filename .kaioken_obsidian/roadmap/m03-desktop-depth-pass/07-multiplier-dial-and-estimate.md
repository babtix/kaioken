# M3-07 · Specify the multiplier dial and cost preview

> Specify the interactive x1–x10 depth multiplier dial and pre-flight cost preview card in the Kaioken
> Studio chat composer, grounded in packages/model and accounting for gap G-4.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-carry-over-audit`, `03-session-cost-meter`, `kaioken_v2/docs/studio-v0.1-scope.md` |
| **Blocks** | Studio Chat Composer completion |
| **Touches** | `ide_kaioken/kaioken_studio_theia/theia-extensions/kaioken/src/browser/chat/composer/` |
| **Risk** | Medium. Cost previews must be realistic without making live provider calls before execution |
| **Gate-critical** | **Yes** |

## Why this exists

Kaioken's generation depth is controlled by a single unified dial: `x1` through `x10`
(`kaioken_v2/README.md:309-316`). Below `x5` the multiplier buys breadth (more modules, more key
points per card, more declarations per bundle); above `x5` it buys adversarial scrutiny (critique
passes and verifier repair loops).

In CLI commands (`kaioken wiki x3`, `kaioken plan x5`), the multiplier is a flag. In the GUI,
invoking a high-multiplier run without knowing its cost upfront causes user panic.
In v1, `.kaioken_v1/ROADMAP.md:95` specified the "multiplier dial + estimate card". Studio v0.1
(`kaioken_v2/docs/studio-v0.1-scope.md:63`) prioritizes this in the chat composer: **the cost
preview is shown BEFORE execution begins**, giving the user complete transparency over token spend.

Crucially, this preview intersects with **Gap G-4** (`roadmap/README.md` §6): provider token pricing
can vary or be unrecorded for custom/local endpoints. The preview must surface this honestly with an
explicit estimate indicator (`~`) rather than promising exactness.

## Current state

Verified against engine packages.

| Fact | Evidence |
|---|---|
| Historical requirement | `.kaioken_v1/ROADMAP.md:95` ("multiplier dial + estimate card") |
| Studio v0.1 scope commitment | `kaioken_v2/docs/studio-v0.1-scope.md:63` ("Multiplier control (x1–x10) in the chat composer, with its cost preview") |
| Master dial implementation | `kaioken_v2/packages/model/src/index.ts:32-86` defines `MIN_MULTIPLIER = 1`, `MAX_MULTIPLIER = 10`, `BREADTH_THRESHOLD = 5`, and `depthFor(multiplier)` |
| Depth calculation formulas | `packages/model/src/index.ts:69-86` calculates `targetModules`, `declarationsPerFile`, `maxOutputTokens`, `repairPasses`, and `critiquePasses` |
| Free model detection | `kaioken_v2/packages/model/src/pool.ts:25` exports `isFreeModel(model)` |
| Known gap G-4 | `roadmap/README.md` §6 ("Token and cost figures can be wrong when a model's accounting is unavailable") |

`UNVERIFIED:` whether pre-flight token estimations for chat tool loops should include system prompt
overhead dynamically derived from the active repository scan.

## Depth calculation logic (Grounded in `packages/model`)

The cost preview calculation derives directly from `depthFor(multiplier)`:

```typescript
import { depthFor, isFreeModel } from "@kaioken/model";

export function estimateRun(multiplier: number, modelId: string, modelRates: { input: number; output: number }) {
  const depth = depthFor(multiplier);
  // Rough estimate of generative calls
  const passes = 1 + depth.refinementPasses;
  const estimatedInputTokens = passes * (depth.declarationsPerFile * 40 + 2000);
  const estimatedOutputTokens = passes * Math.min(depth.maxOutputTokens, 2500);

  if (isFreeModel(modelId)) {
    return { estimatedCostUsd: 0, isFree: true, estimatedTokens: estimatedInputTokens + estimatedOutputTokens, depth };
  }

  const cost = (estimatedInputTokens / 1_000_000) * modelRates.input +
               (estimatedOutputTokens / 1_000_000) * modelRates.output;

  return {
    estimatedCostUsd: cost,
    isFree: false,
    estimatedTokens: estimatedInputTokens + estimatedOutputTokens,
    depth
  };
}
```

## Interface layout in Chat Composer

```
+-------------------------------------------------------------------------+
| Chat Composer                                                           |
+-------------------------------------------------------------------------+
| [ Ask agent or command: "Refactor search analyzer to support regex"   ] |
|                                                                         |
| Multiplier: [---(x3)-------] (x1 to x10)        Model: claude-3-7-sonnet|
+-------------------------------------------------------------------------+
| Pre-flight Estimate (Depth x3):                                         |
| • Est. Spend: ~$0.042 * (12.5k tokens)                                  |
| • Structure: 13 modules, 5 key points, 1 repair pass                    |
| [!] Warning: Pricing estimated from provider catalog rates (G-4).        |
+-------------------------------------------------------------------------+
| [ Attach Context ]                                     [ Run Task (Enter)|
+-------------------------------------------------------------------------+
```

## What done looks like

- [ ] The Studio Chat Composer contains an interactive slider or stepped dial spanning values `x1` to `x10` (default `x3`).
- [ ] As the dial moves, the Pre-flight Estimate card updates in real time without network lag.
- [ ] Displays:
  - Target depth characteristics (breadth vs scrutiny passes).
  - Estimated total tokens.
  - Estimated cost in USD.
- [ ] Gap G-4 handling:
  - If the active model has verified pricing in the catalog: render `$0.042`.
  - If pricing is approximated or catalog is unverified: render `~$0.042*` with footnote *"Approximated pricing; exact provider accounting may vary (G-4)"*.
  - If a free model (e.g. `minimax-m3:free` or local Ollama) is active: render `$0.00 (Free tier)`.
- [ ] Multiplier value is passed into the agent loop and honored during execution.

## Steps

1. **Build Composer Multiplier Slider:**
   - Author `MultiplierDialWidget` in `theia-extensions/kaioken/src/browser/chat/composer/`.
   - Render range input `min=1 max=10 step=1`.
2. **Implement Estimator Utility:**
   - Import `depthFor` from `@kaioken/model` in-process.
   - Implement pre-flight token arithmetic based on active module count and prompt length.
3. **Connect to Active Model Selection:**
   - Read active model ID from workspace config or settings.
   - Look up pricing per million tokens from the model catalog.
4. **Surface Gap G-4 Estimate Indicator:**
   - Check if catalog rates are approximate; toggle `~` and disclaimer.
5. **Pass Multiplier into Run Context:**
   - Ensure the selected multiplier is attached to the request payload dispatched to `@kaioken/agent` or `@kaioken/wiki`.

## In scope

- Multiplier UI control in Kaioken Studio chat composer.
- Real-time pre-flight token and cost calculation.
- Gap G-4 disclaimer and estimate indicator.

## Out of scope

- Re-implementing the core `depthFor` algorithm (uses `@kaioken/model`).
- Server-side credit pre-authorization.

## Gates

From `ide_kaioken/kaioken_studio_theia`:

```bash
yarn build
```

Verify that moving the slider from `x1` to `x10` dynamically recalculates token budgets and passes,
and that selecting a free model forces cost to `$0.00`.

## Traps

| Trap | Guard |
|---|---|
| Making live network requests to estimate cost | The estimate must be computed purely client-side from `depthFor()` formulas and cached pricing tables |
| Promising exact cost figures | Gap G-4 dictates that figures can drift based on reasoning tokens. Always format with `~` and an asterisk |
| Allowing multiplier values outside 1-10 | Enforce bounds check (`MIN_MULTIPLIER = 1`, `MAX_MULTIPLIER = 10`) |
| Ignoring free tier models | Free models (`isFreeModel: true`) must display `$0.00`, avoiding alarming users with estimated costs |

## Open questions

None.

## Session brief

```xml
<task>
In ide_kaioken/kaioken_studio_theia, specify and implement the multiplier dial (x1–x10) and pre-flight
cost preview card in the Kaioken Studio Chat composer.

Requirements from roadmap/m03-desktop-depth-pass/07-multiplier-dial-and-estimate.md:
1. Embed an interactive stepped slider or dial (x1 to x10, default x3) in the Chat composer.
2. In-process, invoke depthFor(multiplier) from @kaioken/model to compute depth characteristics:
   - targetModules, declarationsPerFile, maxOutputTokens, repairPasses, critiquePasses.
3. Render a real-time Pre-flight Estimate card above the composer input:
   - Approximate tokens and estimated USD spend based on active model rates.
   - For free models (isFreeModel), render "$0.00 (Free)".
   - For commercial models, format with "~" and "*" per Gap G-4, accompanied by a brief disclaimer:
     "Estimated spend; provider accounting may vary (G-4)".
4. Pass the chosen multiplier into the agent turn execution context.
</task>

<verification_loop>
Verify that moving the dial recalculates tokens and costs instantly without network requests.
Verify that switching models updates pricing rates.
Verify that Gap G-4 disclaimers appear when rates are approximate.
Run yarn build in kaioken_studio_theia to confirm clean compilation.
</verification_loop>

<missing_context_gating>
Do not hardcode depth formulas in UI components. Import depthFor() directly from @kaioken/model.
</missing_context_gating>

<action_safety>
Modify only theia-extensions/kaioken/src/browser/chat/composer/ components. Do not modify core
engine packages. Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) dial UI implementation, (2) pre-flight estimation math, (3) Gap G-4 estimate indicator
behavior, (4) build verification outcome.
</structured_output_contract>
```
