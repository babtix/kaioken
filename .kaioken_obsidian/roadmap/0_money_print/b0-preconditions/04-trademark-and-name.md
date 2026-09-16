# B0-04 · Trademark and name clearance

> Confront the intellectual property exposure of the name "Kaioken" before commercial transactions
> begin, evaluating risks, commercial entity renaming, and internal codename retention.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits professional trademark evaluation and maintainer naming decision) |
| **Size** | S |
| **Depends on** | Maintainer commercial positioning ([`B1-05`](05-positioning-and-icp.md)) |
| **Blocks** | [`B0-05`](05-readiness-bar.md), domain acquisition, public commercial marketing |
| **Touches** | Product brand, domain registrations, package naming (`@kaioken/*`), marketing materials |
| **Risk** | High — using a recognized pop-culture trademark for a commercial product risks Cease & Desist orders |
| **Gate-critical** | **Yes — blocks entity formation and commercial branding** |

---

## Why this exists

The name **"Kaioken"** is not a generic or coined developer term: it is borrowed directly from a globally
famous Japanese media franchise (*Dragon Ball*, owned by Shueisha, Toei Animation, and Akira Toriyama's
estate / Bird Studio).

In noncommercial, open-source software, anime-inspired project names frequently exist as personal homages
without attracting aggressive legal enforcement. However, **the legal landscape changes completely the
instant money changes hands**.

When a commercial entity charges subscription fees, sells metered cloud inference, or solicits corporate
customers under a trademarked term:
1. It enters the zone of commercial trademark infringement and brand dilution under US (Lanham Act) and
   international intellectual property laws.
2. The risk of receiving a formal Cease & Desist (C&D) letter, losing primary domain names, or facing
   forced app store / marketplace de-listings multiplies dramatically.
3. Rebranding *after* gaining market traction and building SEO equity is painful, expensive, and confusing
   to customers.

This leaf requires addressing the trademark risk head-on before commercial launch.

---

## Current state

Verified facts regarding project naming:

| Fact | Current Repository State | Notes |
|---|---|---|
| Project name | `kaioken` / `kaioken_v2` | Used across codebases, configs, and package names |
| Author entity | `BABTIX` (`.kaioken_v1/LICENSE:3`) | Existing copyright attribution handle |
| Commercial status | Pre-revenue, zero paying customers | Trademark liability has not yet materialized in commerce |
| Trademark ownership | `UNVERIFIED:` Registered by Shueisha / Toei Animation | Trademark covers entertainment, merchandise, and potentially software/games |
| Engine coupling | 19 packages in `kaioken_v2/packages/` | Internal import names use `@kaioken/*` |

---

## The three strategic naming paths

| Option | Strategy | Trademark Risk | Rebranding Cost | Long-term Brand Equity |
|---|---|---|---|---|
| **Path A: Full Brand Retention** | Keep "Kaioken" as public brand, product name, and commercial entity | **Critical.** High likelihood of eventual trademark challenge as revenue grows | None initially; catastrophic if forced to rebrand later | Fragile. Cannot safely register official trademarks in software class |
| **Path B: Two-Layer Name (Codename vs Brand)** | Keep "Kaioken" as open-source engine codename; launch commercial product and company under a new distinct mark | **Low.** Engine is treated as internal technology; commercial tier has clean IP | Low. CLI/engine imports remain `@kaioken/*`; commercial site/app use new brand | **High.** Commercial entity owns and protects its own registered trademark |
| **Path C: Complete Clean Rebrand** | Fully rename engine, packages, repos, and commercial product before public GA | **Zero.** Complete freedom to operate | Medium. Requires mass renaming across packages and docs | **High.** Single unified brand across open-source and commercial tiers |

---

## What done looks like

- [ ] A professional trademark search (TESS / WIPO / EUIPO in International Class 009 and 042) is
      conducted for the chosen commercial mark.
- [ ] Maintainer records a binding decision between Path A, Path B, or Path C.
- [ ] If Path B or C is chosen:
  - A clean, defensible commercial brand name is selected (e.g., *Babtix RepoGraph*, *Provenance AI*,
    or an original coined term).
  - Domain names and social handles for the commercial brand are secured.
  - The repository retains "Kaioken" as the technical engine codename (if Path B) without risking the
    commercial entity.

---

## Steps

1. **Formulate specific legal questions for IP counsel:**
   - *"Does the commercial sale of an AI repository knowledge engine named 'Kaioken' infringe upon
     existing video game or software trademarks held by Shueisha/Toei?"*
   - *"If the open-source CLI engine retains 'Kaioken' as a codename, but the commercial SaaS/hosted
     service operates under a distinct proprietary trademark, is the liability mitigated?"*
2. **Conduct preliminary trademark screening:** Search trademark databases (USPTO TESS, EUIPO) for
   "Kaioken" in Classes 009 (Computer Software) and 042 (Software as a Service).
3. **Evaluate Path B viability:** Analyze whether operating the commercial hosted service under a
   separate brand (e.g. `babtix.com` or a distinct product name) while maintaining `kaioken` as the
   open-source engine provides adequate legal separation.
4. **Record maintainer decision:** Document the chosen naming architecture in
   `roadmap/money_print/b0-preconditions/`.

---

## In scope

- IP risk assessment for project naming.
- Definition of commercial entity vs open-source engine naming boundary.
- Trademark search criteria for counsel.

---

## Out of scope

- Filing formal trademark applications with government patent and trademark offices.
- Refactoring internal package imports (`@kaioken/*`) prior to a strategic decision.
- Logo and visual design generation.

---

## Gates

1. A written decision recorded and signed off by the maintainer selecting Path A, B, or C.
2. If Path B or C is selected, the chosen commercial name is confirmed available via preliminary
   trademark search and primary domain registration.

---

## Traps

| Trap | Guard |
|---|---|
| "Nobody cares about an open-source tool" | True for hobbies; false the moment Stripe invoices and Google Ads run. Legal action hits commercial entities |
| Renaming too late | Changing your name with 5,000 GitHub stars and paying customers is 100x more costly than doing it before launch |
| Trying to register "Kaioken" as a trademark | Almost certain to receive an opposition from media conglomerate counsel. Do not waste legal capital |
| Breaking developer workflow with an unneeded code rewrite | Path B allows keeping `@kaioken/*` packages internally while selling the hosted service under a pristine commercial brand |

---

## Open questions

1. **Does the maintainer select Path B (distinct commercial brand, retain Kaioken engine codename)?**
   - *Recommendation:* Path B is the optimal balance for a solo developer. It preserves existing code
     and community goodwill while shielding the commercial SaaS entity from IP disputes.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
Analyze the intellectual property and trademark constraints surrounding the name "Kaioken" for
commercial developer tooling:

1. Document the origins of the name "Kaioken" and identify existing trademark registrations in
   computer software (Class 009) and SaaS/cloud services (Class 042).
2. Compare the three strategic paths:
   - Path A: Keep "Kaioken" universally (High trademark risk).
   - Path B: Commercial SaaS brand distinct, engine retains "Kaioken" codename (Balanced).
   - Path C: Complete rebrand across open-source and commercial tiers (Maximum safety, higher rename churn).
3. Prepare a concise briefing paper with clear recommendations for the human maintainer.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: "Kaioken" originates from Dragon Ball media franchise; project is currently pre-revenue.
- INFERENCES: Corporate enterprise legal teams will flag pop-culture names during vendor IP diligence.
- OPEN QUESTIONS: Preferred alternative commercial marks and maintainer risk appetite.
</research_mode>

<verification_loop>
Verify that trademark classes cited (Class 009 and 042) correspond accurately to Nice Classification standards.
Confirm no source code renames are executed in this session.
</verification_loop>

<action_safety>
Do NOT rename any packages or files in the repository.
Do NOT register domains or commit brand assets.
Leave all work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) trademark exposure evaluation, (2) assessment of Path A vs B vs C, (3) questions to pose
to an IP attorney, (4) maintainer sign-off recommendation.
</structured_output_contract>
```
