# M2-01 · Decide the distribution model: npm, binary, or Studio

> Evaluate the three viable distribution models for the TypeScript engine — scoped npm package,
> standalone compiled binary, or bundled Studio-only — and record the architectural decision that
> unblocks M2.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | `roadmap/README.md` §9 Q1 (Studio fork) & Q4 (Workspace structure) |
| **Blocks** | `02-npm-provenance-and-signing`, `03-release-workflow-retarget`, `04-installers-and-package-managers`, `05-selfupdate-path` |
| **Touches** | Documentation (`roadmap/decisions/distribution-model.md`) |
| **Risk** | High. Determines the toolchain, signing requirements, and install instructions for all future users |
| **Gate-critical** | **Yes — blocks all downstream M2 execution** |

## Why this exists

In v1, distribution was a solved problem for a Go codebase: GoReleaser cross-compiled static binaries
for Windows, macOS, and Linux, which were zipped and signed with Cosign.

In v2, the canonical engine is a TypeScript/Node monorepo in `kaioken_v2/` comprising 19 packages,
two apps (`apps/cli` and `apps/tui`), and native dependencies (`web-tree-sitter` wasm files and
`.scm` tree-sitter queries). You cannot simply run `go build` to generate an executable.
The project stands at a fork in the road between three mutually incompatible distribution paths.
Downstream tasks in M2 (release workflows, package managers, self-update mechanisms, and signature
verifications) cannot be authored until the maintainer commits to one of these models.

## Current state

Verified against the codebase.

| Fact | Evidence |
|---|---|
| Engine workspace setup | `kaioken_v2/package.json:5-8` (`workspaces: ["packages/*", "apps/*"]`) |
| Engine root private | `kaioken_v2/package.json:3` (`"private": true`) |
| Packages marked private | All packages under `kaioken_v2/packages/*/package.json` currently have `"private": true` |
| CLI executable entry point | `kaioken_v2/apps/cli/dist/bin.js` (compiled from `src/main.ts`) |
| Native wasm dependencies | `kaioken_v2/packages/index/package.json:21` (`web-tree-sitter`), query files in `packages/index/queries/*.scm` |
| Dead Go release workflow | `.github/workflows/release.yaml` still runs `setup-go` and `goreleaser` against archived paths |
| License constraint | License Zero Noncommercial Public License 2.0.1 (`roadmap/README.md` §8) |

`UNVERIFIED:` whether `bun build --compile` reliably packages `web-tree-sitter` and its dynamic
`.wasm` loads on Windows without runtime extraction errors.

## The three distribution models

### Model A: Scoped npm packages (`@kaioken/cli`)
- **How it works:** Publish packages under the `@kaioken` npm scope. Users run `npx @kaioken/cli scan` or `npm install -g @kaioken/cli`.
- **Pros:**
  - Standard JavaScript ecosystem workflow.
  - Native support for GitHub Actions npm provenance (`npm publish --provenance`) backed by Sigstore.
  - Automatic cross-platform compatibility across Windows, macOS, and Linux without compiling OS-specific binaries.
- **Cons:**
  - Requires end-users to have Node.js `>= 22` pre-installed on their machines.
  - Exposes unbundled source/transpiled JS directly.
  - License Zero noncommercial enforcement is purely legal; npm registry has no built-in license gating.

### Model B: Standalone compiled executable (Node SEA or Bun)
- **How it works:** Bundle the CLI into a single executable (`kaioken.exe` / `kaioken`) using Node.js Single Executable Applications (SEA), `pkg`, or `bun build --compile`.
- **Pros:**
  - Matches the v1 user experience: a single zero-dependency binary that runs out of the box.
  - Does not require the user to manage a Node installation.
  - Enables traditional code signing (Windows Authenticode, macOS codesign) and direct GitHub Release downloads.
- **Cons:**
  - Node SEA requires manual blob injection and complex post-processing steps.
  - `web-tree-sitter` loads external `.wasm` files dynamically at runtime (`grammars.ts:75`), which fails inside virtual filesystems unless extracted to disk.
  - Binary sizes are large (60MB–90MB per OS).

### Model C: Ship inside Studio only (Desktop-first)
- **How it works:** Do not distribute a standalone CLI at all. Kaioken is installed exclusively as the Kaioken Studio desktop IDE application, which bundles its own Node/Electron runtime and CLI shim.
- **Pros:**
  - Zero package publishing friction.
  - In-process execution removes sidecar and IPC issues entirely.
  - Simplest distribution footprint for a solo maintainer.
- **Cons:**
  - Completely eliminates headless CI integration (e.g., `kaioken status --check` in GitHub Actions).
  - Destroys terminal-only workflows and the terminal UI (`apps/tui`).

## What done looks like

- [ ] A formal decision document is created at `roadmap/decisions/distribution-model.md` selecting Model A, B, or C.
- [ ] The trade-off analysis is accepted and signed off by the maintainer.
- [ ] Downstream leaves in M2 (`02`, `03`, `04`, `05`) are unblocked and updated to match the chosen model.
- [ ] Status of this leaf transitions from `blocked` to `done`.

## Steps

1. **Review requirements and developer profile:**
   - The maintainer develops on Windows (`D:\project\ai_now_know`).
   - The knowledge engine must run headless in CI (`status --check`) as well as in terminal sessions.
2. **Weigh Node runtime prerequisite:**
   - Assess whether target users (developers using AI coding agents) already possess Node >= 22.
3. **Assess native dependency packaging:**
   - If Model B (binary) is chosen, run a proof-of-concept compiling `apps/cli` with embedded wasm files. If wasm resolution fails, Model A is the only viable path.
4. **Author Decision Record:**
   - Write `roadmap/decisions/distribution-model.md` documenting the choice, the migration steps for `package.json` files, and the target package managers.
5. **Update M2 leaves:**
   - Retarget `02-npm-provenance-and-signing.md` and `03-release-workflow-retarget.md` to reflect the chosen architecture.

## In scope

- Analysis and decision document `roadmap/decisions/distribution-model.md`.
- Unblocking M2 downstream leaf tasks.

## Out of scope

- Writing the GitHub Actions release workflow (handled in M2-03).
- Configuring npm tokens or signing certificates (handled in M2-02).

## Gates

None (architectural decision). Unblocked when the maintainer records the decision in `roadmap/decisions/distribution-model.md`.

## Traps

| Trap | Guard |
|---|---|
| Choosing Model B (binary) without testing `web-tree-sitter` wasm loading | SEA virtual file systems cannot `dlopen` native addons or load wasm files without disk unpacking |
| Choosing Model C and abandoning the headless CLI | Kaioken's core value proposition relies on CI gates (`status --check`) and automated documentation updates |
| Prematurely authoring `release.yaml` before choosing the model | Releases look completely different for npm packages vs binary archives |

## Open questions

1. **Do Kaioken's intended users already have Node >= 22?** If yes, Model A (npm scoped packages) has drastically lower maintenance overhead for a solo vibe coder.
2. **How does License Zero impact npm registry distribution?** Does publishing noncommercial software to npm require explicit warning banners or dual-licensing preparations?

## Session brief

```xml
<task>
This leaf is BLOCKED pending a decision from the maintainer on the distribution model for Kaioken v2.

Your task is to prepare the formal Decision Record at roadmap/decisions/distribution-model.md:
1. Lay out the three models in detail:
   - Model A: Scoped npm packages (@kaioken/cli, @kaioken/core)
   - Model B: Standalone compiled binary (Node SEA / bun build --compile)
   - Model C: Studio-only bundled distribution
2. Compare them across:
   - Build complexity for a solo maintainer
   - Native web-tree-sitter wasm runtime loading
   - Installation friction on Windows, macOS, and Linux
   - CI automation compatibility (status --check)
   - Provenance and signing story (npm provenance vs Authenticode/cosign)
3. Formulate a concrete recommendation (Model A is strongly recommended due to native wasm simplicity
   and built-in npm Sigstore provenance).
4. Do not alter any code or workflow files until the maintainer formally signs off.
</task>

<verification_loop>
Confirm roadmap/decisions/distribution-model.md exists and contains the structured trade-off analysis.
Verify that no changes were made to package.json files or workflows.
</verification_loop>

<missing_context_gating>
Do not invent packaging scripts. Verify that packages/index/src/grammars.ts uses require.resolve
for wasm files, which directly affects single-binary feasibility.
</missing_context_gating>

<action_safety>
Documentation only. Do NOT run git add or git commit. Leave the decision draft uncommitted for review.
</action_safety>

<structured_output_contract>
End with: (1) summary of the three models, (2) recommendation and technical rationale,
(3) list of downstream M2 leaves that depend on the maintainer's sign-off.
</structured_output_contract>
```
