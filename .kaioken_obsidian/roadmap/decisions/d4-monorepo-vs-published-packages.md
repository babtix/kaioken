# DECISION-04 · Studio workspace linkage: monorepo vs published packages

> Decide whether `kaioken_v2` and Kaioken Studio share a single npm workspace monorepo, consume
> published packages from a registry, or formalise isolated runtime path resolution.

| Field | Value |
|---|---|
| **Status** | `ready` (decision analysis complete; stopgap implemented; awaits permanent ratification) |
| **Size** | S |
| **Depends on** | `roadmap/decisions/d3-one-studio-fork.md` |
| **Blocks** | `roadmap/studio-v0.1/01-spike-and-stop.md`, Milestone M2 (Trusted distribution) |
| **Touches** | `kaioken_v2/package.json`, `ide_kaioken/kaioken_studio_theia/package.json` |
| **Risk** | High — affects build times, CI pipelines, and native C++ module ABIs |
| **Gate-critical** | **Yes — blocks release pipeline design** |

## Why this exists

The scope document ([`kaioken_v2/docs/studio-v0.1-scope.md:127-128`](../../kaioken_v2/docs/studio-v0.1-scope.md#L127-L128))
insists:
> *Merging the workspaces affects Kaioken's own build, test and release story. Decide monorepo versus
> published packages at step 1, not later.*

How Studio links to the engine packages (`@kaioken/index`, `@kaioken/scan`, `@kaioken/agent`, etc.)
dictates the entire developer workflow:
- If entangled in a single npm workspace, a change to a GUI widget risks breaking `apps/tui` or
  forcing recompilation of native C++ modules (`tree-sitter`) across incompatible Node and Electron ABIs.
- If decoupled via published npm packages, every tiny bug fix in an engine function requires bumping
  a version, publishing to a registry, and running `yarn upgrade` before testing it in the GUI.

When Studio development started on 2026-09-01, a third path — **runtime path resolution** — was
spiked as a temporary bridge (`studio-v0.1-build-notes.md` §3). This decision record formalises the
permanent strategy.

## Current state

Verified against [`kaioken_v2/docs/studio-v0.1-build-notes.md:49-72`](../../kaioken_v2/docs/studio-v0.1-build-notes.md#L49-L72)
and [`ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts`](../../ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts):

| Fact | Evidence |
|---|---|
| Engine is independent workspace | `kaioken_v2/package.json` defines workspaces `["packages/*", "apps/*"]` on Node >= 22 |
| Theia is independent Yarn workspace | `ide_kaioken/kaioken_studio_theia/package.json` uses Yarn v1 with workspaces `["applications/*", "theia-extensions/*"]` |
| Stopgap implementation | `node_modules/theia-ide-kaioken-ext/` (Blueprint path `theia-extensions/kaioken/`) does NOT list `@kaioken/*` in `package.json`. It dynamically imports the built dist at runtime via `KAIOKEN_ENGINE_ROOT` |
| Native tree-sitter constraint | `@kaioken/index` compiles native bindings for Node 22; Theia Electron compiles native bindings for Electron 32+. Direct dependency sharing causes ABI mismatch errors |
| TUI protection requirement | Scope prerequisite dictates that Studio development must not churn or destabilise `apps/tui` |

## Options and trade-offs

### Option A: Unified npm / Yarn Monorepo
- **Concept:** Merge `ide_kaioken/kaioken_studio_theia/` into the root repo (or add it to `workspaces`
  in `kaioken_v2/package.json`), allowing Theia extensions to declare `"@kaioken/scan": "workspace:*"`.
- **Trade-offs:**
  - *Pros:* Instant type checking across boundaries; IDE auto-completion from engine packages;
    single `install` command.
  - *Cons:* **Severe native ABI collisions.** Theia requires `electron-rebuild` for native modules.
    Running that across shared packages breaks Node CLI/TUI native bindings. Furthermore, Theia uses
    Yarn Classic (v1), while `kaioken_v2` uses npm on Node 22. Reconciling package managers is painful.

### Option B: Published npm Packages
- **Concept:** Publish `@kaioken/*` packages to npm or GitHub Packages. Studio installs them as standard
  versioned dependencies.
- **Trade-offs:**
  - *Pros:* Clean, industry-standard architectural decoupling. Exact version pinning.
  - *Cons:* Unbearable friction during rapid pre-1.0 vibe-coding. An agent cannot fix a bug in
    `packages/wiki` and verify it in Studio without a multi-step release cycle.

### Option C: Formalised Runtime Path Resolution (Current Architecture)
- **Concept:** Formalise the spiked pattern from `studio-v0.1-build-notes.md` §3. Studio depends on
  `@kaioken/*` purely at runtime via dynamic import from `KAIOKEN_ENGINE_ROOT` (defaulting to
  `../../kaioken_v2`).
- **Trade-offs:**
  - *Pros:* Zero package-manager friction. Zero native ABI conflicts (engine runs in backend Node,
    Theia runs its own modules). Complete isolation: Studio work touches zero files in `kaioken_v2`,
    keeping `apps/tui` 100% safe.
  - *Cons:* Requires `npm run build` in `kaioken_v2` before Studio can boot. Type definitions must be
    imported via ambient TypeScript `import type` rather than direct package dependencies.

## Recommendation

**Recommendation: Option C for Studio v0.1 and Milestone M1–M3, transitioning to Option A only in M12.**

*Rationale:* The spiked runtime path resolution has already proven completely functional on disk.
It avoids the notorious Electron/Node native module rebuild trap on Windows (which already cost time
with Spectre libraries in `01-spike-and-stop`). It adheres strictly to the prerequisite that
`apps/tui` must not be destabilised.

The minor cost — remembering to run `npm run build` in `kaioken_v2` — is mitigated by a clear startup
diagnostic in Studio's repository widget.

## What done looks like

- [ ] Maintainer confirms Option C as the official linkage contract for Studio v0.1.
- [ ] `ide_kaioken/kaioken_studio_theia/node_modules/theia-ide-kaioken-ext/src/node/kaioken-engine.ts` (Blueprint path `theia-extensions/kaioken/src/node/kaioken-engine.ts`)
      is updated with a strict contract version guard verifying that the engine at `KAIOKEN_ENGINE_ROOT` matches expected API versions.
- [ ] Status transitions to `done`.

## Steps to reach the decision

1. **Review Build Notes §3:** Evaluate the performance and stability of the dynamic import bridge in
   `studio-v0.1-build-notes.md`.
2. **Confirm Package Manager Separation:** Confirm that keeping Yarn v1 in Theia and npm in `kaioken_v2`
   prevents lockfile corruption.
3. **Sign-off:** Maintainer records determination.

## In scope

- Dependency strategy and workspace configuration between `kaioken_v2` and `kaioken_studio_theia`.

## Out of scope

- Setting up private npm registry servers.

## Gates

Maintainer sign-off on Option C before proceeding to `studio-v0.1/04-chat-pane-and-approval-dialog.md`.

## Traps

| Trap | Guard |
|---|---|
| Merging Yarn v1 and npm lockfiles | Theia's build scripts specifically expect Yarn v1 workspaces. Do not force npm on Theia Blueprint or Yarn on `kaioken_v2`. |
| Silent failures when `kaioken_v2` is not built | Studio must display a visible banner in the UI ("Kaioken engine not built. Run 'npm run build' in kaioken_v2/") instead of crashing silently. |

## Open questions

1. Does the maintainer ratify Option C (Formalised runtime path resolution for Studio v0.1)?
   - *Owner:* Human maintainer.

## Session brief

```xml
<task>
This is a research-and-recommend decision brief for Studio Workspace Linkage (Decision D-4):

1. Examine the current integration between kaioken_studio_theia and kaioken_v2:
   - Check kaioken_v2/docs/studio-v0.1-build-notes.md §3.
   - Inspect theia-extensions/kaioken/src/node/kaioken-engine.ts.
   - Check package managers: npm in kaioken_v2 vs Yarn in kaioken_studio_theia.
2. Evaluate the three options:
   - Option A: Single monorepo workspace (merging package trees).
   - Option B: Published npm packages.
   - Option C: Formalised runtime path resolution via KAIOKEN_ENGINE_ROOT.
3. Weigh the severe risk of native C++ module rebuild collisions (tree-sitter under Node 22 vs Electron).
4. Provide the formal recommendation to endorse Option C for Studio v0.1.
</task>

<research_mode>
Partition your analysis:
- OBSERVED FACTS: Actual package.json configurations, package manager divergence, native tree-sitter deps.
- INFERENCES: Build friction and ABI collision likelihood if workspaces are merged.
- OPEN QUESTIONS: Whether runtime path resolution creates packaging hurdles in leaf 06.
</research_mode>

<verification_loop>
Verify that kaioken-engine.ts currently resolves paths dynamically and that yarn electron start boots
without declaring @kaioken/* in package.json.
</verification_loop>

<action_safety>
Do not modify package.json or install new dependencies during this session.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) technical analysis of the native module ABI conflict between Electron and Node,
(2) evaluation of the 3 linkage options, (3) clear recommendation to formalise Option C,
(4) action items for the maintainer.
</structured_output_contract>
```
