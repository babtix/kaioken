# B3-02 · Registry monetisation and operational liability

> Evaluate commercial models for the extension registry against the severe legal and operational liabilities of package distribution, establishing why the registry must remain free and database-free at launch.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/m12-ecosystem-ga/01-registry-launch.md`](../../m12-ecosystem-ga/01-registry-launch.md), [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md) |
| **Blocks** | [`roadmap/money_print/b5-go-to-market/04-pricing-page-and-checkout.md`](04-pricing-page-and-checkout.md) |
| **Touches** | `registry-web/`, extension ecosystem commercial terms |
| **Risk** | High. Charging for registry listings converts a volunteer open-source directory into a commercial marketplace with strict legal warranties, consumer protections, and heightened supply-chain liabilities. |
| **Gate-critical** | No |

---

## Why this exists

The extension directory at [`registry-web/`](file:///D:/project/ai_now_know/registry-web/) exists in code but is not yet launched to production. It enables developers to discover extensions that add declarative knowledge schemas, Model Context Protocol (MCP) server configurations, and WebAssembly (WASM) analysis tools ([`kaioken_v2/packages/ext/src/manifest.ts:19-25`](file:///D:/project/ai_now_know/kaioken_v2/packages/ext/src/manifest.ts#L19-L25)).

In theoretical SaaS planning, an extension registry is often highlighted as an obvious monetization channel: charging developers for featured listings, selling verified publisher badges, taking a cut of paid plugins, or hosting private team registries.

However, as established in [`roadmap/m12-ecosystem-ga/01-registry-launch.md:24-28`](../../m12-ecosystem-ga/01-registry-launch.md#L24-L28), **a moderation policy is a legally binding operational obligation, not a marketing checkbox.** MCP servers run executable local processes on developer machines; WASM modules run in the engine sandbox. The moment money changes hands on a registry, the maintainer's legal relationship to every package transforms from a disclaimer-protected host into a commercial marketplace operator with direct product liability, consumer protection warranties, and tax nexus implications. Charging for listings raises that obligation exponentially; it does not lower it.

This leaf evaluates whether and how `registry-web` earns, bounding the operational liability for a solo operator.

---

## Current state

Verified against the working tree:

| Fact | Evidence | Note |
|---|---|---|
| Registry frontend is fully implemented | [`registry-web/`](file:///D:/project/ai_now_know/registry-web/) (React 19, Vite 6, Tailwind 4) | Built, but un-deployed to public production. |
| Architecture is database-free over GitHub | [`registry-web/README.md:11`](file:///D:/project/ai_now_know/registry-web/README.md#L11) | Index is `community-extensions.json` in `babtix/kaioken-extensions`. Submissions are PRs. |
| Extension types span zero-risk to executable code | [`kaioken_v2/packages/ext/src/manifest.ts:25`](file:///D:/project/ai_now_know/kaioken_v2/packages/ext/src/manifest.ts#L25) (`"declarative" \| "mcp" \| "wasm"`) | MCP runs local OS processes; WASM runs binaries in sandbox. |
| Malicious package revocation mechanism exists | [`kaioken_v2/packages/ext/src/install.ts`](file:///D:/project/ai_now_know/kaioken_v2/packages/ext/src/install.ts) | CLI enforces `malicious: true` blocklist from registry index. |
| Commercial licensing vacuum blocks commercial ecosystem | [`roadmap/decisions/d1-license.md:18-28`](../../decisions/d1-license.md#L18-L28) | License Zero Noncommercial 2.0.1 currently prohibits commercial use of the engine. |

`UNVERIFIED:` Historical legal liability outcomes for single-operator package managers facing supply-chain attacks under EU Cyber Resilience Act regulations.

---

## Evaluation of monetization options

| Option | Revenue mechanism | Operational & legal burden | Solo maintainer verdict |
|---|---|---|---|
| **1. Paid Listings** | Developers pay $20–$50/mo ASSUMPTION for promoted placement in search results or homepage banners. | Requires payment flow, invoice generation, refund disputes, and active scam filtering. Paid placement incentivizes low-quality and malicious actors to buy visibility. | **REJECTED.** Destroys user trust in a developer tool where security and verification are primary differentiators. |
| **2. Verified Publisher Tier** | Publishers pay an annual fee ($99/yr ASSUMPTION) to obtain a "Verified" badge. | Maintainer must perform manual identity verification (D-U-N-S check, passport/corporate verification, domain verification). When a verified publisher pushes malware, the maintainer faces joint liability for fraudulent endorsement. | **REJECTED AT LAUNCH.** The labor-to-revenue ratio is catastrophic for a solo operator ($99 per year does not cover 30 minutes of identity verification and legal exposure). |
| **3. Paid Marketplace (Rev-Share)** | Sell commercial extensions through `registry-web`, taking a 15%–30% ASSUMPTION cut. | Turns Kaioken into a Merchant of Record (`b4/03`) or marketplace facilitator. Requires handling global sales tax, payouts to third-party developers across 50+ countries, chargeback handling, and software warranty enforcement. | **REJECTED.** Explicitly refused as a non-goal in [`roadmap/m12-ecosystem-ga/01-registry-launch.md:82-83`](../../m12-ecosystem-ga/01-registry-launch.md#L82-L83). |
| **4. Private Registries for Teams** | Enterprise teams pay a monthly fee ($20/seat/mo ASSUMPTION) to host private, proprietary extensions and MCP definitions inside their firewall or on a hosted tenant. | High value for corporate security teams needing to distribute internal corporate knowledge schemas. Requires authentication, multi-tenancy, access control, and encrypted storage. | **DEFERRED TO B3-03.** Viable B2B enterprise tier, but technically unneeded until paying teams exist. |
| **5. Nothing At All (Free Community Directory)** | Zero fee. Database-free GitHub PR submission workflow matching M12-01. | Zero payment handling, zero payout overhead, zero merchant tax obligations. Moderation is handled asynchronously via GitHub PR review. | **RECOMMENDED AT LAUNCH.** Eliminates commercial warranty liability while maximizing ecosystem growth. |

---

## What done looks like

- [ ] A formal decision committed: `registry-web` launches with **Option 5 (zero fees, free community registry)**.
- [ ] Paid listings and revenue-sharing marketplace models are permanently marked out of scope.
- [ ] Private team registries are documented as the sole acceptable long-term registry monetization path, gated strictly behind the team workspace criteria in [`03-team-workspaces.md`](03-team-workspaces.md).
- [ ] The database-free architecture ([`registry-web/README.md:11`](file:///D:/project/ai_now_know/registry-web/README.md#L11)) is maintained with zero database hosting costs.

---

## Steps

1. **Codify the "Zero-Revenue Registry" Launch Policy.**
   Document why `registry-web` must not monetize directly at launch: an unmonetized directory operated under MIT or Apache 2.0 disclaimers (following Decision D-1, [`roadmap/decisions/d1-license.md`](../../decisions/d1-license.md)) carries statutory safe-harbor protections that vanish the moment a fee is charged for listing placement.
2. **Align Moderation SLA with Solo Capacity.**
   Ensure the moderation policy drafted in [`roadmap/m12-ecosystem-ga/01-registry-launch.md:46-53`](../../m12-ecosystem-ga/01-registry-launch.md#L46-L53) reflects reality: a 72-hour PR review SLA for community submissions, gated by automated GitHub Actions running schema validation (`registry-web/api/validate.ts`).
3. **Preserve Database-Free Architectural Purity.**
   Ensure no payment gateway, user database, or session token storage is added to `registry-web/`. The registry remains a static frontend reading `community-extensions.json` hosted on GitHub.
4. **Draft Future Private Registry Specification (B2B Expansion).**
   Outline the boundary for a future Private Registry tier: enterprise customers run an internal CLI flag (`kaioken ext --registry https://internal.corp/extensions`) pointing to their own internal Git repository or an authenticated S3 bucket, requiring zero multi-tenant hosted infrastructure from Kaioken.

---

## In scope

- Commercial evaluation of registry revenue models.
- Legal liability analysis of executable extension distribution (MCP/WASM).
- Architectural guardrails ensuring `registry-web` remains database-free.
- Alignment with M12-01 launch deliverables.

---

## Out of scope

- Writing payment checkout code for extensions.
- Implementing a Stripe Connect marketplace.
- Building a private registry backend before paying teams exist.

---

## Gates

1. A committed decision document in `roadmap/money_print/b3-hosted-surface/02-registry-monetisation.md` selecting Option 5 (Zero-fee registry) for GA.
2. Explicit out-of-scope declarations for paid listings and rev-share marketplaces committed to the roadmap.
3. Verification that `registry-web/` requires zero dynamic backend hosting or database instances.

---

## Traps

| Trap | Guard |
|---|---|
| Thinking paid listings fund moderation | Paid listings attract spam, keyword squatting, and deceptive extensions. The moderation workload grows faster than the listing revenue. |
| Offering a "Verified" badge without legal diligence | If a "Verified" extension distributes an infostealer via MCP, users will claim Kaioken certified its security. A solo maintainer cannot carry that warranty. |
| Turning the registry into a payment processor | Handling payouts to third-party developers requires FinCEN compliance, 1099/W-8BEN tax forms, and VAT compliance across 100+ countries. Never become a two-sided marketplace as a solo developer. |

---

## Open questions

None. The decision to keep the registry free and database-free at launch is definitive.

---

## Session brief

```xml
<task>
In roadmap/money_print/b3-hosted-surface/02-registry-monetisation.md, evaluate the commercial options for registry-web:
1. Paid listings
2. Verified-publisher tier
3. Private registries for teams
4. Nothing at all (free community directory)

Cross-reference roadmap/m12-ecosystem-ga/01-registry-launch.md and demonstrate why a moderation policy is a legally binding operational obligation. Prove that charging for listings increases legal and operational liability beyond what a solo maintainer can support.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: What registry-web contains (React/Vite static frontend, database-free GitHub index), what extension types exist (packages/ext/src/manifest.ts), and the moderation obligations defined in m12/01.
- INFERENCES: How consumer protection laws treat paid commercial listings compared to volunteer open-source directories.
- OPEN QUESTIONS: Future architecture for enterprise-hosted private registries.
</research_mode>

<verification_loop>
Confirm all cross-references to roadmap/m12-ecosystem-ga/01-registry-launch.md and kaioken_v2/packages/ext/src/manifest.ts resolve correctly.
Verify that all competitor and pricing claims include UNVERIFIED: or ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b3-hosted-surface/02-registry-monetisation.md.
Do NOT modify registry-web/ or engine source files.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) verdict on registry monetization, (2) comparative analysis of the 4 options, (3) operational liability impact, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
