# M11-01 · Publish GitHub Action to Marketplace

> Package Kaioken as an official GitHub Action that enforces documentation freshness gates on pull requests via status --check and regenerates the wiki on merge to main.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [M1-01](../m01-green-everywhere/01-retarget-ci-workflow.md) (CI must run before a CI product ships) |
| **Blocks** | `02-pr-triggered-incremental-update.md` |
| **Touches** | `action.yml`, `README.md`, `.github/workflows/` |
| **Risk** | High. Publishing a CI product while our own CI workflow is failing (gap G-6) destroys project credibility. |
| **Gate-critical** | Yes |

## Why this exists

A repository knowledge engine that relies solely on developers remembering to run manual terminal commands will suffer from documentation decay. The engine must become an automated checkpoint in CI.

The `status --check` command was designed specifically for this role: it executes completely offline, requires no model credentials, and returns exit code 0 if documentation is current or exit code 1 if source code has drifted past recorded hashes ([`kaioken_v2/apps/cli/src/commands/status.ts:44`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/commands/status.ts#L44)).

This leaf packages Kaioken as a reusable GitHub Action (`action.yml`) published to the GitHub Marketplace. It provides two operational modes:
1. **Pull Request Gate:** Runs `kaioken status --check`. If changes invalidate cards or chapters, the check fails or posts a PR comment detailing which documentation is stale.
2. **Merge Regeneration:** On merge to `main`, executes `kaioken update` (or `kaioken wiki`) using an API key, automatically committing the refreshed documentation or publishing it to GitHub Pages.

Crucially, **you cannot publish a CI product while your own CI does not run.** As documented in gap **G-6**, Kaioken's own `.github/workflows/ci.yml` is dead because its jobs target an archived directory. [M1-01](../m01-green-everywhere/01-retarget-ci-workflow.md) must land and pass cleanly before this Action can be published.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Repository CI is dead (gap G-6) | `.github/workflows/ci.yml:10` targets `kaioken v1/`, which does not exist |
| M1-01 is scheduled to retarget CI | `roadmap/m01-green-everywhere/01-retarget-ci-workflow.md` |
| Status command implements the `--check` exit gate | `kaioken_v2/apps/cli/src/commands/status.ts:44` (`if (flags.check) return report.ok ? 0 : 1`) |
| Status returns JSON reporting | `kaioken_v2/apps/cli/src/commands/status.ts:37` (`JSON.stringify(report)`) |
| CLI binary entrypoint exists | `kaioken_v2/apps/cli/dist/bin.js` (built via `npm run build`) |
| Node engine requirement | `kaioken_v2/package.json` specifies `"engines": { "node": ">=22" }` |

`UNVERIFIED:` Marketplace branding assets and final action slug availability (`babtix/kaioken-action`).

## What done looks like

- [ ] A root `action.yml` (or `.github/actions/kaioken/action.yml`) defines a composite GitHub Action supporting `status`, `update`, and `wiki` commands.
- [ ] The action automatically sets up Node 22, installs or invokes the Kaioken CLI, and runs the requested command.
- [ ] On pull requests, running in `check` mode executes `kaioken status --check` and outputs structured action outputs (`freshness`, `stale_count`, `stale_files`).
- [ ] A step summary is emitted to `$GITHUB_STEP_SUMMARY` formatting the staleness report as a readable markdown table.
- [ ] Integration test workflow `.github/workflows/test-action.yml` verifies the action runs to completion on an example pull request and push event.
- [ ] Kaioken's own `.github/workflows/ci.yml` is green on Node 22 before this Action is released.

## Steps

1. **Wait for M1-01 to land.** Ensure that `.github/workflows/ci.yml` passes cleanly on `kaioken_v2`.
2. **Draft the Action Manifest (`action.yml`).**
   - Inputs: `command` (`status` | `update` | `wiki`), `root` (default `.`), `multiplier` (default `x1`), `api-key` (optional, for generative runs), `github-token` (optional, for PR comments).
   - Outputs: `freshness` (float 0.0–1.0), `is-fresh` (boolean), `stale-documents` (json array).
3. **Implement Step Summary Rendering.**
   - In the action runner script, parse the JSON output of `kaioken status --json`.
   - Write a formatted Markdown report into `process.env.GITHUB_STEP_SUMMARY`.
4. **Implement PR Commenting Logic.**
   - If `github-token` is provided and documentation is stale, create or update a sticky PR comment with the staleness report and suggested resolution command (`kaioken update`).
5. **Test in CI Runner.** Create a dedicated workflow that runs the composite action against the Kaioken repository itself.
6. **Marketplace Publication (Gated).** Publication to the GitHub Marketplace is a gated operational step dependent on the license decision in [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md) and M1-01 passing in master CI. Building and testing the action locally or in private workflows requires no decision and is unblocked.

## In scope

- `action.yml` manifest definition.
- Step summary and PR comment generation from `kaioken status --json`.
- Integration test workflow testing the action.
- Action documentation and README usage examples.

## Out of scope

- Fixing `.github/workflows/ci.yml` — that is strictly the job of [M1-01](../m01-green-everywhere/01-retarget-ci-workflow.md).
- Implementing PR code review logic — that is [M11-03](./03-pr-review-bot.md).
- Modifying engine code under `kaioken_v2/`.

## Gates

Test the action locally using `act` or via an integration test branch in GitHub Actions:

```bash
# Verify CLI status check exits cleanly on local repo
node kaioken_v2/apps/cli/dist/bin.js status --root . --json
```

Verify `action.yml` syntax:

```bash
# Lint action syntax
npx action-validator action.yml || cat action.yml
```

## Traps

| Trap | Guard |
|---|---|
| Publishing while G-6 is unresolved | Hard gate: M1-01 must land first. Publishing an action when your own CI fails immediately discredits the project. |
| Requiring model API keys for the PR drift gate | `status --check` is deterministic and offline by design. The PR freshness check must never require an API key or network access. |
| Overwriting custom user hooks | The action runs the CLI directly in the runner; it should not execute `kaioken hook install` which touches `.git/hooks`. |
| Spacing out PR comments | If commenting on PRs, use a consistent HTML tag identifier (e.g. `<!-- kaioken-freshness-report -->`) to update the existing comment rather than spamming a new comment on every push. |
| Commercial licensing collision | License Zero Noncommercial 2.0.1 prevents commercial companies from running this action on private enterprise codebases. Gated publication step addresses this. |

## Open questions

None. Marketplace publication is gated behind [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md) and M1-01 landing, but the action manifest build, local testing, and CI workflow integration are fully specified.

## Session brief

```xml
<task>
Create the official Kaioken GitHub Action manifest and runner wrapper at action.yml.

This Action allows external repositories to enforce documentation freshness in pull requests and regenerate docs on merge:
1. Inputs:
   - command: "status", "update", or "wiki" (default: "status")
   - root: working directory (default: ".")
   - check: boolean (default: true for status)
   - api-key: secret token for model providers (required only for update/wiki)
   - github-token: optional GitHub token for posting PR comments
2. Composite execution:
   - Setup Node.js 22 using actions/setup-node@v4.
   - Run the Kaioken CLI command against the repository.
   - For command: "status", execute "node <path-to-cli>/bin.js status --root ${{ inputs.root }} --json"
   - If inputs.check is true, fail the step if freshness is not 100% (ok is false).
   - Format a GitHub Step Summary displaying the list of stale or orphaned documents and the files that triggered invalidation.
3. PR Comments:
   - If github-token is present and running in a pull_request event, update a sticky comment on the PR displaying the freshness status.

IMPORTANT: Building and testing this action is fully unblocked. Note that public listing on the GitHub Marketplace is a gated deployment step waiting on roadmap/decisions/d1-license.md and M1-01 landing.
Address the license constraint in the Action README: clearly state that commercial use requires resolving License Zero Noncommercial 2.0.1.
</task>

<verification_loop>
Verify that action.yml is valid YAML and conforms to GitHub Actions schema.
Verify that running status --json produces parseable output that maps to the action outputs.
Confirm that no API key is required when running in "status" mode.
</verification_loop>

<action_safety>
Do NOT modify anything in kaioken_v2/ or .kaioken_v1/. Do NOT touch .github/workflows/ci.yml (reserved for M1-01).
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) action.yml structure and inputs/outputs, (2) verification of step summary generation, (3) documentation of the License Zero commercial constraint, (4) blocker status regarding M1-01.
</structured_output_contract>
```
