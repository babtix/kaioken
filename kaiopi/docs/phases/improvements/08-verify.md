# Task 08: Improve `@kaioken/verify`

## Target Package
`kaioken/verify`

## Files to Inspect & Modify
- [kaioken/verify/src/gate.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verify/src/gate.ts)
- [kaioken/verify/test/gate.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/verify/test/gate.test.ts)

---

## Problem Description

1. **`runVerify` Hardcodes `npm test` and Bypasses Config & Detection**:
   In `gate.ts` (lines 212–226):
   ```ts
   export async function runVerify(root: string, timeoutMs = 300_000): Promise<{ pass: boolean; summary: string }> {
       const isWin = process.platform === "win32";
       const suite: [string, string[]] | null =
           existsSync(join(root, "package.json"))
               ? isWin
                   ? [process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", "npm test"]]
                   : ["npm", ["test"]]
               : existsSync(join(root, "go.mod"))
                   ? ["go", ["test", "./..."]]
                   : existsSync(join(root, "Cargo.toml"))
                       ? ["cargo", ["test"]]
                       : existsSync(join(root, "Makefile"))
                           ? ["make", ["test"]]
                           : null;
   ```
   Notice that while `detectPackageManager` (detecting `pnpm`, `yarn`, `bun`) and `readConfig` (reading `.kaioken/verify.json`) exist in the same file:
   - `runVerify()` (which is what `bin.ts` and the CLI call!) ignores `detectPackageManager` completely and hardcodes `npm test`!
   - `runVerify()` ignores `.kaioken/verify.json` completely!
   - `runVerify()` ignores `pyproject.toml`!
   - In a project using `pnpm` or `yarn` or custom test scripts, `runVerify` runs `npm test`, which either fails or uses the wrong package manager.
   - *Fix needed*: Make `runVerify()` use `detectCommands(root)` so it honors `.kaioken/verify.json`, detected package managers (`pnpm`, `yarn`, `bun`, `npm`), Python (`pytest`), and custom commands.

2. **Missing Modern Lockfile and Runtime Detection**:
   - `detectPackageManager` only checks `bun.lockb`, but modern Bun uses `bun.lock` (text format).
   - Deno projects (`deno.json` / `deno.lock`) are unhandled.
   - *Fix needed*: Support `bun.lock` and `deno.json` (`deno test`).

3. **Workspace Monorepo Test Handling**:
   In monorepos (such as npm/pnpm/yarn workspaces), `npm test` at the root will fail if the root `package.json` does not declare a `test` script, even though all workspace packages have tests.
   - *Fix needed*: Detect `workspaces` field in `package.json` or `pnpm-workspace.yaml`, and provide workspace test flags or fallback commands.

4. **Structured Failure Reporting**:
   Test failures currently extract a crude text tail of 60 lines. Extracting structured test errors (which test file and test case failed) makes the repair loop significantly more effective.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/verify` and verify all tests pass.
- Add test verifying that `runVerify` runs `pnpm test` when `pnpm-lock.yaml` is present.
- Add test verifying that `runVerify` runs commands declared in `.kaioken/verify.json`.
