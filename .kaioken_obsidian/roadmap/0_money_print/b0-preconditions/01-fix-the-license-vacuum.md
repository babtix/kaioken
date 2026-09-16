# B0-01 · Fix the license vacuum

> Apply an unambiguous open-source license to the repository root and the TypeScript engine, resolving
> the unlicensed status that currently renders all distribution legally void.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits maintainer license selection in `roadmap/decisions/d1-license.md`) |
| **Size** | S |
| **Depends on** | Maintainer decision on [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) |
| **Blocks** | `B0-02` (commercial license model), `B0-05` (readiness bar), `B1-03` (open-core boundary) |
| **Touches** | `LICENSE` (root), `kaioken_v2/package.json` |
| **Risk** | Critical — without a license, the codebase is default "all rights reserved" |
| **Gate-critical** | **Yes — Precondition Zero for all commercial and open-source operations** |

---

## Why this exists

The foundation of the entire business model—open-source client with paid hosted services—rests on the
client being legally distributed under open-source terms. If developers cannot legally clone, run, fork,
or evaluate the codebase, the distribution funnel does not exist.

As uncovered during codebase auditing, the engine currently has **no license file**.
The decision record at [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) was written
under the assumption that the project was actively governed by License Zero Noncommercial 2.0.1.
While that license exists in `.kaioken_v1/LICENSE`, it governs only the archived Go implementation.
The canonical TypeScript engine (`kaioken_v2/`) has **never had a license applied**.

By default under international copyright law (Berne Convention), an author retains all exclusive rights
unless explicitly licensed. Anyone currently cloning or using `kaioken_v2` is technically infringing
copyright, and external contributions cannot be accepted. This is a smaller relicensing problem than
unwinding a viral copyleft license (because 100% of copyright is held by the solo maintainer), but an
urgent present blocker: the open-source distribution half of the business does not legally exist.

---

## Current state

Verified against the repository working tree:

| Fact | Evidence | Notes |
|---|---|---|
| License Zero covers archived Go v1 only | `.kaioken_v1/LICENSE:1-3` | Contains "License Zero Noncommercial Public License 2.0.1, Copyright: 2026 BABTIX" |
| Root repository has no license | Root directory listing | File `LICENSE` does not exist at repo root |
| TypeScript engine has no license | `kaioken_v2/package.json:1-8` | `"license"` field is missing entirely from `kaioken_v2/package.json` |
| Decision record predates finding | `roadmap/decisions/d1-license.md:18-28` | D1 discusses transitioning away from L0-Noncommercial, but v2 was never placed under L0 |
| Contributor status | `git shortlog -sn` | 100% of commits originate from the solo maintainer; zero external copyright holders exist |

---

## What done looks like

- [ ] Maintainer records final license choice in [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md)
      (e.g. Apache-2.0 or MIT).
- [ ] A top-level `LICENSE` file is committed to the repository root containing the exact standard text
      of the chosen license, with copyright assigned to the maintainer or corporate entity.
- [ ] `kaioken_v2/package.json` contains a valid SPDX license identifier (e.g. `"license": "Apache-2.0"`).
- [ ] Each published workspace package under `kaioken_v2/packages/*/package.json` includes the matching
      SPDX `"license"` field.
- [ ] Repository `README.md` includes an explicit license badge and license section.

---

## Steps

1. **Maintainer selects license:** The human maintainer records the selection in
   [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md). Per D1's recommendation,
   **Apache-2.0** provides explicit patent grant protection while allowing permissive developer use;
   **MIT** provides maximum permissive adoption simplicity.
2. **Create root `LICENSE` file:** Copy the official, unedited text of the chosen license into the
   repository root, inserting the current year and maintainer copyright name.
3. **Update engine `package.json`:** Add `"license": "<SPDX-ID>"` to `kaioken_v2/package.json`.
4. **Propagate to workspace packages:** Verify or update `"license"` in each package under
   `kaioken_v2/packages/*/package.json`.
5. **Verify tree hygiene:** Run `git status` to confirm only licensing files and `package.json`
   manifests are touched.

---

## In scope

- Root `LICENSE`
- `kaioken_v2/package.json`
- `kaioken_v2/packages/*/package.json` license fields
- Updating status in [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md)

---

## Out of scope

- Creating custom commercial license terms (covered in [`02-choose-the-commercial-license-model.md`](02-choose-the-commercial-license-model.md)).
- Relicensing archived Go code in `.kaioken_v1/` (remains archived under License Zero).
- Incorporating a corporate entity or registering trademarks (covered in B4 and B0-04).

---

## Gates

Observable and checkable completion criteria:
1. `test -f LICENSE` exits 0 from repository root.
2. `node -e "assert(require('./kaioken_v2/package.json').license !== undefined)"` exits 0.
3. Decision record [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) transitions
   status from `blocked` to `done`.

---

## Traps

| Trap | Guard |
|---|---|
| Assuming v2 is under License Zero | Checked: v2 has no license file. It is unlicensed, not noncommercial |
| Leaving workspace packages without license fields | npm publish will warn or reject packages missing explicit SPDX identifiers. Update all `packages/*/package.json` |
| Attempting to relicense `.kaioken_v1/` | Leave `.kaioken_v1/` untouched. It is historical and out of tracking |
| Committing a custom edited license | Use unmodified standard SPDX license text (Apache-2.0 or MIT) to avoid corporate legal scrutiny |

---

## Open questions

1. **Which permissive license does the maintainer select?**
   - *Option 1: Apache-2.0.* Provides explicit patent defense clauses; favoured by enterprise teams.
   - *Option 2: MIT.* Maximum familiarity, matches OpenCode (`inspire/opencode/LICENSE`) and Theia Blueprint.
   - *Owner:* Human maintainer. Must be committed before this leaf transitions to `done`.

---

## Session brief

```xml
<task>
In this repository, apply an official open-source license to the root repository and the TypeScript
engine in kaioken_v2/, resolving the license vacuum where no license currently exists for v2.

Prerequisite check:
Inspect roadmap/decisions/d1-license.md to confirm the maintainer's chosen license (e.g. Apache-2.0 or MIT).
If D1 remains undecided, do NOT guess the license — report that the task remains blocked on maintainer sign-off.

Once chosen:
1. Create LICENSE at the repository root containing the official SPDX license text with Copyright 2026 BABTIX.
2. Update kaioken_v2/package.json to add the "license" field with the corresponding SPDX identifier.
3. Update each package.json under kaioken_v2/packages/*/package.json to include the matching "license" field.
4. Update roadmap/decisions/d1-license.md status to "done" with the date and commit note.
</task>

<research_mode>
In your preparation:
- OBSERVED FACTS: .kaioken_v1/LICENSE covers only v1; root and kaioken_v2/ have no license file.
- INFERENCES: Enterprise users will not clone or run repositories without an explicit permissive license.
- OPEN QUESTIONS: Whether maintainer prefers Apache-2.0 (patent grant) or MIT (minimalism).
</research_mode>

<verification_loop>
Run from repo root:
  test -f LICENSE
  node -e "const p = require('./kaioken_v2/package.json'); if(!p.license) throw new Error('Missing license');"
Confirm git status touches only LICENSE and package.json files.
</verification_loop>

<action_safety>
Do NOT alter any source code under kaioken_v2/src or apps/.
Do NOT touch .kaioken_v1/LICENSE.
Do NOT run git add or git commit. Leave work uncommitted for review.
</action_safety>

<structured_output_contract>
End with: (1) chosen license and exact SPDX identifier applied, (2) list of files created or updated,
(3) verification check output, (4) confirmation that D1 status was updated.
</structured_output_contract>
```
