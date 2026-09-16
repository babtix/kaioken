# DECISION-01 · Project license model (L0-Noncommercial vs Dual-License vs Permissive)

> Decide the long-term licensing model for Kaioken before the March 2027 contributor expansion creates
> copyright deadlock: stay noncommercial, adopt dual-licensing, or transition to a permissive open-source license.

| Field | Value |
|---|---|
| **Status** | `blocked` (decision pending maintainer selection) |
| **Size** | S (in code review) / High (in strategic consequence) |
| **Depends on** | Nothing |
| **Blocks** | Milestone M11 (Team & CI Surface / GitHub Marketplace), Milestone M12 (Ecosystem GA) |
| **Touches** | `LICENSE`, `kaioken_v2/package.json`, legal terms across site and registry |
| **Risk** | Strategic — permanently dictates commercial viability and corporate adoption |
| **Gate-critical** | **Yes — blocks Q4 milestones** |

## Why this exists

Kaioken is currently published under the **License Zero Noncommercial Public License 2.0.1**.
Under this license, commercial use is strictly prohibited. While this protects the author's research
and prevents commercial exploitation by proprietary AI platforms, it imposes a hard ceiling:
companies and enterprise engineering teams cannot legally use or evaluate the software.

The master roadmap ([`roadmap/README.md:346-362`](../README.md#L346-L362)) establishes a strict
decision deadline: **MARCH 2027**. The reason for this deadline is legal and operational:
*relicensing gets harder with every outside contributor who lands a pull request*. Under common law
and open-source copyright precedent, changing a license requires consent from 100% of copyright
holders unless a Contributor License Agreement (CLA) is in place. The decision must be made while
the contributor list is still a solo maintainer.

Drifting into Q4 (when M11's GitHub Action and M10/Studio land in corporate development environments)
without an intentional choice is indefensible.

## Current state

Verified against [`roadmap/README.md:346-362`](../README.md#L346-L362)
and root repository metadata:

| Fact | Evidence |
|---|---|
| Current License | License Zero Noncommercial Public License 2.0.1 |
| Commercial Restriction | Any commercial entity (for-profit corporation) running `kaioken` violates terms |
| Contributor status | Solo maintainer (`100%` of copyright currently held by the repository owner) |
| Impending collision | Milestone M11 ships a GitHub Action intended for corporate CI; Milestone M12 launches a public extension registry |
| Hard deadline | March 2027 (end of Q3 / before GA) |

## Options and trade-offs

### Option A: Stay Noncommercial (License Zero Noncommercial)
- **Concept:** Retain the current License Zero Noncommercial license permanently. Commercial entities
  must purchase commercial exceptions directly or cannot use it.
- **Pros:** Maximum protection against uncompensated commercial exploitation. Retains the project as
  a pure research and portfolio showcase. Zero corporate sales obligations.
- **Cons:** Permanently caps adoption. Developer tools spread through workplace adoption; developers
  cannot use it on company laptops. Severely limits community contribution.

### Option B: Dual-License (Fair Core / Commercial License)
- **Concept:** Noncommercial / personal use is free under License Zero (or AGPL-3.0); commercial use
  requires a paid commercial license (e.g. License Zero Parity or standard commercial seat licensing).
- **Pros:** Direct monetization path for the solo maintainer. Enterprise teams can pay for compliance.
- **Cons:** Imposes high sales, billing, and legal administrative friction on a solo developer. Requires
  strict enforcement of Contributor License Agreements (CLAs) for any outside PRs.

### Option C: Permissive Open Source (MIT or Apache 2.0) + Monetise Registry/Cloud
- **Concept:** Relicense the core engine (`kaioken_v2`) and Studio under MIT or Apache 2.0. Monetise
  via hosted cloud services, hosted background daemons, or verified publisher tiers on `registry-web`.
- **Pros:** Removes all corporate adoption friction. Maximises distribution, viral developer adoption,
  and open-source community contributions. Eliminates CLA overhead.
- **Cons:** Allows larger AI vendors to bundle or run Kaioken's techniques without paying. Revenue
  requires building hosted infrastructure that does not currently exist.

## Recommendation

**Recommendation: Path C (Transition to Apache 2.0 in Q1 2027).**

*Rationale:* A codebase knowledge engine derives its primary moat from **integration depth and developer
habit**, not proprietary source secrecy. Capping corporate adoption in an era where AI tools move at
hyperspeed guarantees obscurity. Relicensing under Apache 2.0 with a clear patent grant unblocks
Milestone M11 (GitHub Marketplace Action) and makes Kaioken Studio a viable alternative to Cursor or
Windsurf. Monetisation can attach to `registry-web` (private extension publishing) and hosted daemon
cloud runners, rather than per-seat core engine licenses.

However, this recommendation is a proposal. **The maintainer must make the binding choice.**

## What done looks like

- [ ] Maintainer selects Option A, B, or C in writing.
- [ ] If Option B or C is chosen, the `LICENSE` file and `package.json` license fields are updated
      before the first external pull request is merged.
- [ ] If Option B is chosen, a Contributor License Agreement (CLA) bot is integrated into GitHub Actions.
- [ ] Status of this record transitions to `done`.

## Steps to reach the decision

1. **Review Commercial Intent:** Solo maintainer determines personal career goals for Kaioken:
   academic/portfolio asset vs funded commercial venture vs ecosystem open-source tool.
2. **Evaluate Inbound Demand:** Review user requests from `website/` and issues regarding commercial
   use restrictions.
3. **Legal Review of Contributor Baseline:** Verify that `git log` reflects zero external contributors
   holding third-party copyright.
4. **Sign-off:** Maintainer records determination in this file.

## In scope

- Decision determination and legal documentation in `LICENSE` and `package.json`.

## Out of scope

- Negotiating individual corporate enterprise contracts.
- Setting up Delaware C-corps or payment processors.

## Gates

A committed decision recorded by the repository owner before March 31, 2027.

## Traps

| Trap | Guard |
|---|---|
| Merging outside PRs before deciding | An external contributor owns their copyright. Merging outside code without a CLA locks the repo into its current license unless every contributor agrees to relicensing later. |
| Assuming dual-licensing runs itself | Selling commercial licenses requires legal terms, invoicing, and tax infrastructure. |

## Open questions

1. Which path does the maintainer select: A (Stay Noncommercial), B (Dual-License), or C (Permissive Apache 2.0 / MIT)?
   - *Deadline:* March 2027.
   - *Owner:* Human maintainer.

## Session brief

```xml
<task>
This is a research-and-recommend decision brief for the Kaioken Project License (Decision D-1):

Analyze the legal and strategic constraints of the License Zero Noncommercial Public License 2.0.1
currently governing the repository:
1. Examine root LICENSE, kaioken_v2/package.json, and roadmap/README.md lines 346-362.
2. Document the exact contributor copyright baseline via git shortlog -sn to confirm that 100% of
   commits originate from the maintainer.
3. Evaluate the three options (Noncommercial, Dual-License, Permissive) against the upcoming milestones:
   - M11 (Team & CI Surface - GitHub Marketplace Action)
   - M12 (Ecosystem GA - registry-web)
4. Formulate an evidence-based recommendation for the human maintainer.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: What the current LICENSE file states, current commit authorship, and milestone dependencies.
- INFERENCES: How corporate procurement behaves regarding License Zero, and administrative overhead of dual-licensing.
- OPEN QUESTIONS: What the maintainer's primary goal for the project is (commercial venture vs open adoption).
</research_mode>

<verification_loop>
Verify that all legal citations to License Zero Noncommercial 2.0.1 are accurate and that git author
history is checked.
</verification_loop>

<action_safety>
Do NOT modify the LICENSE file or package.json license field during this session.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) observed facts regarding copyright ownership and license text, (2) comparative trade-off
matrix of Paths A, B, and C, (3) specific risk of missing the March 2027 deadline, (4) maintainer
sign-off prompt.
</structured_output_contract>
```
