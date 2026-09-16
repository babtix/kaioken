# B0-05 · The commercial readiness bar

> The strict, observable checklist that must pass before taking money from a single customer:
> licensing, green CI, runtime sandboxing, verifiable distribution, responsive support, and a working refund path.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits completion of engineering prerequisites M1, M7, M2 and B0-01) |
| **Size** | S |
| **Depends on** | [`B0-01`](01-fix-the-license-vacuum.md), [`M1`](../../m01-green-everywhere/README.md), [`M7`](../../m07-permissions-and-sandboxing/README.md), [`M2`](../../m02-trusted-distribution/README.md) |
| **Blocks** | Launching any paid plan, billing integration live keys ([`B2-02`](02-payment-provider-integration.md)) |
| **Touches** | Release verification checklists, commercial readiness gates |
| **Risk** | High — launching prematurely violates customer trust and creates unmanageable support debt |
| **Gate-critical** | **Yes — the definitive release gate for the commercial path** |

---

## Why this exists

Operating Rule 2 states: *a green build is a precondition, not a milestone.*
In commercial operations, an analogous rule applies: **customer readiness is a precondition, not an afterthought.**

Selling developer tooling before the underlying system can reliably install, verify, execute safely, and
be refunded when broken is disastrous:
- Charging a customer for an autonomous agent that lacks sandboxing risks unconstrained loops, filesystem
  destruction, or runaway API bills.
- Charging for a tool that requires building from uncommitted source code alienates non-contributor developers.
- Taking payment without an explicit, functional refund mechanism invites merchant disputes, chargeback
  penalties (typically $15–$25 per dispute), and merchant account termination.

This leaf establishes the **six non-negotiable readiness gates** that must all be satisfied before opening
the commercial billing gateway.

---

## Current state

Verified against current repository status:

| Readiness Dimension | Prerequisite | Current Status | Blocker Description |
|---|---|---|---|
| **1. License Applied** | `B0-01` | **FAIL** | Repository root and `kaioken_v2/` have no license file. Code is unlicensed |
| **2. CI Green Everywhere** | `M1-01` | **FAIL** | `.github/workflows/ci.yml` points at nonexistent `kaioken v1/`. All jobs fail before tests run (Gap **G-6**) |
| **3. Sandboxing & Ceilings** | `M7-05` | **FAIL** | Zero runtime ceilings or spend limits in `kaioken_v2/packages/agent/`. Loops run unbounded |
| **4. Installable & Verifiable** | `M2-01` | **FAIL** | Release workflow (`.github/workflows/release.yaml`) points at Go goreleaser. No npm publish workflow |
| **5. Human Support Channel** | Operational | **FAIL** | No designated support inbox, triage SLA, or issue escalation channel |
| **6. Functional Refund Path** | Operational | **FAIL** | No merchant account, refund policy, or self-service cancellation flow configured |

Every single readiness dimension is currently unfulfilled. This proves why `money_print` cannot rush
directly to billing integration.

---

## What done looks like

The six-point readiness bar. Every item is checkable by running something or pointing at an
artifact — none of them is a matter of opinion.

Each item is binary: either it is demonstrably verified, or it is not.

```markdown
- [ ] 1. License Applied & Clear:
      Top-level LICENSE file committed; package.json contains valid SPDX identifier;
      zero unlicensed or unapproved copyleft dependencies in production tree.

- [ ] 2. Continuous Integration Green:
      GitHub Actions CI runs on Ubuntu/macOS/Windows, executing `npm ci`, `npm run typecheck`,
      `npm test`, and the CLI smoke test cleanly on every master push.

- [ ] 3. Permissions & Sandboxing Shipped (M7):
      Hard resource ceilings (turn limits, wall-clock timeout, and fail-closed spend caps)
      actively prevent runaway agent loops. Filesystem mutation boundaries enforced.

- [ ] 4. Verifiable Stranger Installation (M2):
      A developer with no prior knowledge of the repo can install via `npm install -g @kaioken/cli`
      or download a signed release binary, run `kaioken --version`, and complete an offline scan.

- [ ] 5. Dedicated Support Channel:
      A dedicated email address (e.g. `support@...`) or monitored triage queue exists, with a
      written commitment to respond to paying customer inquiries within 48 business hours.

- [ ] 6. Painless Refund Path:
      A documented 14-day or 30-day "no questions asked" refund policy is published, and the
      maintainer has tested issuing a full refund inside the payment sandbox.
```

---

## Steps

1. **Track prerequisite milestones:** Monitor completion of `M1-01` (retarget CI), `M7-05` (hard ceilings),
   and `M2-03` (release workflow retarget).
2. **Execute stranger verification test:** Perform a clean installation test on a pristine virtual
   machine or container without development tooling pre-installed.
3. **Draft support policy:** Formulate support boundaries appropriate for a solo maintainer:
   - Clarify response times (e.g., best-effort 48h, not 24/7 instant chat).
   - Define supported operating environments (Node >= 22 on standard OS versions).
4. **Draft refund policy:** Publish standard customer-centric refund terms to eliminate consumer
   hesitation and prevent credit card disputes.
5. **Formal audit sign-off:** The maintainer reviews and checks all six items before activating live
   Stripe/MoR API keys.

---

## In scope

- Verification protocol for commercial readiness.
- Written definitions of support and refund standards.
- Linking engineering milestone completion to commercial activation.

---

## Out of scope

- Fulfilling the engineering tasks of M1, M7, or M2 (governed by their respective milestone roadmaps).
- Customer support software automation (Zendesk/Intercom integration).
- Complex multi-tiered enterprise service level agreements (SLAs).

---

## Gates

1. All six checkboxes on the readiness checklist marked as completed with accompanying commit SHAs
   or URL evidence.
2. Maintainer explicit written confirmation that the readiness bar has passed.

---

## Traps

| Trap | Guard |
|---|---|
| "We'll fix the refund flow when someone asks" | A broken refund flow turns a minor customer complaint into an expensive chargeback and fraud flag |
| Selling without sandboxing (M7) | Autonomous coding agents will destroy repos or consume infinite API spend if unconstrained |
| "It works on my machine" installation | Stranger installation must be tested in an isolated container from the public registry |
| Promising 24/7 support as a solo developer | Be honest about response times. Under-promise and over-deliver rather than burning out |

---

## Open questions

1. **What is the default refund window?**
   - *Recommendation:* 14-day unconditional refund for subscription fees; unused prepaid inference
     credits refundable within 30 days.
   - *Owner:* Human maintainer.

---

## Session brief

```xml
<task>
In roadmap/money_print/b0-preconditions/, audit the status of the six commercial readiness dimensions
against the repository working tree:

1. Check LICENSE status at repo root and in kaioken_v2/package.json.
2. Check GitHub Actions CI configuration in .github/workflows/ci.yml (M1).
3. Check sandboxing and resource ceiling implementation in kaioken_v2/packages/agent/ (M7).
4. Check release workflows in .github/workflows/release.yaml (M2).
5. Document exact blockers preventing each dimension from passing.
6. Synthesize an honest status report verifying that the commercial bar remains locked until
   prerequisites are resolved.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: Specific file paths, lines, and missing scripts across M1, M7, M2, and B0.
- INFERENCES: Support load resulting from premature launch.
- OPEN QUESTIONS: Target timeline for completing prerequisite milestones.
</research_mode>

<verification_loop>
Verify that cited milestones and file paths exist and match current master.
Confirm no source code or configuration files are modified.
</verification_loop>

<action_safety>
Do NOT attempt to mark checkboxes as complete unless observable proof exists in the working tree.
Do NOT run git add or git commit. Leave work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) audit scorecard across the six readiness dimensions, (2) blocking issue citations,
(3) readiness verdict (Pass or Blocked), (4) recommended immediate next step for the maintainer.
</structured_output_contract>
```
