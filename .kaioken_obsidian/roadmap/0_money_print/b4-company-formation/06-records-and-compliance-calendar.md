# B4-06 · Corporate records and recurring compliance calendar

> Establish a dated, recurring compliance calendar and record-keeping discipline for corporate filings, tax deadlines, and provider reviews, ensuring mandatory obligations are cheap to meet on time rather than catastrophic to miss.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | [`01-entity-and-jurisdiction.md`](01-entity-and-jurisdiction.md), [`02-banking-and-payment-rails.md`](02-banking-and-payment-rails.md), [`03-tax-and-invoicing.md`](03-tax-and-invoicing.md) |
| **Blocks** | Corporate good standing, continuous banking and payment processing access |
| **Touches** | Corporate minute book, annual filing calendar, accounting archive |
| **Risk** | Medium. Missing mandatory annual corporate reports or tax filing deadlines triggers administrative dissolution by state authorities, forfeiture of limited liability shields, and severe statutory fines. |
| **Gate-critical** | No |

---

## Why this exists

Forming a company is a one-time event; keeping it legally alive is a recurring discipline.

Once a legal entity is registered, national and state governments impose statutory reporting requirements. These obligations are **asymmetric**:
- **Meeting them on time is trivial:** Filing an annual corporate report typically takes 15 minutes and costs $25–$100 ASSUMPTION in statutory fees.
- **Missing them is catastrophic:** Missing a filing deadline results in automatic late penalties ($200–$1,000 ASSUMPTION), forfeiture of "Good Standing" status, and eventually **administrative dissolution**. If an entity is dissolved while continuing to trade, the corporate veil vanishes by operation of law, instantly exposing the founder to personal liability for all debts and legal claims incurred during the lapse.

Furthermore, banks and payment processors (Stripe, Paddle) routinely re-verify company registration status via automated government database checks. If an entity lapses into "Inactive" or "Forfeited" status, payment payouts are frozen automatically without advance warning.

Operating rule 6 ([`roadmap/README.md:409`](../../README.md#L409)) proves that *discipline comes from the calendar, not willpower*. This leaf provides a concrete, repeatable calendar that a solo maintainer can follow in under two hours per month.

---

## Current state

Verified against company formation prerequisites:

| Compliance requirement | Current status | Consequence if missed |
|---|---|---|
| Annual Corporate Franchise / Report | Nonexistent (entity unformed) | Administrative dissolution; loss of limited liability shield. |
| Corporate Income Tax Return | Nonexistent | Punitive late-filing fines (e.g. IRS penalties start at $220/month per partner or 5% per month of unpaid tax ASSUMPTION). |
| Merchant of Record Accounting Reconciliations | Nonexistent | Unreconciled books leading to inaccurate taxable profit declarations. |
| Sub-processor & Privacy Review | Nonexistent | Non-compliance with GDPR Article 28 DPA audit clauses ([`04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md)). |

`UNVERIFIED:` Specific state-level annual report filing dates, which vary widely by jurisdiction (e.g. Delaware LLC tax due June 1; UK Confirmation Statement due 12 months after incorporation date).

---

## The recurring compliance calendar

This calendar establishes an unskippable operational cadence across monthly, quarterly, and annual horizons:

```
+─────────────────────────────────────────────────────────────────────────────+
|                         MONTHLY RHYTHM (First Monday)                       |
|  * Reconcile business bank accounts & credit cards in accounting ledger     |
|  * Ingest and archive all SaaS invoices (Anthropic, OpenAI, Vercel, etc.)   |
|  * Review inference proxy gross margin & API cost anomalies (b2/05)         |
+─────────────────────────────────────────────────────────────────────────────+
                                       │
                                       ▼
+─────────────────────────────────────────────────────────────────────────────+
|                        QUARTERLY RHYTHM (Q1, Q2, Q3, Q4)                    |
|  * Jan 15 / Apr 15 / Jun 15 / Sep 15: Estimated corporate tax payments      |
|  * Validate MoR VAT/tax disbursement statements (Paddle/Lemon Squeezy)      |
|  * Security & sub-processor audit: check upstream LLM ZDR commitments      |
|  * Execute quarterly checkpoint review (roadmap/README.md §11)              |
+─────────────────────────────────────────────────────────────────────────────+
                                       │
                                       ▼
+─────────────────────────────────────────────────────────────────────────────+
|                          ANNUAL RHYTHM (Statutory Cycle)                    |
|  * File Annual Corporate Report / Franchise Tax with state/national registrar|
|  * Renew Commercial Registered Agent fee                                    |
|  * Deliver finalized annual financial statements to CPA / Tax Accountant    |
|  * File National & Local Corporate Tax Returns                              |
|  * Conduct Annual Corporate Meeting & commit signed Minutes / Resolutions   |
|  * Review domain renewals, SSL certificates, and Stripe account KYC details |
+─────────────────────────────────────────────────────────────────────────────+
```

---

## The corporate minute book: maintaining the veil

Single-member companies frequently lose lawsuits because the founder failed to maintain corporate formalities, allowing opposing lawyers to argue the entity was merely an "alter ego" of the individual.

To guarantee the corporate veil remains impenetrable, the maintainer must maintain a lightweight digital **Corporate Minute Book** (e.g. in a private encrypted folder):

1. **Articles of Organization & Operating Agreement:** Stored permanently alongside the state Certificate of Formation.
2. **Written Annual Action of the Sole Member:** A 1-page signed PDF executed every January, stating:
   - Approval of prior year financial statements.
   - Re-election of the maintainer as Director / Managing Member.
   - Ratification of all major corporate contracts (payment agreements, hosting contracts).
3. **Major Transaction Resolutions:** A signed 1-page resolution for any non-routine action:
   - Opening a new commercial bank account.
   - Borrowing funds or signing a significant commercial lease.
   - Executing intellectual property assignments or licensing deals.

---

## What done looks like

- [ ] A dedicated compliance calendar synced to the maintainer's primary calendar with automated 14-day advance alerts.
- [ ] Digital Corporate Minute Book directory established with signed formation documents and founder IP assignment.
- [ ] Registered agent service configured with automated annual renewal billing.
- [ ] Recurring monthly accounting closing checklist committed to personal operational procedures.

---

## Steps

1. **Populate Calendar with Jurisdiction-Specific Deadlines.**
   Upon entity formation (`01-entity-and-jurisdiction.md`), determine the exact statutory deadlines for:
   - Annual Report / Franchise Tax.
   - Corporate Tax Return (and extension filing deadline).
   - Registered Agent Renewal.
2. **Set Up Automated Alerts.**
   Configure Google Calendar / Apple Calendar events with notifications at 30 days, 14 days, and 3 days before every statutory deadline.
3. **Standardize Monthly Financial Closing.**
   On the first Monday of each month:
   - Download CSV statements from business checking and payment gateway.
   - Match all receipts in the cloud accounting ledger (`03-tax-and-invoicing.md`).
   - Flag any unreconciled variance exceeding $10 ASSUMPTION.
4. **Schedule Annual CPA Tax Planning Session.**
   Book a 1-hour consultation with the company accountant two months prior to the end of the tax fiscal year to optimize deductible expenses and prepare tax filings.

---

## In scope

- Defining the recurring monthly, quarterly, and annual corporate compliance schedule.
- Establishing corporate record-keeping standards (Minute Book, resolutions).
- Operational safeguards to protect the limited liability corporate veil.
- Calendar integration to prevent statutory penalties and administrative dissolution.

---

## Out of scope

- Direct filing of tax returns or payment of state registration fees.
- Personal estate planning or trust structuring.
- Audit readiness procedures for public company filings (SEC / GAAP).

---

## Gates

1. A dated, jurisdiction-specific compliance calendar populated with confirmed government deadlines.
2. Corporate Minute Book folder established with initial organizational minutes and founder IP assignment signed.
3. Monthly accounting reconciliation schedule active and integrated with business banking rails.

---

## Traps

| Trap | Guard |
|---|---|
| Relying on postal mail for government reminders | State notices sent to physical registered agents often get lost or buried in spam. Set recurring calendar alerts independently. |
| Forgetting registered agent renewal | Registered agents charge an annual fee ($100–$300/yr ASSUMPTION). If their fee lapses, they resign, triggering automatic revocation of good standing by the state. Put agent fees on autopay. |
| Neglecting annual resolutions because "I own 100%" | Single-member entities need written resolutions precisely because there are no other partners to corroborate corporate governance during litigation. |

---

## Open questions

None. The compliance rhythm and record-keeping requirements apply universally across commercial corporate entities.

---

## Session brief

```xml
<task>
In roadmap/money_print/b4-company-formation/06-records-and-compliance-calendar.md, formulate the recurring compliance calendar and corporate record-keeping protocols for Kaioken.

Detail the ongoing operational cadence:
1. Monthly obligations: bank reconciliation, invoice archiving, proxy cost auditing.
2. Quarterly obligations: estimated taxes, MoR VAT validation, sub-processor security audits.
3. Annual obligations: state franchise filings, corporate tax returns, registered agent renewals, annual minutes.

Document the Corporate Minute Book requirements (resolutions, operating agreements, IP assignments) necessary to defend the limited liability corporate veil from "alter ego" piercing claims.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Operating rule 6 (calendar discipline), dependencies on b4/01 and b4/03, and corporate governance requirements.
- INFERENCES: How failure to observe corporate formalities exposes solo founders to personal liability in contract disputes.
- OPEN QUESTIONS: Exact filing dates, which depend on the jurisdiction selected in b4/01.
</research_mode>

<verification_loop>
Verify cross-references to b4/01, b4/02, b4/03, and b4/04.
Ensure all statutory fee estimates carry ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b4-company-formation/06-records-and-compliance-calendar.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the three-tier compliance calendar, (2) corporate minute book checklist, (3) operational failure modes, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
