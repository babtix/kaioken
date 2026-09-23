# PHASE 6 — COMMAND SURFACE & HUD
> Estimate: 2d · Depends on: Phase 5 · Exit: all offline commands work with network disabled; model commands show spend confirm

## Command table
| Command | Core call | Network |
|---|---|---|
| /kaioken-scan | scan | ❌ |
| /kaioken-symbols <q> | index | ❌ |
| /kaioken-search <q> | search | ❌ |
| /kaioken-status | provenance | ❌ |
| /kaioken-verify | verify | ❌ |
| /kaioken-graph | graph | ❌ |
| /kaioken-serve | serve | ❌ |
| /kaioken-export | export bundle | ❌ |
| /kaioken-plan <×N> | plan → stops at modules.yaml | ✅ |
| /kaioken-cards <×N> | plan/cards | ✅ |
| /kaioken-wiki [--plan] <×N> | wiki cascade | ✅ |
| /kaioken-update [--dry] <×N> | provenance→wiki | ✅ |
| /kaioken-research <topic> <×N> | research | ✅+web |
| /kaioken-delegate <task> | gitops | ❌ |
| /kaioken-merge <slug> | gitops+verify | ❌ |

## Handler pattern — `commands/index.ts`
```ts
export function registerCommands(pi: ExtensionAPI, root: () => string, spend: SpendGate) {
  const off = (name: string, desc: string, fn: () => Promise<string>) =>
    pi.registerCommand(name, { description: desc,
      handler: async (_a, ctx) => ctx.ui.notify(await fn(), "info") });

  off("kaioken-scan",   "Deterministic repo inventory + risk flags", () => scan(root()));
  off("kaioken-status", "0-token drift report",                      () => fmtDrift(root()));
  off("kaioken-verify", "Native build+test gate",                    () => fmtVerify(root()));
  // … symbols/search/graph/serve/export same shape

  pi.registerCommand("kaioken-plan", {
    description: "Propose modules.yaml (checkpoint, then stop)",
    handler: async (args, ctx) => {
      const m = parseMult(args);                       // ×1..×10, default ×3
      if (!await spend.confirm(ctx, "plan", m)) return; // Invariants 6+9
      const out = await runPlan(root(), m);             // pi-ai adapter (Phase 7)
      ctx.ui.notify(`modules.yaml written — REVIEW, then /kaioken-cards ${args}`);
      ctx.ui.setWidget("kaioken", out.moduleTree.slice(0, 12));
    },
  });
  // cards / wiki / update / research: same checkpoint+confirm shape
}
```

## HUD contract
- `setStatus("kaioken", …)`: `grounded · flash-high` | `UNVERIFIED CHANGES` | `verified ✓` | `N stale docs`
- `setWidget("kaioken", lines)`: plan outline preview / verify tail / drift list

## Verification
- [ ] Disable network → 8 offline commands still work
- [ ] Every model command prompts cost confirm before spend
- [ ] Widget shows plan outline after /kaioken-plan

## Pitfalls
- Commands must never block the TUI: long ops → notify progress via setStatus.
- Keep `/kaioken-*` namespace; don't shadow Pi built-ins.

## Next
PHASE-7-generative-pipeline.md
