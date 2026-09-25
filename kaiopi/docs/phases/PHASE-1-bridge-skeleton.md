# PHASE 1 — BRIDGE SKELETON
> Estimate: 2h · Depends on: Phase 0 · Exit: one offline tool registered, callable, badge visible

## Goal
Prove the Pi extension surface end-to-end before porting anything.

## Artifact — `.pi/extensions/kaioken/index.ts` (v0.1)
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "kaioken_status",
    label: "Kaioken Status",
    description: "Offline drift check: stale vs current docs. 0 tokens.",
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: "text", text: "bridge alive (core lands in Phase 2)" }], details: {} };
    },
  });
  pi.on("session_start", async (_e, ctx) => ctx.ui.setStatus("kaioken", "bridge v0.1"));
}
```

## Steps
1. `pi -e ./.pi/extensions/kaioken/index.ts` in a scratch repo.
2. Ask: "call kaioken_status" → tool executes.
3. Iterate with `/reload` (no restart needed).
4. Later phases rely on auto-discovery: files in `.pi/extensions/` load without `-e`.

## Verification
- [x] Tool appears in tool list
- [x] Execute returns text
- [x] Footer badge shows `bridge v0.1`
- [x] `/reload` picks up edits

## Pitfalls
- `typebox` import path is bare `"typebox"` (Pi's dep), not `@sinclair/typebox`.
- ExtensionAPI type import must come from `@earendil-works/pi-coding-agent`.
- `pi -e` is for quick tests only; production path is `.pi/extensions/`.

## Next
PHASE-2-offline-core-port.md
