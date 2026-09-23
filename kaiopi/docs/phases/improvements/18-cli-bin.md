# Task 18: Improve `kaioken/bin.ts` & Bridge Integration

## Target Components
- Root CLI: [kaioken/bin.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/bin.ts)
- Pi Extension Bridge: [.pi/extensions/kaioken/index.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/.pi/extensions/kaioken/index.ts)

---

## Problem Description

1. **Massive CLI Command Deficit**:
   In `kaioken/bin.ts` (lines 16–104), the CLI only exposes 6 commands:
   - `scan`, `symbols`, `status`, `search`, `impact`, `verify`
   - *Missing*: All other 11 core Kaioken operations cannot be invoked via the CLI!
     - `plan` (generate modules.yaml)
     - `cards` (generate knowledge cards)
     - `wiki` (generate wiki chapters)
     - `serve` (start preview web server)
     - `research` (run web-grounded research)
     - `skills` (list/inspect skills)
     - `skillgen` (generate skills)
     - `graph` (render dependency graph)
     - `gitops` (install/remove hooks, show diff)
     - `evals` (run eval gate)
   - *Fix needed*: Expand `kaioken/bin.ts` to support all subcommands so Kaioken is fully usable as a standalone CLI tool without requiring the Pi extension.

2. **Fragile Flag & Argument Parsing in CLI**:
   In `bin.ts` (lines 57 and 83):
   ```ts
   const query = rest.find((arg) => arg !== "--root" && arg !== root) ?? "";
   ```
   Arguments and options are parsed with naive `.find()` checks. Multi-word queries, positional flags, `--limit <n>`, `--json`, and `--output <dir>` cannot be parsed cleanly.
   - *Fix needed*: Use standard Node.js `util.parseArgs` (built into Node 18+) for robust argument, flag, and option parsing.

3. **ESM `require()` Crash in Extension Bridge**:
   In `.pi/extensions/kaioken/index.ts` (lines 68–72):
   ```ts
   export function readConfiguredTheme(env: NodeJS.ProcessEnv = process.env): string | undefined {
       if (env.KAIOKEN_THEME_SETTING) return env.KAIOKEN_THEME_SETTING;
       try {
           const { readFileSync } = require("node:fs") as typeof import("node:fs");
           ...
       }
   ```
   In an ES module environment (`"type": "module"` in `package.json`), bare `require(...)` throws `ReferenceError: require is not defined`! While wrapped in a `try/catch` that swallows the error and returns `undefined`, it fails to read the theme settings.
   - *Fix needed*: Use `createRequire(import.meta.url)` or asynchronous/synchronous ESM imports instead of raw `require()`.

---

## Verification & Acceptance Criteria
- Run `node --loader tsx kaioken/bin.ts --help` (or `tsx kaioken/bin.ts`) and verify all subcommands are listed with proper descriptions.
- Test executing `scan`, `search`, `impact`, `graph`, `serve`, `verify`, and `status` via `kaioken/bin.ts`.
- Verify that `readConfiguredTheme` in `.pi/extensions/kaioken/index.ts` reads settings without throwing `ReferenceError`.
