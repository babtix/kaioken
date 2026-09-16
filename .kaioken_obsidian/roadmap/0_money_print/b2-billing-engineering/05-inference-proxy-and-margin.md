# B2-05 · Inference proxy and margin

> Operate the hosted inference proxy in front of packages/model that adds the commercial retail margin,
> manages master key custody, and implements provider failover under reseller SLA obligations.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B2-01`](01-account-and-identity.md), [`B2-04`](04-usage-metering.md), [`B1-06`](06-unit-economics-model.md) |
| **Blocks** | [`B2-06`](06-quotas-and-abuse-controls.md), [`B2-07`](07-billing-test-and-reconciliation.md) |
| **Touches** | `kaioken_v2/packages/model/`, `kaioken_v2/apps/cli/src/model.ts`, hosted proxy service |
| **Risk** | **High — as an inference reseller, provider outages and API cost spikes directly threaten your availability and solvency** |
| **Gate-critical** | **Yes — real engine gates: `npm test` and `npm run typecheck`** |

---

## Why this exists

In the Kilo Code and OpenCode model, the hosted inference proxy is the **primary commercial engine**.
It allows a developer to install Kaioken and immediately run top-tier foundation models without having to
create an Anthropic account, enter personal credit cards, generate developer API keys, or manage rate limits.

However, operating a managed inference proxy transforms the maintainer from a software developer into
an **infrastructure reseller**:
1. **You carry provider cost risk:** You pay the upstream providers in cash every month. If your margin
   calculation is flawed or your caching breaks, you lose money on every turn.
2. **You carry an availability promise:** When Anthropic or OpenAI experiences an API outage or degradation,
   paying users do not blame the foundation model vendor—they blame Kaioken. If your proxy goes down,
   your paying users are locked out of their workflow.
3. **You manage master key custody:** Your server holds master production keys with high spending limits.
   A breach of your proxy exposes thousands of dollars of API credit.

This leaf designs the proxy layer sitting directly in front of [`packages/model/`](../../../kaioken_v2/packages/model/src/index.ts).

---

## Current state

Verified in `kaioken_v2/packages/model/`:
- `packages/model/src/index.ts:1-9`: The model package is transport-agnostic. It never reads credentials
  and never imports an HTTP library; the caller injects a `ModelClient` double or transport.
- `packages/model/src/pool.ts`: Contains multi-model fallback and pooling logic.
- `packages/model/src/retry.ts`: Implements backoff retry for transient network errors.
- `apps/cli/src/model.ts`: Instantiates the live client transport using local API keys.

---

## Technical architecture

```
                     HOSTED INFERENCE PROXY PIPELINE
┌──────────────────────────┐
│  Kaioken Local Client    │
│  (apps/cli, Studio IDE)  │
└────────────┬─────────────┘
             │ 1. POST /v1/chat/completions
             │    Header: `Authorization: Bearer <user_jwt>`
             │    Body: { model: "kaioken/claude-3-5-sonnet", messages: [...] }
             ▼
┌────────────────────────────────────────────────────────────────────────┐
│  KAIOKEN HOSTED PROXY SERVICE (Cloudflare Worker / Fly.io)             │
│                                                                        │
│  1. Authenticate & Authorize:                                          │
│     - Verify user JWT signature (`B2-01`)                              │
│     - Check active entitlement & remaining credit quota (`B2-06`)      │
│     - If quota exhausted: return HTTP 402 Payment Required             │
│                                                                        │
│  2. Key Injection & Provider Routing:                                  │
│     - Strip user token; inject server master ANTHROPIC_API_KEY         │
│     - Primary: Route to api.anthropic.com                              │
│     - Failover: If HTTP 500/503/429 -> Route to OpenRouter fallback   │
│                                                                        │
│  3. Streaming & Margin Metering:                                       │
│     - Pipe SSE chunks directly to client (<30ms TTFT latency)          │
│     - Extract verified usage tokens from final chunk/trailer (`B2-04`) │
│     - Calculate: retailPrice = wholesaleCost * 1.25 (25% margin)       │
│     - Commit transaction to Usage Ledger DB (`B2-04`)                  │
└────────────────────────────────────┬───────────────────────────────────┘
                                     │
                                     ▼
                ┌────────────────────────────────────────┐
                │ Upstream AI Providers (Anthropic / OAI)│
                └────────────────────────────────────────┘
```

---

## Key custody and security standards

1. **Zero Client Secret Exposure:** Master provider API keys are injected exclusively in server memory
   via encrypted environment secrets. Client binaries never receive, store, or see provider keys.
2. **Short-Lived User Tokens:** Client sessions authenticate via short-lived JWTs (1 hour expiration)
   refreshable via `~/.kaioken/auth.json`. A leaked user token cannot compromise the master provider account.
3. **Egress Key Rotation:** Master provider keys are rotated monthly without requiring any client-side update.

---

## Provider failover: keeping the availability promise

Because the maintainer carries reseller availability liability, single-provider dependency is fatal:

| Failure Scenario | Proxy Defense | Fallback Path |
|---|---|---|
| **Direct Anthropic 503 Outage** | Proxy catches 5xx within 1.5s | Automatically retries request via OpenRouter Anthropic endpoint |
| **Provider Rate Limit (429)** | Proxy manages multi-key pooling | Rotates across secondary master keys or fallback provider |
| **Complete Model Downtime** | Returns structured degradation code | Client offers: *"Claude 3.5 is unavailable; switch to GPT-4o for this turn?"* |

---

## What done looks like

- [ ] Proxy transport adapter in `kaioken_v2/apps/cli/src/model.ts`:
  - When configured with `provider: "kaioken"`, routes requests to `https://proxy.kaioken.dev/v1`.
  - Attaches user Bearer token from local auth store.
  - Streams completion tokens back to caller with zero interface changes to `ModelClient`.
- [ ] Proxy backend service:
  - Validates user JWT and verifies positive credit balance.
  - Injects server-side provider secrets.
  - Implements OpenRouter failover when primary endpoint returns 502/503.
  - Records verified tokens to usage ledger with 25% retail margin applied.
- [ ] Latency benchmark: Proxy adds less than 50ms time-to-first-token (TTFT) overhead compared to direct calls.
- [ ] Unit tests in `packages/model/test/proxy.test.ts` validating:
  - Transparent error handling when proxy returns 402 (payment required) or 401 (unauthorized).
  - Successful streaming chunk passthrough.

---

## Steps

1. **Implement Proxy Client Transport in CLI:**
   - In `apps/cli/src/model.ts`, implement `createHostedModelClient(credentials: AuthCredentials)`.
   - Ensure it satisfies the standard `ModelClient` interface from `packages/model/src/index.ts`.
2. **Build Server Proxy Handler:**
   - Implement streaming reverse proxy using Fetch API / SSE passthrough.
   - Enforce server-side master key injection from environment variables.
3. **Implement Provider Fallback Logic:**
   - On upstream 5xx, retry against secondary endpoint (e.g. OpenRouter) before failing.
4. **Wire into Metering Ingestion:**
   - Pass completed request metadata to `recordMeteredUsage()` (`B2-04`).
5. **Verify Engine Gates:** Run `npm test` and `npm run typecheck`.

---

## In scope

- Client-side proxy transport in `kaioken_v2/apps/cli/`.
- Hosted proxy routing and key injection architecture.
- Fallback failover logic across provider endpoints.

---

## Out of scope

- Training or fine-tuning custom proprietary foundation models.
- Building a multi-region global CDN network (Cloudflare Workers / single edge region suffices).
- Complex custom prompt caching proxies (native provider prompt caching is passed through).

---

## Gates

From `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific proxy client test:
```bash
npx vitest run packages/model/test/proxy.test.ts
```

Offline verification:
```bash
# Must pass completely offline without network
node apps/cli/dist/bin.js scan --root .
```

---

## Traps

| Trap | Guard |
|---|---|
| Buffering full streaming responses | Never buffer the full response on the proxy before sending. Stream chunks immediately to avoid massive latency |
| Logging customer prompts in plaintext | Strip or encrypt prompt payloads in proxy logs. Store ONLY token counts, model names, and request IDs |
| Unhedged upstream rate limits | Set up multiple provider accounts and fallback routes on OpenRouter to survive provider outages |
| Burning margin on payment processor fees | A 25% margin must cover both provider wholesale cost and payment processor interchange fees |

---

## Open questions

1. **Where should the proxy service be deployed?**
   - *Recommendation:* Deploy on **Cloudflare Workers** or **Fly.io**. Both offer low-latency global edge
     routing, minimal fixed cost, and native streaming SSE support.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In kaioken_v2/packages/model/ and apps/cli/src/, implement the client transport adapter for the Kaioken
hosted inference proxy, adding managed model routing with transparent streaming and error handling:

1. In packages/model/src/proxy-client.ts:
   - Implement HostedModelClient implementing ModelClient from index.ts:
     constructor(baseUrl: string, getAuthToken: () => Promise<string>, options?: { timeoutMs?: number }).
   - complete(request: ModelRequest): Promise<string>.
   - completeStream(request: ModelRequest, onChunk: (chunk: string) => void): Promise<ModelUsage>.
   - Handles HTTP 402 Payment Required: throws structured PaymentRequiredError with renewal URL.
   - Handles HTTP 401 Unauthorized: triggers token refresh or prompts re-login.
2. In apps/cli/src/model.ts:
   - When default_provider is "kaioken", instantiate HostedModelClient using stored auth token.
3. Add unit tests in packages/model/test/proxy.test.ts:
   - Tests streaming chunk assembly.
   - Tests structured PaymentRequiredError on 402.
   - Verifies offline mock behavior passes without real credentials.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node apps/cli/dist/bin.js scan --root .
Confirm all tests pass and offline scan succeeds without credentials.
</verification_loop>

<action_safety>
Do NOT modify existing BYOK transports (Anthropic/OpenAI direct clients).
Do NOT embed production API keys in source files.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) proxy client transport summary, (2) files touched, (3) test suite execution results,
(4) confirmation of offline determinism.
</structured_output_contract>
```
