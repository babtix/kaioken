# B3-04 · Uptime, support boundaries, and refund commitments

> Codify a sustainable, legally defensible service promise for a solo maintainer — explicitly rejecting 24/7 SLAs, defining business-hours support channels, and establishing an automated, no-questions-asked refund path.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | [`01-what-gets-hosted.md`](01-what-gets-hosted.md), [`roadmap/money_print/b0-preconditions/05-readiness-bar.md`](05-readiness-bar.md) |
| **Blocks** | [`roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md), [`roadmap/money_print/b5-go-to-market/04-pricing-page-and-checkout.md`](04-pricing-page-and-checkout.md) |
| **Touches** | Terms of Service, Public SLA & Support Policy, Billing Refund Flow |
| **Risk** | Medium. Over-promising on uptime or response times exposes a solo operator to customer chargebacks, consumer fraud claims, and devastating personal burnout. |
| **Gate-critical** | Yes |

---

## Why this exists

A solo software developer cannot operate a 24/7 Network Operations Center (NOC). Promising a 99.9% uptime Service Level Agreement (SLA) means that if the service suffers more than 43 minutes of cumulative downtime in a calendar month, the operator is contractually in breach and liable for financial penalties. When upstream providers (Anthropic, OpenAI, AWS, Cloudflare) suffer widespread outages, a solo maintainer has zero control over time-to-resolution.

Furthermore, promising 1-hour support response times guarantees sleep deprivation and interrupts core engineering work. Operating rule 1 ([`roadmap/README.md:404`](../../README.md#L404)) establishes that review capacity and cognitive focus are the ultimate bottlenecks. Support cannot be allowed to consume the day.

At the same time, charging customers money requires commercial honesty. If a paid service fails to deliver what was promised, customers are entitled to restitution. Precondition leaf [`roadmap/money_print/b0-preconditions/05-readiness-bar.md`](05-readiness-bar.md) explicitly requires that an unambiguous, self-service refund mechanism exist before first revenue.

This leaf establishes what is promised in writing, what is deliberately and explicitly excluded, and how the refund mechanism guarantees fairness without administrative friction.

---

## Current state

Verified against the working tree and business roadmap:

| Domain | Current baseline | Commercial requirement |
|---|---|---|
| **Engine execution** | 100% local, offline-capable CLI commands ([`kaioken_v2/apps/cli/src/main.ts:31-124`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/main.ts#L31-L124)). | Local execution needs zero uptime promise (runs offline on user machine). |
| **Hosted proxy** | Not yet deployed; specified in `b2/05` and `b3/01`. | Only the inference proxy and entitlement checks require an availability commitment. |
| **Support channels** | Public GitHub Issues repository only. | Free users get community triage; paying users need a prioritized private channel. |
| **Refund policy** | Nonexistent (engine currently unlicensed and un-monetized). | Mandatory prerequisite from `b0/05` before accepting payments via Stripe/Paddle (`b2/02`). |

`UNVERIFIED:` Standard chargeback thresholds for digital developer tools under major card network rules (Visa/Mastercard chargeback ratio ceiling is typically 0.9% of transactions).

---

## The written service contract: promised vs refused

| Commitment dimension | What is PROMISED in writing | What is DELIBERATELY REFUSED |
|---|---|---|
| **Availability / SLA** | **Target availability of 99.0%** (~7.2 hours allowable downtime/month). Explicit "Best Effort" standard. Pro-rated billing credit available on request for verified outages exceeding 12 consecutive hours. | **No 99.9% or 99.99% financial SLAs.** No liquidated damages, contractual penalties, or indemnification for lost developer productivity. |
| **Support Channels** | **Asynchronous email ticketing only** (`support@kaioken.dev` or web portal). Ticket history tracked in a lightweight desk (e.g. Plain or Help Scout). | **No live chat, no phone support, and no Discord/Slack emergency paging.** The maintainer is never reachable on-demand. |
| **Response Time Promise** | **First response within 2 business days (48 hours)** during regular business hours (Monday–Friday, excluding regional public holidays). Paid tiers receive queue priority over free issues. | **No 1-hour or same-day response guarantees.** Pager duty during weekends, nights, and vacations is explicitly excluded. |
| **Incident Communication** | **Public, third-party hosted status page** (e.g. Instatus or Better Stack) decoupled from primary infrastructure. Incident notice posted within 2 hours of verified outage. Post-mortem published within 5 business days for major outages (>4 hours). | **No custom per-customer SMS notifications or automated outbound phone alerts.** |
| **Refund Guarantee** | **14-day unconditional money-back guarantee** on initial subscription charges. 100% refund of unused metered token credit balances upon account termination. Self-service "Request Refund" button in billing portal. | **No retroactive refunds for consumed inference tokens** (upstream LLM costs already incurred by the proxy). |

---

## What done looks like

- [ ] A formal `SERVICE-PROMISE.md` (or Public Terms section) drafted with the exact promised and refused terms from the table above.
- [ ] A public status page URL configured and linked from both the website footer and the CLI (`kaioken status --service`).
- [ ] The support workflow configured: `support@kaioken.dev` routes to a dedicated ticketing system with automated auto-responders stating the 48-hour business-day SLA.
- [ ] The self-service refund mechanism implemented in the billing portal (`b2/02` / `b2/07`), allowing users to claim an automated refund within 14 days without manual maintainer intervention.

---

## Steps

1. **Draft the Public Service Commitment Document.**
   Write the legal terms for inclusion in [`roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md):
   - Include the "As Is" and "Best Effort" disclaimers standard for software licenses.
   - Limit liability strictly to the amounts paid by the customer in the preceding 12 months.
2. **Deploy Decoupled Status Page.**
   Set up a free-tier status page on an independent domain (e.g. `status.kaioken.dev` via Instatus, Better Stack, or GitHub Status). Configure automated synthetic uptime probes checking the `/health` endpoint of the inference proxy (`b2/05`).
3. **Configure the Support Triage Workflow.**
   - Free users: Directed to GitHub Issues via `kaioken_v2` issue templates. Community-supported, best-effort triage during release trains.
   - Paid users: Submission via email or in-app link. Priority tag applied automatically based on user entitlement lookup (`b2/03`).
4. **Implement Automated Refund Rails.**
   In the billing portal configuration (`b2/02`):
   - If `account_age <= 14 days` and `refund_requested == true`, trigger Stripe/Paddle API `refunds.create` automatically.
   - Revoke paid entitlements and cancel recurring subscriptions immediately.
   - This eliminates customer support tickets for routine cancellations and prevents chargeback disputes.

---

## In scope

- Defining the public uptime targets and SLA limitations.
- Establishing support channels, business hours, and response time expectations.
- Defining incident response communication protocols.
- Codifying the self-service refund rules required by `b0/05`.

---

## Out of scope

- Negotiating custom enterprise Master Service Agreements (MSAs) or bespoke SLAs.
- 24/7 pager rotation setup (PagerDuty, Opsgenie).
- Live chat widget integration on the marketing website.

---

## Gates

1. A written `SERVICE-PROMISE.md` approved and committed to the repository.
2. Verified automated refund logic configured in the billing integration plan (`b2/07`).
3. Public status page architecture specified and independent of the core inference gateway.

---

## Traps

| Trap | Guard |
|---|---|
| Putting a live Discord link as "Support" | Discord creates an expectation of immediate, real-time responses. Users will ping `@maintainer` at 02:00. Use asynchronous email ticketing for official support. |
| Offering credit card refunds through email requests | Manual refunds require back-and-forth emails, verifying identity, and logging into Stripe. Automate the 14-day refund directly in the billing dashboard. |
| Promising 99.9% uptime when upstream LLMs drop connections | If OpenAI or Anthropic suffers an outage, the Kaioken proxy cannot complete requests. State uptime as "proxy infrastructure availability", excluding upstream model provider downtime. |

---

## Open questions

None. The boundaries of solo maintainer support and uptime are fully defined.

---

## Session brief

```xml
<task>
In roadmap/money_print/b3-hosted-surface/04-uptime-and-support-promise.md, document the formal service promise, support boundaries, and refund commitments for Kaioken.

A solo operator cannot offer a 24/7 SLA. Define:
1. What is promised in writing (99.0% target uptime, best-effort standard) vs what is deliberately excluded (no financial SLAs, no 24/7 NOC).
2. The support channel (asynchronous email ticketing) and response time promise (within 48 business hours).
3. Incident communication via an independent public status page.
4. The unambiguous, self-service refund path mandated by roadmap/money_print/b0-preconditions/05-readiness-bar.md (14-day unconditional refund).
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Requirements from b0/05 readiness bar, local-first engine command surface (apps/cli/src/main.ts), and solo maintainer operating rule 1.
- INFERENCES: Why automated refunds drastically reduce card network chargeback risk for solo developers.
- OPEN QUESTIONS: Exact ticketing software selection (Help Scout, Plain, or Zendesk).
</research_mode>

<verification_loop>
Verify cross-references to roadmap/money_print/b0-preconditions/05-readiness-bar.md and b2/07.
Confirm that no vendor pricing is cited without UNVERIFIED: or ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b3-hosted-surface/04-uptime-and-support-promise.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the service promise, (2) the promised vs refused commitments table, (3) refund policy architecture, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
