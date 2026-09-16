# B1-03 · The open-core boundary

> The single hardest decision in money_print: delineate what is free forever versus what is paid,
> anchoring the boundary in real product surfaces and preserving the free tier as the distribution engine.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits maintainer formal sign-off on boundary matrix) |
| **Size** | M |
| **Depends on** | [`B0-01`](01-fix-the-license-vacuum.md), [`B1-02`](02-choose-the-revenue-model.md) |
| **Blocks** | [`B1-04`](04-pricing-and-packaging.md), [`B2-03`](03-entitlements-and-license-keys.md) |
| **Touches** | Feature gating, product packaging definitions, architectural boundaries |
| **Risk** | Critical — an overly restrictive free tier kills adoption; an overly permissive free tier eliminates revenue |
| **Gate-critical** | **Yes — governs entitlement logic across all surfaces** |

---

## Why this exists

In an open-core commercial strategy, drawing the line between "free" and "paid" is the definitive product
decision. Getting this boundary wrong is the most common reason open-source commercial ventures fail:
- **Too stingy:** Crippling the free tier (e.g. artificial file limits on local scanning, paywalling the CLI,
  or disabling BYOK) destroys trust, repels open-source developers, and extinguishes the viral distribution
  engine that makes the product reachable in the first place.
- **Too generous:** Giving away infrastructure-heavy capabilities (e.g. free hosted inference, free cloud
  daemons, or unlimited centralized indexing) creates unsustainable server costs and leaves users with zero
  economic incentive to upgrade.

The guiding architectural principle:
> **The free tier is the distribution mechanism.** Anything required for an individual developer to
> install the tool, scan their codebase, generate local repository documentation, run agent sessions with
> their own API keys, and succeed alone MUST remain free and open source forever.
> 
> Monetization attaches strictly to convenience (managed zero-setup inference), multi-device continuity
> (hosted background daemons), and organizational collaboration (shared team registries and synchronized wikis).

---

## Current state

Verified across current repository surfaces:

| Surface | Real Repository Artifact | Current Implementation | Proposed Tier |
|---|---|---|---|
| **CLI** | `kaioken_v2/apps/cli/` | Full terminal command suite (`scan`, `wiki`, `impact`, `agent`) | **Free Forever** |
| **TUI** | `kaioken_v2/apps/tui/` | Terminal user interface for interactive review | **Free Forever** |
| **Studio IDE** | `ide_kaioken/kaioken_studio_theia/` | Desktop Electron application spike | **Free Client** (paid cloud sync) |
| **Wiki Engine** | `kaioken_v2/packages/wiki/` | Local markdown documentation compiler with provenance | **Free Local** (paid shared hosting) |
| **Model Layer** | `kaioken_v2/packages/model/` | Model abstraction; caller injects client transport | **Free BYOK** (paid managed proxy) |
| **Local Daemon** | `kaioken_v2/apps/cli/src/commands/daemon.ts` | Background file watcher and IPC server on localhost | **Free Local** (paid cloud daemon) |
| **Registry** | `registry-web/` & `kaioken_v2/packages/ext/` | Extension registry and packaging primitives | **Free Public** (paid private teams) |

---

## Surface-by-surface boundary specification

```
                                    THE OPEN-CORE BOUNDARY
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ FREE FOREVER (Permissive Open Source)                                                    │
│ Distribution engine: runs 100% locally, offline-capable, developer sovereignty           │
│                                                                                          │
│  • CLI & TUI (`apps/cli`, `apps/tui`): all local commands (scan, wiki, impact, status)  │
│  • AST Codebase Indexing (`packages/index`, `packages/scan`): tree-sitter offline parsers│
│  • Local Wiki Compiler (`packages/wiki`): builds full documentation into local directory │
│  • Bring-Your-Own-Key (`packages/model`): unlimited direct calls to Anthropic/OpenAI     │
│  • Local Background Daemon (`apps/cli/src/commands/daemon.ts`): runs on developer laptop │
│  • Public Extension Ecosystem (`packages/ext`): installing and publishing public tools   │
│  • Studio Desktop App (`ide_kaioken/`): full local IDE, diff viewer, local agent chat    │
└──────────────────────────────────────────────────────────────────────────────────────────┘
                                             ▲
                                             │ Gate: Convenience, Cloud, & Teams
                                             ▼
┌──────────────────────────────────────────────────────────────────────────────────────────┐
│ PAID COMMERCIAL LAYER (Proprietary Hosted Services)                                      │
│ Monetization engine: infrastructure, operational convenience, and team collaboration     │
│                                                                                          │
│  • Managed Hosted Inference (`B2-05`): zero-config premier models sold at retail margin  │
│  • Cloud Background Daemons: runs 24/7 on cloud instances, watching GitHub webhooks      │
│  • Team Synchronized Wikis: centralized hosted documentation portal for engineering orgs │
│  • Private Registry Workspaces: proprietary team extensions on `registry-web`            │
│  • Organization Audit & Governance: centralized spend controls and compliance logging   │
│  • Commercial Support & SLAs: guaranteed bug triage and operational warranties           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## What done looks like

- [ ] Maintainer reviews and formally approves the open-core boundary matrix.
- [ ] Explicit commitment written into documentation that Bring-Your-Own-Key (BYOK) local inference will
      never be paywalled, throttled, or deprecated.
- [ ] Technical architecture confirms that `@kaioken/agent` and `@kaioken/model` can operate cleanly
      with zero network connectivity to Kaioken commercial servers when local credentials are provided.
- [ ] Feature-gating entitlement architecture in [`B2-03`](03-entitlements-and-license-keys.md)
      is strictly scoped to the paid services listed above.

---

## Steps

1. **Audit local execution independence:** Verify that `node apps/cli/dist/bin.js scan --root .` and
   local wiki compilation run without initiating any network connection or licensing check.
2. **Review extension registry boundaries:** In `registry-web/`, confirm that public package publishing
   and installation remain free, while organizational namespaces and private scopes are flagged for
   monetization.
3. **Draft Developer Bill of Rights:** Articulate the promise to the developer community:
   - Your code and your repository knowledge graphs remain local and private.
   - Local features never phone home or require a paid login.
   - You can use your own API keys forever without subscription fees.
4. **Record sign-off:** Transition this leaf to `done` upon maintainer approval.

---

## In scope

- Defining free vs paid functional boundaries across all six primary surfaces.
- Ensuring local offline operation remains unencumbered.
- Mapping paid entitlements to specific cloud-hosted capabilities.

---

## Out of scope

- Writing license key verification code (covered in [`B2-03`](03-entitlements-and-license-keys.md)).
- Developing cloud multi-tenant infrastructure.
- Setting price tiers for paid features (covered in [`B1-04`](04-pricing-and-packaging.md)).

---

## Gates

1. A committed boundary table in this leaf signed off by the maintainer.
2. Automated test verifying that the CLI functions offline with zero license keys or accounts configured:
   ```bash
   node kaioken_v2/apps/cli/dist/bin.js scan --root .
   ```

---

## Traps

| Trap | Guard |
|---|---|
| Gating basic CLI commands behind an account | Requiring a login just to run `kaioken scan` will result in instant developer abandonment. Keep the CLI friction-free |
| Crippling BYOK performance | Never deliberately degrade or delay responses for users supplying their own API keys. It burns developer goodwill immediately |
| Vague boundary lines | Do not say "advanced features are paid". Name the exact features: hosted daemons, team sync, managed proxy, private registry |

---

## Open questions

1. **Is the Studio desktop editor completely free?**
   - *Recommendation:* Yes, the Studio desktop application client is 100% free and open source.
     Paid features inside Studio attach strictly to the hosted inference connection, cloud sync,
     and team workspace features.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, review and formalize the open-core boundary for Kaioken:

1. Map the six primary product surfaces:
   - CLI (apps/cli)
   - TUI (apps/tui)
   - Studio IDE (ide_kaioken/)
   - Wiki engine (packages/wiki)
   - Model layer (packages/model)
   - Extension registry (registry-web & packages/ext)
2. Detail the exact separation between free local features (distribution engine) and paid hosted
   services (revenue engine).
3. Validate that offline local capabilities are preserved with zero mandatory authentication.
4. Prepare a Developer Bill of Rights section guaranteeing the permanent openness of the local client.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: packages/index and apps/cli work offline without network access today.
- INFERENCES: Open-source developer sentiment strongly penalizes tools that gate local capabilities.
- OPEN QUESTIONS: Whether team-level sync features should have a limited free tier (e.g. up to 3 seats).
</research_mode>

<verification_loop>
Run from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Verify that scanning executes completely offline without network calls.
Confirm no source files are modified.
</verification_loop>

<action_safety>
Do NOT add license validation checks to kaioken_v2/apps/cli/src/.
Do NOT run git add or git commit. Leave work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) finalized boundary specification matrix, (2) Developer Bill of Rights draft,
(3) verification results of local offline execution, (4) maintainer sign-off prompt.
</structured_output_contract>
```
