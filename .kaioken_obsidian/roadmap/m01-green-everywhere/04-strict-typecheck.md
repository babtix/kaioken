# M1-04 · Drive any out of the engine and Studio workspace

> Systematically eliminate explicit and implicit `any` types across the engine and Studio integration,
> enabling stricter TypeScript compiler options one package per session per operating rule 3.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-retarget-ci-workflow` |
| **Blocks** | M1 done, `roadmap/m03-desktop-depth-pass/` |
| **Touches** | `kaioken_v2/tsconfig.base.json`, `packages/wiki/`, `packages/session/`, `apps/cli/`, `apps/tui/`, Studio extension |
| **Risk** | Medium. Type tightening can cascade across package boundaries if shared schemas change |
| **Gate-critical** | **Yes** |

## Why this exists

Operating rule 1 specifies that review capacity is the bottleneck, and operating rule 3 dictates
"one package per session: give an agent `packages/wiki`, not 'the wiki system'." In v1, the milestone
deliverable was "zero `any` in `desktop/src`". Since `desktop/` is archived, the equivalent surface
in v2 is `kaioken_v2` plus the Studio desktop workspace.

Using `any` undermines TypeScript's ability to catch boundary breakage between the 19 engine
packages and the Studio frontend. This leaf organizes the elimination of `any` and the activation of
stricter compiler flags into reviewable, single-package sessions so that diffs remain reviewable in
one sitting.

## Current state

Verified against the codebase.

| Fact | Evidence |
|---|---|
| Base compiler configuration | `kaioken_v2/tsconfig.base.json:7-19` has `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true` |
| Looser compiler options present | `kaioken_v2/tsconfig.base.json:10` has `"exactOptionalPropertyTypes": false`; missing `"noImplicitReturns"` and `"noFallthroughCasesInSwitch"` |
| `any` in engine packages | `packages/wiki/src/artifact.ts` and `packages/session/src/storage.ts` contain explicit `any` casts |
| `any` in apps | `apps/cli/src/commands/daemon.ts` uses loose types; `apps/tui/src/app.ts` and `apps/tui/src/logo.ts` use `any` |
| `any` in Studio extension | `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts:28` disables `@typescript-eslint/no-explicit-any` and types dynamic imports as `Promise<any>` |
| Root tsconfig is a solution file | `kaioken_v2/tsconfig.json:1-3` (`"files": []`, project references only) |

`UNVERIFIED:` whether enabling `"exactOptionalPropertyTypes": true` would trigger extensive churn
across the `pi-ai` provider payload interfaces in `packages/model`.

## What done looks like

- [ ] All occurrences of `: any` and `as any` in `kaioken_v2/packages/` are replaced with concrete types, discriminated unions, or `unknown` with narrowing guards.
- [ ] Explicit `any` usages in `apps/cli/` (including `daemon.ts`) and `apps/tui/` are replaced with typed command arguments and event interfaces.
- [ ] The dynamic engine loader in the Studio extension (`kaioken-engine.ts`) exports typed signatures rather than `LoadedEngine { scan: any; index: any; ... }`.
- [ ] `kaioken_v2/tsconfig.base.json` enables `"noImplicitReturns": true` and `"noFallthroughCasesInSwitch": true`.
- [ ] `npm run typecheck` (`tsc --build --force`) succeeds with zero errors across all 19 packages and 2 apps.

## Session breakdown (Rule 3 enforcement)

To avoid unreviewable multi-thousand-line PRs, execute this leaf across 4 discrete sessions:

| Session | Target package / surface | Goal |
|---|---|---|
| **Session 4A** | `packages/wiki` & `packages/session` | Clean up `packages/wiki/src/artifact.ts` and `packages/session/src/storage.ts` |
| **Session 4B** | `apps/cli` & `daemon.ts` | Type the daemon request bodies, RPC dispatch, and command options |
| **Session 4C** | `apps/tui` | Type terminal UI state, ink/blessed render wrappers in `app.ts` and `logo.ts` |
| **Session 4D** | Studio Extension & Compiler Flags | Type `theia-ide-kaioken-ext`, then enable `"noImplicitReturns"` and `"noFallthroughCasesInSwitch"` in `tsconfig.base.json` |

## Steps

1. **Session 4A (Packages):**
   - In `packages/wiki/src/artifact.ts`, inspect each `any` usage and map it to known schema interfaces from `@kaioken/templates` or `WikiChapter`.
   - In `packages/session/src/storage.ts`, replace raw `any` JSON deserialization with `extractJson<T>` or runtime schema validation.
   - Run `npm run typecheck` from `kaioken_v2/`.
2. **Session 4B (CLI & Daemon):**
   - In `apps/cli/src/commands/daemon.ts`, replace `args: unknown` and `any` casts with discriminated request types for all HTTP/SSE endpoints.
   - Run `npm run typecheck` from `kaioken_v2/`.
3. **Session 4C (TUI):**
   - In `apps/tui/src/app.ts` and `logo.ts`, replace dynamic terminal stream wrappers with typed interfaces.
   - Run `npm run typecheck` and `npm test` from `kaioken_v2/`.
4. **Session 4D (Studio & Base Config):**
   - In `theia-ide-kaioken-ext/src/node/kaioken-engine.ts`, define an interface matching `@kaioken/scan`, `@kaioken/index`, `@kaioken/wiki`, `@kaioken/search` instead of `any`.
   - In `kaioken_v2/tsconfig.base.json`, add:
     ```json
     "noImplicitReturns": true,
     "noFallthroughCasesInSwitch": true
     ```
   - Run full project reference build: `npm run typecheck`.

## In scope

- `kaioken_v2/tsconfig.base.json`
- `kaioken_v2/packages/wiki/`
- `kaioken_v2/packages/session/`
- `kaioken_v2/apps/cli/`
- `kaioken_v2/apps/tui/`
- Studio extension engine bridge (`kaioken-engine.ts`)

## Out of scope

- Refactoring runtime architecture or rewriting the TUI framework.
- Enabling `"exactOptionalPropertyTypes": true` (causes excessive friction with undefined optional fields in third-party LLM SDKs).
- Touching archived `.kaioken_v1/`.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
```

```bash
npm test
```

From repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

Verify `git diff` shows no unintended behavioral changes, only type annotations and compiler settings.

## Traps

| Trap | Guard |
|---|---|
| Replacing `any` with `unknown` without adding type guards | If code accesses properties on `unknown`, the compiler will reject it. Implement proper narrowing functions |
| Running `tsc --noEmit` on root `tsconfig.json` | Root config has `"files": []`. Always run `npm run typecheck` which executes `tsc --build --force` |
| Attempting all packages in a single agent session | Violates Rule 1 and Rule 3. Enforce the 4-session breakdown |
| Breaking Studio's CommonJS/ESM bridge | Studio uses dynamic import via `new Function` because Theia compiles CommonJS. Keep the bridge mechanism while typing the return value |

## Open questions

None.

## Session brief

```xml
<task>
Perform strict typecheck hardening across kaioken_v2/ and the Studio engine bridge, driving out
all occurrences of `any` and enabling stricter compiler options per the 4-session breakdown in
roadmap/m01-green-everywhere/04-strict-typecheck.md.

Targets:
1. packages/wiki/src/artifact.ts and packages/session/src/storage.ts — replace `any` with concrete
   types or schema validators.
2. apps/cli/src/commands/daemon.ts and apps/cli/src/main.ts — ensure strict typing on CLI flags,
   HTTP request bodies, and SSE event dispatch.
3. apps/tui/src/app.ts and logo.ts — eliminate `any` in terminal event handlers and screen buffers.
4. Studio extension (theia-ide-kaioken-ext/src/node/kaioken-engine.ts) — provide typed interfaces
   for loaded @kaioken/* packages instead of `Record<string, any>`.
5. kaioken_v2/tsconfig.base.json — enable "noImplicitReturns": true and
   "noFallthroughCasesInSwitch": true.

Follow operating rule 3: execute one package/subsystem at a time, running `npm run typecheck`
between edits to guarantee that type safety increases monotonically.
</task>

<verification_loop>
Run these from kaioken_v2/:
  npm run typecheck
  npm test
Verify that no `any` annotations remain in the touched files, and that `tsc --build --force` passes
without errors across all 19 packages and 2 apps.
</verification_loop>

<missing_context_gating>
Do not invent mock types. Use exported interfaces from @kaioken/scan, @kaioken/index,
@kaioken/provenance, and @kaioken/templates. Read package source files to determine real structures.
</missing_context_gating>

<action_safety>
Do not alter runtime behavior or API contracts unless fixing an actual type bug. Do NOT run git add
or git commit — leave all edits uncommitted in the working tree for orchestrator review.
</action_safety>

<structured_output_contract>
End with: (1) list of files edited, (2) summary of previous `any` usages eliminated per file,
(3) new compiler options enabled in tsconfig.base.json, (4) typecheck and test gate counts pasted.
</structured_output_contract>
```
