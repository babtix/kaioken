# B6-03 · Revenue milestones and decision gates

> Establish a disciplined ladder of financial thresholds, pairing each revenue milestone with the specific operational decision it unlocks or forces, labeling all financial figures as assumptions in an editable model.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/money_print/b1-model-and-positioning/06-unit-economics-model.md`](06-unit-economics-model.md), [`01-when-to-hire.md`](01-when-to-hire.md), [`02-solo-maintainer-limits.md`](02-solo-maintainer-limits.md) |
| **Blocks** | Capital allocation strategy, corporate expansion sequencing |
| **Touches** | Financial planning model, corporate governance roadmap |
| **Risk** | Medium. Spending money on premature enterprise infrastructure before revenue validates product demand drains cash reserves and forces premature shutdown. |
| **Gate-critical** | Yes |

---

## Why this exists

In early-stage software companies, founders frequently make financial commitments out of sequence:
- Incorporating an expensive offshore venture structure before making $100.
- Purchasing enterprise SOC 2 compliance software before having 10 customers.
- Leasing an office or hiring an engineer before achieving cash-flow breakeven.

To maintain financial discipline, capital expenditure and corporate commitments must follow a **strict, stepwise decision ladder**. A new expense, operational complexity, or hiring decision is unlocked **if and only if** the preceding revenue milestone has been reached and sustained.

This leaf provides that ladder. **Every dollar figure in this document is explicitly labeled as an ASSUMPTION in an editable table**, allowing the maintainer to adjust the arithmetic as real-world conversion rates and gross margins are verified.

---

## Current state

Verified against business roadmap:

> [!note]
> All monetary assumptions and unit economics are canonically owned by [`roadmap/money_print/b1-model-and-positioning/06-unit-economics-model.md`](06-unit-economics-model.md); any adjustments to retail margins, token wholesale rates, subscription pricing, or fixed operating overhead must be made there first and inherited here rather than restated locally.

| Metric | Current baseline | Evidence |
|---|---|---|
| **Current MRR** | $0.00 | Pre-launch, unlicensed engine ([`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md)). |
| **First Target** | 100 active free users | Defined in [`roadmap/money_print/b5-go-to-market/02-first-hundred-users.md`](02-first-hundred-users.md). |
| **Inference Proxy Unit Economics** | 25% retail margin baseline (`Wholesale cost / 0.75 = Retail price`, with sensitivity to 35% margin if `b1/06` open question 1 resolves upward) | Canonically modeled in [`b1/06`](06-unit-economics-model.md#L65). Note: this is a 25% margin on retail revenue, which corresponds to a 33.3% markup on wholesale cost. |
| **Fixed Operational Overhead** | ~$200.00 / month ASSUMPTION (itemized) | Canonically modeled in [`b1/06`](06-unit-economics-model.md#L115-L124) ($60 compute, $30 domains/email, $30 observability, $80 compliance/merchant amortized). |
| **Break-Even Volume** | ~19 paying Pro subscribers ASSUMPTION | Canonically computed in [`b1/06`](06-unit-economics-model.md#L128-L129) ($200 overhead / ~$10.60 net contribution margin). |

`UNVERIFIED:` Time to reach $10k MRR for developer CLI tools utilizing an open-core plus metered inference model (indie SaaS benchmarks indicate an average of 9 to 18 months of post-launch iteration).

---

## The revenue milestone ladder

The following table pairs each revenue rung with its required customer count, operational cost impact, and the explicit decision it unlocks or forces:

| Rung | Monthly Recurring Revenue (MRR) | Approximate paying users | Decisions unlocked or forced | Solo maintainer operational state |
|---|---|---|---|---|
| **Rung 0: Baseline** | **$0 / month** | 0 paid<br>(100+ free) | **Unlock:** Free community distribution (`b5/02`). Validate Checkpoint Question 2 ([`roadmap/README.md:421`](../../README.md#L421)). Test offline Tree-sitter scan on 50+ external repos. | 100% time spent on core engine stability and documentation (`b5/03`). Zero billing overhead. |
| **Rung 1: First Proof** | **$1,000 / month ASSUMPTION** | ~55 Pro subscribers<br>at $18/mo ASSUMPTION | **Unlock:** First commercial validation. Comfortably exceeds the 19-subscriber break-even threshold from `b1/06` (~$380/mo net profit after ~$200/mo fixed overhead). Pays for operational SaaS: professional status page ($20/mo ASSUMPTION), error tracking, domain renewals, cloud accounting ledger (`b4/03`).<br>**Force:** Verify proxy token metering and automated reconciliation (`b2/07`). | Support is minimal (~2h/week). Maintainer handles all inquiries personally via email. |
| **Rung 2: Pilot Viability** | **$5,000 / month ASSUMPTION** | ~280 Pro subscribers<br>or 5 Team pilots ASSUMPTION | **Unlock:** Satisfies the revenue condition for Category 08 collaboration in [`roadmap/money_print/b3-hosted-surface/03-team-workspaces.md`](03-team-workspaces.md). Engage corporate attorney to review custom enterprise DPA terms. Register official trademark (`b0/04`).<br>**Force:** Conduct first quarterly tax disbursement audit. | Support expands to ~8h/week. Enforce strict "no private DMs" boundary (`b5/05`). |
| **Rung 3: Full-Time Floor** | **$10,000 / month ASSUMPTION** | ~555 Pro subscribers<br>or 10 Teams ASSUMPTION | **Unlock:** **Full-Time Founder Transition.** Under the blended subscription cohort model in `b1/06` (~$10.60 net contribution margin per $18 subscriber), this yields ~$5,680/mo net profit ASSUMPTION after ~$200 fixed overhead, supporting the maintainer full-time. (Note: if revenue were derived purely from metered token credit sales at the canonical 25% retail margin, gross margin would be $2,500/mo, requiring ~$25,000 MRR to achieve the same net profit).<br>**Force:** Build automated billing anomaly alarms in `b2/05` proxy to prevent negative margin runaway. | Approaching the solo maintainer ceiling (`b6/02`). Support reaches 12–15h/week. |
| **Rung 4: Solo Ceiling** | **$20,000 / month ASSUMPTION** | ~1,110 Pro subscribers<br>or 25 Teams ASSUMPTION | **Unlock:** Satisfies all hiring triggers in [`roadmap/money_print/b6-scale/01-when-to-hire.md`](01-when-to-hire.md). Net profit under blended model reaches ~$11,500/mo ASSUMPTION.<br>**Force:** **THE CRITICAL JUNCTION.** The maintainer must choose: **Option A:** Hire the first Customer Support Engineer contractor to relieve the review bottleneck (`b6/01`), OR **Option B:** Close self-service signups, cap active users, and run as a boutique, high-margin lifestyle business. | Solo operation without hiring is no longer sustainable. Support exceeds 20h/week if hiring is avoided. |
| **Rung 5: Expansion** | **$50,000+ / month ASSUMPTION** | ~2,775+ subscribers<br>or 60+ Teams ASSUMPTION | **Unlock:** Formal SOC 2 Type I audit preparation. Dedicated multi-region inference proxy clusters. Sponsored open-source core maintainer grants.<br>**Force:** Implement multi-person code review and security access controls. | Sustainable small software company (2–3 full-time equivalents). |

---

## Cash allocation model per dollar earned

To ensure solvency, every dollar of gross revenue collected must be allocated according to strict reserve percentages based on revenue type:

### Model A: Pure Metered Token Resale (at canonical 25% retail margin on revenue)
When revenue is derived purely from selling metered inference credits above subscription allowances:
- Formula: `Wholesale cost / 0.75 = Retail price` (a 25% margin on retail revenue, equivalent to a 33.3% markup on wholesale cost).
- **Wholesale Inference COGS (75% ASSUMPTION):** Direct pass-through cost owed to foundation model providers (Anthropic, OpenAI, OpenRouter). Swept immediately to prevent provider debt.
- **Payment Gateway / MoR Fee (5% ASSUMPTION):** Merchant of Record processing charge (`b1/06#L75`).
- **Corporate Tax & VAT Reserve (4% ASSUMPTION):** ~20% of net margin swept to tax holding sub-account (`b4/02`).
- **Operating Reserve & Fixed Overhead (8% ASSUMPTION):** Absorbs ~$200/mo fixed operational costs (`b1/06#L123`) and builds emergency reserves.
- **Founder Draw / Net Profit (8% ASSUMPTION):** Distributable profit to the solo maintainer (~32% of gross margin).
*(Total: 75% + 5% + 4% + 8% + 8% = 100%)*

### Model B: Blended Subscription Cohort Model (canonical from `b1/06#L99-L105`)
When revenue is derived from the $18/mo Pro subscription (where 60% of users are light users consuming only $2.70 of their $10 wholesale credit allowance):
- **Blended Wholesale Token COGS (~42% ASSUMPTION):** Directly derived from the 100-user cohort weighted average in `b1/06#L103` ($1,007.60 wholesale token cost on $2,394.20 total revenue).
- **Payment Gateway / MoR Fee (~8% ASSUMPTION):** ~$1.40 on an $18 transaction (`b1/06#L75`).
- **Corporate Tax & VAT Holding (15% ASSUMPTION):** Swept into segregated tax account (`b4/03`).
- **Operating Reserve & Fixed Overhead (15% ASSUMPTION):** Absorbs ~$200/mo fixed operational costs and accumulates a 6-month runway buffer.
- **Founder Draw / Net Profit (20% ASSUMPTION):** Sustainable founder compensation.
*(Total: 42% + 8% + 15% + 15% + 20% = 100%)*

---

## What done looks like

- [ ] Editable revenue milestone ladder approved and integrated into the company financial plan.
- [ ] Financial accounting system configured to track progress against Rungs 1 through 4.
- [ ] Cash allocation rules enacted in the corporate business bank account via automated sub-account distribution.
- [ ] The decision threshold at Rung 4 ($20k MRR ASSUMPTION) formally acknowledged as the hiring or cap trigger.

---

## Steps

1. **Incorporate Editable Financial Spreadsheet.**
   Create a private spreadsheet modeling: `Active Users * Price * Gross Margin - Fixed Costs = Net Cash Flow`. Align variables with the ASSUMPTION figures in the ladder above.
2. **Review Rung Gates at Quarterly Checkpoints.**
   During each quarterly review ([`roadmap/README.md:414-426`](../../README.md#L414-L426)), evaluate which revenue rung the business currently occupies and whether unlocked decisions may be executed.
3. **Enforce Expense Discipline.**
   Reject any proposed new SaaS subscription or legal contract that belongs to a higher rung than the business has currently achieved and sustained.

---

## In scope

- Defining the six-rung revenue milestone ladder from $0 to $50k+ MRR.
- Pairing specific business decisions with quantitative revenue triggers.
- Modeling the gross revenue cash allocation percentages.
- Linking Rung 4 directly to the solo maintainer ceiling and hiring triggers.

---

## Out of scope

- Building complex equity valuation models for venture fundraising.
- Designing multi-tiered affiliate or referral commission systems.
- Securing commercial bank loans or venture debt.

---

## Gates

1. Revenue milestone ladder committed to `roadmap/money_print/b6-scale/03-revenue-milestones-and-decision-gates.md` with all figures labeled ASSUMPTION.
2. Written confirmation that team collaboration features remain blocked until Rung 2 ($5,000 MRR ASSUMPTION) is reached.
3. Automated cash allocation transfer rules configured in business banking rails.

---

## Traps

| Trap | Guard |
|---|---|
| Unlocking Rung 3 decisions during a Rung 1 revenue spike | A single month with a $10,000 contract is not Rung 3. Milestones must be sustained for 3 consecutive months before unlocking new fixed costs. |
| Treating gross revenue as spendable income | Spending 100% of payouts on personal expenses ignores the 42%–75% ASSUMPTION owed to upstream LLM providers (depending on subscription vs metered overage mix) and statutory tax obligations. Allocate reserves immediately. |
| Refusing to decide at Rung 4 | Stalling at $20k MRR without choosing between hiring or capping customers leads inevitably to burnout and product decline. Make the choice. |

---

## Open questions

None. The financial thresholds and decision gates are explicitly paired and editable.

---

## Session brief

```xml
<task>
In roadmap/money_print/b6-scale/03-revenue-milestones-and-decision-gates.md, construct the revenue milestone ladder and operational decision gates for Kaioken.

Document:
1. The six revenue rungs (Rung 0: $0 baseline -> Rung 1: $1k MRR -> Rung 2: $5k MRR -> Rung 3: $10k MRR -> Rung 4: $20k MRR -> Rung 5: $50k+ MRR).
2. Pair every rung with the exact operational decision it unlocks or forces (e.g. Rung 2 unlocks team pilot reviews per b3/03; Rung 4 forces the hire-or-cap decision per b6/01 and b6/02).
3. Label EVERY number as an ASSUMPTION in an editable table.
4. Establish the cash allocation reserve formula (distinguishing Model A: pure metered token credit resale at 25% retail margin / 75% COGS vs Model B: blended subscription cohorts at ~42% COGS from b1/06).
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Roadmap §11 checkpoint rhythm, dependencies on b1/06 and b3/03, and b6/01 hiring thresholds.
- INFERENCES: Why bootstrapping requires locking capital expenditures strictly behind sustained revenue floors.
- OPEN QUESTIONS: Periodic revisions to unit economic assumptions as model token prices evolve.
</research_mode>

<verification_loop>
Verify cross-references to roadmap/README.md line 421, b3/03, and b6/01.
Confirm that EVERY numerical price or revenue target is labeled with ASSUMPTION.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b6-scale/03-revenue-milestones-and-decision-gates.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) the six-rung revenue ladder table, (2) cash reserve allocation formula, (3) operational failure guards, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
