# B2-02 · Payment provider integration

> Integrate automated subscription and credit checkout workflows, comparing Merchant of Record providers
> against direct gateways and offloading global tax liability for a solo maintainer.

| Field | Value |
|---|---|
| **Status** | `ready` (architecture specified; live keys depend on Phase B4 Entity Decision) |
| **Size** | M |
| **Depends on** | [`B2-01`](01-account-and-identity.md), [`B1-04`](04-pricing-and-packaging.md), Phase B4 (Entity Formation) |
| **Blocks** | [`B2-03`](03-entitlements-and-license-keys.md), [`B2-07`](07-billing-test-and-reconciliation.md) |
| **Touches** | `kaioken_v2/apps/cli/src/commands/billing.ts`, backend checkout webhooks, customer portal |
| **Risk** | High — errors in payment webhook processing disrupt customer access or cause duplicate billing |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

Taking money globally is not just an API call to charge a credit card: **it is a legal and tax nexus event.**

When software is sold to customers across the US, UK, European Union, Japan, and Australia:
- Digital services are subject to destination-based Value Added Tax (VAT), Goods and Services Tax (GST),
  and US State Sales Taxes.
- A business that collects payment directly is legally required to register for VAT in every jurisdiction
  where sales exceed local thresholds, calculate variable local rates, file periodic returns, and remit taxes.
- For a solo maintainer, managing cross-border tax compliance across dozens of tax authorities is a
  fatal administrative sinkhole that violates Operating Rule 1.

Therefore, the choice between a **Merchant of Record (MoR)** and a **Direct Gateway (Stripe)** is the
most critical operational decision in billing engineering.

---

## Current state

Verified repository state:
- Zero payment processing code exists in the repository.
- Checkout workflows will be triggered from the CLI (`kaioken upgrade`) or the web portal.
- Account identity is established via [`B2-01`](01-account-and-identity.md).

> [!important] Accuracy Rule: Vendor Claims & Fees
> All vendor fees, plan terms, and features cited below are marked **`UNVERIFIED:`**.
> Payment provider fee schedules change. All numbers must be confirmed on the vendor's official website
> before contracts are signed.

---

## Merchant of Record (MoR) vs Direct Gateway

| Dimension | Direct Gateway (Stripe Payments + Billing) | Merchant of Record (Paddle / Lemon Squeezy) |
|---|---|---|
| **Vendor Names** | `UNVERIFIED:` Stripe Payments, Stripe Billing, Stripe Tax | `UNVERIFIED:` Paddle Billing, Lemon Squeezy |
| **Legal Seller of Record** | The maintainer's company | **The MoR provider** (Paddle / Lemon Squeezy) |
| **Global Tax Liability (VAT/GST)** | **Maintainer is 100% liable.** Must register and remit in each country | **MoR is 100% liable.** MoR handles all registration, collection, and filing |
| **Invoicing & Compliance** | Maintainer must generate compliant B2B VAT invoices | MoR automatically generates globally compliant tax invoices |
| **Chargeback & Fraud Liability** | Maintainer handles disputes ($15/dispute penalty) | MoR absorbs or assists with fraud detection and disputes |
| **Typical Fee Structure** | `UNVERIFIED:` ~2.9% + $0.30 (payments) + 0.5% (billing) + 0.5% (tax) ≈ **~4.0%** | `UNVERIFIED:` ~5.0% + $0.50 (inclusive of tax handling) ≈ **~5.5%** |
| **Solo Maintainer Verdict** | **Dangerous.** The ~1.5% fee saving is wiped out by a single tax accounting bill | **Strongly Recommended.** Completely eliminates foreign tax liabilities |

**Strategic Decision:** For a solo operator with no full-time accounting department, **a Merchant of Record
is non-negotiable**. The marginal ~1.5% fee premium pays for complete insulation from international tax authorities.

---

## Technical architecture

```
               CHECKOUT & WEBHOOK SUBSCRIPTION LIFECYCLE
┌─────────────────┐       ┌──────────────────────┐       ┌────────────────────────┐
│  Developer CLI  │       │ Kaioken Cloud Server │       │  Merchant of Record    │
│`kaioken upgrade`│       │  (Webhooks Handler)  │       │ (Paddle/LemonSqueezy)  │
└────────┬────────┘       └──────────┬───────────┘       └───────────┬────────────┘
         │ 1. CLI requests checkout  │                               │
         │──────────────────────────>│ 2. Create checkout session    │
         │                           │──────────────────────────────>│
         │                           │ 3. Return hosted checkout URL │
         │                           │<──────────────────────────────│
         │ 4. Opens browser to URL   │                               │
         │<──────────────────────────│                               │
         │                                                           │
         │ (Customer completes payment securely on MoR hosted page)  │
         │                                                           │
         │                           │ 4. POST /webhooks/mor         │
         │                           │<──────────────────────────────│
         │                           │    event: `subscription.created`
         │                           │    status: `active`           │
         │                           │                               │
         │                           │ 5. Provisions Entitlement     │
         │                           │    Updates DB: plan = "pro"   │
         ▼                           ▼    Issues new license key     ▼
```

---

## What done looks like

- [ ] Webhook endpoint implemented in Kaioken cloud server to handle MoR events:
  - `subscription.created` / `subscription.updated`: activates user entitlements.
  - `subscription.cancelled` / `subscription.payment_failed`: initiates grace period or revocation.
  - `order.created` (one-off): credits metered token balances.
- [ ] Webhook signature verification implemented using HMAC SHA-256 to reject forged payloads.
- [ ] Idempotent event processing: ensures duplicate webhook deliveries do not double-credit customers.
- [ ] CLI command `kaioken upgrade`:
  - Generates an authenticated checkout session URL for the active logged-in user.
  - Opens the default browser to complete payment.
  - Polls or listens for entitlement activation.
- [ ] Test suite verifies webhook payload handling across simulated checkout, renewal, and failure events.

---

## Steps

1. **Configure Sandbox Environment:** Set up test accounts in the selected MoR sandbox (Paddle or Lemon Squeezy).
2. **Define Product Catalog in Provider Dashboard:**
   - Create Pro Subscription product (`$18/mo` `ASSUMPTION`).
   - Create Metered Credit Pack product (`$10` one-off `ASSUMPTION`).
3. **Implement Webhook Handler (`server/src/billing/webhook.ts`):**
   - Verify provider signature header using secret key.
   - Parse event types into strongly-typed domain events.
   - Update user entitlement status in database idempotently.
4. **Implement CLI Checkout Trigger (`apps/cli/src/commands/billing.ts`):**
   - Query cloud server for customer portal or checkout link.
   - Launch system browser via `open` package.
5. **Engine Gate Verification:** Verify that `npm run typecheck` and `npm test` remain completely green.

---

## In scope

- Client-side billing command triggers in `kaioken_v2/apps/cli/`.
- Webhook contract definition and signature verification logic.
- Idempotent entitlement update logic.

---

## Out of scope

- Direct credit card form rendering in CLI or desktop app (PCI-DSS violation; always use hosted checkout).
- Establishing corporate bank accounts (Phase B4).
- Manual invoicing workflows for custom enterprise deals.

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific billing integration test:
```bash
npx vitest run apps/cli/test/billing.test.ts
```

Offline verification:
```bash
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Choosing direct Stripe to "save 1.5%" | A solo developer cannot register for VAT in Germany, UK, and 20 US states. Use an MoR |
| Missing webhook signature verification | Never trust an unverified webhook payload. Always compute and verify the HMAC signature |
| Non-idempotent event handling | Webhook providers routinely retry successful webhooks. Use a processed-events deduplication table |
| Processing credit card numbers locally | Never touch raw card data. Always redirect to the MoR hosted checkout page to avoid PCI-DSS scope |

---

## Open questions

1. **Which MoR provider is selected?**
   - *Options:* Paddle vs Lemon Squeezy. Both provide developer-friendly APIs and handle global tax.
   - *Dependency:* Depends on Phase B4's corporate entity domicile and currency preferences.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In kaioken_v2/apps/cli/, design and implement the payment provider checkout trigger and webhook
payload verification interface for a Merchant of Record (MoR) integration:

1. Implement apps/cli/src/billing/mor-webhook.ts:
   - Interface MorWebhookPayload defining subscription.created, subscription.updated, order.created.
   - Function verifyMorSignature(rawBody: string, signature: string, secret: string): boolean.
   - Function handleBillingEvent(event: MorWebhookPayload): Promise<EntitlementUpdate>.
2. Implement apps/cli/src/commands/billing.ts:
   - "kaioken upgrade": retrieves checkout URL for authenticated user and opens browser.
   - "kaioken portal": retrieves billing management link to cancel or update payment methods.
3. Write unit tests in apps/cli/test/billing.test.ts validating:
   - Valid HMAC signature accepted; invalid rejected.
   - Idempotent duplicate event deduplication.
   - Offline safety: billing modules never block offline CLI execution.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Confirm all unit tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT embed live MoR production API keys or webhook secrets.
Do NOT modify core analysis packages (packages/wiki, packages/scan).
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) MoR webhook handling summary, (2) files touched, (3) test suite execution results,
(4) confirmation that no offline commands are affected.
</structured_output_contract>
```
