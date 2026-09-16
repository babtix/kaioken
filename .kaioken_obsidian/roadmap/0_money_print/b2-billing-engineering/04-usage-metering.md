# B2-04 · Usage metering

> Count token consumption accurately enough to bill for it, resolving the collision with Gap G-4
> and establishing a billing-grade, dispute-resistant usage ledger.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B2-01`](01-account-and-identity.md), [`roadmap/gaps/g4-token-and-cost-accuracy.md`](../../gaps/g4-token-and-cost-accuracy.md) |
| **Blocks** | [`B2-05`](05-inference-proxy-and-margin.md), [`B2-06`](06-quotas-and-abuse-controls.md), [`B2-07`](07-billing-test-and-reconciliation.md) |
| **Touches** | `kaioken_v2/packages/model/`, metering ingestion pipeline, user ledger schemas |
| **Risk** | **High — billing customers on inaccurate token counts triggers chargebacks and fraud complaints** |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

You cannot legally or ethically bill a customer on a number you have already documented as sometimes wrong.

This leaf collides directly with **Gap G-4** ([`roadmap/gaps/g4-token-and-cost-accuracy.md`](../../gaps/g4-token-and-cost-accuracy.md)):
> *"pi-ai's bundled model catalog is a snapshot. A model it has not heard of is used anyway, with limits
> cloned from the nearest sibling of the same provider and a warning printed — token and cost figures
> may then be wrong."*

In local developer tooling, an approximate cost meter displaying `~$0.04` in the IDE status bar is a harmless
helpful indicator. In commercial billing, however:
- Deducting real money from a customer's credit card or prepaid credit pack based on estimated or cloned
  token metrics is a **direct violation of merchant terms and consumer protection laws**.
- When an invoice is questioned and the maintainer cannot prove the exact token count with an upstream
  provider receipt, payment processors rule in favor of the customer, slapping the merchant with a
  chargeback fee (typically $15–$25 per dispute).
- Inaccurate metering is the single most common cause of customer churn and refunds in AI developer tools.

This leaf implements **billing-grade usage metering**: a verifiable, append-only usage ledger that bills
**only on provider-verified integer tokens** and provides transparent itemized receipts for every request.

---

## Current state

Verified in `kaioken_v2/apps/cli/src/model.ts:200-204`:
- Synthesized models print: `"Token and cost figures may be wrong."`
- Streaming responses from certain endpoints omit final `usage` payloads.
- No durable database or append-only ledger exists to record token transactions.

---

## The three accounting categories

To eliminate refund liability, the metering engine strictly separates token measurements:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 1. VERIFIED ACCOUNTING (BILLABLE)                                                      │
│ • Upstream provider returned exact prompt_tokens and completion_tokens integers in     │
│   the final response payload or HTTP trailer.                                          │
│ • Upstream request ID (e.g. `req_anthropic_abc123`) is stored in the ledger.           │
│ • Status: ELIGIBLE FOR BILLED DEDUCTION.                                               │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 2. ESTIMATED ACCOUNTING (NON-BILLABLE AT RETAIL)                                       │
│ • Provider pricing or model limits cloned from a sibling; local tokenizer estimation.   │
│ • Status: NOT BILLABLE AS METERED OVERAGE. Billed as $0.00 or absorbed by subscription  │
│   allowance. Customer is warned: "Usage unverified by upstream provider".               │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ 3. UNMEASURED / STREAMING OMISSIONS (SAFETY FAIL-CLOSED)                               │
│ • Provider returned zero usage data (common with broken streaming SSE chunks).         │
│ • Policy: NEVER GUESS TOKENS FOR BILLING.                                              │
│ • The proxy records byte length for internal capacity tracking, but charges the user   │
│   a flat nominal fallback turn fee (explicitly stated in ToS) or treats as zero-cost. │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## Technical architecture: the append-only usage ledger

Every billable inference request processed by the hosted proxy emits an immutable ledger event:

```ts
export interface MeteredUsageEvent {
  eventId: string;              // UUIDv4
  userId: string;               // Customer ID
  timestamp: number;            // UTC millisecond timestamp
  provider: "anthropic" | "openai" | "google";
  model: string;                // e.g. "claude-3-5-sonnet-20241022"
  upstreamRequestId: string;    // Direct provider correlation ID
  promptTokens: number;         // Verified integer
  completionTokens: number;     // Verified integer
  totalTokens: number;
  accuracy: "verified" | "estimated" | "unmeasured";
  wholesaleCostUsd: number;     // Calculated wholesale liability (cents)
  retailPriceUsd: number;       // Calculated customer charge (cents)
  sessionContextId?: string;    // Links to agent run for auditability
}
```

### Ledger Guarantees:
1. **Cryptographic Traceability:** Every event records the `upstreamRequestId`. If a customer disputes a
   charge, the maintainer can query Anthropic or OpenAI logs to prove the exact tokens consumed.
2. **Double-Spend Prevention:** The proxy assigns an idempotent `request_id` header before forwarding.
   Retried client requests cannot trigger multiple ledger deductions for the same generation.
3. **Atomic Balance Deductions:** Credit balance deductions occur in a transactional database transaction
   (`UPDATE users SET credit_balance = credit_balance - event.retailPriceUsd WHERE credit_balance >= event.retailPriceUsd`).

---

## What done looks like

- [ ] Metering module implemented in `kaioken_v2/packages/model/src/metering.ts`:
  - Extracts verified usage tokens from provider response objects.
  - Flags responses without verified tokens as `accuracy: "unmeasured"`.
  - Rejects billing calculations on estimated or unmeasured requests.
- [ ] Ledger client in proxy records structured `MeteredUsageEvent` records for every completion.
- [ ] CLI command `kaioken usage`:
  - Displays current billing cycle usage, remaining credit allowance, and recent transactions.
  - Displays per-session cost breakdown with verified token counts.
- [ ] Unit tests in `packages/model/test/metering.test.ts` proving that:
  - Missing token responses never calculate non-zero billing amounts without explicit verified flags.
  - Token calculations strictly match the unit economics formula from [`B1-06`](06-unit-economics-model.md).

---

## Steps

1. **Implement Usage Extraction in `packages/model/`:**
   - Write standard adapters for Anthropic (`res.usage.input_tokens`, `res.usage.output_tokens`),
     OpenAI (`res.usage.prompt_tokens`, `res.usage.completion_tokens`), and Google (`usageMetadata`).
2. **Implement Fail-Safe Accounting Guard:**
   - If `res.usage` is missing or undefined:
     ```ts
     if (!rawUsage?.promptTokens || !rawUsage?.completionTokens) {
       return { accuracy: "unmeasured", billable: false };
     }
     ```
3. **Connect to Balance Deduction Handler:**
   - Deduct retail price from customer's prepaid balance or monthly allowance.
4. **Implement CLI Usage Reporter:**
   - In `apps/cli/src/commands/usage.ts`, fetch recent usage events and format a clean terminal table.
5. **Engine Gates Verification:** Ensure `npm run typecheck` and `npm test` pass.

---

## In scope

- Usage extraction logic for provider responses in `kaioken_v2/packages/model/`.
- Metered usage event schema definition.
- CLI usage inspection commands.

---

## Out of scope

- Distributed time-series database operations (PostgreSQL / SQLite ledger handles initial volume).
- Generating downloadable PDF invoices (handled by MoR / Paddle).
- Billing third-party API providers for their service outages.

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific metering test:
```bash
npx vitest run packages/model/test/metering.test.ts
```

Offline verification:
```bash
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Billing on word counts or character estimates | Never bill on character heuristics. Only bill on exact token integers returned by provider APIs |
| Discarding upstream request IDs | Always persist `upstreamRequestId`. It is your sole evidence when disputing chargebacks |
| Billing client-reported usage | The client cannot be trusted to report its own usage. Metering must occur strictly on the hosted proxy |
| Rounding fractions to the user's disadvantage | Round token prices down or keep accounting in micro-cents (`$0.000001`) to avoid systematic overcharging claims |

---

## Open questions

1. **How should completely unmeasured streaming requests be handled?**
   - *Recommendation:* Absorb unmeasured requests as a platform operational cost (treat as `$0.00` billed
     to the user) while logging an alert for provider investigation. It protects customer trust and
     eliminates chargeback risks.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In kaioken_v2/packages/model/, implement billing-grade usage metering to resolve the collision with Gap G-4,
ensuring customer billing attaches only to verified provider token counts:

1. Implement packages/model/src/metering.ts:
   - Define interface MeteredUsageEvent:
     { eventId, userId, timestamp, provider, model, upstreamRequestId, promptTokens, completionTokens, accuracy, retailPriceUsd }.
   - Implement extractVerifiedUsage(providerResponse: unknown, provider: string): MeteredUsageResult.
   - Enforce Gap G-4 honesty: if usage metrics are estimated or missing, mark accuracy as "unmeasured"
     and set billable to false.
2. Wire usage extraction into apps/cli/src/model.ts for proxy responses.
3. Add apps/cli/src/commands/usage.ts:
   - "kaioken usage": prints current credit allowance balance and recent itemized sessions.
4. Add unit tests in packages/model/test/metering.test.ts:
   - Verifies exact token integer extraction across Anthropic, OpenAI, and Google formats.
   - Verifies that responses with missing usage fail gracefully and are marked unbillable.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Confirm all tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT guess or estimate token counts for billing purposes.
Do NOT modify local BYOK execution flows.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) metering extraction implementation summary, (2) handling of Gap G-4 unmeasured responses,
(3) test suite results, (4) confirmation of offline test suite health.
</structured_output_contract>
```
