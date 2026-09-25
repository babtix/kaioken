# PHASE 7 — GENERATIVE PIPELINE ON FLASH-HIGH
> Estimate: 4d · Depends on: Phase 6 · Exit: full plan→cards→wiki→update cycle on Flash with checkpoints + confirms + strict-improvement repair

## 7.1 ModelClient adapter — `kaioken/modelport/src/piai.ts`
```ts
import { getModel, stream } from "@earendil-works/pi-ai";   // adapt event names to installed pi-ai version
import type { ModelClient, GenRequest, GenResult } from "./port.js";

export class PiAiClient implements ModelClient {
  constructor(private id = "antigravity/gemini-3.8-flash-high") {}
  async generate(req: GenRequest): Promise<GenResult> {
    const [prov, mid] = this.id.split("/");
    const model = getModel(prov, mid);
    let text = "", usage: any = null;
    for await (const ev of stream(model, { messages: req.messages, thinking: req.thinking ?? "high" })) {
      if (ev.type === "text") text += ev.text;
      if (ev.type === "done") usage = ev.usage;
    }
    return { text, usage };
  }
}
```
Core stays key-free (Invariant 2): auth/config lives in Pi's models.json only.

## 7.2 Spend gate (Invariants 6+9)
```ts
export function estimate(model: any, inTok: number, outTok: number) {
  return (inTok * model.cost.input + outTok * model.cost.output) / 1e6; // $ per M from models.json
}
export const spend = {
  async confirm(ctx: any, stage: string, mult: number) {
    const { inTok, outTok } = estimateTokens(stage, mult, indexStats(root())); // chars/4 heuristic + stage table
    const usd = estimate(currentModel(), inTok, outTok);
    return ctx.ui.confirm("Spend estimate",
      `${stage} ×${mult} ≈ ${(inTok/1e6).toFixed(1)}M in / ${(outTok/1e3).toFixed(0)}k out ≈ $${usd.toFixed(2)} on flash-high. Proceed?`);
  },
};
```

## 7.3 Multiplier dial
| × | Passes | Output |
|---|---|---|
| 1 | 1 | public surface, summaries |
| 2 | 1+diagrams | subsections |
| 3 | exhaustive (default) | all declarations |
| 4–9 | +critique/revise | padding eliminated |
| 10 | +adversarial repair | every grounding failure fixed |

## 7.4 Checkpoints (mechanical, not polite)
- `plan` writes `modules.yaml` → **returns**, no cards.
- `wiki --plan` writes `wiki_plan.yaml` → **returns**.
- Human edits YAML; next command resumes from it.

## 7.5 Adversarial repair (ported verbatim from v2)
Mechanical verifier (symbol/anchor/padding/coverage) → CORRECTION+CRITIQUE passes → accept ONLY on strict score improvement.

## 7.6 Flash tuning
- thinking=high for plan/wiki outlines; medium allowed for ×1–3 fills (`/kaioken-config thinking high|medium`).
- Skills as few-shot procedures; rules numbered; skeletons-first returns.

## Verification
- [x] Confirm dialog shows real $ before every model stage
- [x] Checkpoints stop exactly at YAML files
- [x] Repair loop rejects non-improving revisions
- [x] Whole cycle logged in session JSONL, reproducible

## Pitfalls
- Never hardcode prices; read `model.cost` (single source).
- pi-ai event shapes vary by version — pin and adapt once.

## Next
PHASE-8-surfaces-packaging-ci.md
