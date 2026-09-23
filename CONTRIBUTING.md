# Contributing to Kaioken

Thank you for considering a contribution. Kaioken is a repository knowledge engine with a hard rule: **verifiable truth over generative illusion**. That rule applies to contributions too.

## 1. License notice (read before you contribute)

Kaioken is published under the **[License Zero Noncommercial Public License 2.0.1](LICENSE)**. Commercial use requires separate permission from the maintainer.

By opening a pull request you agree that:

- Your contribution is licensed to the project under the repository's current `LICENSE`.
- You hold the rights to grant that license (your work is original, or you have permission for any third-party material it contains).
- If the project relicenses in the future, the maintainer will need your consent for your copyrighted portion. This is why the project tracks authorship carefully and may ask you to confirm your consent in writing before a relicense (see the March 2027 licensing decision context in the maintainer's roadmap).

If you cannot agree to the above, please do not open a PR — you are still welcome to file issues and participate in discussions.

## 2. Ground rules

- Be respectful. The [Code of Conduct](CODE_OF_CONDUCT.md) applies everywhere in this project.
- Report security issues privately per [SECURITY.md](SECURITY.md) — never as a public issue.
- Never commit secrets or local state: `.env*`, `*_token`, `mcp_token`, `node_modules/`, `dist/` output, `*.tsbuildinfo`, `.kaioken/sessions/`, `.kaioken/prism/`, `search_index.json`, `mcp.json`. Check `.gitignore` when in doubt.
- Keep PRs small and focused: one concern per PR (one package, one surface, one fix).
- Review is by the solo maintainer. Expect direct technical feedback and requests for mechanical verification.

## 3. Where to change what

| Area | Path | Notes |
|---|---|---|
| Engine core | `.kaioken_v2/packages/*` | All packages are `private: true` composite TypeScript projects. Do not reorder `tsconfig.json` project references without checking dependents. |
| CLI / daemon | `.kaioken_v2/apps/cli` | Owns all provider wiring (`ModelClient` concrete clients live only here). Bin is generated at `dist/bin.js` — never invoke `src/bin.ts` directly. |
| Terminal UI | `.kaioken_v2/apps/tui` | Bin `kaioken-tui` generated at `dist/bin.js`. |
| Desktop app | `desktop/` | Electron + Vite app (`desktop:dev` / `desktop:build` from root `package.json`). |
| Web portal | `website/` | React 19 + Vite + Tailwind v4. |
| Extension registry | `registry-web/` | Community hub. Untrusted input: validate manifests, sanitize rendering. |
| News feed | `web-news/` | Serverless publishing feed. |
| Design spec | `DESIGN.md` | Update only when UI surfaces change intentionally. |
| Agent instructions | `.kaioken_v2/AGENTS.md` | Authored section at top is source of truth for contributors; the `kaioken:knowledge` block at the bottom is generated — do not hand-edit it. |

## 4. Development setup

Requirements: **Node.js ≥ 22**, **npm ≥ 10**, **Git** on `PATH`.

```bash
cd .kaioken_v2
npm install
npm run build
npm test
```

Notes:

- `npm run build` is two halves: `tsc --build` over every project reference **plus** copying Tree-Sitter `.scm` queries into `packages/index/dist/queries/`. Running just `tsc -b` leaves `packages/index` extracting zero symbols.
- Build before running anything: every package's `main`/`types` points at `./dist/`.
- Target a repository explicitly with `--root <dir>` on CLI invocations (e.g. `node apps/cli/dist/bin.js scan --root /path/to/repo`). Commands are designed to run from any cwd.
- Useful commands: `npm run typecheck` (clean rebuild), `npm run clean`, single test `npx vitest run packages/<pkg>/test/<file>.test.ts` (build first — tests import from `dist/`).

## 5. Offline-first testing contract

> "If a stage needs an API key or network connection to be tested, it is designed wrong."

- `scan`, `symbols`, `search`, `serve`, `status`, `verify`, `graph`, `export`, `impact`, `hook` paths must work with **zero network calls and no API keys**.
- Tests live only under `packages/*/test/**/*.test.ts` and `apps/*/test/**/*.test.ts` (vitest). Tests placed elsewhere are silently ignored.
- `vitest.config.ts` sets `testTimeout: 20_000` — if your test needs more, the test is too slow; do not raise the global timeout.
- Every PR that changes behavior must include or update offline tests. PRs without test evidence will be asked for it.

## 6. Grounding contract (code + docs PRs)

Kaioken rejects hallucinated APIs mechanically. Your PR must respect the same gates:

- New or renamed symbols must resolve through `SymbolOracle.has(name)` / `hasFile(path)` (`.kaioken_v2/packages/index/src/oracle.ts`).
- Quoted code excerpts must be **verbatim** and resolvable via `resolveExcerpt` (`.kaioken_v2/packages/index/src/anchors.ts`). Fuzzy paraphrases are forbidden.
- Adding a language requires **both** a grammar entry in `packages/index/src/grammars.ts` **and** a `.scm` query under `packages/index/src/queries/`. One without the other fails silently. Never hand-edit `.scm` files under `dist/`.
- Do not introduce a model-port dependency into a package that must work offline. Concrete model/embedding/fetch wiring belongs in `apps/cli` only.
- Test-gate semantics (`packages/agent/src/gate.ts`): a repo that cannot be tested is `unverifiable`, never `passed`. Do not write code that reports success without evidence.

## 7. AI-assisted contributions

This project builds grounded AI agents, so AI help is normal — but it must be disclosed and human-verified:

- Disclose in the PR template: tool + model (e.g. "opencode / muse-spark"), what was generated vs. hand-written, and what you personally verified.
- You are responsible for every line in your PR, including AI-generated parts: grounding, tests, security, and license cleanliness.
- Fully autonomous PRs with no human author verification statement will be closed.
- Generated documentation must still pass mechanical verification and the offline test suite — "the model said so" is not evidence.

## 8. Branch, commit, and PR workflow

1. Fork, then branch from `master`: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`.
2. Keep commits scoped. Advisory style — Conventional Commits preferred: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` with an optional scope (`feat(index): …`, `fix(agent): …`). Imperative mood ("add", not "added").
3. Fill in the pull request template completely, including test evidence and the AI-disclosure line.
4. Ensure CI is green and review feedback is addressed. The maintainer squash-merges.

A good PR description states: the problem, the change, the packages touched, how it was verified (commands + output), and any follow-ups.

## 9. Review gates (what gets merged)

- [ ] Builds cleanly (`npm run build`, plus `typecheck` where relevant).
- [ ] Offline tests pass; new/updated tests cover the behavior change.
- [ ] No secrets, no vendored third-party dumps, no generated `dist/` committed.
- [ ] Grounding holds: no unverified symbols, paths, or paraphrased excerpts.
- [ ] Docs updated if behavior changed (`README.md`, package docs, wiki/cards where applicable).
- [ ] License consent + AI disclosure completed in the PR template.

## 10. Reporting bugs / requesting features

Use the issue templates (bug report / feature request). Include: version/commit, Node version, affected package or command, minimal repro with `--root` context where applicable, expected vs. actual behavior, and redacted logs. Security reports go through the private channel in `SECURITY.md`, not public issues.
