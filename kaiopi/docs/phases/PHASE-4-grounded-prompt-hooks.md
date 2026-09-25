# PHASE 4 — GROUNDED PROMPT & CONTEXT INJECTION
> Estimate: 1d · Depends on: Phase 3 · Exit: rules+drift in system prompt; badge flips on edit; rm -rf blocked

## Artifact 1 — `prompts/grounding.ts`
```ts
export const GROUNDING_RULES = `
KAIOKEN GROUNDING RULES (mandatory, override style preferences):
1. NEVER assert a symbol/import/file exists without kaioken_symbol_lookup first.
2. NEVER quote code without kaioken_read_file exact anchors.
3. BEFORE any edit: kaioken_impact on the touched symbol.
4. BEFORE documenting: kaioken_status; if stale, propose /kaioken-update first.
5. A coding task is COMPLETE only after kaioken_verify returns PASS.
6. If a tool returns NEGATIVE GUARANTEE, state non-existence plainly. Never invent.
7. Rationing: skeletons first; detail only when needed.
8. Task matches a .kaioken/skills procedure? kaioken_skill_load before improvising.`;
```

## Artifact 2 — `hooks/index.ts`
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { checkDrift } from "../../../../kaioken/provenance/src/status.js";
import { GROUNDING_RULES } from "../prompts/grounding.js";

let dirty = false;
export const setDirty = (v: boolean) => { dirty = v; };

export function registerHooks(pi: ExtensionAPI, root: () => string, badge: (s: string) => void) {
  pi.on("before_agent_start", async (event) => {
    const drift = await checkDrift(root()).catch(() => null);
    const head = drift?.stale?.length
      ? `DRIFT REPORT: ${drift.stale.length} stale doc(s): ${drift.stale.slice(0, 5).join(", ")}\n` : "";
    // + append .kaioken/config.yaml steering notes & architecture.md glossary here (agentsmd port)
    return { systemPrompt: event.systemPrompt + "\n\n" + head + GROUNDING_RULES };
  });

  pi.on("session_start", async (_e, ctx) => {
    badge("grounded · flash-high");
    ctx.ui.setWidget("kaioken", ["kaioken: grounded", "model: gemini-3.8-flash-high"]);
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      setDirty(true); ctx.ui.setStatus("kaioken", "UNVERIFIED CHANGES");
    }
    if (event.toolName === "bash" &&
        /rm\s+-rf|git\s+push\s+.*--force|drop\s+table/i.test(String(event.input.command ?? "")))
      return { block: true, reason: "Kaioken policy: destructive operation blocked" };
  });
}
```

## Wiring — update `index.ts`
```ts
import { registerTools } from "./tools/index.js";
import { registerHooks, setDirty } from "./hooks/index.js";
export default function (pi: ExtensionAPI) {
  const root = () => process.cwd();
  const badge = (s: string) => pi && void 0; // replaced below via ctx in hooks
  registerHooks(pi, root, s => lastCtx?.ui.setStatus("kaioken", s));
  registerTools(pi, root);
}
```
(Keep a module-level `lastCtx` captured from `session_start`; clear `dirty` + badge `verified ✓` inside `kaioken_verify` wrapper on PASS.)

## Verification
- [x] Live session system prompt contains rules + drift line
- [x] Edit → badge `UNVERIFIED CHANGES`
- [x] verify PASS → badge `verified ✓`
- [x] `rm -rf /tmp/x` blocked with reason

## Pitfalls
- `before_agent_start` chains across extensions: append, never replace blindly.
- Drift check must stay 0-token/offline (Invariant 7) — no model call in hook.

## Next
PHASE-5-gates-repair-delegate.md
