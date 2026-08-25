# AGENTS.md

This is a multi-project workspace that builds **Kaioken** (a terminal AI coding
assistant + knowledge engine), not a single app. Most work targets `cli/`. Read
the matching project-level `AGENTS.md` before editing that area.

## Layout

First-party (build here):
- `cli/` — the Go single binary (`kaioken`). Entry: `cmd/kaioken/main.go`. Has
  its own `cli/AGENTS.md` plus a `.kaioken/` knowledge base — read those first
  for any cli work.
- `website/` — React 19 + Vite 6 + Tailwind 4 landing/docs site.
- `desktop/` — Tauri v2 + React 19 desktop app wrapping the cli as a Go
  sidecar. **Plan/spec only, not yet built.** Before touching it, read
  `desktop/README.md`, `AGENT_BRIEF.md`, `PLAN.md`, and `docs/10-tasks.md`.

Nested reference repos (do NOT modify or commit into these):
- `opencode/` — vendored clone of `anomalyco/opencode` (branch `dev`), kept for
  reference only. It is a separate git repo and is NOT tracked by the root. It
  has its own `opencode/AGENTS.md`; ignore unless a task explicitly targets it.
- `wiki/` — the GitHub wiki repo (`babtix/kaioken.wiki`), tracked by root as a
  gitlink with **no `.gitmodules`**, so `git submodule ...` errors. Treat as
  separate from first-party code.

Gitignored local dirs (don't commit, don't rely on them being present):
`.reference/` (third-party source, read-only), `.qoder/`, `.claude/`, `.ainow/`.

## Commands

There is **no root `package.json` or `Makefile`** — run commands per project.

`cli/` (Go 1.24.2):
- `cd cli && make build` → `cli/kaioken.exe`. Also `make test`, `make vet`,
  `make lint`, `make check` (=test+vet), `make clean`.
- `make test` runs `go test ./... -count=1`; `make lint` runs golangci-lint if
  installed (skips silently otherwise). Full details in `cli/AGENTS.md`.

`website/`:
- `cd website && npm install && npm run dev`
- `npm run build` runs `tsc -b && vite build`; `prebuild` regenerates the wiki
  manifest via `scripts/gen-wiki-manifest.mjs`.

`desktop/` (only when implementing the plan):
- Requires the Rust toolchain (currently **not installed** in this env) and Go
  on PATH (Go is at `C:\Program Files\Go\bin`, not on a fresh shell's PATH —
  `scripts/build-sidecar.mjs` must not assume `go` resolves).
- `npm install` then `npm run dev` (`predev` builds the sidecar). Dist:
  `npm run dist` → `tauri build`. Tests: `npm run test` (vitest).

## Git (root repo)

- Root repo is `babtix/kaioken`, default branch **`master`**.
- Use conventional-commit messages: `type(scope): summary`, e.g.
  `feat(cli): ...`, `fix(website): ...`, `chore(desktop): ...`.
- Never commit into `opencode/` or `wiki/` from root work — they are separate
  repos.

## Cross-cutting

- `desktop/` consumes `cli/` as a sidecar and reuses `website/`'s design system:
  changes to the cli daemon/API contract or the website theme ripple into desktop.
- The cli maintains its own generated knowledge under `cli/.kaioken/`; that tree
  is agent-managed — do not hand-edit. See `cli/AGENTS.md`.
