# B2-07 · Billing test and reconciliation

> Test money without moving money using sandbox provider modes, and execute a 30-minute monthly reconciliation
> runbook comparing gateway receipts, internal proxy ledgers, and provider invoices.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | [`B2-02`](02-payment-provider-integration.md), [`B2-04`](04-usage-metering.md), [`B2-05`](05-inference-proxy-and-margin.md) |
| **Blocks** | Phase B5 (Customer Operations), Launching Paid Gateway Keys |
| **Touches** | Reconciliation scripts, sandbox test fixtures, monthly financial runbooks |
| **Risk** | Medium — un-reconciled financial flows conceal billing leaks or provider overcharges |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

A developer tool that charges for subscriptions and resells API tokens cannot be verified simply by
checking that unit tests pass. You must prove two operational capabilities before launching:
1. **Testing money without moving money:** Validating that checkout flows, webhook provisioning, credit
   deductions, and cancellations function end-to-end in sandbox mode with zero real credit cards charged.
2. **Monthly financial reconciliation:** Verifying that the money collected from customers actually exceeds
   the money paid to upstream providers.

For a solo maintainer, financial auditing cannot be a week-long manual spreadsheet nightmare (violating Rule 1).
It must be a **scripted, 30-minute monthly check** that compares:
- What the payment processor paid you (Net Revenue).
- What your internal proxy ledger recorded (`B2-04`).
- What Anthropic and OpenAI actually billed you (Wholesale Invoices).

If these three numbers do not align, either your proxy is leaking unmetered tokens, or an upstream provider
is overbilling you.

---

## Current state

Verified repository state:
- Zero sandbox payment testing exists in the repo.
- No automated script compares database token logs against external provider invoices.
- Offline tests in `kaioken_v2/` must remain completely isolated from sandbox or live billing APIs.

---

## Testing money without moving money

The sandbox verification harness validates the entire financial lifecycle using MoR test cards:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                        END-TO-END SANDBOX TEST SUITE                                   │
│                                                                                        │
│ 1. Account Signup: Register test user via CLI device flow (`B2-01`)                    │
│ 2. Upgrade to Pro: Trigger `kaioken upgrade`, complete checkout via MoR sandbox        │
│ 3. Webhook Delivery: Simulate `subscription.created` webhook; verify DB status = "pro" │
│ 4. Inference Execution: Run 5 agent turns through proxy; verify token deduction        │
│ 5. Allowance Exhaustion: Consume $10 allowance; verify subsequent run returns 402      │
│ 6. Top-Up Purchase: Purchase $10 credit pack; verify proxy immediately unblocks        │
│ 7. Refund / Cancellation: Simulate refund; verify downgrade to Community tier          │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## The three-way reconciliation formula

On the 1st of every calendar month, the maintainer reconciles three independent data sources:

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│   A. Net Merchant      │      │   B. Internal Ledger   │      │   C. Provider Invoices │
│      Payout (MoR)      │      │      Recorded Margin   │      │      (Wholesale Cost)  │
│ Gross Revenue - MoR Fee│      │ Retail Billed - Calc'd │      │ Anthropic + OpenAI     │
│                        │      │ Wholesale Token Cost   │      │ Monthly Invoices       │
└───────────┬────────────┘      └───────────┬────────────┘      └───────────┬────────────┘
            │                               │                               │
            └───────────────────────────────┼───────────────────────────────┘
                                            ▼
                           THE MONTHLY RECONCILIATION EQUATION
                     Actual Gross Margin = Net Payout (A) - Invoices (C)
                                            ▲
                     Discrepancy Check: | Invoices (C) - Ledger Cost (B) | < 3%
```

> [!important] Discrepancy Alert Threshold: > 3%
> If actual provider invoices (C) exceed recorded wholesale ledger cost (B) by more than **3%**,
> a financial leak exists: either streaming chunks are dropping usage trailers (Gap G-4),
> an unauthenticated proxy route is exposed, or retries are consuming unmetered tokens.

---

## The solo-operator 30-minute monthly runbook

To ensure the maintainer does not drown in financial bookkeeping, this checklist is executed monthly:


### Monthly Financial Health Runbook (30 Minutes on the 1st of the Month)

- [ ] 1. Export MoR Monthly Statement:
      Download payout CSV from Paddle / Lemon Squeezy dashboard for the previous month.
      Record Net Revenue: `$____________`.

- [ ] 2. Export Provider Invoices:
      Download monthly PDF invoices from Anthropic Console and OpenAI Platform.
      Record Total Wholesale API Cost: `$____________`.

- [ ] 3. Run Automated Reconciliation Script:
      From `kaioken_v2/`, execute:
      `npm run reconcile -- --month 2026-08 --invoices anthropic.json,openai.json`

- [ ] 4. Verify Ledger Discrepancy:
      Confirm that discrepancy between recorded ledger tokens and provider invoices is < 3%.
      If > 3%, check `accuracy: "unmeasured"` counts in proxy logs.

- [ ] 5. Calculate Realized Gross Margin:
      `Realized Gross Margin = (Net Revenue - Provider Cost) / Net Revenue`.
      Confirm margin is >= 30%. If < 25%, review heavy-user cohort quotas.

- [ ] 6. Commit Summary Report:
      Save sanitized summary to `roadmap/money_print/financials/YYYY-MM.md`.

---

## What done looks like

- [ ] Sandbox test script implemented in `kaioken_v2/scripts/test-billing-sandbox.mjs`:
  - Simulates full user lifecycle against MoR sandbox endpoints.
  - Asserts that zero real money moves during automated test execution.
- [ ] Automated reconciliation CLI tool in `kaioken_v2/scripts/reconcile.mjs`:
  - Ingests provider invoice totals and internal database ledger sums.
  - Outputs gross margin, net profit, and discrepancy percentages.
- [ ] 30-minute monthly runbook published and committed to the business path documentation.
- [ ] Engine tests remain 100% green and offline.

---

## Steps

1. **Write Sandbox Lifecycle Runner:** Create `scripts/test-billing-sandbox.mjs` executing simulated
   webhook payloads and assertions.
2. **Implement Reconciliation Script:** Write `scripts/reconcile.mjs` computing the three-way variance equation.
3. **Document Runbook:** Integrate the 30-minute checklist into Phase B5 operations documentation.
4. **Verify Engine Gates:** Run `npm test` and `npm run typecheck`.

---

## In scope

- Sandbox testing automation scripts.
- Reconciliation math and reporting CLI script.
- Monthly operator runbook documentation.

---

## Out of scope

- Filing corporate tax returns or hiring CPAs (Phase B4).
- Integrating enterprise ERP systems (NetSuite / QuickBooks).
- Automated banking wire transfer reconciliation.

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Dry-run reconciliation test:
```bash
node scripts/reconcile.mjs --dry-run
```

Offline verification:
```bash
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Never reconciling wholesale bills | It is easy to celebrate revenue (`ASSUMPTION:` $5,000) while provider invoices quietly exceed it (`ASSUMPTION:` $6,200). Always reconcile monthly |
| Manual spreadsheet accounting | Do not build manual spreadsheets. Use `node scripts/reconcile.mjs` to automate the comparison in seconds |
| Letting sandbox tests hit live APIs | Ensure sandbox tests use explicit mock flags and sandbox API keys. Never test in production |

---

## Open questions

1. None. The reconciliation formula is standard financial best practice for compute resellers.

---

## Session brief

```xml
<task>
In kaioken_v2/scripts/, implement sandbox billing testing and financial reconciliation tooling:

1. Implement kaioken_v2/scripts/test-billing-sandbox.mjs:
   - Simulates complete subscription lifecycle: checkout -> webhook -> entitlement -> deduction -> cancellation.
   - Uses mock/sandbox provider payloads; verifies no real payment calls occur.
2. Implement kaioken_v2/scripts/reconcile.mjs:
   - CLI script that accepts provider invoice sums and compares them to internal ledger events.
   - Computes: Net Margin = Net Payout - Wholesale Cost.
   - Calculates Discrepancy % = |Wholesale Invoices - Ledger Cost| / Wholesale Invoices.
   - Flags alert if discrepancy > 3%.
3. Add "test:billing": "node scripts/test-billing-sandbox.mjs" to package.json.
4. Add "reconcile": "node scripts/reconcile.mjs" to package.json.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node scripts/reconcile.mjs --dry-run
  node apps/cli/dist/bin.js scan --root .
Confirm all tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT connect to live payment provider APIs.
Do NOT modify core engine packages.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) sandbox testing script summary, (2) reconciliation script implementation,
(3) test suite execution results, (4) verification of offline determinism.
</structured_output_contract>
```
