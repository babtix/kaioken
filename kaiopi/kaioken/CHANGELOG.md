# Changelog

## [0.1.0] — Kaioken

The first release of Kaioken, the offline truth layer for the Pi harness.

### The shape of it

A fast, cheap model with the right oracle behaves like a grounded senior
engineer; the same model without one invents symbols, paraphrases code it never
read, and declares work done without running anything. Kaioken supplies the
oracle. Pi supplies the hands.

Ten invariants hold the design together — Pi core is never forked, the core
stays offline, no assertion without an oracle lookup, negative guarantees are
first-class answers, no "done" without the native test gate, human checkpoints
before spending, provenance governs refresh, skeletons fit the budget before
detail is fetched, cost is reported mechanically, and a stage that needs a key
to be tested is designed wrong.

### Offline core

Seventeen packages under `kaioken/`, none of which reaches the network or reads a
credential:

- **`scan`** — deterministic repository inventory with risk classification
- **`index`** — Tree-sitter AST index, `SymbolOracle`, exact anchor resolution
- **`search`** — BM25 + RRF over wiki, cards and skills
- **`provenance`** — content-hash staleness: which documents a change invalidates
- **`impact`** — blast radius from indexed dependents
- **`graph`** — dependency graph build, render and export bundle
- **`gitops`** — worktrees, diffs, post-commit hook
- **`verify`** — the hard native test gate (npm/pnpm/yarn/bun/go/cargo/make)
- **`verifycore`** — mechanical verifier: symbol, anchor, padding, coverage
- **`skills`** — skill store with frontmatter parsing
- **`serve`** — offline preview server, binds `127.0.0.1` only

### Generative pipeline

Six packages behind an injected model seam, so the whole pipeline is testable
offline with scripted doubles:

- **`modelport`** — the pure `ModelClient` port, the pi-ai adapter, spend
  estimation from the model's own published rates, and a bounded concurrency pool
- **`plan`** — module plan → knowledge cards, with an adversarial repair loop
- **`wiki`** — chapter cascade: outline → sections → write → verify → repair
- **`research`** — web-grounded answers with citation verification and an SSRF
  filter that rejects private IPv4 and IPv6 ranges
- **`skillgen`** — task procedures with every cited path checked against the scan
- **`evals`** — offline grounding probe suite, metrics, and a gate that exits
  non-zero when a metric misses its threshold

### The Pi bridge

`.pi/extensions/kaioken/` — the only code that talks to Pi:

- **7 tools** — `kaio_symbol_lookup`, `kaio_read_file`,
  `kaio_wiki_search`, `kaio_impact`, `kaio_skill_load`,
  `kaio_status`, `kaio_verify`
- **16 commands** — `scan`, `index`, `search`, `graph`, `export`, `status`,
  `plan`, `cards`, `wiki`, `update`, `research`, `skills`, `serve`, `delegate`,
  `merge`, `verify`
- **4 hooks** — grounding prompt injection with a drift report, resource
  discovery, session badge, and a destructive-command guard

### Surfaces

- `kaioken` and `kaioken-light` Pi themes, ported from the DESIGN.md ANSI ramp
  and validated against Pi's own theme schema
- Generated skills offered to Pi through `resources_discover`, so they appear in
  the ordinary skill list as well as behind `kaio_skill_load`
- A `verified ✓` badge on every wiki page, driven by
  `.kaioken/verification.json`

### Packaging

`kaioken-pi` on npm, built by `npm run pack:kaioken`. Pi loads extensions as
TypeScript, so the bundle ships `.ts` and rewrites the bridge's relative core
imports to package specifiers. That rewrite is checked mechanically: every symbol
the bridge imports must be reachable from the barrel a consumer actually
resolves, and the built extension is loaded the way Pi loads it before the
package is considered good.

### Verification

- 551 tests across 31 files, all offline
- `check:kaioken` — typecheck, no-network-import assertion, barrel coverage
- `check:kaioken:fresh` — the offline chain on an untouched repository
- `pack:kaioken` — build and load the publishable package
- `kaioken/evals/bin.mjs` — the grounding gate, at `×3` and `×10`
- CI runs all of it with no secrets and no network

### Bugs found and fixed while building this

- `/kaio-scan` read `risk.level` on a `Risk[]` array, so it reported "0 high
  risk flags" even on a repository full of private keys.
- `/kaio-export` built a manifest with a field that is not part of
  `ExportManifest`.
- `/kaio-wiki` and `/kaio-update` passed a promise where the run contract
  requires `Promise<void>`.
- The destructive-command guard named `powershell` as a shell it policed but
  matched only Unix syntax, so `Remove-Item -Recurse -Force` passed through. The
  cause was `\b-recurse`, which can never match: a word boundary needs a
  word/non-word transition and the space before the hyphen is not one.
- `research`'s `cites_failed_fetch` defect was unreachable — a page that could
  not be fetched was reported as an invented source.
- The plan's path normalisation converted backslashes after stripping `./`, so
  `.\src\a.ts` never normalised.
- No Kaioken package had a `test` script, so the suites were silently skipped by
  `npm test --workspaces`.
- `kaioken/` had no build script, so most packages shipped a `dist` older than
  their sources.
- Nothing typechecked the Kaioken tree at all — `tsconfig.kaioken.json` was
  added, and it immediately found six more errors in committed code.

### Known limits

- The wiki, cards and skills are model output. Claims are checked against the
  index at generation time and the failures are recorded, but a claim that
  passed is still a claim. Where a document and the code disagree, the code is
  right.
- Grounding is only as good as the index. A language without a parser is indexed
  by file rather than by declaration, and the oracle says so rather than guesses.
- The verifier runs the repository's own tests and has no opinion about whether
  they are any good.
- No provider is configured in this repository, so every claim above is verified
  offline. Live model runs against a real provider have not been exercised here.
