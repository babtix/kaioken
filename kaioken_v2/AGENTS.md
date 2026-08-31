# AGENTS.md

A repository knowledge engine organised as an npm workspaces monorepo of composite TypeScript projects. `scan`, `symbols`, `search`, `serve`, `status`, `verify` and `graph` are fully offline; every model-dependent stage (plan, cards, wiki, update, chat, research, export) talks to a `ModelClient` port implemented in `apps/cli`. Build before running anything — every package's `main`/`types` points at `./dist/`.

## Commands

Run from the repo root unless noted.

- `npm install` — workspace install.
- `npm run build` — `tsc --build` over every project reference, then `node packages/index/scripts/copy-queries.mjs` to copy tree-sitter `.scm` files into `packages/index/dist/queries/`. Both halves are required; without the copy, `packages/index` extracts zero symbols.
- `npm run typecheck` — `tsc --build --force` (clean rebuild).
- `npm run test` — builds first, then `vitest run`. Tests must be offline (see Gotchas).
- `npm run clean` — `tsc --build --clean`.
- One test: `npx vitest run packages/<pkg>/test/<file>.test.ts`. Build first, since tests import from `dist/`.
- CLI: `node apps/cli/dist/bin.js <command> --root <path>`. The bin is generated; do not invoke `src/bin.ts` directly. The package maps the command name `kaioken` to it. `apps/tui` exposes `kaioken-tui` the same way.

## Architecture

- Workspaces: `packages/*` and `apps/*`. All packages are `private: true`.
- The root `tsconfig.json` references every project; build order is fixed by the references graph. `packages/index` sits behind `packages/scan`; `packages/serve` depends on `scan`, `index`, `search`; both `apps/cli` and `apps/tui` depend on `apps/cli`/`packages/agent` and friends. Don't reorder references without checking dependents.
- `packages/index` serves three roles from one artifact: skeleton for context bundling, grounding oracle (`SymbolOracle.has(name)`), and anchor resolver (`resolveExcerpt` — refuses paraphrases and ambiguous matches rather than guessing).
- `packages/model` is a transport-free port. Concrete wiring (the `@earendil-works/pi-agent-core` / `@earendil-works/pi-ai` dependencies) lives only in `apps/cli` — that is the only place in the repo that knows Pi exists.
- Card and wiki stores are read by path, not through their writing package — do not introduce a model-port dependency into a tenant that must work offline.

## Conventions

- Adding a new source language requires **both** an entry in `packages/index/src/grammars.ts` and a `.scm` query file under `packages/index/src/queries/`. Forgetting either fails silently: without the grammar the file shows up in `unparsedLanguages`; without the `.scm`, declaration extraction returns nothing.
- Use the `--root <dir>` flag on every CLI invocation against a target repository. Commands are designed to be runnable from any cwd.
- `phase 1 is fully deterministic and offline` (vitest config comment). Tests that need a network call or an API key are wrong by design, not by oversight.

## Gotchas

- `packages/index` has a non-TypeScript build step: `scripts/copy-queries.mjs` mirrors `.scm` files into `dist/`. The repo-root `npm run build` invokes it; running `cd packages/index && npm run build` works too. Running just `tsc -b` does not.
- `vitest.config.ts` sets `testTimeout: 20_000`. If a test needs more, the test is too slow — don't raise the global timeout.
- Tree-sitter `.scm` files inside `dist/` are generated; edit `src/queries/` and rebuild, never hand-edit `dist/`.
- Node `>=22` is required (root `engines` field).
- Test discovery is `packages/*/test/**/*.test.ts` and `apps/*/test/**/*.test.ts` only. Tests placed elsewhere are silently ignored.
- `apps/tui` builds as part of `tsc --build`; its `bin` (`kaioken-tui`) is generated at `apps/tui/dist/bin.js`.

<!-- kaioken:knowledge:start — generated, do not edit by hand -->

## Project knowledge (generated)

Kaioken maintains documentation for this repository under `.kaioken/`.
Read the relevant entry before exploring source files — it is faster, and it
carries decisions the code does not state. Source files remain ground truth:
if a document and the code disagree, the code wins.

### Task guides (`.kaioken/skills/`)

Open the matching skill FIRST when starting one of these tasks:

- `add-a-cli-command` — Add a new subcommand to the CLI under apps/cli/src/commands/. Load when extending the CLI with a new top-level command (e.g. runCards, runChat, runExport) or wiring it into main.ts.
- `add-a-package` — Scaffold a new package under packages/ that follows the existing layout (src/index.ts barrel, internal modules, colocated test/ directory, package.json with tsconfig). Load when introducing a new capability package to the monorepo.
- `add-a-quality-gate` — Extend packages/agent with a new gate command, verdict type, or detection rule (e.g. detectCommands, runGate). Load when adding a code-quality check that runs against a repository during the agent pipeline.
- `extend-the-tui` — Add a new screen, runner, or provider lister to the TUI under apps/tui/src/. Load when adding a new interactive mode (EngineRunner, ChatRunner, ShellRunner style) or wiring a new provider list source.
- `use-tools-ask-questions` — Learned from a session: Use your tools, do not ask questions. 1) Write the file s…
- `write-a-wiki-or-card-artifact` — Write a new wiki document, module plan card, or graph export artifact under the .kaioken/ directory using the established write*/read* pairs. Load when adding a new artifact type to the documentation pipeline.

Refresh after significant changes with `kaioken update`.

<!-- kaioken:knowledge:end -->
