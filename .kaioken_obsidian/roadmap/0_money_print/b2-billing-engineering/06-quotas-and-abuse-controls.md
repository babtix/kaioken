# B2-06 · Quotas and abuse controls

> Enforce hard account-level quotas, proxy rate limits, and abuse controls, reusing the client-side resource
> ceiling architecture from Milestone M7 and failing closed whenever spend cannot be measured.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B2-04`](04-usage-metering.md), [`B2-05`](05-inference-proxy-and-margin.md), [`roadmap/m07-permissions-and-sandboxing/05-resource-ceilings.md`](../../m07-permissions-and-sandboxing/05-resource-ceilings.md) |
| **Blocks** | [`B2-07`](07-billing-test-and-reconciliation.md), Paid Customer Launch |
| **Touches** | `kaioken_v2/packages/agent/src/ceilings.ts`, hosted proxy quota middleware |
| **Risk** | **Critical — failure to enforce hard quotas allows runaway sessions to bankrupt the business (negative margin tail)** |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

As mathematically demonstrated in [`B1-06`](06-unit-economics-model.md),
a developer tool that resells third-party AI compute without hard quotas is an insolvency hazard:
- A single user running unconstrained autonomous agent loops at Multiplier ×10 can consume `$80+` in wholesale
  API tokens in a few days. On an unhedged `$18/month` subscription, that single user generates **negative
  450% gross margin**.
- Malicious actors, buggy scripts, or infinite prompt-critique loops can drain entire upstream API credit
  lines in hours if rate limits do not exist.

Furthermore, per **Gap G-4** ([`roadmap/gaps/g4-token-and-cost-accuracy.md`](../../gaps/g4-token-and-cost-accuracy.md)),
provider token accounting can be delayed, estimated, or completely missing.
> **The Fail-Closed Mandate:** If the proxy or client cannot verify the exact cost of an ongoing execution,
> **it must fail closed immediately**. It must never assume unmetered tokens cost `$0.00` and continue spending blind.

Rather than inventing a second, disconnected quota system, this leaf **explicitly reuses and extends the
resource ceiling engine** designed in [`roadmap/m07-permissions-and-sandboxing/05-resource-ceilings.md`](../../m07-permissions-and-sandboxing/05-resource-ceilings.md).

---

## Current state

Verified in the repository:
- `roadmap/m07-permissions-and-sandboxing/05-resource-ceilings.md`: Defines `packages/agent/src/ceilings.ts`
  with `ResourceCeilingConfig` (`maxTurns`, `maxSpendUsd`, `maxWallClockMs`, `strictAccounting`).
- `kaioken_v2/apps/cli/src/agent-host.ts:251-277`: Currently executes the agent loop without turn bounds or cost limits.
- No account-level monthly quota or server-side rate limiter currently exists on the proxy.

---

## The two-tier quota architecture

Protection operates at two synchronized layers:

```
                               THE TWO-TIER QUOTA DEFENSE
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: CLIENT-SIDE SESSION CEILINGS (Milestone M7 Architecture)                      │
│ Implemented in `packages/agent/src/ceilings.ts` & `apps/cli/src/agent-host.ts`         │
│                                                                                        │
│  • Per-Session Turn Limit: Hard stop at N turns (e.g. default 15 turns per run).       │
│  • Per-Session Spend Ceiling: Hard abort if single run exceeds $2.00 in model spend.   │
│  • Per-Session Wall-Clock Timeout: Force abort if turn executes longer than 10 mins.  │
│  • Fail-Closed Policy: Aborts if provider returns unmetered usage under a spend cap.  │
└────────────────────────────────────┬───────────────────────────────────────────────────┘
                                     │ (All client calls pass through proxy)
                                     ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: SERVER-SIDE ACCOUNT QUOTAS & ABUSE LIMITS (Phase B2 Architecture)             │
│ Implemented in Hosted Inference Proxy (`B2-05`)                                        │
│                                                                                        │
│  • Monthly Account Credit Quota: Hard cutoff when user consumes allowance ($10) + top-up│
│  • Token Bucket Rate Limiting: 60 requests/min, 200k tokens/min per user account.      │
│  • Concurrency Ceiling: Max 2 simultaneous streaming runs per personal seat.           │
│  • Automated Abuse Tripwires: Suspends proxy key if >10 consecutive 4xx errors occur.  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## The fail-closed safety policy (Gap G-4)

When checking spend limits:
1. **Verified Accounting:** `cost = (promptTokens * rate) + (completionTokens * rate)`. If `cost > budget`,
   halt execution immediately.
2. **Estimated Accounting (Gap G-4):** When an unrecognised model is requested and rates are cloned from a
   sibling, the tracker multiplies estimated tokens by a **conservative worst-case penalty rate**
   (`$15.00/M tokens`), preventing under-metering.
3. **Unmeasured Accounting (Streaming Omission):** If the provider returns zero usage data:
   - If a financial `maxSpendUsd` or monthly credit cap is active, **the engine fails closed**:
     `"Cannot verify provider spend (Gap G-4). Halting session to prevent financial overage."`
   - Execution is aborted immediately via `agent.abort()`.

---

## What done looks like

- [ ] Client-side ceiling integration in `kaioken_v2/packages/agent/src/ceilings.ts` (sharing implementation
      with M7-05):
  - Enforces `maxTurns`, `maxSpendUsd`, and `maxWallClockMs`.
  - Directly terminates agent execution when tripped.
- [ ] Server-side quota middleware in hosted proxy (`B2-05`):
  - Checks user's remaining monthly balance before routing to upstream providers.
  - Returns `HTTP 402 Payment Required` with `{ error: "quota_exceeded", remainingCredits: 0 }`.
- [ ] Rate-limiting middleware:
  - Enforces 60 requests/minute and 2 concurrent streams per user ID.
  - Returns `HTTP 429 Too Many Requests` with standard `Retry-After` headers.
- [ ] Unit tests in `packages/agent/test/ceilings.test.ts` and proxy test suite:
  - Validates hard abort at exact dollar budget threshold.
  - Validates fail-closed behavior when token metrics are missing.
  - Validates proxy rejection when credit quota is zero.

---

## Steps

1. **Synchronize with Milestone M7:** Import or implement `ResourceCeilingTracker` in
   `kaioken_v2/packages/agent/src/ceilings.ts` matching the M7-05 specification.
2. **Wire Ceilings into Agent Host:**
   - In `apps/cli/src/agent-host.ts`, instantiate `ResourceCeilingTracker` on every session.
   - Attach abort listeners so ceiling trips terminate active child processes cleanly.
3. **Implement Server-Side Quota Middleware:**
   - In proxy request handler, query user balance in Redis / database.
   - If `balance <= 0`, reject immediately before calling Anthropic/OpenAI.
4. **Implement Token Bucket Rate Limiter:**
   - Implement lightweight memory or Redis sliding-window counter.
5. **Verify Engine Gates:** Run `npm test` and `npm run typecheck`.

---

## In scope

- Client-side session spend and turn ceilings in `packages/agent/`.
- Server-side account quota and rate limiting rules for hosted proxy.
- Fail-closed enforcement for Gap G-4.

---

## Out of scope

- IP-based DDoS mitigation (handled at edge by Cloudflare).
- Custom per-user negotiated enterprise quota exceptions.
- CAPTCHA challenges in the terminal.

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific ceiling tests:
```bash
npx vitest run packages/agent/test/ceilings.test.ts
```

Offline verification:
```bash
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Relying on client self-reporting for quotas | Never trust client spend reporting. Server-side proxy must independently reject requests when quota is zero |
| Failing open on missing token counts | If you cannot measure what a run costs, you must fail closed. Never assume missing tokens cost $0 |
| Soft "advisory" ceilings | Agents ignore soft prompt advice. The ceiling must terminate execution programmatically via process abort |
| Building duplicate ceiling systems | Reuse `packages/agent/src/ceilings.ts` directly between M7-05 and B2-06 |

---

## Open questions

1. None. The necessity of hard fail-closed quotas is mathematically established in B1-06.

---

## Session brief

```xml
<task>
In kaioken_v2/packages/agent/ and apps/cli/, implement hard resource ceilings and quota enforcement,
reusing the M7-05 ceiling architecture and ensuring fail-closed behavior on unmeasured models (Gap G-4):

1. Implement kaioken_v2/packages/agent/src/ceilings.ts:
   - Define interface ResourceCeilingConfig:
     { maxTurns?: number; maxSpendUsd?: number; maxWallClockMs?: number; strictAccounting?: boolean }.
   - Implement class ResourceCeilingTracker:
     Tracks turns, tokens, and USD spend; throws or signals CeilingBreach on limit breach.
   - Enforce Gap G-4 fail-closed rule: if maxSpendUsd is set, but cost accounting is unmeasured or
     pricing is missing, reject run with CeilingBreach("accounting_unavailable").
2. Wire ceiling into kaioken_v2/apps/cli/src/agent-host.ts:
   - Ensure tracker.checkCeilings() is evaluated before every turn and on streaming events.
   - Trigger agent.abort() immediately upon breach.
3. Add unit tests in kaioken_v2/packages/agent/test/ceilings.test.ts:
   - Verifies turn limit abort.
   - Verifies spend limit abort.
   - Verifies fail-closed behavior on missing token metrics.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  npx vitest run packages/agent/test/ceilings.test.ts
  node apps/cli/dist/bin.js scan --root .
Confirm all tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT make ceilings soft or advisory.
Do NOT modify offline scanning tools.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) ceiling tracker implementation summary, (2) fail-closed Gap G-4 validation,
(3) test suite results, (4) confirmation that M7-05 architecture was reused.
</structured_output_contract>
```
