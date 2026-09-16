# B1-01 · Study the comparables

> Conduct a structured competitive analysis of open-source coding tools with paid hosted layers,
> analyzing how OpenCode, Kilo Code, Cursor, and Continue separate free clients from paid revenue.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`B0-01`](01-fix-the-license-vacuum.md) |
| **Blocks** | [`B1-02`](02-choose-the-revenue-model.md), [`B1-03`](03-open-core-boundary.md) |
| **Touches** | Competitive positioning research, comparative packaging matrices |
| **Risk** | Low — observational research; does not alter engine code |
| **Gate-critical** | **No — foundational research for B1-02 and B1-03** |

---

## Why this exists

The maintainer named the commercial target explicitly: **the way Kilo Code and OpenCode do it**.
To replicate and adapt that business model successfully, the maintainer must understand the precise mechanics
of how these projects operate:
- What functionality is distributed completely free in the client?
- What functionality triggers a payment prompt or requires a subscription?
- How is the legal boundary maintained so the client remains open source while the revenue layer remains proprietary?
- How do they manage inference gross margins and customer usage limits?

Benchmarking against direct and adjacent comparables prevents reinventing packaging models that the market
has already evaluated and rejected.

---

## Current state

Verified repository artifacts:
- `inspire/opencode/`: Vendored read-only reference copy of the OpenCode coding agent.
- `inspire/opencode/LICENSE`: MIT License (Copyright 2025 OpenCode).
- `inspire/pi/`: Vendored reference library for agent runtime primitives (`@earendil-works/pi-agent-core`), MIT.

> [!important] Accuracy Rule: Competitor & Vendor Claims
> All competitor pricing numbers, plan tiers, and usage limits cited below are marked **`UNVERIFIED:`**.
> Commercial terms, subscription tiers, and provider margins change frequently. Every claim must be
> independently verified against the vendor's live official pricing page before basing financial
> commitments upon it.

---

## Comparable 1: OpenCode

- **Repository Artifact:** Vendored locally at `inspire/opencode/`.
- **License:** Pure MIT (`inspire/opencode/LICENSE:1-21`).
- **Architecture:** Client is written in TypeScript/Bun (`inspire/opencode/package.json`), providing a
  terminal-based coding agent and language model client.
- **What is Free:**
  - Full client application, CLI, TUI, and local workspace tools.
  - Bring-Your-Own-Key (BYOK) provider routing (OpenAI, Anthropic, Ollama, OpenRouter).
  - Local configuration files and custom prompt templates.
- **What is Paid (`UNVERIFIED:` verify at opencode.ai/pricing):**
  - Managed inference proxy: zero-setup model access billed via subscription or prepaid credits.
  - Cloud workspace synchronization and team collaboration features.
- **How Client Stays Open:** The core CLI repository is 100% open source under MIT. The hosted backend,
  token metering proxy, and billing APIs live in a completely separate proprietary backend service.

---

## Comparable 2: Kilo Code

- **License:** Permissive open-source client.
- **What is Free:**
  - Full client editor integration and coding agent capabilities.
  - BYOK connection allowing developers to use their own Anthropic / OpenAI / Bedrock credentials.
- **What is Paid (`UNVERIFIED:` verify at kilocode.com/pricing):**
  - Managed hosted inference credits sold at a retail markup over provider wholesale rates.
  - Premium pooled models without requiring individual developer API keys.
  - Centralized team billing and usage dashboards.
- **How Client Stays Open:** The client interfaces with standard OpenAI-compatible endpoints. The paid
  tier is simply a specialized hosted endpoint with authentication tokens attached.

---

## Comparable 3: Cursor (The Proprietary Benchmark)

- **License:** Proprietary closed-source fork of VS Code.
- **What is Free (`UNVERIFIED:` verify at cursor.com/pricing):**
  - Limited free tier (e.g. 14-day Pro trial or ~50 slow agent requests).
- **What is Paid (`UNVERIFIED:` verify at cursor.com/pricing):**
  - Flat seat subscription (e.g. ~$20/month for Pro) including a pool of fast agent runs (e.g. 500 requests),
    falling back to slower queues or metered overages.
  - Business tier (e.g. ~$40/seat/month) adding centralized admin, SSO, and privacy guarantees.
- **Key Takeaway for Kaioken:** Cursor proves developer willingness to pay (`UNVERIFIED:` ~$20/month) for frictionless
  daily coding workflows, but its closed model invites open-source competition.

---

## Comparable 4: Continue.dev

- **License:** Apache-2.0 open-source IDE extension (VS Code / JetBrains).
- **What is Free:**
  - Client extension 100% free with BYOK.
  - Local models, custom slash commands, context providers.
- **What is Paid (`UNVERIFIED:` verify at continue.dev/pricing):**
  - Continue Hub: team-wide model configuration, policy governance, internal prompt registries,
    and centralized enterprise analytics.
- **Key Takeaway for Kaioken:** Continue demonstrates that enterprise engineering organizations will pay
  for centralized control, shared configuration, and audit logging even when the client is completely free.

---

## Comparative synthesis

| Product | Client License | Core Client Free? | BYOK Allowed? | Primary Revenue Engine | Gross Margin Risk |
|---|---|---|---|---|---|
| **OpenCode** | MIT | Yes | Yes | Hosted managed inference & platform | Reseller margin risk on tokens |
| **Kilo Code** | Open Source | Yes | Yes | Metered inference credit margin | Reseller margin risk on tokens |
| **Cursor** | Proprietary | Limited Trial | Restricted | Flat seat subscription ($20/mo `UNVERIFIED:`) | Heavy-user tail risks ($50+ API cost) |
| **Continue** | Apache-2.0 | Yes | Yes | Enterprise governance Hub | Low (SaaS software margin) |
| **Kaioken (Proposed)** | Permissive (Apache/MIT) | **Yes** | **Yes** | **Hosted inference margin + remote repo daemons** | **Mitigated via M7/B2-06 hard quotas** |

---

## What done looks like

- [ ] Detailed research dossier completed analyzing OpenCode, Kilo Code, Cursor, and Continue.
- [ ] Every specific pricing claim, tier name, and limit marked `UNVERIFIED:` with direct URL citations.
- [ ] Technical architecture of how OpenCode and Kilo Code isolate proprietary backends from open clients
      documented for use in [`B2-05`](05-inference-proxy-and-margin.md).
- [ ] Clear implications synthesized for Kaioken's revenue model decision ([`B1-02`](02-choose-the-revenue-model.md)).

---

## Steps

1. **Inspect vendored OpenCode architecture:**
   - Read `inspire/opencode/packages/` to understand how the CLI routes provider calls vs hosted calls.
2. **Review live competitor pricing pages:**
   - Navigate to official pricing documentation for Kilo Code, Cursor, and Continue.
   - Record current published pricing tiers, token caps, and plan structures, noting the date of access.
3. **Map packaging boundaries:**
   - Document exactly what features trigger monetization across each competitor.
4. **Synthesize recommendations:**
   - Deliver findings to [`B1-02`](02-choose-the-revenue-model.md) and [`B1-03`](03-open-core-boundary.md).

---

## In scope

- Analysis of open-source coding agents and desktop IDE pricing models.
- Code architecture review of `inspire/opencode/`.
- Mapping client-side vs server-side boundaries in peer tools.

---

## Out of scope

- Direct user interviews or willingness-to-pay surveys.
- Reverse-engineering closed-source proprietary backends.
- Implementing proxy clients or billing code.

---

## Gates

1. A completed research markdown document committed to `roadmap/money_print/b1-model-and-positioning/`.
2. 100% of external pricing figures verified to carry the `UNVERIFIED:` prefix.

---

## Traps

| Trap | Guard |
|---|---|
| Presenting stale pricing as verified fact | Pricing in the AI developer tool space changes every quarter. Always prefix competitor claims with `UNVERIFIED:` |
| Assuming open source means zero revenue | OpenCode and Kilo Code demonstrate that developer convenience (not having to manage API keys) drives substantial consumer revenue |
| Forbidding BYOK | Never disable Bring-Your-Own-Key. Free BYOK drives developer trust and adoption; monetized convenience drives revenue |

---

## Open questions

1. None. This is a research leaf.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, compile a structured comparative analysis of
open-source and proprietary coding tool business models:

1. Read inspire/opencode/package.json, inspire/opencode/LICENSE, and inspire/opencode/AGENTS.md to
   document how OpenCode structures its open-source footprint.
2. Document the business and pricing mechanics of OpenCode, Kilo Code, Cursor, and Continue.
3. Specifically detail:
   - What is free vs what is paid.
   - How the open client is preserved while monetizing hosted services.
   - How each provider handles token cost risk and heavy users.
4. Prefix ALL pricing numbers, dollar values, and plan tiers with UNVERIFIED: and cite the official vendor page.
</task>

<research_mode>
Strictly separate:
- OBSERVED FACTS: What is confirmed in the repository (inspire/opencode is MIT, contains CLI/TUI tools).
- INFERENCES: Competitive dynamics of developer tool pricing and user tolerance for subscription limits.
- OPEN QUESTIONS: Exact wholesale margin structures negotiated by large competitors with Anthropic/OpenAI.
</research_mode>

<verification_loop>
Grep the output for any dollar signs or pricing claims:
Confirm every single competitor price is prefixed with UNVERIFIED: and includes a vendor URL citation.
Confirm no repository source files outside the roadmap are modified.
</verification_loop>

<action_safety>
Do NOT modify any files in inspire/opencode/ or kaioken_v2/.
Do NOT run git add or git commit. Leave work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) breakdown of OpenCode's client vs hosted model, (2) comparative matrix across the four products,
(3) confirmation of UNVERIFIED: tags on all external prices, (4) recommendations for B1-02.
</structured_output_contract>
```
