# M12-05 · v2.0 Release checklist and final gates

> Execute the final release gate for Kaioken v2.0 General Availability: answer all quarterly checkpoints in writing, formalize the license choice, commit the version numbering base, eliminate the redundant Studio fork, and close all half-wired work.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | All prior milestones (M1–M12), Quarterly Checkpoints ([README §11](../README.md#11-quarterly-checkpoints)), [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md), [`roadmap/decisions/d2-version-base.md`](../decisions/d2-version-base.md), [`roadmap/decisions/d3-one-studio-fork.md`](../decisions/d3-one-studio-fork.md), [`roadmap/decisions/d4-monorepo-vs-published-packages.md`](../decisions/d4-monorepo-vs-published-packages.md) |
| **Blocks** | v2.0 Git tag, public release announcement |
| **Touches** | `kaioken_v2/package.json`, `CHANGELOG.md`, `roadmap/README.md`, `ide_kaioken/` |
| **Risk** | Critical. Tagging a GA release with half-wired subsystems or unresolved legal/architectural contradictions turns Kaioken into an abandoned repository. |
| **Gate-critical** | **Yes — the ultimate release gate** |

## Why this exists

Tagging a v2.0 General Availability release cannot be a casual gesture. In a fully vibe-coded project, the temptation is always to sprint forward, add another command or UI widget, and ignore the loose ends left in previous sessions.

README §11 establishes the quarterly discipline required to prevent this failure mode, culminating in **Checkpoint Question 5**:

> **"What is still half-wired from a previous quarter? Fix it before starting new work."**
> 
> *Question 5 is the one that decides whether this is a v2.0 or another abandoned 40-package repo.*

This leaf is the final checkpoint before General Availability. It pulls together every unresolved strategic decision and architectural loose end across the entire roadmap:
1. **Quarterly Checkpoint Audit:** All five checkpoint questions ([README §11](../README.md#11-quarterly-checkpoints)) must be answered in writing in a committed release record.
2. **The License Decision:** Path A (portfolio noncommercial), Path B (dual-license commercial), or Path C (permissive open core) must be formally chosen and enacted ([README §8](../README.md#8-the-license-decision)).
3. **The Version Base (Q2):** The relationship between the archived Go v1.x releases and the canonical TypeScript engine is formally set ([README §9](../README.md#9-open-questions-this-note-cannot-answer)).
4. **The One Studio Fork (Q1):** The violation of the solo maintainer rule at the shell layer is resolved: one Studio fork (`kaioken_studio_theia` or `kaioken_studio`) is selected as the flagship product, and the duplicate is cleanly archived.
5. **Documentation Consolidated:** M12-03 is confirmed complete, with zero stale Go v1 mentions across all five surfaces.
6. **Zero Half-Wired Subsystems:** Any command, package, or RPC route that is half-implemented, stubbed, or unverified is either completed and tested or deleted outright.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Quarterly checkpoints defined | `roadmap/README.md:393-406` (Questions 1 through 5) |
| License decision deadline was March 2027 | `roadmap/README.md:345-362` (Paths A, B, C detailed) |
| Open question Q1: Two Studio forks live | `roadmap/README.md:369` and `ide_kaioken/` directory contents |
| Open question Q2: Version base undefined | `roadmap/README.md:370` (v1.x inheritance vs v2.0.0 re-base) |
| Known gaps documented | `roadmap/README.md:315-327` (G-1 through G-6) |
| Uncommitted daemon work on disk | `git status` shows `kaioken_v2/apps/cli/src/commands/daemon.ts` |
| Engine workspace version | `kaioken_v2/package.json` |

`UNVERIFIED:` Community user count outside the maintainer (Question 2: "How many people other than you ran Kaioken this quarter?").

## What done looks like

- [ ] A written release audit document `roadmap/releases/v2.0-GA-AUDIT.md` is committed answering all five quarterly questions in writing:
  1. *Does a fresh clone build green on all three OSes, today?* (Proven by CI matrix).
  2. *How many people other than you ran Kaioken this quarter?* (Documented count).
  3. *Did the knowledge engine's output on Kaioken itself get better or worse?* (Dogfood comparison).
  4. *What shipped that nobody needed?* (Honest list of cut or simplified features).
  5. *What is still half-wired from a previous quarter? Fix it before starting new work.* (Every item closed).
- [ ] License choice (Path A, B, or C) is ratified and updated in root `LICENSE` and all package manifests.
- [ ] Version base (Q2) is established: `kaioken_v2/package.json` and all workspace packages are tagged `2.0.0`.
- [ ] One Studio fork is confirmed as primary; the redundant fork is moved out of active tracking or archived.
- [ ] All 19 engine packages pass `npm run typecheck` and `npm test` with zero warnings or test failures.
- [ ] The working tree is completely clean — no uncommitted scratch files or experimental commands.
- [ ] `CHANGELOG.md` is compiled detailing all changes since the v1.3.1 Go archive.

## Steps

1. **Conduct Half-Wired Feature Audit (Question 5).**
   - Audit all 19 packages in `kaioken_v2/packages/` and commands in `apps/cli/src/commands/`.
   - Identify any TODOs, stubbed endpoints, or mock handlers.
   - For each finding: either complete it with passing characterization tests, or remove the dead code.
2. **Execute the License Transition.**
   - Commit the maintainer's decision on [README §8](../README.md#8-the-license-decision).
   - If Path A: reaffirm License Zero Noncommercial 2.0.1 in all public docs.
   - If Path B: update terms to establish the commercial licensing contact and dual-license terms.
   - If Path C: transition core engine to MIT/Apache-2.0 and update headers.
3. **Resolve Q1 and Prune the Shell Layer.**
   - Formally commit the decision from M10-01.
   - Move the rejected Studio fork (`kaioken_studio/` or `kaioken_studio_theia/`) to an archive branch and remove from master.
4. **Enact Version Base (Q2).**
   - Bump version across `kaioken_v2/package.json` and all 19 packages to `2.0.0`.
   - Update `CONTRACT_VERSION` in daemon if protocol was altered.
5. **Run Dogfood Verification (Question 3 & Operating Rule 5).**
   - Run `node apps/cli/dist/bin.js wiki x2` on Kaioken itself.
   - Diff output against committed dogfood documentation. Confirm output quality has improved.
6. **Compile the Final Release Record.**
   - Complete `v2.0-GA-AUDIT.md`.
   - Sign off on all gates.
   - Create git tag `v2.0.0`.

## In scope

- Release audit documentation in `roadmap/releases/`.
- License updates across manifests and root files.
- Version stamping across workspace `package.json` files.
- Pruning half-wired features across the codebase.
- Compiling `CHANGELOG.md`.

## Out of scope

- Introducing any new product features or packages.
- Major UI redesigns of Studio.
- Expanding tree-sitter grammars beyond the five supported languages.

## Gates

All three operating system matrix runs in CI must pass 100% green on the release commit:

```bash
# Verify typecheck and tests pass locally
cd kaioken_v2 && npm run typecheck && npm test
```

Verify clean working tree:

```bash
git status --porcelain
# Must return empty string
```

Run dogfood status verification:

```bash
node kaioken_v2/apps/cli/dist/bin.js status --check
```

## Traps

| Trap | Guard |
|---|---|
| Hand-waving Checkpoint Question 5 | Do not declare GA with half-wired features. If a feature is only 80% implemented, either finish the remaining 20% or delete it. |
| Tagging v2.0 while carrying two Studio forks | Enforce the solo maintainer rule: archive the redundant shell before tagging GA. |
| Slipping the license decision | GA without a clear license choice leaves legal status ambiguous. The license must be committed before the tag is created. |
| Releasing on a dirty git working tree | The release commit must be tagged from a pristine working tree where every file is accounted for. |
| Forgetting to run dogfood verification | Run the engine on itself. If Kaioken's documentation of Kaioken regressed, the engine is not ready for GA. |

## Open questions

1. **Strategic License Decision:** Resolved by [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md). Ratifies Path A, B, or C before v2.0 GA tagging.
2. **Version Numbering Base:** Resolved by [`roadmap/decisions/d2-version-base.md`](../decisions/d2-version-base.md). Sets the version line across all packages to clean semver v2.0.0 or establishes v1.x inheritance.
3. **One Studio Shell Decision:** Resolved by [`roadmap/decisions/d3-one-studio-fork.md`](../decisions/d3-one-studio-fork.md). Formally designates the primary desktop shell (Theia vs Code-OSS) and archives the duplicate.
4. **Monorepo vs Published Packages:** Resolved by [`roadmap/decisions/d4-monorepo-vs-published-packages.md`](../decisions/d4-monorepo-vs-published-packages.md). Establishes workspace package consumption structure for GA distribution.

## Session brief

```xml
<task>
Execute the comprehensive release checklist for Kaioken v2.0 General Availability.

This is the final gate for the entire roadmap. Releasing v2.0 requires pulling together the strategic decisions and closing every half-wired subsystem in the codebase:

1. Answer all five Quarterly Checkpoint questions in writing at roadmap/releases/v2.0-GA-AUDIT.md:
   - Question 1: Does a fresh clone build green on all three OSes, today? (Verify against CI matrix results).
   - Question 2: How many people other than you ran Kaioken this quarter? (Record empirical user/contributor count).
   - Question 3: Did the knowledge engine's output on Kaioken itself get better or worse? (Run dogfood wiki run and record diff).
   - Question 4: What shipped that nobody needed? (Document any non-essential features identified for pruning).
   - Question 5: "What is still half-wired from a previous quarter? Fix it before starting new work."
     * Conduct a code audit of kaioken_v2/packages/ and apps/cli/src/commands/.
     * Identify any incomplete commands, stubbed handlers, or unlanded files (such as the uncommitted daemon work).
     * Fix and test, or safely delete, all half-wired items.
2. Confirm the three prerequisite strategic decisions:
   - Check decisions/license: Verify the license choice (Path A, B, or C from README §8) is enacted in LICENSE and manifests.
   - Check decisions/Q1: Verify one Studio fork has been selected and the duplicate fork has been archived.
   - Check decisions/Q2: Set package versions across kaioken_v2/package.json and all 19 workspace packages to "2.0.0".
3. Compile CHANGELOG.md documenting the complete architectural shift from v1.3.1 Go to v2.0.0 TypeScript.
4. Verify the working tree is completely clean and all engine gates pass.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
From repository root:
  node kaioken_v2/apps/cli/dist/bin.js status --check
  git status
Confirm that typecheck and tests pass with zero errors, status --check returns 0, and git status shows only intended release audit files.
</verification_loop>

<completeness_contract>
Quote Checkpoint Question 5 in the audit: "What is still half-wired from a previous quarter? Fix it before starting new work."
Every package and CLI command must have passing tests. No stubbed or incomplete features may survive into the release commit.
</completeness_contract>

<action_safety>
Do NOT perform arbitrary refactors of core algorithms.
Do NOT run git tag, git add, or git commit — the maintainer personally signs and tags the release.
Leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of the v2.0 GA release audit, (2) written answers to the five quarterly checkpoint questions, (3) resolution of the three strategic decisions (license, Q1, Q2), (4) verification that all half-wired subsystems are closed.
</structured_output_contract>
```
