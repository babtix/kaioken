# B4-03 · Cross-border sales tax, VAT, and the Merchant-of-Record decision

> Resolve statutory international sales tax, VAT, and invoicing liabilities for cross-border digital software by evaluating a Merchant of Record against a direct payment processor, enforcing clean accounting records from day one.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | M |
| **Depends on** | [`01-entity-and-jurisdiction.md`](01-entity-and-jurisdiction.md), [`roadmap/money_print/b2-billing-engineering/02-payment-provider-integration.md`](02-payment-provider-integration.md) |
| **Blocks** | [`roadmap/money_print/b2-billing-engineering/07-billing-test-and-reconciliation.md`](07-billing-test-and-reconciliation.md), [`roadmap/money_print/b5-go-to-market/04-pricing-page-and-checkout.md`](04-pricing-page-and-checkout.md) |
| **Touches** | Tax accounting configuration, checkout invoicing pipeline, corporate books |
| **Risk** | Critical. Selling digital services internationally without collecting and remitting statutory sales tax/VAT creates retroactive corporate tax liabilities, severe government penalties, and potential piercing of limited liability for tax fraud. |
| **Gate-critical** | Yes |

---

## Why this exists

Selling software across the internet creates instant, cross-border tax obligations:
1. **European Union:** Cross-border sales of digital automated services to EU consumers (B2C) trigger statutory EU VAT (ranging from 17% to 27% depending on the customer's country) from **euro zero**. There is no minimum revenue threshold.
2. **United Kingdom:** UK HMRC requires 20% VAT registration and remittance on B2C digital services from the very first British customer.
3. **United States:** Over 45 states enforce economic nexus laws. Once sales cross specific thresholds ($100k revenue or 200 separate transactions in a state ASSUMPTION), sales tax must be collected, reported, and remitted per state and county jurisdiction.
4. **Rest of World:** Canada (GST/HST), Australia (GST), India (GST), and dozens of other nations impose digital services taxes on foreign software vendors.

For an enterprise corporation with a dedicated accounting department, filing quarterly VAT returns across 40 jurisdictions is an accepted operational cost. **For a solo maintainer, managing cross-border tax compliance manually is fatal.** It is the single fastest way to destroy operating rule 1 ([`roadmap/README.md:404`](../../README.md#L404)), drowning the maintainer in tax filings, currency conversions, and statutory audit inquiries.

This leaf resolves the **Merchant of Record (MoR)** decision, representing the single largest operational simplification available to a solo operator, and establishes record-keeping protocols from day one.

---

## Current state

Verified against working tree and billing roadmap:

| Fact | Status | Evidence |
|---|---|---|
| Billing engineering architecture | In development | Specified in `b2/02` (payment provider) and `b2/07` (reconciliation). |
| Tax collection infrastructure | None | No tax calculation logic exists in the engine or website. |
| Maintainer tax residency | Unspecified | Gated behind `b4/01` (`blocked`). |
| Invoicing requirement | Unmet | B2B enterprise customers require VAT-compliant reverse-charge invoices before issuing payment. |

`UNVERIFIED:` Historical pricing and transaction take-rates for Stripe vs Merchant of Record providers:
- `UNVERIFIED:` Stripe standard fee is typically ~2.9% + $0.30 per transaction, plus ~0.5% for Stripe Tax and ~0.4% for Stripe Invoicing (changes frequently; verify on stripe.com).
- `UNVERIFIED:` Merchant of Record providers (Paddle, Lemon Squeezy) typically charge ~5.0% + $0.50 per transaction (changes frequently; verify on vendor sites).

---

## The structural choice: Direct Gateway vs Merchant of Record

The maintainer must choose between two distinct legal and architectural models:

```
Direct Gateway Model (Stripe):
Customer  ───>  Your Entity (Legal Seller)  ───>  Payment Processor
                * You bear 100% tax liability
                * You register for VAT/GST in 40+ countries
                * You remit taxes to 40+ foreign tax authorities

Merchant of Record Model (Paddle / Lemon Squeezy):
Customer  ───>  Merchant of Record (Legal Reseller)  ───>  Your Entity (Vendor)
                * MoR bears 100% tax liability
                * MoR calculates, collects & remits all VAT/GST
                * You receive a single net payout & invoice per month
```

| Dimension | Option A: Direct Gateway (Stripe + Stripe Tax) | Option B: Merchant of Record (Paddle / Lemon Squeezy) |
|---|---|---|
| **Legal Status** | Your entity is the **merchant of record**. You sell directly to the end user. | The MoR is the **legal reseller**. The customer purchases from Paddle/Lemon Squeezy; they pay you as a software supplier. |
| **Sales Tax & VAT Liability** | **You hold full statutory liability.** Stripe Tax calculates tax, but **you** must register, file, and remit taxes to each foreign government. | **The MoR holds full statutory liability.** The MoR registers, collects, files, and remits taxes in every country. |
| **Invoicing & Reverse Charge** | You must generate VAT-compliant B2B invoices and validate EU VIES VAT numbers in real-time. | Handled automatically by the MoR. |
| **Chargeback & Fraud Shield** | You handle chargeback disputes and pay dispute fees ($15/chargeback ASSUMPTION). | The MoR acts as the merchant shield, fighting chargebacks and absorbing certain fraud liabilities. |
| **Platform Fee** | ~3.8% total ASSUMPTION (Stripe 2.9% + Tax 0.5% + Billing 0.4%). | ~5.0% + $0.50 ASSUMPTION. |
| **Solo Maintainer Overhead** | **Severe.** 10–20 hours per month spent on tax registrations, quarterly filings, and cross-border currency accounting. | **Minimal.** ~30 minutes per month to record a single net supplier invoice in accounting software. |

### Strategic Recommendation
**Option B (Merchant of Record) is overwhelmingly recommended for a solo maintainer.** The ~1.2% fee differential is negligible compared to the thousands of dollars in accounting fees, foreign tax filing fees, and cognitive overhead required to manage manual multi-jurisdiction VAT compliance.

---

## Record-keeping from day one

Tax authorities do not accept retroactive reconstruction of accounting books. Clean records must be maintained from the very first transaction:

1. **Dedicated Cloud Accounting Software:** Connect the business bank account (`b4/02`) to an automated cloud ledger (e.g. Xero, QuickBooks Online, or FreeAgent).
2. **Automated Receipt Ingestion:** Every vendor expense (OpenAI API bills, Anthropic tokens, Vercel hosting, domain renewals, legal fees) must automatically ingest into the accounting system with receipts attached (e.g. via Dext or auto-forwarded email).
3. **Monthly Bank Reconciliation:** On the 1st of every month, reconcile 100% of banking transactions against invoices and receipts. Never let unreconciled transactions accumulate across quarters.
4. **Clear Separation of In-Scope Deductions:** Track software development expenses accurately. Hardware (MacBook/PC), internet connectivity, and home office costs must follow qualified local tax deduction rules confirmed by an accountant.

---

## What done looks like

- [ ] Maintainer decides in writing between Option A (Direct Gateway) and Option B (Merchant of Record).
- [ ] If Option B (MoR) is selected: Paddle or Lemon Squeezy account configured and approved.
- [ ] If Option A (Stripe) is selected: Local CPA/tax advisor engaged to handle quarterly sales tax and international VAT filings.
- [ ] Cloud accounting ledger operational and synced to the corporate business bank account.
- [ ] Automated tax receipt archiving folder operational.
- [ ] Status of this leaf transitions from `blocked` to `done`.

---

## Steps

1. **Evaluate Domestic vs International Customer Distribution.**
   Review initial waitlist and community demographics to estimate cross-border sales volume.
2. **Review with Local Tax Advisor.**
   Ask the CPA: *"Does our tax authority require domestic VAT registration even if we sell through an international Merchant of Record?"* (Most jurisdictions treat MoR payouts as B2B export of software services, zero-rated for domestic VAT).
3. **Select and Contract Billing Platform.**
   Finalize choice in [`roadmap/money_print/b2-billing-engineering/02-payment-provider-integration.md`](02-payment-provider-integration.md).
4. **Deploy Automated Invoicing Pipeline.**
   Ensure customer receipts display the customer's legal company name, business address, and registered VAT/tax ID number for B2B expense reporting.
5. **Establish Monthly Closing Routine.**
   Set an unskippable recurring calendar reminder on the 1st of each month to reconcile all corporate bank transactions and archive receipts.

---

## In scope

- Analysis of international digital services tax liabilities (EU/UK VAT, US economic nexus).
- Comprehensive trade-off comparison of Direct Gateways vs Merchants of Record.
- Day-one cloud bookkeeping and receipt preservation requirements.
- Defining B2B corporate invoicing compliance criteria.

---

## Out of scope

- Filing specific country tax forms or quarterly returns.
- Integrating payment webhooks in code (handled in `b2/02`).
- Setting up complex offshore transfer pricing structures.

---

## Gates

1. A committed decision document selecting the tax collection mechanism (MoR vs Direct) in `roadmap/money_print/b4-company-formation/03-tax-and-invoicing.md`.
2. Cloud accounting platform connected to the live corporate bank account.
3. Written sign-off from a certified tax professional approving the tax collection and invoicing workflow.

---

## Traps

| Trap | Guard |
|---|---|
| "I'll worry about EU VAT when Europe notices me" | EU tax authorities share transaction data with card networks. Unpaid VAT accrues compounding statutory interest and penalties that attach to corporate directors personally. |
| Choosing Stripe because the headline percentage is lower | Saving ~1.2% ASSUMPTION in transaction fees while spending $5,000/year ASSUMPTION on international tax accountants is a massive net loss for a solo maintainer. |
| Reconstructing receipts at annual tax filing time | Trying to find missing API receipts 12 months later wastes entire weeks. Automate receipt capture at purchase time. |

---

## Open questions

1. **Billing Architecture Decision:** Does the maintainer select Option A (Stripe + Tax Automation) or Option B (Merchant of Record like Paddle/Lemon Squeezy)?
   - *Status:* Open. Keeps this leaf marked `blocked`.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b4-company-formation/03-tax-and-invoicing.md, analyze the cross-border tax liabilities and the Merchant of Record (MoR) decision for Kaioken.

Cover:
1. International sales tax and VAT realities on digital software (EU VAT euro-zero threshold, UK VAT, US economic nexus).
2. The core trade-off: Direct Gateway (Stripe) vs Merchant of Record (Paddle/Lemon Squeezy).
3. Why MoR is the single biggest operational simplification available to a solo operator (shifting statutory tax liability, multi-country filing elimination).
4. Day-one accounting and bookkeeping discipline (cloud ledgers, receipt archiving, monthly reconciliation).

Mark the leaf status as "blocked" pending the maintainer's platform decision.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Dependencies on b4/01 and b2/02, invoicing requirements for corporate software buyers.
- INFERENCES: How outsourcing tax liability to an MoR preserves solo engineering capacity.
- OPEN QUESTIONS: The maintainer's final platform selection between Stripe and an MoR.
</research_mode>

<verification_loop>
Verify that all competitor fee figures (Stripe, Paddle) carry UNVERIFIED: and ASSUMPTION labels.
Confirm status is marked blocked.
Verify cross-references to b4/01, b2/02, and b2/07.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b4-company-formation/03-tax-and-invoicing.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) comparative tax model table, (2) recommendation rationale for solo maintainers, (3) day-one bookkeeping checklist, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
