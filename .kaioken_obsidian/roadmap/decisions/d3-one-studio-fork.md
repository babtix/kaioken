# DECISION-03 · Studio shell consolidation: Theia vs Code-OSS

> Two separate desktop forks currently live in this repository: Eclipse Theia and Code-OSS.
> The plan's own rule states that *two clients is one too many for a solo maintainer*; decide which
> fork ships and archive the other.

| Field | Value |
|---|---|
| **Status** | `ready` (decision analysis complete; awaits maintainer ratification) |
| **Size** | S (in code review) / Critical (in architectural focus) |
| **Depends on** | Nothing |
| **Blocks** | `roadmap/studio-v0.1/`, Milestone M10 (IDE Extension consolidation) |
| **Touches** | `ide_kaioken/kaioken_studio_theia/`, `ide_kaioken/kaioken_studio/` |
| **Risk** | **Critical — running two shells violates operating rule 1 and divides review bandwidth** |
| **Gate-critical** | **Yes — P0 decision for the desktop studio** |

## Why this exists

Operating rule 1 ([`roadmap/README.md:381-383`](../README.md#L381-L383)) is the project's most
load-bearing operating constraint: *the bottleneck is review, not generation*. A solo maintainer
using AI coding agents can generate thousands of lines of code an hour, but can only rigorously
review approximately one substantial feature per week.

Currently, the repository carries **two parallel desktop IDE builds**:
1. **Theia Fork:** `ide_kaioken/kaioken_studio_theia/` (based on `eclipse-theia/theia-ide` Blueprint).
2. **Code-OSS Fork:** `ide_kaioken/kaioken_studio/` (based on `microsoft/vscode` Code-OSS).

Maintaining two distinct desktop shells — each with its own multi-gigabyte build tree, native
toolchain quirks, bundling scripts, and extension APIs — splits maintenance capacity in half.
The roadmap itself states: *two clients is one too many for a solo maintainer*. Running both violates
the project's governing principle at the shell layer. One fork must be chosen and the other archived.

## Current state

Verified against the working tree in `ide_kaioken/`:

| Dimension | Theia Fork (`ide_kaioken/kaioken_studio_theia/`) | Code-OSS Fork (`ide_kaioken/kaioken_studio/`) |
|---|---|---|
| **Upstream source** | Eclipse Theia Blueprint (`eclipse-theia/theia-ide`) | Microsoft VS Code (`microsoft/vscode` Code-OSS) |
| **Custom UI panels** | First-class `ReactWidget`s integrated directly into shell DOM | Sandboxed `Webview` iframes with message passing |
| **In-process engine** | Native Node backend imports `@kaioken/*` in-process over RPC | Must run engine as out-of-process daemon or subprocess |
| **Rebranding mechanism** | Official Blueprint template: config + one extension | Hand-maintained patches across Microsoft's source tree |
| **Upstream upgrades** | Simple npm package version bumps | Complex git rebases onto Microsoft's fast-moving master branch |
| **Extension ecosystem** | Open VSX + VS Code extension API compatibility | Open VSX (Microsoft Marketplace is ToS-barred to forks) |
| **Licensing** | EPL-2.0 / MIT template | MIT (Code-OSS), but proprietary brand boundaries |
| **Current progress** | Spike complete, ESM bridge proven, dark theme & wiki built | Basic window shell starts in Agents window; no engine bridge |

## Options and trade-offs

### Option A: Standardise on Eclipse Theia (Archive Code-OSS)
- **Trade-offs:**
  - *Pros:* Custom panels (knowledge graph canvas, agent chat dossier, wiki browser) render as
    first-class React widgets with direct DOM access rather than trapped inside iframe webviews.
    Engine packages run in-process in the Node backend, eliminating IPC serialization overhead.
    Rebranding is clean and supported upstream without carrying hundreds of merge conflicts on every
    VS Code release.
  - *Cons:* Theia's adopter community is smaller than VS Code's. Edge-case bugs require reading
    Theia platform source code.

### Option B: Standardise on Code-OSS (Archive Theia)
- **Trade-offs:**
  - *Pros:* Massive global mindshare; exact visual parity with VS Code; vast extension test suite.
  - *Cons:* **Prohibitive solo-maintenance tax.** Rebranding requires constantly rebasing a fork
    against Microsoft's high-velocity tree (which funds an entire platform engineering team at Cursor).
    Custom UI must live inside restricted iframe webviews. Engine cannot easily run in-process within
    the extension host.

## Recommendation

**Recommendation: Option A (Eclipse Theia). Archive `ide_kaioken/kaioken_studio/`.**

*Rationale:* For a solo developer, the Code-OSS rebase tax is fatal. Every monthly VS Code release
would turn into days of conflict resolution across modified core files. Theia was specifically designed
from inception for white-labeling and domain-specific IDE composition. The fact that Theia runs
Kaioken's TypeScript packages **in-process** (proven in `01-spike-and-stop.md`) eliminates sidecars,
network latency, and sidecar mismatch bugs.

Archiving `ide_kaioken/kaioken_studio/` immediately restores 50% of the project's desktop review
bandwidth.

## What done looks like

- [ ] Maintainer confirms Option A (Theia).
- [ ] `ide_kaioken/kaioken_studio/` is archived out of active tracking (or removed).
- [ ] All roadmap documents (`roadmap/studio-v0.1/`, `roadmap/README.md`) confirm Theia as the sole
      Studio desktop shell.
- [ ] Open question Q1 is closed.

## Steps to reach the decision

1. **Review Feasibility Evidence:** Maintainer reviews `kaioken_v2/docs/theia-studio-research.md` and
   `kaioken_v2/docs/studio-v0.1-build-notes.md`.
2. **Review Code-OSS Maintenance Reality:** Maintainer confirms that rebasing Code-OSS monthly is
   untenable for a solo developer.
3. **Formal Ratification:** Maintainer signs off on Option A.

## In scope

- Decision determination and repository pruning strategy between the two forks in `ide_kaioken/`.

## Out of scope

- Maintaining feature parity between both forks.

## Gates

Maintainer sign-off choosing one fork before proceeding to `studio-v0.1/04-chat-pane-and-approval-dialog.md`.

## Traps

| Trap | Guard |
|---|---|
| Keeping both forks "just in case" | Violates rule 1. Keeping both creates ongoing uncertainty, duplicate questions, and wasted disk space. One must be archived. |
| Trying to port VS Code webviews to Theia | Theia runs VS Code extensions natively, but custom Kaioken panes should use native `ReactWidget`s to avoid iframe latency. |

## Open questions

1. Does the maintainer ratify Option A (Standardise on Theia and archive Code-OSS)?
   - *Owner:* Human maintainer.

## Session brief

```xml
<task>
This is a research-and-recommend decision brief for Studio Shell Consolidation (Decision D-3):

1. Inspect the two live forks in ide_kaioken/:
   - ide_kaioken/kaioken_studio_theia/ (Theia Blueprint)
   - ide_kaioken/kaioken_studio/ (Code-OSS)
2. Compare them against operating rule 1 (review bottleneck) and the criteria documented in
   kaioken_v2/docs/theia-studio-research.md:
   - Panel extensibility (native ReactWidget vs iframe webview)
   - Upstream maintenance tax (npm version bump vs git rebase on Microsoft master)
   - In-process engine consumption (proven in studio-v0.1-build-notes.md)
3. Formulate the final consolidation recommendation to archive Code-OSS and establish Theia as the
   sole desktop IDE shell for Kaioken Studio.
</task>

<research_mode>
Partition your analysis:
- OBSERVED FACTS: State of the two directories, build files, and actual upstream maintenance differences.
- INFERENCES: Long-term maintenance burden of a Code-OSS fork for a solo maintainer.
- OPEN QUESTIONS: Whether any unique capability in the Code-OSS fork needs preservation before archiving.
</research_mode>

<verification_loop>
Verify that both paths exist under ide_kaioken/ and that the Theia spike findings in
kaioken_v2/docs/studio-v0.1-build-notes.md are cited accurately.
</verification_loop>

<action_safety>
Do NOT delete or move either fork during this research session. Archiving happens only after
maintainer ratification. Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) side-by-side comparison of the two forks on maintenance and integration criteria,
(2) unambiguous recommendation to select Theia, (3) actionable archiving steps for the maintainer.
</structured_output_contract>
```
