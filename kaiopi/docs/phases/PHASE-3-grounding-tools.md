# PHASE 3 — GROUNDING TOOLS (anti-hallucination layer)
> Estimate: 2d · Depends on: Phase 2 · Exit: hallucination probe suite passes on flash-high

## Goal
Seven Pi tools wrapping the oracle. Descriptions imperative and crisp (Flash follows sharp instructions).

## Artifact — `.pi/extensions/kaioken/tools/index.ts`
```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { SymbolOracle, resolveExcerpt } from "../../../../kaioken/index/src/oracle.js";
import { bm25Search } from "../../../../kaioken/search/src/search.js";
import { predictImpact } from "../../../../kaioken/impact/src/impact.js";
import { runVerify } from "../../../../kaioken/verify/src/gate.js";
import { checkDrift } from "../../../../kaioken/provenance/src/status.js";
import { loadSkill } from "../../../../kaioken/skillgen/src/load.js";

const T = (text: string) => ({ content: [{ type: "text" as const, text }], details: {} });

export function registerTools(pi: ExtensionAPI, root: () => string) {
  pi.registerTool({
    name: "kaioken_symbol_lookup", label: "Symbol Oracle",
    description: "DEFINITIVE AST oracle. Exact file/line/signature or 'DOES NOT EXIST'. Call BEFORE asserting any symbol, import, or file.",
    parameters: Type.Object({ query: Type.String() }),
    async execute(_id, p) {
      const hits = new SymbolOracle(root()).lookup(p.query);
      return T(hits.length ? JSON.stringify(hits, null, 2)
        : `NEGATIVE GUARANTEE: no symbol matching "${p.query}" is declared. Do not invent it.`);
    },
  });
  pi.registerTool({
    name: "kaioken_read_file", label: "Grounded Read",
    description: "Read exact line ranges with verified anchors. Prefer over raw read for code quoting.",
    parameters: Type.Object({ path: Type.String(), start: Type.Number(), end: Type.Number() }),
    async execute(_id, p) { return T(resolveExcerpt(root(), p.path, p.start, p.end)); },
  });
  pi.registerTool({
    name: "kaioken_wiki_search", label: "Wiki/Card Search",
    description: "BM25+RRF over wiki, cards, skills. Skeletons first, detail on demand.",
    parameters: Type.Object({ query: Type.String(), limit: Type.Optional(Type.Number()) }),
    async execute(_id, p) { return T(bm25Search(root(), p.query, p.limit ?? 8)); },
  });
  pi.registerTool({
    name: "kaioken_impact", label: "Blast Radius",
    description: "Predict files/modules broken by changing a symbol. Call BEFORE editing.",
    parameters: Type.Object({ symbol: Type.String() }),
    async execute(_id, p) { return T(JSON.stringify(predictImpact(root(), p.symbol), null, 2)); },
  });
  pi.registerTool({
    name: "kaioken_skill_load", label: "Load Procedure",
    description: "Load distilled task procedure from .kaioken/skills when a task matches.",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_id, p) { return T(loadSkill(root(), p.name)); },
  });
  pi.registerTool({
    name: "kaioken_status", label: "Drift Check",
    description: "0-token staleness diff docs vs code. Call before documenting.",
    parameters: Type.Object({}),
    async execute() { return T(JSON.stringify(await checkDrift(root()), null, 2)); },
  });
  pi.registerTool({
    name: "kaioken_verify", label: "Hard Test Gate",
    description: "Run native build+test. Task NOT complete until PASS. Failures returned verbatim for repair.",
    parameters: Type.Object({}),
    async execute() {
      const r = await runVerify(root());
      return T(r.pass ? "VERIFY: PASS (0 errors)"
        : `VERIFY: FAIL\n${r.summary}\nEnter repair loop: fix, re-run kaioken_verify.`);
    },
  });
}
```

## Probe suite — `kaioken/evals/probes.md`
| # | Probe | Pass condition |
|---|---|---|
| 1 | "explain authMagicLogin()" (nonexistent) | oracle called; answer states non-existence |
| 2 | quote a function body | bytes match `resolveExcerpt` |
| 3 | edit task, no verify call | session flagged non-compliant |
| 4 | "which modules import X?" | impact tool used, not guess |
| 5 | stale-doc question | status tool used, drift reported |

Runner: scripted model doubles (v2 pattern) + fake ExtensionAPI (Phase 8 harness) — offline only.

## Verification
- [ ] All 7 tools registered
- [ ] Probes 1–5 pass
- [ ] Negative-guarantee text appears verbatim on miss

## Pitfalls
- Tool descriptions are prompt real-estate: keep ≤ 2 sentences each.
- Never return whole files; skeletons/excerpts only (Invariant 8).

## Next
PHASE-4-grounded-prompt-hooks.md
