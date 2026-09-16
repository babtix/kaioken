# money_print · The Business Path

> The roadmap that begins where the engineering roadmap ends: transforming Kaioken from a codebase
> knowledge engine into a self-sustaining commercial entity that earns recurring revenue.

| Field | Value |
|---|---|
| **Status** | `ready` (framework defined; gated on engineering prerequisites) |
| **Model** | Open-source client, paid hosted layer (Kilo Code / OpenCode pattern) |
| **Maintainer** | Solo operator |
| **Prerequisites** | Milestone M1 (green CI), Milestone M7 (sandboxing & ceilings), Milestone M2 (trusted distribution) |
| **Precondition Zero** | Fix the license vacuum (the current TypeScript engine is unlicensed) |
| **Exit Trigger** | See Phase B6 (Kill criteria & stop conditions) |

---

## What money_print is

The primary roadmap at [`roadmap/README.md`](../README.md) answers one question: **"what do I build?"**
It organizes twelve milestones, six architectural enablers, and the Studio desktop environment to take
the TypeScript engine (`kaioken_v2/`) from an in-progress codebase to a hardened, extensible developer
tool.

`money_print` answers the subsequent question: **"how does this become a company that earns money?"**

Software does not monetize automatically because it is technically sophisticated. Without deliberate
packaging, pricing, legal entity structure, billing infrastructure, and distribution economics, a
project remains an unpaid hobby or portfolio piece. `money_print` is the structured operational plan
for monetization, running alongside and after the engineering milestones.

---

## The commercial model

The target model is explicit: **the open-source client with a paid hosted layer**, following the proven
trajectory of tools like OpenCode (vendored at `inspire/opencode/`, MIT) and Kilo Code.

In this architecture:
1. **The client software is free and open source:** The CLI (`apps/cli`), TUI (`apps/tui`), and desktop
   editor (`ide_kaioken/`) are distributed freely under a permissive open-source license. The client
   is the **distribution mechanism**, not a giveaway. It creates the top of the funnel, enables viral
   adoption on developer machines, and provides zero-friction evaluation.
2. **Revenue concentrates in the hosted cloud layer:** Monetization attaches to services that a user
   cannot self-host without operational friction or upfront infrastructure investment:
   - **Metered inference credits sold at a margin:** Managed proxying to premier foundation models
     without requiring users to manage their own API accounts or keys.
   - **Paid hosted daemons & remote indexers:** Cloud-hosted repository background workers that maintain
     durable codebase graphs, run scheduled analyses, and sync documentation without keeping a local
     laptop running.
   - **Team collaboration & private registry publishing:** Monetized services on `registry-web` for
     team-scoped knowledge packs, verified extensions, and shared organizational wiki artifacts.
   - **Support and commercial warranties:** Enterprise service agreements for corporate environments
     that cannot deploy unlicensed or unmaintained tooling.

---

## The hard entry condition

> [!danger] Entry condition: money_print does not start until the engine can support a paying customer.
> Taking money before the engineering foundation is stable sells a promise that cannot be fulfilled,
> burns early customer goodwill, and creates immediate support debt for a solo maintainer.

Money cannot change hands until three specific engineering milestones from [`roadmap/README.md`](../README.md)
are completely green and verified:

1. **Milestone M1 (Green everywhere):** A continuous integration workflow that actually runs and passes
   on every commit (`.github/workflows/ci.yml`). Today CI points at an archived directory (`kaioken v1/`)
   and fails before running a test (Gap **G-6**). You cannot sell software that cannot prove its own build.
2. **Milestone M7 (Permissions and sandboxing):** Hard execution ceilings, filesystem guardrails, and
   fail-closed spend limits (`roadmap/m07-permissions-and-sandboxing/05-resource-ceilings.md`). You cannot
   sell unattended autonomous execution or reseller inference without rigorous guardrails; an unconstrained
   agent loop can churn through hundreds of dollars of API credits in minutes.
3. **Milestone M2 (Trusted distribution):** A verifiable, signed release channel (`.github/workflows/release.yaml`)
   with npm provenance and binary signing. A paying stranger must be able to install, verify, and run
   the software without cloning source code or encountering security warnings.

Selling before M1, M7, and M2 exist is premature commercialization.

---

## Precondition zero: the license vacuum

Before any commercial phase can execute, the legal vacuum in the repository must be resolved.

Verified repository facts:
- `.kaioken_v1/LICENSE` contains the **License Zero Noncommercial Public License 2.0.1** (Copyright 2026 BABTIX).
  However, this license covers **only the archived Go implementation**.
- There is **no `LICENSE` file at the repository root**.
- There is **no `LICENSE` file in `kaioken_v2/`** (the canonical TypeScript engine).
- Therefore, the active engine is **unlicensed**. Under international copyright law, an unlicensed codebase
  is default "all rights reserved": nobody may legally copy, distribute, fork, run, or contribute to it.
- Describing Kaioken as "open source" today is factually false. The open-source distribution half of the
  business model does not legally exist yet.

Phase **B0** exists specifically to eliminate this vacuum before any public or commercial activity begins.

---

## The solo-maintainer tension

Operating rule 1 ([`roadmap/README.md:398-410`](../README.md#10-operating-rules--the-constraints-under-which-all-of-the-above-is-sized))
governs the entire engineering effort: **the bottleneck is review, not generation.**

This tension is tenfold more severe in commercial operations:
- Every hour spent setting up merchant accounts, handling chargebacks, filing cross-border sales tax,
  drafting privacy policies, answering billing support emails, or negotiating enterprise terms is an
  hour **not spent developing the engine**.
- Unlike TypeScript code, billing administration and tax compliance cannot be delegated to an AI coding
  agent. A bug in code breaks a test; a mistake in corporate tax or merchant compliance incurs statutory
  penalties or personal liability.
- Therefore, the business path must be architected for **maximum operational leverage**: Merchant of
  Record (MoR) providers that take legal liability for global taxes, self-serve credit card billing,
  automated fail-closed quotas, and zero bespoke enterprise sales contracts during phases B0-B2.

---

## The seven phases (B0 – B6)

The business path is organized into seven sequential phases. Sibling agents are concurrently authoring
phases B3 through B6; this manifest establishes the holistic structure.

| Phase | Title | Purpose | File Count | Depends on | Blocks |
|---|---|---|---|---|---|
| **B0** | [Preconditions](roadmap/0_money_print/b0-preconditions/README.md) | Resolve license vacuum, verify dependencies, evaluate trademark, set readiness bar | 5 leaves + README (6 files) | Engineering M1 | B1, B2 |
| **B1** | [Model & Positioning](roadmap/0_money_print/b1-model-and-positioning/README.md) | Study comparables, select revenue model, set open-core boundary, define pricing & unit economics | 6 leaves + README (7 files) | B0 | B2 |
| **B2** | [Billing Engineering](roadmap/0_money_print/b2-billing-engineering/README.md) | Implement accounts, payment integration, entitlements, metering, proxy, and quota ceilings | 7 leaves + README (8 files) | B0, B1-02, B4 | B3 |
| **B3** | [Hosted Surface](roadmap/0_money_print/b3-hosted-surface/README.md) *(concurrent)* | Minimal viable hosted infrastructure, proxy operations, pager minimization | 4 leaves + README (5 files) | B1, B2 | B5, B6 |
| **B4** | [Company Formation](roadmap/0_money_print/b4-company-formation/README.md) *(concurrent)* | Legal entity questions, MoR vs direct banking rails, tax, terms, contributor agreements | 6 leaves + README (7 files) | B0 | B2-02, B5 |
| **B5** | [Go to Market](roadmap/0_money_print/b5-go-to-market/README.md) *(concurrent)* | Answering Question 2 ("how many people ran Kaioken"), launch narrative, docs funnel | 5 leaves + README (6 files) | B1, B2, B3, B4 | B6 |
| **B6** | Scale & Stop Conditions (`b6-scale`) *(concurrent)* | Hard exit criteria, financial runway limits, time-investment ceilings, pivot/sunset protocol | 4 leaves + README | B1, B2, B3, B5 | Ongoing solvency |

---

## What would make me stop: pointer to B6

A business path that does not define its own termination conditions is a trap. Phase **B6** establishes
explicit, non-negotiable **stop criteria**:
- If gross margins on inference resale turn negative after abuse controls are active.
- If operational overhead (support, tax, billing) exceeds 10 hours per week for three consecutive weeks,
  starving engine development.
- If customer acquisition cost consistently exceeds lifetime value after the initial developer launch.
- If legal clearance for trademarks or dependency licenses requires capital beyond the maintainer's
  personal risk budget.

When a kill condition trips, the project executes an orderly sunset or reverts to a pure noncommercial
research tool, preventing endless financial and cognitive drain.
