# B3-01 · The smallest hosted surface that carries revenue

> Scope the production hosted footprint strictly to services that directly generate margin, rejecting infrastructure that creates permanent operational drag without revenue.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/money_print/b2-billing-engineering/05-inference-proxy-and-margin.md`](05-inference-proxy-and-margin.md), [`roadmap/money_print/b2-billing-engineering/01-account-and-identity.md`](01-account-and-identity.md) |
| **Blocks** | [`04-uptime-and-support-promise.md`](04-uptime-and-support-promise.md), [`roadmap/money_print/b5-go-to-market/04-pricing-page-and-checkout.md`](04-pricing-page-and-checkout.md) |
| **Touches** | Production infrastructure architecture specification, hosting budget |
| **Risk** | High. Overscoping hosted infrastructure burdens a solo maintainer with high cloud fixed costs and 24/7 pager debt. |
| **Gate-critical** | Yes |

---

## Why this exists

Every hosted service is a permanent operational mortgage. When an open-source engine runs locally on a user's machine, compute, storage, and networking costs belong to the user. The moment the maintainer hosts a service, three new costs appear immediately:
1. **Financial cost:** Cloud hosting, bandwidth, databases, load balancers, and external API egress bills that arrive every month regardless of revenue.
2. **Operational cost:** Uptime monitoring, security patching, TLS renewals, DDoS mitigation, database migrations, and outage triage.
3. **Legal & compliance cost:** Data privacy (GDPR/CCPA), data processing agreements, breach notification liabilities, and audit logging.

To survive as a solo maintainer, Kaioken must operate on the **smallest possible hosted surface that still carries revenue**. Following the business model seen in comparable tools ([`inspire/opencode/`](../../../inspire/opencode/)), revenue does not come from hosting generic developer utilities; it comes from **reselling metered inference credits at a gross margin and managing user entitlements**. Every additional service must justify its permanent operational drag by directly unlocking revenue that cannot be earned otherwise.

---

## Current state

Verified against the working tree:

> [!note]
> All monetary assumptions and unit economics are canonically owned by [`roadmap/money_print/b1-model-and-positioning/06-unit-economics-model.md`](06-unit-economics-model.md); any adjustments to margins, wholesale token rates, or fixed overhead must be made there first and inherited here rather than restated locally.

| Product surface | Current implementation | Revenue role | Operational burden if hosted |
|---|---|---|---|
| **Inference Proxy** | Direct client-to-provider routing in [`kaioken_v2/packages/model/src/index.ts:20-22`](file:///D:/project/ai_now_know/kaioken_v2/packages/model/src/index.ts#L20-L22) (`ModelClient`) and [`kaioken_v2/packages/model/src/pool.ts:20-33`](file:///D:/project/ai_now_know/kaioken_v2/packages/model/src/pool.ts#L20-L33) (`effectiveConcurrency`) | **Core revenue vehicle.** Resells upstream tokens (Anthropic, OpenAI, OpenRouter) at the canonical 25% retail margin on revenue (`Wholesale cost / 0.75 = Retail price`, as modeled in `b1/06`), with sensitivity up to 35% retail margin if the open question in `b1/06` resolves upward (`b2/05`). Note: this is a 25% margin on retail revenue, which corresponds to a 33.3% markup on wholesale cost. | High traffic volume, upstream rate limit handling, streaming token accounting. Must be high-availability edge compute. |
| **Account & Entitlements** | None currently in engine. Specified in `b2/01` (accounts) and `b2/03` (entitlements). | **Mandatory access gate.** Validates API keys, enforces credit balances, and gates paid features. | Lightweight auth queries, token verification, webhook reception from payment provider (`b2/02`). |
| **Extension Registry** | Frontend in [`registry-web/`](file:///D:/project/ai_now_know/registry-web/), database-free over GitHub PRs ([`registry-web/README.md:11`](file:///D:/project/ai_now_know/registry-web/README.md#L11)). | Ecosystem expansion. Currently zero revenue. Paid options evaluated in [`02-registry-monetisation.md`](02-registry-monetisation.md). | Zero backend database burden today (served statically on CDN). Adding dynamic backend hosting creates database maintenance. |
| **Team Workspaces** | Explicitly refused non-goal in [`roadmap/README.md:278-288`](../../README.md#L278-L288) and [`roadmap/README.md:342-344`](../../README.md#L342-L344) ("Not until there are users"). | Future B2B expansion tier (`b3/03`). | Severe. Stateful multi-tenant WebSocket servers, distributed concurrency, conflict resolution. |
| **Hosted Wiki Publishing** | Local generator in [`kaioken_v2/apps/cli/src/commands/wiki.ts`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/commands/wiki.ts) and static exporter in [`kaioken_v2/apps/cli/src/commands/export.ts`](file:///D:/project/ai_now_know/kaioken_v2/apps/cli/src/commands/export.ts). | Distant potential SaaS tier ("Hosted Readme/Knowledge portal"). | High storage, CDN bandwidth, custom domain routing, SSL termination, and spam/abuse moderation. |

`UNVERIFIED:` Exact serverless cold-start latency characteristics of Cloudflare Workers vs AWS Lambda for long-running streaming inference requests.

---

## What done looks like

- [ ] A written hosting boundary document explicitly approving the Inference Proxy and Account/Entitlement service as the **only** hosted services for launch.
- [ ] Hosted Wiki Publishing is explicitly rejected; documentation distribution remains local-first (`kaioken export` to static GitHub Pages/S3/Vercel).
- [ ] Team Workspace state sync is explicitly rejected until B3-03 gates are met.
- [ ] Extension registry remains database-free and hosted as static assets on a CDN edge.
- [ ] The hosted architecture relies entirely on managed, serverless infrastructure (e.g. Cloudflare Workers + Supabase/Turso Auth) with zero stateful virtual machines to patch or maintain.

---

## Steps

1. **Evaluate Candidate Surfaces Against Operational Scarcity.**
   Analyze each candidate service against three criteria: (1) Does it directly generate cash flow? (2) Does it require stateful database clustering? (3) Does its failure crash a customer's development workflow?
2. **Bound the Hosted Footprint.**
   Select the absolute minimum viable hosted surface:
   - **In-boundary:** An edge-routed **Inference & Entitlement Gateway** (`b2/05`). It receives authenticated requests from Kaioken CLI / Studio, checks user quota/credits in an edge cache, streams the prompt to upstream LLM providers, counts tokens, records usage asynchronously, and streams responses back.
   - **Out-of-boundary:** Everything else. Wiki hosting, shared editing, real-time collaboration, and custom user databases stay out of the hosted environment.
3. **Decouple Wiki Publishing to User-Owned Infrastructure.**
   Enforce the architectural principle: `kaioken wiki` writes to `.kaioken/wiki/` locally. `kaioken export` (`apps/cli/src/commands/export.ts`) bundles these into standard Markdown or HTML. Users deploy their knowledge bases to their own existing static infrastructure (GitHub Pages, GitLab Pages, Cloudflare Pages, S3). Kaioken hosts zero customer documentation.
4. **Preserve Database-Free Registry Architecture.**
   Affirm [`registry-web/README.md:11`](file:///D:/project/ai_now_know/registry-web/README.md#L11). The registry frontend builds to static HTML/JS deployed on Vercel or Cloudflare Pages. Metadata is read from GitHub repository APIs. No Postgres instance, no Redis cache, and no operational pager for community packages.
5. **Formulate Edge Deployment Architecture.**
   Document the serverless deployment blueprint:
   - Compute: Edge runtime (e.g. Cloudflare Workers) with near-zero cold starts and built-in DDoS mitigation.
   - Auth & Entitlements: Managed serverless database (e.g. Supabase Auth or Clerk) handling user identity and Stripe billing webhooks (`b2/02`).
   - Logging: Ephemeral token accounting, no persistent prompt logging (enforcing [`roadmap/money_print/b4-company-formation/04-terms-privacy-dpa.md`](04-terms-privacy-dpa.md)).

---

## In scope

- Architectural boundary definition for hosted vs local execution.
- Operational cost analysis of candidate services.
- Decisions on wiki hosting, registry infrastructure, and proxy topology.
- Defining serverless stack constraints to eliminate OS-level maintenance.

---

## Out of scope

- Writing billing code or payment webhooks (handled in `b2/02` and `b2/05`).
- Deploying infrastructure templates (Terraform, Pulumi, CloudFormation).
- Enterprise on-premises deployment architecture.

---

## Gates

1. Architectural boundary specification committed to `roadmap/money_print/b3-hosted-surface/01-what-gets-hosted.md`.
2. Estimated monthly fixed operational baseline committed, aligning with the canonical ~$200/month ASSUMPTION total fixed overhead in [`b1/06`](06-unit-economics-model.md) (comprising ~$60/mo hosted proxy/DB compute, ~$30/mo domains/email, ~$30/mo observability, and ~$80/mo amortized merchant/legal compliance before variable token costs).
3. Zero stateful Linux server instances (EC2, Droplets, VPS) specified in the launch architecture.

---

## Traps

| Trap | Guard |
|---|---|
| Hosting a documentation SaaS because "it's easy to build" | Hosting docs means handling custom domains, SSL certificates, storage quotas, and DMCA takedowns. Keep docs local and static via `kaioken export`. |
| Running persistent Node.js servers on a VPS | VPS instances require security updates, SSH key rotations, monitoring agents, and systemd service restarts. Use managed serverless edge runtimes only. |
| Storing prompt bodies in a hosted database | Storing code snippets creates immense GDPR/DPA liability (`b4/04`) and ballooning database storage costs. Process streams in-flight without persisting user source code. |
| Building an all-in-one monolith before first user | The only hosted component needed for first revenue is the proxy metering tokens. Defer everything else. |

---

## Open questions

None. The scoping decision is firm: host only the inference proxy and entitlement validator.

---

## Session brief

```xml
<task>
Document the scoping decision for Kaioken's minimal hosted surface in roadmap/money_print/b3-hosted-surface/01-what-gets-hosted.md.

Analyze all potential product candidates:
1. Inference proxy (packages/model/src/index.ts and pool.ts)
2. Account & entitlement service (b2/01, b2/03)
3. Extension registry (registry-web)
4. Team workspaces (README §7 refused non-goals)
5. Hosted wiki publishing (apps/cli/src/commands/wiki.ts, export.ts)

Argue definitively for the SMALLEST hosted surface that carries revenue (the inference proxy + entitlement validator), demonstrating why hosting anything else adds permanent operational pager debt to a solo maintainer without commensurate revenue.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: What the current engine exposes (packages/model/src/index.ts, apps/cli/src/commands/export.ts), how registry-web is architected (database-free on GitHub), and what the roadmap refused (collaborative workspaces in §7).
- INFERENCES: How serverless edge infrastructure lowers solo maintenance overhead compared to long-running VPS instances.
- OPEN QUESTIONS: Any vendor-specific platform choices (e.g. Cloudflare Workers vs AWS Lambda).
</research_mode>

<verification_loop>
Verify all cited file paths and line numbers against the repository working tree.
Confirm that no competitor pricing is cited without UNVERIFIED: or ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b3-hosted-surface/01-what-gets-hosted.md.
Do NOT modify engine code or deploy any cloud resources.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the scoping boundary, (2) operational trade-off matrix across the five candidates, (3) verified file paths, (4) confirmation of zero uncommitted git actions.
</structured_output_contract>
```
