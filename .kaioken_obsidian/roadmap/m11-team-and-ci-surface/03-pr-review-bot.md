# M11-03 · PR review bot on webhook

> Build a repository-aware PR review bot from scratch that comments on pull requests using module cards and the symbol oracle to enforce architectural boundaries without generic LLM hallucinations.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [M1-01](../m01-green-everywhere/01-retarget-ci-workflow.md), [`01-github-action.md`](./01-github-action.md), `packages/agent`, `packages/model`, `packages/index` |
| **Blocks** | M11 completion |
| **Touches** | `kaioken_v2/packages/agent/`, `kaioken_v2/apps/cli/src/commands/`, PR review webhook handler |
| **Risk** | High. Generic AI review bots that post obvious or incorrect comments alienate developers. Comments must be grounded in verified repository facts. |
| **Gate-critical** | No |

## Why this exists

Generic AI code review bots fail in predictable ways: they point out obvious syntax, guess wildly at business logic, hallucinate nonexistent library methods, and complain about stylistic preferences already enforced by linters.

Kaioken is uniquely positioned to provide code review that is actually useful because it is a **repository knowledge engine**:
- It knows the intended module decomposition and architectural rules via module cards (`.kaioken/cards/*.json`).
- It has a tree-sitter symbol oracle ([`packages/index/src/oracle.ts:17`](file:///D:/project/ai_now_know/kaioken_v2/packages/index/src/oracle.ts#L17)) that definitively knows whether a symbol exists or not.
- It understands documentation impact ([`packages/impact/src/predict.ts:24`](file:///D:/project/ai_now_know/kaioken_v2/packages/impact/src/predict.ts#L24)).

**This is a build, not a port.** While v1 had an experimental `internal/review` package in Go, it was archived with commit `e46fe1b5` and has **no v2 equivalent whatsoever** ([README §3](../README.md#3-translation-layer--v1-artifact--v2-equivalent)). We are building the review capability fresh on the TypeScript engine, connecting webhook event payloads (from GitHub Actions or a webhook receiver) to an agent review pipeline that posts inline PR comments.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| v1 review package has no v2 counterpart | `roadmap/README.md:110` (`internal/review` → `(none) · M11 builds new`) |
| 19 engine packages exist, none is review | `kaioken_v2/packages/` inventory ([README §1.2](../README.md#12-engine-package-inventory--and-which-milestone-each-one-feeds)) |
| Symbol oracle provides verified declaration checks | `kaioken_v2/packages/index/src/oracle.ts:17` (`SymbolOracle.has`, `lookup`) |
| Public feature board tracks code review agent | `roadmap/README.md:200` ("Code review agent: Annotates a git diff for style, bugs, performance as inline comments") |
| Agent package provides tool-calling loop | `kaioken_v2/packages/agent/src/` |

`UNVERIFIED:` GitHub API rate limits when posting large numbers of inline comments on massive diffs.

## What done looks like

- [ ] A new review execution mode is created in the CLI (e.g. `kaioken review --diff <diff-file> --json` or `kaioken review --pr <pr-number>`).
- [ ] The reviewer accepts a unified git diff and parses added/modified hunks with line numbers.
- [ ] For each modified file, the reviewer loads the relevant module card to verify that new imports and logic do not violate stated module boundaries.
- [ ] The reviewer checks every referenced external declaration against `SymbolOracle`; if code references a symbol that does not exist, it flags it as a defect.
- [ ] Reviews are emitted as structured JSON containing `{ file, line, rule, comment, severity }`.
- [ ] When run in a GitHub Actions environment with a valid token, the bot posts inline comments directly onto the PR diff.
- [ ] The bot never comments on trivial formatting (whitespace, indentation) that a linter handles.
- [ ] Vitest unit tests verify that: (1) architectural boundary violations produce comments, (2) verified code produces zero comments, (3) hallucinated symbols are caught by the oracle.

## Steps

1. **Design the Review Prompt & Grounding Strategy.**
   - In `kaioken_v2/packages/agent/src/review.ts`, assemble the system prompt.
   - Inject repository module cards (`.kaioken/cards/`) so the model knows official boundaries.
   - Instruct the model to strictly evaluate: (1) architectural boundary leaks, (2) missing error handling, (3) broken assumptions documented in the wiki.
2. **Parse Unified Diffs with Line Mapping.**
   - Implement diff parsing to map hunk changes to new file line numbers.
   - Ensure comments are attached to valid diff positions so GitHub's API does not reject them.
3. **Filter Model Claims with `SymbolOracle`.**
   - Before emitting a comment claiming a function is missing or wrong, verify against `SymbolOracle.has(name)`.
   - Prevent the review bot from hallucinating API signatures.
4. **Wire GitHub Pull Request Commenting.**
   - Use Octokit or lightweight `@kaioken/gitops` REST calls to create inline review comments via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`.
5. **Add Local Smoke & CLI Command.**
   - Expose `kaioken review` in `apps/cli/src/commands/review.ts` so developers can run the review pass locally before pushing code.

## In scope

- Review analysis pipeline in `kaioken_v2/packages/agent/` or `packages/review/`.
- CLI command `kaioken review` in `kaioken_v2/apps/cli/`.
- GitHub inline review comment submission via REST API.
- Unit tests with mock diffs and fixtures.

## Out of scope

- Chatbot conversation on PRs — this is a one-pass review bot, not an interactive chatbot.
- Static analysis / linter replacement (ESLint, Prettier, etc.) — do not replicate linting rules.
- Slack or Discord bot integrations (refused non-goals per [README §7](../README.md#7-deliberately-not-on-the-roadmap)).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Test diff review offline against a git fixture:

```bash
node apps/cli/dist/bin.js review --help
```

## Traps

| Trap | Guard |
|---|---|
| Treating this as a "port" of v1 | v1 code is dead and gone. Build fresh using TypeScript, `SymbolOracle`, and `packages/agent`. |
| Commenting on trivial style or formatting | Explicitly prompt the reviewer to ignore formatting, syntax, and naming conventions covered by linters. |
| Hallucinating incorrect method suggestions | Run candidate symbol suggestions through `SymbolOracle.has()`. If the symbol does not exist in the repo, discard the comment. |
| Exceeding GitHub comment rate limits | Batch comments into a single PR review submission (`event: COMMENT` with an array of comments) rather than posting individual HTTP requests per line. |
| Commercial licensing collision | License Zero Noncommercial 2.0.1 prevents commercial teams from running this review bot on proprietary codebases. |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, build a repository-aware PR review bot from scratch (v1's internal/review was archived; this is a fresh build, not a port).

The review bot analyzes a git diff and posts grounded inline comments on GitHub pull requests:
1. In kaioken_v2/packages/agent/src/ (or a new module), implement the review analysis engine:
   - Accept a unified git diff string and target file list.
   - Grounding: Load module cards from .kaioken/cards/ to provide architectural boundaries and invariants.
   - Fact verification: Use SymbolOracle from @kaioken/index (packages/index/src/oracle.ts) to verify that any declaration cited in a finding actually exists in the repository.
   - Focus: Review solely for architectural boundary leaks, subtle bugs, and violations of documented repository patterns. Explicitly ignore syntax, formatting, and lint issues.
2. Structure output as an array of ReviewFinding objects:
   { path: string, line: number, comment: string, severity: "suggestion" | "warning" | "defect" }
3. In kaioken_v2/apps/cli/src/commands/review.ts, implement the "kaioken review" command:
   - Accepts "--diff <path>", "--base <ref>", or pulls diff from GitHub PR if run in GitHub Actions.
   - Emits structured JSON to stdout.
   - If GITHUB_TOKEN and PR context are present, submits a single batched GitHub Review with comments on the PR diff.
4. Write vitest unit tests with sample git diffs verifying that:
   - Architectural violations produce findings.
   - Valid diffs produce zero comments.
   - Fact checking prevents hallucinated method suggestions.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
Confirm that all tests pass and that the review module runs deterministically when provided mock diffs and offline fixtures.
</verification_loop>

<action_safety>
Do not modify packages/scan, packages/index, or packages/wiki. Scope changes to the review engine and CLI command.
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) review bot architecture and prompt grounding design, (2) files touched, (3) test suite output, (4) how the fact-checking gate through SymbolOracle prevents review hallucinations.
</structured_output_contract>
```
