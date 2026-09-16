# B0-02 · Choose the commercial license model

> Define the legal structure of the open-core boundary as a licensing contract: evaluate a single permissive
> license, an open-core dual license, and a time-delayed Business Source License.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits maintainer strategic determination) |
| **Size** | S |
| **Depends on** | [`B0-01`](01-fix-the-license-vacuum.md), [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) |
| **Blocks** | [`B0-05`](05-readiness-bar.md), [`B1-03`](03-open-core-boundary.md) |
| **Touches** | `roadmap/decisions/d1-license.md`, `LICENSE`, legal documentation |
| **Risk** | Strategic — dictates contributor rights, cloud hosting rights, and enterprise adoption friction |
| **Gate-critical** | **Yes — governs the legal enforceability of the commercial model** |

---

## Why this exists

While [`B0-01`](01-fix-the-license-vacuum.md) resolves the immediate absence of a license, this leaf
addresses the architectural legal structure of commercialization.

Monetizing open-core software can take three fundamentally distinct legal shapes:
1. **Single Permissive License (MIT or Apache-2.0):** 100% of the distributed code is open source. Commercial
   revenue attaches exclusively to proprietary hosted services, remote daemons, and cloud inference.
2. **Open Core Dual Licensing (Permissive Core + Commercial Proprietary Add-on):** The engine and basic
   CLI are MIT/Apache, while enterprise packages (e.g. advanced sandboxing, SSO, audit logging) carry a
   separate proprietary commercial license.
3. **Source-Available / Delayed Open Source (BSL 1.1 or FSL):** Code is free to use and inspect, but
   competing commercial cloud hosting is prohibited for a defined duration (e.g. 2 to 4 years), after
   which it automatically converts to Apache-2.0.

Choosing between these models determines whether external contributors can contribute freely, whether
a Contributor License Agreement (CLA) is mandatory, and whether enterprise legal departments will
approve internal usage.

---

## Current state

Verified against repository metadata and industry precedent:

| Fact | Evidence | Notes |
|---|---|---|
| Initial D1 framing | `roadmap/decisions/d1-license.md:46-70` | Evaluates Noncommercial vs Dual-License vs Permissive Apache-2.0 |
| OpenCode model | `inspire/opencode/LICENSE:1-21` | Shipped under pure MIT license; monetizes hosted platform without licensing restrictions |
| Contributor status | `git shortlog -sn` | Single author. No external copyright holders to consult before setting policy |
| Enterprise procurement behavior | Legal precedent | Pure permissive licenses pass automated enterprise compliance checks; BSL/SSPL trigger immediate legal reviews |

---

## The three licensing models compared

| Metric | Model 1: Single Permissive (MIT / Apache-2.0) | Model 2: Dual License (Core MIT + Commercial Add-on) | Model 3: Time-Delayed Source-Available (BSL / FSL) |
|---|---|---|---|
| **Distribution Reach** | Maximum. Zero enterprise friction | High for core; commercial features require seat agreement | Medium. BSL is blacklisted by many corporate IT policies |
| **Cloud Resale Defense** | None. Hyperscalers can host freely | Core can be hosted; commercial features protected | High. Prevents competitive cloud offerings |
| **Contributor Friction** | Minimal. Standard PR workflow, no CLA required | High. Requires strict CLA/DCO for core contributions | High. Contributors hesitate to contribute to commercial BSL repos |
| **Administrative Burden** | **Lowest.** Zero contract enforcement | High. Must issue, track, and enforce commercial seat licenses | Moderate. Must manage licensing conversion timelines |
| **Solo Maintainer Fit** | **Optimal.** Revenue comes from hosted services (MoR / Stripe) | Poor. High sales, legal, and compliance overhead | Fair. Protects engine, but damages open-source distribution |

---

## What done looks like

- [ ] Maintainer records an explicit choice among Model 1, Model 2, or Model 3 in a written decision record.
- [ ] Contributor License Agreement (CLA) policy is documented:
  - If Model 1 is chosen: A standard Developer Certificate of Origin (DCO) or lightweight PR acknowledgement
    is adopted.
  - If Model 2 or 3 is chosen: A formal CLA requirement is drafted before opening the repository to public PRs.
- [ ] Legal boundaries between open-source repositories and commercial hosted assets are formally defined.

---

## Steps

1. **Evaluate against solo maintainer constraints:** Review Operating Rule 1 (review bottleneck).
   Model 1 (Single Permissive + Hosted Services) eliminates corporate license management and CLA bureaucracy.
2. **Examine comparables:** Analyze how OpenCode (`inspire/opencode`) and Kilo Code structure their licensing
   terms (see [`B1-01`](01-study-the-comparables.md)).
3. **Decide CLA necessity:** Document whether the project requires contributors to assign or license copyright
   back to the maintainer.
4. **Record decision:** Update [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) with the
   precise legal architecture.

---

## In scope

- Legal evaluation of single permissive, dual licensing, and source-available licenses.
- Determining contributor agreement (CLA/DCO) policy.
- Documenting the legal boundary for commercial products.

---

## Out of scope

- Drafting formal end-user commercial contracts or enterprise master services agreements (MSAs).
- Writing the commercial pricing tiers (covered in [`B1-04`](04-pricing-and-packaging.md)).
- Product packaging of what features are gated (covered in [`B1-03`](03-open-core-boundary.md)).

---

## Gates

1. A written decision recorded in `roadmap/decisions/d1-license.md` specifying:
   - Primary engine license (Model 1, 2, or 3).
   - Commercial add-on license terms (if Model 2).
   - Contributor agreement policy (DCO vs CLA).
2. Maintainer explicit sign-off on the operational overhead of the chosen model.

---

## Traps

| Trap | Guard |
|---|---|
| Choosing BSL/SSPL for an early developer tool | BSL destroys top-of-funnel viral developer adoption. Developers cannot run it on work laptops without corporate approval |
| Dual-licensing without a CLA | If external contributors submit code to an open-core repo without a CLA, the maintainer cannot legally include that code in commercial bundles |
| Underestimating license management burden | Auditing seat counts and negotiating proprietary license agreements is a full-time sales/legal job. Pure permissive + hosted service eliminates it |

---

## Open questions

1. **Does the maintainer accept the pure permissive model (Model 1)?**
   - *Recommendation:* Adopt Model 1 (Apache-2.0 for all published code, monetizing hosted cloud inference,
     managed background daemons, and team services). This matches the Kilo Code / OpenCode pattern and
     minimizes legal friction for a solo operator.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/decisions/d1-license.md and roadmap/money_print/b0-preconditions/, evaluate and formalize
the commercial licensing model for Kaioken:

1. Review the trade-offs between:
   - Model 1: Single Permissive License (Apache-2.0 / MIT) with monetization via hosted cloud services.
   - Model 2: Open Core Dual Licensing (Permissive Core + Commercial Proprietary Add-on).
   - Model 3: Time-delayed Source-Available (BSL 1.1 / FSL).
2. Highlight the operational reality of Rule 1 (solo maintainer review bottleneck): Model 2 and 3 require
   enforcing CLAs and managing commercial software licenses.
3. Formulate a concise decision brief for the human maintainer to confirm whether Model 1 is adopted.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: inspire/opencode is pure MIT; .kaioken_v1 is L0-Noncommercial; v2 is unlicensed.
- INFERENCES: Solo maintainer cannot sustain per-seat license enforcement; hosted layer is the cleanest revenue path.
- OPEN QUESTIONS: Whether maintainer insists on protecting code from hyperscalers (Model 3) or prioritizes developer reach (Model 1).
</research_mode>

<verification_loop>
Verify that all legal license descriptions accurately reflect SPDX definitions and industry practice.
Confirm no source code or package manifests are modified during this analysis.
</verification_loop>

<action_safety>
Do NOT commit changes to LICENSE or package.json until the maintainer formally signs off on this decision.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) comparative assessment of the three models against the solo maintainer constraint,
(2) clear recommendation, (3) proposed text for updating d1-license.md, (4) prompt for maintainer decision.
</structured_output_contract>
```
