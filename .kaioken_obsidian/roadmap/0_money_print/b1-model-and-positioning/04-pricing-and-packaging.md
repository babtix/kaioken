# B1-04 · Pricing and packaging

> Define product tiers, feature gating thresholds, and trust-preserving price adjustment policies,
> modeling all dollar numbers as explicit assumptions in an editable packaging matrix.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits maintainer approval of packaging tiers and assumptions) |
| **Size** | S |
| **Depends on** | [`B1-02`](02-choose-the-revenue-model.md), [`B1-03`](03-open-core-boundary.md) |
| **Blocks** | [`B1-06`](06-unit-economics-model.md), [`B2-02`](02-payment-provider-integration.md) |
| **Touches** | Tier definitions, feature entitlement catalogs, pricing terms |
| **Risk** | Medium — pricing too high deters early traction; pricing too low creates unmanageable user volume |
| **Gate-critical** | **Yes — provides the concrete catalog for payment gateway setup** |

---

## Why this exists

Pricing software is not an irreversible permanent decree; it is a hypothesis that must be tested against
market demand and unit economics.

However, changing prices after launch carries severe reputation risk for a developer tool. If early
supporters who took a chance on an unproven product feel cheated by sudden price hikes, feature demotions,
or bait-and-switch tier shifts, community trust is destroyed permanently.

This leaf defines:
1. A **three-tier packaging architecture** that maps directly onto the open-core boundary defined in
   [`B1-03`](03-open-core-boundary.md).
2. **Explicit assumptions** for all dollar values, formatted in an editable table for easy sensitivity analysis.
3. Concrete **grandfathering mechanics** ensuring early paying customers retain their pricing and benefits,
   transforming price changes into community loyalty events rather than PR disasters.

---

## Current state

Verified repository technical gating points:
- Feature gates will attach to entitlement checks in `apps/cli/src/` and `ide_kaioken/` via [`B2-03`](03-entitlements-and-license-keys.md).
- Model routing in `kaioken_v2/packages/model/` can direct calls to local BYOK endpoints or managed proxy URLs.
- No commercial pricing table or subscription tier currently exists in the codebase.

---

## The packaging tiers (editable assumptions table)

> [!important] All numbers below are explicitly labeled ASSUMPTION.
> They are illustrative baseline estimates designed to be updated as real conversion data and provider
> wholesale rates evolve.

| Tier | Price (`ASSUMPTION`) | Target Persona | What is Included | What is Gated |
|---|---|---|---|---|
| **Community** | **$0** (Free Forever) | Solo developer, open-source contributor | • Full CLI & TUI suite<br>• Local AST codebase scanning<br>• Local wiki generation<br>• Unlimited local BYOK inference<br>• Local background daemon | • Hosted proxy access<br>• Cloud daemon runners<br>• Team synchronized wikis<br>• Private registry publishing |
| **Pro Developer** | **$18 / month**<br>*(or $180/yr)* | Professional engineer, systems architect | • Everything in Community<br>• **$10 monthly credit allowance** for managed premier inference<br>• 1 Cloud background daemon (repo sync)<br>• Hosted web documentation portal<br>• Standard email support | • Team workspace sharing<br>• Centralized org billing<br>• Custom enterprise SLA |
| **Team / Org** | **$45 / seat / mo**<br>*(min 3 seats)* | Engineering teams, tech leads, enterprises | • Everything in Pro<br>• **$25 monthly credit allowance** per seat for pooled inference<br>• Unlimited cloud repo daemons<br>• Shared private team registry<br>• Centralized admin & billing<br>• Priority 24h issue triage SLA | • Bespoke on-prem enterprise deployments |
| **Inference Credit Add-on** | **$10 / pack**<br>*(metered)* | Pro & Team users who exhaust monthly allowances | • Metered top-up credits sold at **25% retail markup** over wholesale model rates<br>• Never expire while subscription is active | • Requires active Pro or Team subscription |

---

## Grandfathering mechanics: how to change prices without breaking trust

When the project matures, operational costs or feature expansion will inevitably require price adjustments.
To execute price increases without alienating early adopters, Kaioken adopts the **Stripe / GitHub Early-Adopter Covenant**:

1. **The Lifetime Legacy Guarantee:** Any customer who subscribes during Phase B1/B2 retains their initial
   monthly subscription rate for as long as their subscription remains continuously active ("grandfathered in").
2. **Never Demote Free Features to Paid:** Features that were released as open-source in Community tier
   will never be reclassified into a paid tier in future releases. Monetization moves forward with new
   cloud capabilities, never backward into existing local code.
3. **60-Day Advance Notification:** Any change to metered inference markups or plan allowances must be
   communicated at least 60 calendar days in advance via email and CLI terminal banners.
4. **Annual Lock-in Option:** When a price increase is announced, existing monthly users are given a
   30-day window to lock in the legacy rate for an entire year via annual billing.

---

## What done looks like

- [ ] Maintainer reviews and approves the three-tier packaging model.
- [ ] Product feature matrix is cross-referenced against [`B1-03`](03-open-core-boundary.md) to ensure
      no local offline features are paywalled.
- [ ] Grandfathering policy is formally adopted and committed to customer-facing documentation.
- [ ] Tier names and SKU identifiers are formalized for the payment provider catalog in
      [`B2-02`](02-payment-provider-integration.md).

---

## Steps

1. **Review competitor parity:** Compare the `$18/month` Pro assumption against Cursor (`UNVERIFIED:` ~$20/mo)
   and GitHub Copilot (`UNVERIFIED:` ~$10–$19/mo).
2. **Audit credit allowance arithmetic:** In [`B1-06`](06-unit-economics-model.md), verify that the
   `$10` included credit allowance on an `$18` subscription leaves an adequate gross margin buffer.
3. **Draft the Customer Terms of Service section on pricing:** Formulate the legal covenant guaranteeing
   grandfathered pricing.
4. **Record sign-off:** Commit approved assumptions table.

---

## In scope

- Defining subscription tiers and feature matrices.
- Establishing credit allowance structures.
- Formalizing customer-trust price change and grandfathering policies.

---

## Out of scope

- Setting up Stripe Products, Prices, and Coupons via API (covered in [`B2-02`](02-payment-provider-integration.md)).
- Implementing in-app paywall UI modals or upgrade banners.
- Custom enterprise negotiated contracts.

---

## Gates

1. An approved, committed packaging table with all dollar figures explicitly designated as `ASSUMPTION`.
2. Written adoption of the four-point grandfathering rules committed to repository documentation.

---

## Traps

| Trap | Guard |
|---|---|
| Hiding price increases | Stealth price hikes cause immediate developer backlash on social channels. Always give 60 days notice and grandfather active users |
| Over-complicating tiers | Do not create five different tiers. Three tiers (Free, Pro, Team) are sufficient for 95% of developer SaaS |
| Uncapped included usage | Never include "unlimited" inference in Pro. The included allowance must be capped at a specific dollar/token sum |

---

## Open questions

1. **Should the Pro tier launch with an introductory discount?**
   - *Recommendation:* Launch Pro at `ASSUMPTION:` `$12/month` for the first 100 paying users as a
     "Founding Member" lifetime grandfathered rate, generating early urgency and testimonials.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, define the packaging tiers, feature gates, and
price adjustment policies for Kaioken:

1. Detail the three tiers: Community (Free), Pro Developer ($18/mo ASSUMPTION), and Team ($45/seat/mo ASSUMPTION).
2. Define the included inference credit allowances and metered top-up mechanics.
3. Document the four-point grandfathering covenant to guarantee customer trust during future price adjustments.
4. Verify that all dollar values are explicitly labeled ASSUMPTION in an editable markdown table.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: Commercial packaging tiers in competitive landscape (Cursor, Kilo Code, OpenCode).
- INFERENCES: Developer price sensitivity around ~$15-$20/month subscription thresholds.
- OPEN QUESTIONS: Whether to offer annual billing at launch (e.g. 2 months free).
</research_mode>

<verification_loop>
Verify that all pricing numbers carry explicit ASSUMPTION labels.
Verify that Community tier retains 100% of local offline capabilities without gating.
Confirm no source files are modified.
</verification_loop>

<action_safety>
Do NOT create live Stripe billing SKUs or commit financial credentials.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) finalized packaging table, (2) grandfathering covenant draft, (3) validation that
free tier is uncompromised, (4) maintainer sign-off prompt.
</structured_output_contract>
```
