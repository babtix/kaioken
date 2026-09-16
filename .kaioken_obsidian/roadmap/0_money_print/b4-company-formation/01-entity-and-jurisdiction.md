# B4-01 · Entity choice, jurisdiction, and liability shielding

> Formulate the decision criteria for incorporating a limited liability corporate entity prior to first revenue, identifying jurisdictional impacts on liability, banking, payment underwriting, and taxation while leaving jurisdiction an open decision for local professional counsel.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md), [`roadmap/money_print/b0-preconditions/01-fix-the-license-vacuum.md`](01-fix-the-license-vacuum.md) |
| **Blocks** | [`02-banking-and-payment-rails.md`](02-banking-and-payment-rails.md), [`03-tax-and-invoicing.md`](03-tax-and-invoicing.md), [`roadmap/money_print/b2-billing-engineering/02-payment-provider-integration.md`](02-payment-provider-integration.md) |
| **Touches** | Corporate governance documents, entity articles of association |
| **Risk** | Critical. Selling commercial software without a limited liability entity exposes the solo maintainer's personal savings, home, and personal assets to direct legal liability. |
| **Gate-critical** | Yes |

---

## Why this exists

It is technically possible to sign up for payment gateways as a sole proprietor using personal identification numbers. In software, this is dangerous negligence.

When Kaioken charges a user money, a contractual relationship is formed. If the software suffers an unhandled bug that corrupts a customer's git repository, if the inference proxy leaks customer source code during a security incident, or if an enterprise competitor files a patent or copyright infringement lawsuit, **a sole proprietor is personally liable without limit**. Personal bank accounts, vehicles, and real estate can be seized in civil judgments.

Furthermore, commercial payment processors (Stripe, Paddle) classify AI developer tools reading source code as medium-to-high risk, subjecting unincorporated accounts to sudden rolling reserves (holding 10%–25% of gross receipts for 90 days) or outright account termination.

Therefore, an incorporated limited liability entity must exist **before dollar one of commercial revenue is processed**. This leaf outlines the structural choices and prepares the exact decision matrix for professional legal counsel, without presuming or guessing the maintainer's home jurisdiction.

---

## Current state

Verified against repository metadata and working tree:

| Fact | Status | Evidence |
|---|---|---|
| Contributor baseline | 100% solo maintainer | `git log` reflects single committer; zero outside copyright claims. |
| Entity status | Nonexistent | No corporate entity or registration number is attached to the project. |
| Maintainer jurisdiction | Unspecified | The maintainer's citizenship, tax residency, and physical location are **not recorded anywhere in this repository and must not be assumed**. |
| Licensing baseline | Unlicensed engine | `.kaioken_v1/LICENSE` is License Zero Noncommercial; `kaioken_v2/` is unlicensed ([`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md)). |

`UNVERIFIED:` Timeframe for corporate entity registration across various international company registries (typically spans 48 hours to 4 weeks depending on jurisdiction).

---

## The three primary corporate archetypes

Across most global jurisdictions, three broad legal operating structures exist for solo software developers. The choice dictates personal liability, administrative burden, and tax treatment:

| Entity archetype | Liability protection | Banking & payment provider ease | Annual compliance overhead | Solo founder suitability |
|---|---|---|---|---|
| **1. Unincorporated Sole Proprietorship** | **Zero.** Personal and business assets are identical. Unlimited personal liability for all damages and debts. | Low. Processors may onboard individuals but enforce lower volume caps, higher reserves, and harsh personal KYC scrutiny. | Minimal. Business income reported directly on personal tax returns. | **UNACCEPTABLE FOR COMMERCIAL SALES.** The legal risk of selling AI tools without a liability shield is too high. |
| **2. Private Limited Liability Entity** *(e.g., US LLC, UK Ltd, German GmbH, Canadian Corp, Estonian OÜ, Australian Pty Ltd)* | **Complete liability shield** (provided the corporate veil is respected: separate accounts, no fraud, proper governance). | High. Standard structure recognized by all global banks, Stripe, Paddle, and card networks. | Moderate. Annual state filings, registered agent fees, dedicated corporate tax return or pass-through schedule. | **RECOMMENDED DEFAULT.** Minimizes administrative friction while establishing complete personal liability protection. |
| **3. Joint-Stock / Venture Corporation** *(e.g., Delaware C-Corp, UK PLC, French SAS)* | **Complete liability shield.** Required for issuing stock options, SAFE notes, and taking institutional venture capital. | Highest for venture banks (Mercury, Brex), but overkill for merchant accounts. | High. Corporate bylaws, board resolutions, separate corporate franchise taxes, double taxation unless electing pass-through. | **PREMATURE.** Massive overhead for a solo maintainer bootstrapping without venture funding. |

---

## Jurisdictional decision factors

The maintainer's choice of jurisdiction directly determines:

1. **Liability Law & Corporate Veil Durability:** How easily can an adversarial litigant pierce the corporate veil? Jurisdictions with established commercial law precedent provide strong statutory protections for single-member entities.
2. **Banking Access & Currency Friction:** Can the entity open a multi-currency commercial account (USD, EUR, GBP) without physical travel? US Stripe Atlas entities or Estonian e-Residency entities are often marketed to non-residents, but introduce complex cross-border tax withholding and double-reporting obligations at home.
3. **Payment Processor Underwriting:** Payment rails require domestic tax identification numbers (e.g. US EIN, UK UTR, European VAT number) and local proof of address.
4. **Tax Complexity:** Does forming a foreign entity trigger Controlled Foreign Corporation (CFC) anti-avoidance rules, punitive passive income taxation (e.g. US PFIC rules), or mandatory reporting penalties in the maintainer's country of tax residency?

---

## Questions to ask a qualified professional

When the maintainer meets with an attorney or chartered accountant, these four questions must be resolved:

1. *"Given my personal tax residency in [Jurisdiction], is it more tax-efficient and legally sound to incorporate a domestic limited company, or to incorporate an offshore vehicle (e.g. US LLC or Delaware C-Corp)?"*
2. *"If I form a single-member limited liability entity, what specific corporate governance steps (operating agreement, capitalization, meeting minutes) are strictly required to ensure personal liability protection cannot be pierced?"*
3. *"How does our local tax authority treat digital cross-border SaaS revenue and metered software usage?"*
4. *"What are the annual filing deadlines, mandatory franchise fees, and registered agent requirements to keep the entity in good standing?"*

---

## What done looks like

- [ ] A qualified legal/tax professional in the maintainer's jurisdiction is consulted.
- [ ] Maintainer records the chosen jurisdiction and entity structure in private company records.
- [ ] Certificate of Incorporation / Articles of Organization filed and approved by relevant government registrar.
- [ ] Corporate tax identification number (EIN, Tax ID, or VAT registration) issued.
- [ ] Status of this leaf transitions from `blocked` to `done`.

---

## Steps

1. **Compile Maintainer Residency Context (Private).**
   Identify the maintainer's physical domicile, tax residency, and anticipated operational location. (Keep off GitHub).
2. **Schedule Initial Consultation with Legal / Accounting Counsel.**
   Engage a local commercial attorney or certified public accountant specializing in digital cross-border software businesses. Present the four questions listed above.
3. **File Entity Registration Documents.**
   File Articles of Organization / Incorporation for a private limited liability company. Appoint a registered agent if required.
4. **Execute Core Governance Documents.**
   Adopt standard Operating Agreement / Articles of Association specifying:
   - 100% equity ownership held by maintainer.
   - Formal corporate IP assignment: all intellectual property related to Kaioken created by the maintainer is assigned exclusively to the corporate entity.
5. **Obtain Tax Identification Number.**
   Secure federal/national corporate tax ID required for banking onboarding (`02-banking-and-payment-rails.md`).

---

## In scope

- Comparative structural analysis of entity types.
- Defining the jurisdictional criteria affecting banking, tax, and liability.
- Drafting specific questions for professional counsel.
- Establishing the mandatory IP assignment requirement.

---

## Out of scope

- Giving specific legal or tax advice for an unstated country.
- Registering trademarks (handled in `b0/04-trademark.md`).
- Designing venture equity cap tables or investor SAFEs.

---

## Gates

1. A formally registered limited liability entity certificate exists with relevant government authority.
2. Official Tax Identification Number (EIN, VAT, or local equivalent) received.
3. Written Intellectual Property Assignment Agreement executed between maintainer as an individual and the new corporate entity.

---

## Traps

| Trap | Guard |
|---|---|
| "I'll form an LLC after I make my first $10k" | If an incident occurs during the first $1k of revenue, personal liability attaches. The shield must be in place *before* commercial transactions occur. |
| Forming a US Delaware LLC while living outside the US without tax advice | Many countries tax foreign LLCs as non-transparent corporations or apply aggressive CFC penalties. Always consult local counsel before using Stripe Atlas as a non-US resident. |
| Failing to execute an IP assignment agreement | If the individual founder writes code and forms a company, the individual personally owns the copyright until a written contract assigns it to the company. |

---

## Open questions

1. **Maintainer Jurisdiction and Entity Form:** Which country and specific legal structure (e.g. LLC, Ltd, GmbH, etc.) will be chosen?
   - *Status:* Open. Keeps this leaf marked `blocked`.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b4-company-formation/01-entity-and-jurisdiction.md, document the decision framework for forming a commercial corporate entity prior to first revenue.

Address:
1. Why selling commercial software without an incorporated entity creates unacceptable personal liability.
2. The trade-offs between Sole Proprietorship (unacceptable), Private Limited Company (recommended), and Joint-Stock C-Corp (premature).
3. How jurisdictional choices govern liability protection, banking access, payment provider underwriting, and cross-border taxation.
4. Provide the exact list of four questions the maintainer must bring to a qualified attorney or tax professional in their jurisdiction.

Keep jurisdiction explicitly open and mark the leaf status as "blocked".
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Solo contributor baseline (100% copyright), unlicensed engine state (d1-license.md), and absence of jurisdiction in the repository.
- INFERENCES: Why payment gateways treat unincorporated accounts with higher reserve penalties.
- OPEN QUESTIONS: The maintainer's actual physical jurisdiction and chosen legal structure.
</research_mode>

<verification_loop>
Verify that no specific jurisdiction (e.g. Delaware or US LLC) is assumed as the maintainer's domicile.
Confirm status is marked blocked.
Verify that all cross-references to roadmap/decisions/d1-license.md and b0/01 resolve.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b4-company-formation/01-entity-and-jurisdiction.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of entity comparison, (2) the list of questions for professional counsel, (3) confirmation of blocked status, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
