# B1-02 · Choose the revenue model

> Evaluate the four potential commercial revenue models — metered inference margin, flat seat subscription,
> hosted daemon compute, and hybrid pricing — assessing engineering demands and gross margin risks.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits binding maintainer selection) |
| **Size** | S |
| **Depends on** | [`B1-01`](01-study-the-comparables.md) |
| **Blocks** | [`B1-03`](03-open-core-boundary.md), [`B1-04`](04-pricing-and-packaging.md), [`B1-06`](06-unit-economics-model.md), [`B2-01`](01-account-and-identity.md) |
| **Touches** | Revenue architecture, billing specifications, risk models |
| **Risk** | Strategic — choosing an unhedged flat model risks negative gross margins; an over-complex model adds unmaintainable billing debt |
| **Gate-critical** | **Yes — gates Phase B2 Billing Engineering** |

---

## Why this exists

A developer tool company cannot write billing code without deciding what unit of value is being metered
and charged.

In the AI tooling sector, choosing a revenue model is not merely a marketing preference: **it dictates
your engineering architecture and financial survival**:
- If you sell a flat subscription ($20/month) with unlimited or loosely constrained model calls, a single
  heavy developer running complex background multi-pass reasoning runs (Multiplier ×10) can rack up
  `$150+` in monthly provider API costs, generating **catastrophically negative gross margins**.
- If you sell purely metered inference credits, you eliminate gross margin risk (every token is sold at a
  positive markup), but you introduce purchase friction (developers hate "token anxiety") and turn
  yourself into an infrastructure reseller competing on token margins.
- If you sell hosted daemon compute, you monetize repository synchronization and background knowledge
  compilation, but you must build and operate multi-tenant cloud worker infrastructure that does not exist today.

This leaf lays out the four models with their precise engineering prerequisites and margin risks,
requiring the human maintainer to choose the path.

---

## Current state

Verified repository technical architecture:

| Surface | File Reference | Current Capabilities | Billing Readiness |
|---|---|---|---|
| Model calls | `kaioken_v2/packages/model/src/index.ts:1-23` | Seam for model completion; caller supplies client | Ready for proxy interception (`B2-05`) |
| CLI provider setup | `kaioken_v2/apps/cli/src/model.ts:47-75` | Local API keys stored in user config | Supports free BYOK out of the box |
| Multiplier dial | `kaioken_v2/packages/model/src/index.ts:32-57` | Multiplier ×1 to ×10 expands passes and tokens | High variance in per-session token consumption |
| Resource ceilings | `roadmap/m07-permissions-and-sandboxing/05-resource-ceilings.md` | M7 hard ceiling design | Prerequisite to prevent infinite loop drains |
| Daemon service | `kaioken_v2/apps/cli/src/commands/daemon.ts:164-175` | Local daemon exists; zero cloud daemon exists | Hosted daemons require building cloud infrastructure |

---

## The four models compared

### Model A: Pure Metered Inference Resale (The Kilo Code Pattern)
- **Mechanism:** Users purchase prepaid credit packs (e.g. `$20` for `$20` in inference credits).
  Calls routed through Kaioken's inference proxy are billed at provider wholesale cost plus a retail
  margin (e.g. 25% to 35% margin).
- **Engineering Demands:**
  - Fast, reliable inference proxy with low-latency streaming (`B2-05`).
  - Strict, verified real-time token metering (`B2-04`).
  - Credit deduction and balance check on every request.
- **Gross Margin Risk:** **Near Zero.** Every token sold carries a guaranteed positive markup. You cannot
  lose money on a heavy user.
- **Customer Friction:** Medium-High. Developers worry about depleting balances during long agent loops.

### Model B: Flat Seat Subscription (The Cursor Pattern)
- **Mechanism:** Fixed recurring monthly charge (e.g. `UNVERIFIED:` `$20`/month) granting access to a
  standard allocation of agent turns or requests, with fair-use pooling.
- **Engineering Demands:**
  - Standard recurring subscription billing via Stripe / MoR (`B2-02`).
  - Monthly quota reset mechanisms.
  - Soft or hard monthly usage caps (`B2-06`).
- **Gross Margin Risk:** **High.** A user who runs Kaioken daily at Multiplier ×10 can consume `$50`–`$100`
  in underlying Claude 3.5 Sonnet / GPT-4o tokens, causing negative gross margin unless hard capped.
- **Customer Friction:** **Lowest.** Predictable monthly expense with corporate expense-card appeal.

### Model C: Hosted Background Daemon / Workspace Cloud
- **Mechanism:** Monetize the continuous knowledge graph. The client is free with BYOK; customers pay
  for cloud daemons that monitor GitHub repositories, index new PRs, compute documentation impact,
  and sync shared team wikis.
- **Engineering Demands:**
  - High. Requires cloud container infrastructure, multi-tenant database, secure GitHub App webhooks.
  - Defers revenue until substantial server-side engineering is built.
- **Gross Margin Risk:** Low (standard SaaS compute margins), but high upfront development cost.
- **Customer Friction:** Low for engineering teams; irrelevant for solo developers.

### Model D: The Hybrid Model (Recommended)
- **Mechanism:** Flat base subscription (e.g. `ASSUMPTION:` `$15`–`$20`/month) providing full platform
  access, private team wiki sync, and an included allowance of hosted inference (e.g. `ASSUMPTION:` `$10`
  wholesale value), with metered credit top-ups once the allowance is exhausted. Free tier retains
  unlimited local BYOK.
- **Engineering Demands:** Combines subscription management (`B2-02`) with the proxy quota meter (`B2-05`).
- **Gross Margin Risk:** **Bounded.** The included credit allowance caps monthly provider exposure per seat,
  guaranteeing a positive gross margin on the subscription while overages are billed at a markup.
- **Customer Friction:** Low. Users get predictable pricing with the safety of metered overflow.

---

## Comparison matrix

| Model | Setup Velocity | Upfront Engineering | Gross Margin Safety | Revenue Predictability | Solo Maintainer Fit |
|---|---|---|---|---|---|
| **A · Metered Inference** | Fast | Medium (proxy + meter) | **Guaranteed Positive** | Low (usage fluctuates) | High |
| **B · Flat Subscription** | Fastest | Low (Stripe checkout) | **Dangerous (Negative Tail)** | High (recurring MRR) | Medium (high support risk) |
| **C · Hosted Daemon Cloud** | Slow | Very High (multi-tenant cloud) | High | High | Low (high ops burden) |
| **D · Hybrid (Sub + Metered)** | Fast | Medium-High | **Protected by Quota Cap** | **High** | **Highest** |

---

## What done looks like

- [ ] Maintainer records an explicit, binding selection among Models A, B, C, or D in a written decision.
- [ ] The choice is documented with explicit gross margin protection rules before Phase B2 commences.
- [ ] Product packaging specifications in [`B1-04`](04-pricing-and-packaging.md) and unit economics in
      [`B1-06`](06-unit-economics-model.md) are aligned to the selected model.

---

## Steps

1. **Review unit economics arithmetic:** Examine the break-even models in [`B1-06`](06-unit-economics-model.md)
   to evaluate heavy-user tail risk under flat pricing.
2. **Assess solo operational constraints:** Model C requires multi-tenant container orchestration; Model B
   requires heavy quota enforcement. Model A or D fits a solo maintainer best.
3. **Formulate maintainer decision:** Propose the Hybrid Model (Model D) or Pure Metered (Model A) as the
   primary candidate.
4. **Record decision:** Update status to `done` upon maintainer sign-off.

---

## In scope

- Strategic analysis of monetization mechanisms.
- Risk modeling for gross margin safety.
- Architecture specification for billing requirements.

---

## Out of scope

- Setting final retail dollar price tags (covered in [`B1-04`](04-pricing-and-packaging.md)).
- Implementing proxy code or billing webhooks (covered in Phase B2).
- Building enterprise custom sales collateral.

---

## Gates

1. A written decision committed to this file or `roadmap/money_print/b1-model-and-positioning/`
   explicitly naming the primary revenue model.
2. Written verification of how heavy-user negative gross margin is prevented under the chosen model.

---

## Traps

| Trap | Guard |
|---|---|
| Adopting "unlimited" flat subscriptions | In an agentic tool with automated loops, "unlimited" guarantees bankruptcy from heavy users. Always cap or meter |
| Pure metered pricing without a subscription | Metered-only models suffer from erratic monthly churn and revenue unpredictability. Hybrid provides base MRR |
| Building hosted cloud before proving demand | Do not build complex cloud daemon infrastructure before validating that users will pay for local inference or sync |

---

## Open questions

1. **Which model does the maintainer select?**
   - *Recommendation:* **Model D (Hybrid: Flat Subscription with Capped Inference + Metered Top-ups)**,
     with free unlimited local BYOK.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, analyze the strategic tradeoffs between the four
potential revenue models for Kaioken:
- Model A: Pure Metered Inference (Kilo Code style)
- Model B: Flat Seat Subscription (Cursor style)
- Model C: Hosted Cloud Daemon Infrastructure
- Model D: Hybrid Subscription with Capped Allowance + Metered Top-ups

Synthesize the analysis around Rule 1 (solo maintainer) and the gross margin risk of heavy multi-pass
agent sessions. Present a clear decision brief for maintainer determination.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: packages/model/src/index.ts has multiplier 1-10; G-4 notes provider accounting variance.
- INFERENCES: Heavy users running autonomous loops will cause negative margin on unhedged flat plans.
- OPEN QUESTIONS: Maintainer preference for upfront recurring revenue vs pure utility billing.
</research_mode>

<verification_loop>
Verify that all citations to kaioken_v2/packages/model and M7 resource ceilings are accurate.
Confirm no code or package manifests are altered.
</verification_loop>

<action_safety>
Do NOT configure payment gateway settings or write billing code.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) comparative trade-off summary, (2) margin risk breakdown for each option,
(3) explicit recommendation for the maintainer, (4) maintainer sign-off prompt.
</structured_output_contract>
```
