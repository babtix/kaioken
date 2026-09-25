# PHASE 2 — OFFLINE CORE PORT
> Estimate: 3d · Depends on: Phase 1 · Exit: 400+ ported tests green offline; scan produces index.json + risk.json

## Goal
The truth engine lives inside the Pi monorepo. No model code yet.

## Copy list (from `kaioken_v2/packages/` → `kaioken/`)
scan · index · search · provenance · graph · impact · serve · gitops · skillgen(load only)
Plus extract: `wiki/src/verify.ts` mechanical verifier → `kaioken/verifycore`; `agent/src/gate.ts` runner → `kaioken/verify`.

## DO NOT copy
agent (prompt/tools → bridge) · tui (retired, Pi TUI replaces) · session (Pi JSONL replaces) · model (replaced by pi-ai adapter, Phase 7) · ext (later).

## Steps
### 2.1 Copy & rewire
```bash
for p in scan index search provenance graph impact serve gitops; do
  cp -r ../kaioken_v2/packages/$p kaioken/$p
done
```
- Fix ESM imports: relative imports need `.js` extensions.
- Mirror Tree-Sitter `.scm` queries in build script (tsc --build + copy step, as v2 did).

### 2.2 Thin offline CLI — `kaioken/bin.ts`
```ts
#!/usr/bin/env node
import { parseArgs } from "node:util";
// offline verbs ONLY: scan symbols search serve status verify graph export
const [cmd, ...rest] = process.argv.slice(2);
const root = (i => i ? rest[i + 1] : process.cwd())(rest.indexOf("--root"));
switch (cmd) {
  case "scan":    console.log(JSON.stringify(await (await import("./scan/api.js")).scan(root)))); break;
  case "symbols": console.log((await import("./index/api.js")).lookup(root, rest[0])); break;
  case "status":  console.log(JSON.stringify(await (await import("./provenance/api.js")).check(root))); break;
  case "verify":  process.exit((await (await import("./verify/api.js")).run(root)).pass ? 0 : 1);
  // search | serve | graph | export …
  default: console.error("offline verbs only; generative verbs live in Pi commands"); process.exit(2);
}
```

### 2.3 Wire workspaces + build + test
```bash
npm install && npm run build
npm test -ws --if-present
node kaioken/bin.js scan --root /tmp/scratch
ls /tmp/scratch/.kaioken/index.json /tmp/scratch/.kaioken/risk.json
```

## Verification
- [x] All ported suites pass with network disabled
- [x] `scan` writes `index.json` + `risk.json`
- [x] `symbols`, `search`, `status`, `verify` work from bin
- [x] No import of any model/provider package inside `kaioken/`

## Pitfalls
- Tree-sitter native bindings: keep same versions as v2 to avoid grammar ABI drift.
- Accidentally porting `agent` prompt code → duplicate source of truth. Resist.
- `serve` must bind 127.0.0.1 only (security posture from v2).

## Next
PHASE-3-grounding-tools.md
