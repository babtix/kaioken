# B1-06 · Unit economics model

> Build the unit economic arithmetic over stated assumptions — modeling provider costs, token volumes,
> heavy-user tail risk, and proving that hard quotas are an engineering prerequisite to prevent negative gross margins.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B1-02`](02-choose-the-revenue-model.md), [`B1-04`](04-pricing-and-packaging.md) |
| **Blocks** | [`B2-04`](04-usage-metering.md), [`B2-05`](05-inference-proxy-and-margin.md), [`B2-06`](06-quotas-and-abuse-controls.md) |
| **Touches** | Unit economic formulas, quota limits, proxy margin configurations |
| **Risk** | High — without hard quotas, heavy users incur negative gross margins that scale with adoption |
| **Gate-critical** | **Yes — provides mathematical constraints for Phase B2 quota engineering** |

---

## Why this exists

A software business that resells third-party computing capacity (specifically foundation model tokens)
is a **reseller carrying wholesale cost risk**.

Unlike traditional pure-software SaaS where the marginal cost of serving an additional user is near zero,
every generative AI agent run incurs a direct, unrecoverable cash liability paid to upstream providers
(Anthropic, OpenAI, Google, OpenRouter).

In an autonomous repository knowledge engine where the Multiplier dial ([`packages/model/src/index.ts:32-57`](../../../kaioken_v2/packages/model/src/index.ts#L32-L57))
expands generative output, repair passes, and critique passes from ×1 up to ×10:
> **An unconstrained heavy user will generate massive negative gross margins.**
> If a developer paying `$18/month` runs multiple daily ×10 multi-pass wiki compilation and agent loops,
> they will consume `$100+` in wholesale API costs. Under an unmetered or loosely capped plan, every
> new heavy user accelerates insolvency.
> 
> Therefore, **quotas and spend ceilings are not finance niceties or marketing options: they are hard
> engineering prerequisites.** This arithmetic model proves why [`B2-06`](06-quotas-and-abuse-controls.md)
> and [`M7-05`](../../m07-permissions-and-sandboxing/05-resource-ceilings.md) must fail closed.

---

## Current state

Verified repository constants and cost mechanics:
- `kaioken_v2/packages/model/src/index.ts:32-57`: `MIN_MULTIPLIER = 1`, `MAX_MULTIPLIER = 10`, `BREADTH_THRESHOLD = 5`.
  Multiplier scales leaf modules, key points, declarations per file, repair passes, and critique passes.
- `kaioken_v2/apps/cli/src/model.ts:200-204`: Documents Gap **G-4** — model catalog pricing is static snapshot,
  and synthesized models warn that token/cost figures may be wrong.
- Reselling unmeasured or approximate tokens without strict fail-closed accounting guarantees financial leakage.

---

## The editable assumptions table

> [!important] All numbers below are explicitly designated as ASSUMPTION.
> This is a mathematical sensitivity model, not a revenue forecast. All calculations can be re-run
> by adjusting these parameters.

### 1. Wholesale Model Pricing Assumptions (`ASSUMPTION`)
Based on typical premier foundation model rates (e.g. Claude 3.5 Sonnet / GPT-4o class):

| Metric | Value (`ASSUMPTION`) | Notes |
|---|---|---|
| Wholesale Input Token Price | **$3.00 / million tokens** | Prompt caching can reduce this; modeled at full rate |
| Wholesale Output Token Price | **$15.00 / million tokens** | Completion tokens dominate agent generation spend |
| Blended Wholesale Rate | **~$6.00 / million tokens** | Assuming ~3:1 input-to-output token ratio across sessions |
| Retail Proxy Markup Margin | **25%** | Wholesale cost / 0.75 = Retail price charged to user credits |

### 2. Retail Packaging Assumptions (`ASSUMPTION`)
From [`B1-04`](04-pricing-and-packaging.md):

| Tier Parameter | Value (`ASSUMPTION`) | Notes |
|---|---|---|
| Monthly Pro Subscription Fee | **$18.00 / month** | Collected via payment processor (MoR fee deducted separately) |
| Included Wholesale Credit Allowance | **$10.00 / month** | Maximum wholesale API spend absorbed by subscription |
| Net Subscription Margin (Floor) | **$8.00 / month** | Guaranteed base margin before payment processing fees |
| Payment Gateway / MoR Fee | **5% + $0.50** | `ASSUMPTION:` ~$1.40 on an $18 transaction |

---

## Session token arithmetic: cost per run by multiplier

How a single execution varies depending on the Multiplier dial:

| Multiplier Setting | Description | Estimated Tokens (Input + Output) | Wholesale Cost per Run (`ASSUMPTION`) | Retail Price to User (`ASSUMPTION`) |
|---|---|---|---|---|
| **×1 (Fast Scan)** | 1 pass, single module overview | ~15,000 tokens | **$0.09** | $0.12 |
| **×3 (Standard Work)** | Breadth mode, 2-3 modules, 1 repair pass | ~60,000 tokens | **$0.36** | $0.48 |
| **×5 (Deep Analysis)** | Threshold mode, full module cards, critique pass | ~180,000 tokens | **$1.08** | $1.44 |
| **×10 (Max Rigor)** | Multi-pass critique, repair, full AST synthesis | ~550,000 tokens | **$3.30** | $4.40 |

Notice: A single ×10 run costs `$3.30` in direct wholesale cash. Running three ×10 runs exhausts the entire
`$10.00` monthly wholesale allowance.

---

## User cohort economics: the negative-margin heavy user tail

Modeling 100 hypothetical paying Pro users across three typical usage cohorts:

| Cohort | % of Base | Usage Behavior | Monthly Wholesale Cost (`ASSUMPTION`) | Subscription Revenue | Net Margin per User (`ASSUMPTION`) | Cohort Total Margin |
|---|---|---|---|---|---|---|
| **Light User** | 60% | 10 ×1 runs, 5 ×3 runs per month | **$2.70** | $18.00 | **+$15.30** *(85%)* | +$918.00 |
| **Average User** | 30% | 20 ×3 runs, 4 ×5 runs per month | **$11.52** *(capped at $10 + $1.52 overage)* | $18.00 + $2.03 overage | **+$8.51** *(42%)* | +$255.30 |
| **Heavy User (WITH Quota)** | 10% | Daily ×5 and ×10 runs (30 runs/mo) | **$10.00** allowance + **$40.00** metered overages | $18.00 sub + **$53.33** overage fees | **+$21.33** *(30%)* | +$213.30 |
| **Heavy User (WITHOUT Quota - Uncapped Trap)** | *Danger* | 30 ×10 runs on flat subscription | **$99.00** | $18.00 | **-$81.00 (NEGATIVE 450%)** | **-$810.00 (Loss!)** |

> [!danger] The Uncapped Flat-Rate Death Spiral
> Look at the bottom row. Without a hard credit allowance and metered overage quotas, **just 10 heavy users
> erase the profit generated by 60 light users and push the entire business into net cash loss.**
> This is why flat "unlimited" plans in agentic developer tools are suicidal for a solo maintainer.

---

## Break-even analysis for a solo operator

Fixed monthly operational overhead estimates:

| Operational Item | Monthly Cost (`ASSUMPTION`) |
|---|---|
| Hosted proxy & database compute (Fly.io / Render / Supabase) | **$60.00** |
| Domain names, SSL, DNS, and transactional email (Postmark) | **$30.00** |
| Sentry / logging / observability | **$30.00** |
| Merchant account & legal entity compliance amortized | **$80.00** |
| **Total Fixed Monthly Overhead** | **~$200.00 / month** |

### Break-Even Calculation
- Net contribution margin per Pro subscriber after payment processing fees:
  `$18.00 - $1.40 (MoR) - $6.00 (blended wholesale token cost) = ~$10.60 per user.`
- **Break-Even Volume:**
  `$200.00 / $10.60 = 19 paying Pro subscribers.`
- At **50 paying Pro subscribers**, the project generates `~$330/month` in pure profit after covering all
  compute, tooling, and token costs.
- At **250 paying Pro subscribers**, the project generates `~$2,650/month` in recurring profit, supporting
  part-time solo operations.

---

## What done looks like

- [ ] Complete arithmetic model committed with all variables labeled `ASSUMPTION`.
- [ ] Explicit mathematical proof documented showing that unconstrained heavy users produce negative gross margins.
- [ ] Hard quota requirements codified for implementation in [`B2-06`](06-quotas-and-abuse-controls.md).
- [ ] Clear break-even subscriber threshold identified (~19 subscribers under stated assumptions).

---

## Steps

1. **Verify wholesale rates against live provider cards:** Check current Anthropic/OpenAI pricing cards
   (`UNVERIFIED:`) and update input/output token pricing assumptions.
2. **Review Multiplier token footprint:** Run sample scans in `kaioken_v2/` across ×1, ×3, ×5, and ×10 to
   validate actual token counts against the model's assumptions.
3. **Formalize quota handoff to B2-06:** Provide the exact allowance parameters (`$10` wholesale monthly cap)
   to the billing engineering specification.

---

## In scope

- Unit economic formulas for token proxying and subscription tiers.
- Heavy-user tail risk analysis.
- Break-even fixed cost modeling.

---

## Out of scope

- Multi-year financial forecasting or venture capital pro formas.
- Real-time accounting database design.
- Currency conversions outside USD.

---

## Gates

1. A fully calculated, mathematically consistent unit economics model committed to this file.
2. The mathematical requirement for hard spend ceilings transferred to [`B2-06`](06-quotas-and-abuse-controls.md).

---

## Traps

| Trap | Guard |
|---|---|
| Relying on user "fair use" goodwill | Heavy users do not read fair-use paragraphs. Hard programmatic quotas are the only reliable defense |
| Confusing revenue with gross margin | Reselling $100 in tokens at a 20% margin is $20 in profit, not $100. Never size the business on gross GMV |
| Assuming prompt caching is always available | Always model unit economics at un-cached worst-case rates; treat cache discounts as bonus margin |

---

## Open questions

1. **Should the retail proxy markup margin be 25% or 35%?**
   - *Recommendation:* Start at **25%** markup to remain competitive with direct provider rates while
     covering credit card interchange fees and proxy compute.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, document the unit economics model and gross margin
analysis for Kaioken:

1. Build an editable spreadsheet-style assumptions table modeling:
   - Wholesale token rates ($3/M input, $15/M output ASSUMPTION).
   - Retail proxy markup (25% ASSUMPTION).
   - Token volume per run across Multiplier x1, x3, x5, and x10.
2. Model the three user cohorts (Light, Average, Heavy).
3. Explicitly demonstrate the negative-margin danger of an unconstrained heavy user on a flat subscription (-$81/user loss).
4. Calculate the solo maintainer break-even threshold under $200/mo fixed overhead (~19 Pro users).
5. Ensure all dollar figures carry explicit ASSUMPTION tags.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: packages/model/src/index.ts multiplier bounds; G-4 provider accounting variance.
- INFERENCES: Reselling third-party compute without hard caps leads to runaway liabilities.
- OPEN QUESTIONS: Provider price changes and prompt caching discount percentages over time.
</research_mode>

<verification_loop>
Verify that all calculations in the markdown tables are mathematically consistent.
Confirm all pricing numbers carry ASSUMPTION tags.
Confirm no engine source code is modified.
</verification_loop>

<action_safety>
Do NOT alter engine code or tests.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) unit economics model summary, (2) cohort gross margin table, (3) heavy-user tail risk
warning, (4) break-even subscriber count.
</structured_output_contract>
```
