# M1-02 · Add the three-OS matrix and make jobs required

> Extend the retargeted CI workflow to run across Ubuntu, macOS, and Windows runners, making each
> check required and catching native tree-sitter compilation differences before they reach master.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-retarget-ci-workflow` (the baseline single-runner workflow must be working first) |
| **Blocks** | `03-flaky-test-quarantine`, `roadmap/m02-trusted-distribution/` |
| **Touches** | `.github/workflows/ci.yml` |
| **Risk** | Medium. Windows path separators, CRLF line endings, and native tree-sitter bindings behave differently across runners |
| **Gate-critical** | **Yes** |

## Why this exists

Operating rule 2 states that a green build is a precondition, not a milestone. In a cross-platform
knowledge engine, "green on Ubuntu" is an incomplete truth. The primary maintainer develops on
Windows (`D:\project\ai_now_know`), production deployments may run on Linux, and potential users
clone on macOS.

The TypeScript engine in `kaioken_v2/` relies on `web-tree-sitter` and language grammar packages
(`tree-sitter-typescript`, `tree-sitter-python`, etc.). While web-tree-sitter executes Wasm modules,
Node native dependencies, path normalization (`toPosix` in `@kaioken/scan`), shell execution in
`@kaioken/gitops`, and file system watchers operate under distinct OS semantics. Without a required
3-OS matrix, OS-specific failures (such as Windows backslash path escaping or macOS case-insensitive
file lookups) silently land on master.

## Current state

Verified against the working tree and CI configuration.

| Fact | Evidence |
|---|---|
| M1-01 retargeted CI to a single runner | `.github/workflows/ci.yml` (runs on `ubuntu-latest` only) |
| Engine requires Node >= 22 | `kaioken_v2/package.json:9-11` (`"engines": { "node": ">=22" }`) |
| Real build and test scripts | `kaioken_v2/package.json:12-17` (`build`, `typecheck`, `test`, `clean`) |
| Tree-sitter dependencies declared | `kaioken_v2/packages/index/package.json:14-22` (`web-tree-sitter`, `tree-sitter-go`, `tree-sitter-javascript`, `tree-sitter-python`, `tree-sitter-rust`, `tree-sitter-typescript`) |
| Grammars load prebuilt wasm via node require | `kaioken_v2/packages/index/src/grammars.ts:21-41` |
| Query files copied during build | `kaioken_v2/packages/index/scripts/copy-queries.mjs` runs in `npm run build` |
| Path normalization exists in scan | `kaioken_v2/packages/scan/src/scan.ts` uses `toPosix` helper |

`UNVERIFIED:` whether `npm ci` and `vitest run` on `macos-latest` require any extra system libraries
or compilation headers for node-gyp fallbacks.

## What done looks like

- [ ] `.github/workflows/ci.yml` defines a matrix strategy across `ubuntu-latest`, `macos-latest`, and `windows-latest`.
- [ ] Each matrix job runs Node 22, executes `npm ci`, `npm run typecheck`, `npm test`, and the CLI smoke test.
- [ ] Path handling in CI steps uses platform-agnostic commands or cross-platform shells (e.g. bash or node scripts).
- [ ] The cache key in `actions/setup-node` incorporates runner OS: `npm-cache-${{ runner.os }}-${{ hashFiles('kaioken_v2/package-lock.json') }}`.
- [ ] Matrix failure behavior is set to `fail-fast: false` so that failures on one OS do not cancel diagnostic runs on the others.
- [ ] The workflow job name produces predictable check names (e.g., `engine (ubuntu-latest)`, `engine (macos-latest)`, `engine (windows-latest)`) suitable for GitHub Branch Protection required status checks.
- [ ] Gates pass locally on the host OS.

## Steps

1. **Inspect `.github/workflows/ci.yml`** after M1-01 has landed to understand the single-runner baseline.
2. **Add matrix strategy** to the `engine` job:
   ```yaml
   strategy:
     fail-fast: false
     matrix:
       os: [ubuntu-latest, macos-latest, windows-latest]
   runs-on: ${{ matrix.os }}
   ```
3. **Configure runner-specific environment and cache:**
   - Use `actions/setup-node@v4` with `node-version: 22`.
   - Ensure cache key accounts for `${{ runner.os }}` and `kaioken_v2/package-lock.json`.
4. **Ensure cross-platform step execution:**
   - In `working-directory: kaioken_v2`, run:
     - `npm ci`
     - `npm run typecheck`
     - `npm test`
   - Smoke test step:
     ```yaml
     - name: Smoke test CLI
       run: node apps/cli/dist/bin.js scan --root .
       working-directory: kaioken_v2
     ```
   - Ensure shell compatibility: do not use bash-specific builtins on Windows unless `shell: bash` is explicitly declared.
5. **Check for Windows path and line-ending traps:**
   - Verify git checkout configuration if line endings cause git status dirtiness (`core.autocrlf: false` or `.gitattributes`).
6. **Verify and review diff:**
   - Check `git diff .github/workflows/ci.yml` to confirm no unwanted job duplication or leftover v1 artifacts.

## In scope

- `.github/workflows/ci.yml`

## Out of scope

- `.github/workflows/release.yaml` (handled in M2-03).
- Fixing engine code bugs exposed by the matrix on other platforms (if macOS or Linux surfaces an engine bug, log it as an issue/task; do not quietly mutate engine packages in this workflow PR).
- Quarantining flaky tests (handled in M1-03).
- Setting up branch protection rules in GitHub web UI (document the required check names, but UI settings cannot be committed to git).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck && npm test
```

From repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

Working tree must show only `.github/workflows/ci.yml` modified.

## Traps

| Trap | Guard |
|---|---|
| Using `shell: bash` implicitly on Windows | Either make commands POSIX-neutral (`npm run ...`) or explicitly set `defaults.run.shell: bash` at job level |
| `fail-fast: true` aborting the matrix on first failure | Explicitly set `fail-fast: false` so full multi-OS diagnostic data is captured |
| Relying on `npm run typecheck` without `--force` | `npm run typecheck` runs `tsc --build --force`. Do not replace with `tsc --noEmit` which ignores solution references |
| Assuming `tree-sitter` wasm files work identically on Windows and Linux | Wasm is portable, but file paths passed to `Language.load()` must resolve cleanly across forward and backslashes |
| Cache collisions across operating systems | Key the npm cache on `${{ runner.os }}` so native binaries compiled during install do not poison different platforms |

## Open questions

None.

## Session brief

```xml
<task>
In .github/workflows/ci.yml, expand the single-runner CI job established in M1-01 into a full
three-OS matrix: ubuntu-latest, macos-latest, windows-latest.

Requirements:
1. Under jobs.engine, add a strategy matrix with:
   matrix:
     os: [ubuntu-latest, macos-latest, windows-latest]
   fail-fast: false
   runs-on: ${{ matrix.os }}
2. Set job name to "engine (${{ matrix.os }})" so GitHub branch protection rules can uniquely target
   each required check.
3. Configure actions/setup-node@v4 for Node 22 with npm cache pointing to
   kaioken_v2/package-lock.json, scoped by runner.os.
4. Steps to execute in kaioken_v2:
   - npm ci
   - npm run typecheck (which runs tsc --build --force)
   - npm test (which runs npm run build && vitest run)
   - Smoke test: node apps/cli/dist/bin.js scan --root .
5. Ensure all step execution works seamlessly on Windows without crashing on shell incompatibilities
   (use cross-platform npm scripts or specify shell: bash if invoking unix shell constructs).

Do NOT modify any engine code under kaioken_v2/ or .github/workflows/release.yaml.
</task>

<verification_loop>
Run these from kaioken_v2/ on your current host to ensure baseline health:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Verify that .github/workflows/ci.yml is valid YAML and matches the schema expected by GitHub Actions.
Confirm git status shows only .github/workflows/ci.yml modified.
</verification_loop>

<missing_context_gating>
Do not invent runner names or package names. Read kaioken_v2/package.json for valid scripts.
The engine requires Node >= 22. All query files are copied via copy-queries.mjs during npm run build.
</missing_context_gating>

<action_safety>
Scope strictly to .github/workflows/ci.yml. No edits to packages or other workflow files. Do NOT run
git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the
working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed in ci.yml and why, (2) the exact matrix configuration and job naming,
(3) local verification gate outcomes, (4) potential platform quirks to monitor on the first run.
</structured_output_contract>
```
