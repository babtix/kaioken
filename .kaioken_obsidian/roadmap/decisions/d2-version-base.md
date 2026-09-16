# DECISION-02 · Engine version base (Inherit v1.x vs Re-base v2.0)

> The 12-month roadmap runs milestones v1.4 to v2.0 against a Go binary that is now archived.
> Decide whether the TypeScript rewrite inherits the v1.x release sequence or re-bases its versioning.

| Field | Value |
|---|---|
| **Status** | `blocked` (decision pending maintainer selection) |
| **Size** | S |
| **Depends on** | Nothing |
| **Blocks** | Milestone M2 (Release tagging & distribution), Milestone M12 (GA) |
| **Touches** | `kaioken_v2/package.json` across all 19 packages, git release tags |
| **Risk** | Medium — impacts package publishing and semantic versioning coherence |
| **Gate-critical** | **Yes — blocks release automation in M2** |

## Why this exists

The original 12-month roadmap ([`roadmap/README.md:80-93`](../README.md#L80-L93)) was written when
Kaioken was a single Go binary at version `v1.3.1`. The roadmap scheduled releases from `v1.4` (M1)
through `v2.0` (M12).

However, commit `e46fe1b5` archived the entire Go implementation into `.kaioken_v1/`. The active,
canonical codebase in `kaioken_v2/` is an 8-phase TypeScript rewrite across 19 npm packages.
Currently, `kaioken_v2/package.json` sets `"version": "0.1.0"` (or unversioned private packages),
while the daemon implementation hardcodes `DAEMON_VERSION = "2.0.0"`.

Every milestone tag in Milestone M2 (Trusted distribution) depends on resolving this question:
- Does the TypeScript engine **inherit the v1.x sequence** (tagging M1 as `v1.4.0`)?
- Does it **re-base from v0.1.0 / v0.2.0** as a new software line?
- Or does it **jump straight to `v2.0.0-alpha.N`**, treating the complete rewrite as the v2 generation
  leading to GA?

## Current state

Verified against [`roadmap/README.md:370`](../README.md#L370),
[`kaioken_v2/package.json`](../../kaioken_v2/package.json),
and [`kaioken_v2/apps/cli/src/commands/daemon.ts:39`](../../kaioken_v2/apps/cli/src/commands/daemon.ts#L39):

| Fact | Evidence |
|---|---|
| Roadmap sequence | `roadmap/README.md` §2 table targets: M1 = v1.4, M2 = v1.5, M3 = v1.6 ... M12 = v2.0 |
| Go v1 archived | Go v1 stopped at v1.3.1; archived to `.kaioken_v1/` and out of tracking |
| Daemon version discrepancy | `apps/cli/src/commands/daemon.ts:39` hardcodes `const DAEMON_VERSION = "2.0.0";` |
| npm package versions | Most `kaioken_v2/packages/*/package.json` are unversioned or set to `"0.1.0"` |
| Git tags | Past git tags reflect `v1.x` Go releases |

## Options and trade-offs

### Option A: Inherit the v1.x Line (M1 = `v1.4.0`, M2 = `v1.5.0`, ..., M12 = `v2.0.0`)
- **Concept:** Follow the roadmap literally. The TypeScript rewrite is considered internal refactoring;
  the public product continues its linear versioning.
- **Pros:** Preserves 1:1 mapping with the master milestone table. No renaming of milestones.
- **Cons:** Violates semantic versioning. The Go CLI and TypeScript engine share zero binary compatibility,
  flags have shifted, and the CLI binary name and runtime changed from Go to Node. Tagging a complete
  ground-up rewrite as a minor bump (`v1.3.1 -> v1.4.0`) is structurally dishonest.

### Option B: Clean Break at v0.x (M1 = `v0.1.0`, M2 = `v0.2.0`, ..., M12 = `v1.0.0`)
- **Concept:** Treat the TypeScript rewrite as a brand-new project. Run through `v0.x` during stabilization,
  declaring GA as `v1.0.0`.
- **Pros:** Follows classic SemVer for new software products. Allows rapid breaking API changes in
  `packages/*` before Milestone M12.
- **Cons:** Creates cognitive dissonance with the project name "Kaioken v2" and conflicts with the
  milestone table which culminates in v2.0.

### Option C: Re-base as v2 Prereleases (M1 = `v2.0.0-alpha.1`, M2 = `v2.0.0-alpha.2`, ..., M12 = `v2.0.0`)
- **Concept:** Recognize that the rewrite *is* Kaioken v2. Milestones M1 through M11 are tagged as
  `v2.0.0-alpha.N` or `v2.0.0-beta.N`, with Milestone M12 representing the final `v2.0.0` GA release.
- **Pros:** Semantically honest: acknowledges the Go binary was v1 and this is the v2 line. Aligns
  cleanly with directory name `kaioken_v2/` and `DAEMON_VERSION = "2.0.0"`. Leaves M12's GA milestone intact.
- **Cons:** Requires updating the milestone tags in `roadmap/README.md` §2 table from `v1.x` to `v2.0.0-alpha.x`.

## Recommendation

**Recommendation: Option C (Re-base as v2.0.0 Prereleases).**

*Rationale:* The rewrite directory is named `kaioken_v2`. The Go code is archived in `.kaioken_v1`.
Calling the new engine `v1.4` when it has zero lines of Go and represents a complete architectural
rebirth is confusing. Re-basing on `v2.0.0-alpha.1` (M1) through `v2.0.0` (M12 GA) respects SemVer,
accurately communicates alpha stability to early users, and aligns with the codebase reality.

## What done looks like

- [ ] Maintainer selects Option A, B, or C.
- [ ] Milestone table in `roadmap/README.md` §2 is updated with the reconciled version strings.
- [ ] All `package.json` files in `kaioken_v2/` are synchronised to the chosen version base.
- [ ] Status transitions to `done`.

## Steps to reach the decision

1. **Audit npm Publishing Requirements:** Check if `@kaioken/*` packages will be published to public
   npm or GitHub Packages in Milestone M2.
2. **Review User Communication:** Evaluate how external users downloading binaries via Scoop/winget/brew
   interpret version jumps.
3. **Record Decision:** Maintainer records choice in this file.

## In scope

- Versioning strategy definition across `roadmap/`, `kaioken_v2/package.json`, and git tags.

## Out of scope

- Updating changelogs or publishing release tarballs — that is Milestone M2.

## Gates

Maintainer sign-off on the chosen versioning path prior to cutting the first release tag in M2.

## Traps

| Trap | Guard |
|---|---|
| Tagging `v1.4.0` on a breaking rewrite | SemVer mandates major bump for breaking CLI/API rewrites. Option A breaks SemVer conventions. |
| Inconsistent versions across npm packages | When tagging releases, all 19 workspace packages must stay version-aligned or use independent semver carefully. |

## Open questions

1. Which versioning path does the maintainer select: Option A (v1.4 -> v2.0), Option B (v0.1 -> v1.0), or Option C (v2.0.0-alpha -> v2.0.0)?
   - *Owner:* Human maintainer.

## Session brief

```xml
<task>
This is a research-and-recommend decision brief for Version Base Reconciliation (Decision D-2):

1. Investigate the version history in the repository:
   - Check past git tags via git tag -l.
   - Inspect kaioken_v2/package.json and all packages/*/package.json versions.
   - Note the DAEMON_VERSION constant in apps/cli/src/commands/daemon.ts:39.
2. Evaluate the three options:
   - Option A: Inherit v1.x (tagging M1 as v1.4.0).
   - Option B: Clean break at v0.x (tagging M1 as v0.1.0, M12 as v1.0.0).
   - Option C: Re-base as v2 prereleases (tagging M1 as v2.0.0-alpha.1, M12 as v2.0.0 GA).
3. Provide a clear recommendation supporting the release automation work in Milestone M2.
</task>

<research_mode>
Partition your analysis:
- OBSERVED FACTS: Actual tag history in git, versions in package.json files, directory naming.
- INFERENCES: Impact on package registries (npm/Scoop/Homebrew) and developer expectations.
- OPEN QUESTIONS: What the maintainer considers the public face of the project (CLI vs packages).
</research_mode>

<verification_loop>
Verify git tag list and ensure all cited package.json paths exist.
</verification_loop>

<action_safety>
Do not run git tag or edit package.json versions during this session.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) factual summary of current version state across tags and packages, (2) trade-off
breakdown of Options A, B, and C, (3) recommendation with migration steps for roadmap/README.md.
</structured_output_contract>
```
