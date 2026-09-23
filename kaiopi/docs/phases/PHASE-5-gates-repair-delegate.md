# PHASE 5 — GATES, REPAIR LOOP & DELEGATION
> Estimate: 2d · Depends on: Phase 4 · Exit: FAIL→repair→PASS observed; delegate worktree round-trip merges clean

## Artifact 1 — `kaioken/verify/src/gate.ts`
```ts
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
const run = promisify(execFile);

export async function runVerify(root: string, timeoutMs = 300_000) {
  const suite =
    existsSync(`${root}/package.json`) ? ["npm", ["test"]] :
    existsSync(`${root}/go.mod`)       ? ["go", ["test", "./..."]] :
    existsSync(`${root}/Cargo.toml`)   ? ["cargo", ["test"]] :
    existsSync(`${root}/Makefile`)     ? ["make", ["test"]] : null;
  if (!suite) return { pass: false, summary: "unverifiable: no native suite detected" };
  try {
    const { stdout } = await run(suite[0], suite[1], { cwd: root, timeout: timeoutMs, maxBuffer: 1e7 });
    return { pass: true, summary: stdout.slice(-2000) };
  } catch (e: any) {
    return { pass: false, summary: (e.stdout ?? "") + (e.stderr ?? "") };
  }
}
```
Never falsely pass (Invariant 5): no detector → `unverifiable`.

## Artifact 2 — repair protocol (returned on FAIL + appended to prompt)
```text
REPAIR LOOP: read failure verbatim → minimal fix → re-run kaioken_verify.
Max 5 iterations; then stop and present failing output to the human.
Never weaken/delete tests to pass. Never mark done on FAIL.
```

## Artifact 3 — delegation commands
```ts
pi.registerCommand("kaioken-delegate", {
  description: "Isolate task in a git worktree",
  handler: async (args, ctx) => {
    const wt = await createWorktree(root(), slug(args));   // kaioken/gitops
    ctx.ui.notify(`worktree: ${wt}\nrun: cd ${wt} && pi --model antigravity/gemini-3.8-flash-high\nmerge: /kaioken-merge ${slug(args)}`);
  },
});
pi.registerCommand("kaioken-merge", {
  description: "Verify worktree then ff-merge",
  handler: async (args, ctx) => {
    const wt = worktreePath(root(), args);
    const r = await runVerify(wt);
    if (!r.pass) return ctx.ui.notify(`VERIFY FAIL in ${wt} — not merging`, "error");
    await ffMerge(root(), args);
    ctx.ui.notify(`merged ${args} ✓`);
  },
});
```
v2 (later): Pi SDK programmatic sub-session inside the worktree.

## Verification
- [ ] Breaking edit → verify FAIL → repair loop → PASS
- [ ] Repo without tests → `unverifiable`, task not claimable as done
- [ ] delegate → work in wt → merge clean; main tree never dirty

## Pitfalls
- Timeout mandatory (subprocess hang = agent hang).
- Merge only after verify IN the worktree, not main.

## Next
PHASE-6-commands-hud.md
