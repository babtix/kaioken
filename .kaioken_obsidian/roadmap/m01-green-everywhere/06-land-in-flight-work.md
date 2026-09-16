# M1-06 · Land or revert the in-flight daemon and serve work

> Land or revert the uncommitted daemon implementation and its CLI/serve modifications, ensuring
> master has a clean, reviewable working tree before CI is retargeted.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | None. Must run before `01-retarget-ci-workflow` |
| **Blocks** | `01-retarget-ci-workflow` |
| **Touches** | `kaioken_v2/apps/cli/src/commands/daemon.ts`, `kaioken_v2/apps/cli/src/main.ts`, `kaioken_v2/packages/serve/src/index.ts` |
| **Risk** | High. `daemon.ts` is ~1,900 lines of uncommitted server code; committing it without review risks shipping defects, while discarding it risks data loss |
| **Gate-critical** | **No** (Pre-gate requirement) |

## Why this exists

Operating rule 2 establishes that a green build is a precondition, not a milestone. In practice,
retargeting CI while carrying unreviewed, uncommitted files in the local working tree creates a false
signal: CI checks out the remote branch (which lacks the dirty changes), while the local developer
tests against the uncommitted code.

Presently, the repository holds substantial uncommitted work: a newly authored HTTP/SSE daemon in
`apps/cli/src/commands/daemon.ts` (1,928 lines), CLI flag bindings in `apps/cli/src/main.ts`, and a
re-export in `packages/serve/src/index.ts`. This work must be explicitly **reviewed and landed**
(with tests and clean typecheck) or **shelved onto a feature branch** before M1-01 runs.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Modified file: CLI entry point | `kaioken_v2/apps/cli/src/main.ts` lines 29, 193-194, 284-292, 412-413 (adds `--token`, `--token-stdin`, and `case "daemon"`) |
| Modified file: Serve package index | `kaioken_v2/packages/serve/src/index.ts` line 17 (`export { buildGraph } from "./graph.js";`) |
| Untracked file: Daemon command | `kaioken_v2/apps/cli/src/commands/daemon.ts` (1,928 lines, HTTP server, SSE event bus, approval queue, workspace inspect) |
| Git status dirty | `git status --short` shows `M` on `main.ts` and `serve/src/index.ts`, `??` on `daemon.ts` |
| M1 dependency order | `roadmap/m01-green-everywhere/README.md:57` places `06` before `01` |

`UNVERIFIED:` whether `daemon.ts` currently handles process termination signals (SIGINT/SIGTERM)
cleanly on Windows without leaving orphaned background listener ports.

## What done looks like

- [ ] Either Option A (Land) or Option B (Shelve) is executed deliberately:
  - **Option A (Land):**
    - `daemon.ts` is audited for path traversal security (`confinePath`), auth token handling, and error response formatting.
    - An automated test is added under `apps/cli/test/daemon.test.ts` verifying daemon boot, health check, and graceful shutdown.
    - `npm run typecheck` and `npm test` pass with zero errors.
    - All three files are committed cleanly to master.
  - **Option B (Shelve):**
    - The dirty files are committed to a feature branch (`git checkout -b feat/daemon-service`), and master is reset to a clean state.
- [ ] `git status` on master is completely clean.
- [ ] M1-01 can run with complete confidence that local behavior matches remote CI.

## Steps

1. **Evaluate landing vs shelving:**
   - Inspect `apps/cli/src/commands/daemon.ts`. It provides backend services for the Studio desktop app and background runners.
   - If the implementation builds clean and passes tests, proceed with **Option A (Land)**.
   - If the implementation is half-baked or introduces regressions, execute **Option B (Shelve)** to `feat/daemon-service`.
2. **If Landing (Option A):**
   - **Audit Security:**
     - Verify `confinePath()` (line 747) prevents directory traversal attacks outside the designated workspace root.
     - Verify bearer token authorization checks on protected routes.
   - **Verify Build & Typecheck:**
     - From `kaioken_v2/`, run:
       ```bash
       npm run typecheck
       ```
     - Fix any missing imports or interface discrepancies.
   - **Add Smoke Test:**
     - Add a lightweight test verifying daemon startup and port assignment in `apps/cli/test/daemon.test.ts`.
   - **Run Engine Tests:**
     - Execute `npm test` from `kaioken_v2/`.
3. **If Shelving (Option B):**
   - Create feature branch:
     ```bash
     git checkout -b feat/daemon-service
     git add kaioken_v2/apps/cli/src/commands/daemon.ts kaioken_v2/apps/cli/src/main.ts kaioken_v2/packages/serve/src/index.ts
     git commit -m "feat(cli): preserve in-flight daemon implementation"
     git checkout master
     git reset --hard HEAD
     ```
4. **Final Check:**
   - Confirm working tree is clean.

## In scope

- `kaioken_v2/apps/cli/src/commands/daemon.ts`
- `kaioken_v2/apps/cli/src/main.ts`
- `kaioken_v2/packages/serve/src/index.ts`
- `kaioken_v2/apps/cli/test/daemon.test.ts` (if landing)

## Out of scope

- Modifying `.github/workflows/ci.yml` (handled in M1-01).
- Building the full Studio UI integration for the daemon (handled in M3 / Studio v0.1).
- Touching unrelated engine packages.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck && npm test
```

From repo root:

```bash
git status --short
```

Must be completely clean (or contain only tracked, reviewed changes if landing).

## Traps

| Trap | Guard |
|---|---|
| Retargeting CI while leaving `daemon.ts` uncommitted | Local passes because `main.ts` imports `daemon.js`; remote CI fails because `daemon.ts` was never pushed |
| Discarding `daemon.ts` with `git clean -f` | 1,900 lines of functional daemon logic would be permanently destroyed. Never run `git clean` |
| Committing without running `npm run typecheck` | Any type error in `daemon.ts` will break the entire project reference build |
| Unhandled port binding collisions in tests | Use port 0 in daemon tests so the OS dynamically assigns an available port |

## Open questions

None.

## Session brief

```xml
<task>
In this repository, resolve the uncommitted in-flight work in kaioken_v2:
  M kaioken_v2/apps/cli/src/main.ts
  M kaioken_v2/packages/serve/src/index.ts
  ?? kaioken_v2/apps/cli/src/commands/daemon.ts (1,928 lines)

This leaf MUST be completed before M1-01 can run: CI cannot be green if the committed tree differs
from what is tested locally.

Actions:
1. Review kaioken_v2/apps/cli/src/commands/daemon.ts, main.ts, and packages/serve/src/index.ts.
2. Verify that npm run typecheck and npm test pass cleanly in kaioken_v2/.
3. If they pass and the code is structurally sound, prepare the work for landing:
   - Ensure apps/cli/src/commands/daemon.ts compiles with no type errors.
   - Verify security in confinePath and auth token resolution.
   - Write a minimal smoke test in kaioken_v2/apps/cli/test/daemon.test.ts testing daemon boot with port 0.
4. If the work is incomplete or destabilizing, preserve it onto a feature branch
   (feat/daemon-service) and restore master to a clean state.
5. Report the exact state of the working tree.
</task>

<verification_loop>
Run these from kaioken_v2/:
  npm run typecheck
  npm test
Confirm whether the changes compile and whether tests succeed.
Run git status to verify exact file statuses.
</verification_loop>

<missing_context_gating>
Read the diff on main.ts and serve/src/index.ts before making any changes.
Do not invent replacement daemon logic. Either harden the existing 1,928 lines or branch them.
</missing_context_gating>

<action_safety>
Never run git clean or git reset --hard without explicitly saving daemon.ts.
Do NOT run git add or git commit directly — prepare the files and report the exact diff and
recommended commit command to the orchestrator.
</action_safety>

<structured_output_contract>
End with: (1) verdict (land vs branch), (2) verification gate results with pasted test counts,
(3) files ready to stage and commit, (4) confirmation that the tree is ready for M1-01.
</structured_output_contract>
```
