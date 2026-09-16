# B0-03 · Dependency license audit

> Mechanically audit the npm dependency tree of kaioken_v2 and establish legal clearance for upstream
> desktop components, specifically the EPL-2.0 weak-copyleft wrapping in Eclipse Theia.

| Field | Value |
|---|---|
| **Status** | `blocked` (mechanical audit ready; legal clearance on Theia EPL-2.0 core pending legal review) |
| **Size** | M |
| **Depends on** | [`B0-01`](01-fix-the-license-vacuum.md) |
| **Blocks** | [`B0-05`](05-readiness-bar.md), Studio commercial release ([`roadmap/decisions/d3-one-studio-fork.md`](../../decisions/d3-one-studio-fork.md)) |
| **Touches** | `kaioken_v2/package.json`, scripts for license checking, dependency manifests |
| **Risk** | High — shipping copyleft code in a commercial package risks IP contamination and mandatory source disclosures |
| **Gate-critical** | **Yes — legal prerequisite to shipping binary packages** |

---

## Why this exists

Commercial software distribution creates strict legal liability for copyright infringement if upstream
dependency licenses are violated. Even in an open-source client / paid hosted model, binary releases
(such as npm packages or packaged Studio desktop installers) aggregate hundreds of third-party packages.

While modern JavaScript libraries are overwhelmingly permissive, weak copyleft (e.g. LGPL, EPL, CDDL)
or restrictive noncommercial licenses in the dependency graph can mandate source disclosure, forbid
commercial distribution, or trigger viral terms.

This leaf establishes two defenses:
1. A **mechanical npm audit** that runs in CI to verify that all transitive dependencies of `kaioken_v2/`
   carry approved permissive licenses (MIT, Apache-2.0, BSD, ISC).
2. A **formal legal escalation** regarding Eclipse Theia: the Studio desktop wrapper carries an MIT license,
   but upstream core packages are EPL-2.0. That interaction requires explicit professional legal review.

---

## Current state

Verified against the repository working tree:

| Component | License File | Verified License | Notes |
|---|---|---|---|
| Studio Theia Blueprint fork | `ide_kaioken/kaioken_studio_theia/LICENSE:1-22` | MIT | Copyright Eclipse Theia IDE Authors |
| Studio Code-OSS fork | `ide_kaioken/kaioken_studio/LICENSE.txt:1-22` | MIT | Copyright Microsoft Corporation |
| OpenCode reference | `inspire/opencode/LICENSE:1-21` | MIT | Copyright 2025 OpenCode |
| Pi reference | `inspire/pi/LICENSE:1-21` | MIT | Copyright 2025 Mario Zechner |
| Upstream Theia core packages | Upstream npm packages (`@theia/*`) | `UNVERIFIED:` EPL-2.0 / GPL-2.0-with-classpath-exception | Upstream Theia core remains EPL-2.0 despite Blueprint MIT wrapper |
| Engine tree (`kaioken_v2/`) | `kaioken_v2/package-lock.json` | Unverified transitive tree | Needs automated license scanning |

> [!warning] The Theia EPL-2.0 Weak-Copyleft Trap
> `UNVERIFIED:` While the Eclipse Theia Blueprint repository provides a top-level MIT `LICENSE` file
> ([`ide_kaioken/kaioken_studio_theia/LICENSE`](../../../ide_kaioken/kaioken_studio_theia/LICENSE)),
> the underlying runtime dependencies (`@theia/core`, `@theia/monaco`, etc.) are published by the Eclipse
> Foundation under the **Eclipse Public License 2.0 (EPL-2.0)** or **GPL-2.0 with Classpath Exception**.
> Under EPL-2.0, distributing binary modifications of EPL modules requires making the source code of those
> specific modules available under EPL-2.0 upon request.
> 
> Distributing a commercial, rebranded desktop IDE built on Theia Blueprint without understanding the
> boundary between your proprietary or MIT extensions and Theia's EPL core creates legal exposure.
> This question cannot be decided by an agent; it must be reviewed by legal counsel.

---

## What done looks like

- [ ] A license auditing script is integrated into `kaioken_v2/package.json` (e.g. `npm run audit:licenses`).
- [ ] Every production dependency in `kaioken_v2/` is confirmed to be under an approved permissive license:
      `MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, or `0BSD`.
- [ ] Any GPL, AGPL, SSPL, or commercial-restricted dependency in the production graph fails the audit gate.
- [ ] A written memo regarding Eclipse Theia's EPL-2.0 licensing boundary is obtained from qualified legal counsel
      before commercial Studio binary distribution.

---

## Steps

### Phase 1: Mechanical Engine Audit (Executable by Agent)
1. **Add automated license checker:** In `kaioken_v2/`, install a lightweight license scanning tool
   (e.g., `license-checker-rseidelsohn` as a dev dependency) or create a zero-dependency script that
   inspects all `node_modules/**/package.json` files.
2. **Define allowed license whitelist:**
   Whitelist: `MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense`.
3. **Run production audit:** Run the checker excluding `devDependencies`:
   ```bash
   npx license-checker-rseidelsohn --production --onlyAllow "MIT;Apache-2.0;BSD-2-Clause;BSD-3-Clause;ISC;0BSD;Unlicense" --summary
   ```
4. **Quarantine or replace violations:** If any production package uses copyleft or ambiguous licensing,
   identify the package, trace its dependency origin, and replace it.

### Phase 2: Upstream Legal Clearance (Human / Legal Counsel)
1. **Prepare Theia dependency inventory:** Extract exact package versions of all `@theia/*` dependencies
   used in `ide_kaioken/kaioken_studio_theia/`.
2. **Submit legal inquiry:** Present the Theia Blueprint MIT wrapper vs EPL-2.0 core issue to qualified
   legal counsel. Formulate the precise question:
   *"Does distributing a rebranded desktop IDE based on Theia Blueprint with custom extensions require
   licensing our proprietary/MIT extensions under EPL-2.0, or does EPL-2.0 apply strictly to modifications
   within `@theia/*` packages?"*
3. **Record legal determination:** Commit the written guidance to `roadmap/money_print/b0-preconditions/`
   before releasing Studio binaries.

---

## In scope

- Transitive production dependencies of `kaioken_v2/`.
- Dependency manifests in `ide_kaioken/kaioken_studio_theia/`.
- License checking automation script in `kaioken_v2/package.json`.

---

## Out of scope

- Auditing development-only dependencies (`vitest`, `typescript`, `@types/*`), which are not shipped in
  production distributions.
- Auditing the archived Go implementation in `.kaioken_v1/`.
- Negotiating custom license agreements with third-party vendors.

---

## Gates

1. Mechanical gate: Running the license audit script from `kaioken_v2/` exits 0 with zero unapproved licenses:
   ```bash
   node scripts/audit-licenses.mjs
   ```
2. Legal gate: Written legal opinion or documented compliance path on Theia EPL-2.0 committed to
   the repository.

---

## Traps

| Trap | Guard |
|---|---|
| Relying on top-level `LICENSE` in forks | Upstream packages inside `node_modules` often carry separate, more restrictive licenses. Audit the full resolved tree |
| Auditing devDependencies by mistake | Dev dependencies (e.g. test runners) do not ship to users. Scope the audit strictly to `--production` |
| Assuming MIT wrapper removes copyleft obligations | A wrapper license cannot relicense upstream EPL-2.0 code. Route Theia to legal counsel |
| Letting license checking slow down standard CI | Run license auditing as an explicit release gate or weekly check, not on every local test run |

---

## Open questions

1. **Does legal counsel clear Theia EPL-2.0 packaging for commercial Studio distribution?**
   - *Alternative:* If Theia EPL-2.0 creates unacceptable commercial friction, does the project standardize
     on the Code-OSS fork ([`roadmap/decisions/d3-one-studio-fork.md`](../../decisions/d3-one-studio-fork.md)),
     which is pure MIT?
   - *Owner:* Legal counsel & Human maintainer.

---

## Session brief

```xml
<task>
In kaioken_v2/, implement a deterministic mechanical dependency license audit to verify that all
production dependencies in the monorepo comply with an approved permissive license whitelist.

1. Inspect kaioken_v2/package.json and all workspace packages (packages/*, apps/*).
2. Create a lightweight audit script in kaioken_v2/scripts/audit-licenses.mjs that:
   - Reads production dependencies across all workspace packages.
   - Inspects package.json license fields in node_modules.
   - Verifies each license against the allowed whitelist:
     MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, Unlicense.
   - Exits 0 if clean; prints offending packages and exits 1 if an unapproved license is detected.
3. Add "audit:licenses": "node scripts/audit-licenses.mjs" to kaioken_v2/package.json scripts.
4. Run the script and record any non-conforming dependencies.

Do NOT attempt to resolve legal questions regarding Eclipse Theia in this session.
Document any unverified packages cleanly in the output.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: What packages and licenses actually exist in kaioken_v2/node_modules.
- INFERENCES: Whether dual-licensed packages (e.g. MIT OR GPL) can be safely ingested under MIT.
- OPEN QUESTIONS: Theia EPL-2.0 upstream legal interpretation (marked UNVERIFIED:).
</research_mode>

<verification_loop>
Run from kaioken_v2/:
  npm run build
  node scripts/audit-licenses.mjs
Confirm exit code is 0 and output reports audited package counts.
</verification_loop>

<action_safety>
Do NOT modify production engine code.
Do NOT remove packages without confirmation.
Do NOT run git add or git commit. Leave changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) audit script implementation summary, (2) count of audited production packages,
(3) list of unique licenses detected, (4) list of any flagged or non-permissive dependencies.
</structured_output_contract>
```
