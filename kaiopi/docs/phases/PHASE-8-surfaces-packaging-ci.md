# PHASE 8 — SURFACES, PACKAGING, CI
> Estimate: 3d · Depends on: Phase 7 · Exit: CI green offline; `npm pack` of kaioken-pi grounds a stock Pi session in a clean repo

## 8.1 Pi package
Bundle bridge + skills + prompt template per pi.dev packaging → publish `kaioken-pi` on npm. Repo-local `.pi/extensions` remains the dev path.

## 8.2 Skills mirror
On `session_start`: symlink/copy `.kaioken/skills/*` into Pi skills dir for native discovery; `kaioken_skill_load` remains the grounded path.

## 8.3 serve/website
Unchanged readers of `.kaioken/`; add `verified ✓` badge sourced from `state.json`.

## 8.4 Test harness — fake ExtensionAPI
```ts
export function fakePi() {
  const reg = { tools: [] as any[], commands: [] as any[], hooks: {} as Record<string, any[]> };
  const pi = {
    registerTool: (t: any) => reg.tools.push(t),
    registerCommand: (n: string, o: any) => reg.commands.push({ name: n, ...o }),
    on: (ev: string, h: any) => { (reg.hooks[ev] ??= []).push(h); },
  };
  return { pi: pi as any, reg };
}
```
Suites: bridge registration · hallucination probes (Phase 3) · gate suite on fixture repos (TS/Go/Py/Rust) · hook blocklist. All offline (Invariant 10).

## 8.5 CI — `.github/workflows/ci.yml`
```yaml
name: ci
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run build
      - run: npm test
        env: { CI: true }   # deliberately no secrets
```

## 8.6 Docs & theme
New root README (vision + phase index); port DESIGN.md CRT tokens to a Pi theme JSON (16-color parity).

## Verification
- [x] CI green with zero secrets
- [x] `npm pack` → install in clean repo → stock Pi session grounded
- [x] Skills visible natively + via tool

## Pitfalls
- Package must not pin Pi core versions tightly; depend on extensions API only.
- Theme parity: no truecolor-only accents (16-color rule).

## Next
PHASE-9-evals-release.md
