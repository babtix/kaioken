# B6-01 · Trigger conditions and financial thresholds for the first hire

> Codify the quantitative trigger thresholds for making the first corporate hire, basing the decision on sustained revenue and support hours rather than founder fatigue, and targeting the review bottleneck that AI coding agents cannot relieve.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/money_print/b1-model-and-positioning/06-unit-economics-model.md`](06-unit-economics-model.md), [`roadmap/money_print/b3-hosted-surface/03-team-workspaces.md`](03-team-workspaces.md) |
| **Blocks** | [`03-revenue-milestones-and-decision-gates.md`](03-revenue-milestones-and-decision-gates.md) |
| **Touches** | Operating budget, company organization, payroll planning |
| **Risk** | High. Hiring too early destroys cash reserves and creates personal payroll liabilities; hiring too late causes quality collapse and founder burnout as customer demands scale. |
| **Gate-critical** | No |

---

## Why this exists

Solo founders often hire out of an emotional reaction to fatigue: *"I'm working 70 hours a week and feeling burned out, so I need to hire an engineer."*

In a vibe-coded company, hiring an engineer to write code is almost always the wrong decision:
1. **Coding agents already write code:** The maintainer can generate 2,000 lines of code an hour using coding agents. Adding a human junior or mid-level software engineer adds management overhead without speeding up implementation.
2. **Review remains the bottleneck:** Operating rule 1 ([`roadmap/README.md:404`](../../README.md#L404)) states: *the bottleneck is review, not generation*. Adding a second engineer who writes another 2,000 lines an hour doubles the review burden on the maintainer, compounding the bottleneck instead of relieving it.
3. **Employees destroy runway:** An employee represents an inflexible, legally binding monthly fixed cost (salary, employment taxes, health benefits, equipment). If revenue dips, the maintainer cannot simply "turn off" an employee without severance and legal consequences.

A first hire is justified **if and only if** they relieve the specific uncompressible tasks that prevent the maintainer from reviewing code and advancing the roadmap: customer support triage, bug diagnosis, and customer onboarding.

This leaf establishes the exact, non-negotiable quantitative thresholds that must be satisfied before extending an offer of employment.

---

## Current state

Verified against team structure and repository:

| Dimension | Current status | Evidence |
|---|---|---|
| **Headcount** | 1 (Solo Maintainer) | `git shortlog -sn` reflects 100% solo authorship. |
| **Operating Model** | AI-assisted development | Operating rule 1 ([`roadmap/README.md:404`](../../README.md#L404)) governs all sizing. |
| **Support Volume** | 0 hours/week | Zero external users currently; baseline before launch. |
| **Monthly Revenue** | $0.00 | Pre-revenue phase. |

`UNVERIFIED:` Fully loaded annual cost of a remote Customer Success Engineer / Developer Advocate in software startups (typically estimated at $70,000–$120,000/year ASSUMPTION depending on location and seniority).

---

## The three quantitative trigger thresholds

The maintainer is strictly barred from hiring until all three of the following conditions are simultaneously met and sustained:

```
+─────────────────────────────────────────────────────────────────────────────+
|                          THE THREE HIRING TRIGGERS                          |
+─────────────────────────────────────────────────────────────────────────────+
|  1. FINANCIAL FLOOR:                                                        |
|     * Sustained Monthly Recurring Revenue (MRR) >= $18,000 ASSUMPTION       |
|     * Sustained for at least 3 consecutive calendar months                  |
|     * A 6-month operating cash reserve banked in corporate checking         |
|                                                                             |
|  2. SUPPORT LOAD FLOOR:                                                     |
|     * Support tickets, customer onboarding, and bug triage consume          |
|       >= 15 hours/week of maintainer time for 4 consecutive weeks           |
|     * Customer inquiries directly prevent releasing bi-weekly trains (R6)   |
|                                                                             |
|  3. ROLE SPECIFICITY:                                                       |
|     * The role is a Customer Engineer / Support Developer, NOT a generic    |
|       co-founder or backend feature coder                                   |
|     * The job description explicitly tasks them with triaging GitHub issues,|
|       writing repro tests, and answering customer support tickets           |
+─────────────────────────────────────────────────────────────────────────────+
```

### Why $18,000/mo MRR?
At $18,000/mo ($216,000 annual run rate ASSUMPTION):
- Gross inference margins (~40% ASSUMPTION) leave ~$10,800/mo net gross profit.
- Fixed infrastructure, SaaS, and accounting costs consume ~$1,000/mo ASSUMPTION.
- A qualified remote technical support contractor or junior engineer costs ~$5,000–$6,500/mo fully loaded ASSUMPTION.
- The business retains ~$3,300–$4,800/mo in cash flow to pay founder dividends and build cash reserves.

Hiring at any lower revenue run-rate forces the founder to forfeit their own salary or risk insolvency.

---

## What the first hire actually does

To relieve the review bottleneck, the first hire must own tasks that an AI agent cannot perform:

| Responsibility | Why an agent cannot do it | How it relieves the maintainer |
|---|---|---|
| **Tier-1 Support Triage** | Involves empathetic human communication, investigating customer account billing issues, and de-escalating frustrated users. | Eliminates 15 hours/week of reactive interruptions; preserves deep focus. |
| **Bug Reproduction & Characterization Tests** | Customers submit vague bug reports (*"Wiki failed on my repo"*). Someone must clone the user's repo, isolate the AST parser defect, and write a failing vitest test. | Delivers a clean, reproducible failing test to the maintainer. Operating rule 4 ([`roadmap/README.md:407`](../../README.md#L407)): the maintainer fixes the bug in 10 minutes because the test is already written. |
| **Documentation & Example Maintenance** | Ensuring quickstart tutorials run cleanly on new framework releases (Next.js 16, Fastify 5, Vite 7). | Keeps the onboarding funnel (`b5/03`) leak-free without maintainer time. |

The first hire **does NOT write major engine architectural refactors**. They defend the maintainer's review bottleneck.

---

## What done looks like

- [ ] Written hiring policy committed to company operating manual.
- [ ] Financial accounting dashboard configured in Xero/QuickBooks with automated alerts when MRR crosses the $18,000 ASSUMPTION threshold.
- [ ] Time-tracking audit showing maintainer support hours logged honestly.
- [ ] Standardized Contractor / Employment Agreement template reviewed by local legal counsel (`b4/01`).

---

## Steps

1. **Track Support Time Honestly.**
   Use a lightweight tool (Toggl or Clockify) to log hours spent on: (a) answering customer tickets, (b) reviewing external pull requests, (c) accounting/tax administrative tasks.
2. **Monitor the 3-Month MRR Runway.**
   Verify that gross revenue is not an ephemeral one-time spike (e.g. lifetime deals), but true recurring monthly subscriptions.
3. **Draft the "Customer Engineer" Job Description.**
   Specify core deliverables:
   - Triage all inbound GitHub Discussions and email tickets within 24 hours.
   - Author reproducible characterization tests for incoming bug reports.
   - Maintain showcase documentation repositories.
4. **Begin with a 90-Day Trial Contractor Agreement.**
   Engage the candidate as an independent contractor for 90 days before transitioning to a permanent employee role, validating cultural and technical fit with zero long-term termination liability.

---

## In scope

- Defining quantitative hiring triggers (MRR, support hours, cash reserve).
- Identifying the specific operational responsibilities of the first hire.
- Structuring the relationship between the first hire and operating rule 1.
- Designing trial contractor onboarding workflows.

---

## Out of scope

- Setting up employee equity stock option plans (ESOP / 409A valuations).
- Recruiting executive leadership (VP Sales, CMO).
- Expanding into physical commercial office leases.

---

## Gates

1. Verified MRR exceeding $18,000 ASSUMPTION for 90 consecutive days.
2. Verified corporate cash reserve exceeding $50,000 ASSUMPTION banked in corporate account.
3. Documented weekly support time exceeding 15 hours/week over 4 consecutive weeks.

---

## Traps

| Trap | Guard |
|---|---|
| Hiring a "co-founder" to share the misery | If the product lacks market traction, having two people stare at zero users does not help. Fix the product before adding headcount. |
| Hiring an engineer who generates unreviewed PRs | If the hire writes 5 PRs a week that sit in the maintainer's review queue, the bottleneck worsens. Hire for support and test writing, not raw feature generation. |
| Hiring on projected rather than realized revenue | Never hire based on a prospect's verbal promise to buy a $50k contract. Wait until the cash settles in the bank. |

---

## Open questions

None. The financial thresholds and operational triggers are clearly bounded.

---

## Session brief

```xml
<task>
In roadmap/money_print/b6-scale/01-when-to-hire.md, formulate the quantitative trigger conditions and financial thresholds for Kaioken's first hire.

Address:
1. Why hiring out of emotional fatigue is a trap in an AI-assisted codebase.
2. How operating rule 1 (the review bottleneck) dictates what the hire must do: customer support triage, bug reproduction, and characterization tests — NOT unreviewed feature coding.
3. The three strict quantitative thresholds:
   - Sustained MRR >= $18,000 ASSUMPTION for 3 consecutive months.
   - Customer support load >= 15 hours/week for 4 consecutive weeks.
   - Clear job description as Customer/Support Engineer.
4. Financial breakdown proving runway safety.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Operating rule 1 in roadmap/README.md line 404, current solo headcount (1), and unit economics dependencies.
- INFERENCES: Why adding software engineers to an AI-assisted project can worsen the maintainer's review bottleneck.
- OPEN QUESTIONS: Candidate sourcing channels once the threshold is crossed.
</research_mode>

<verification_loop>
Verify citations to roadmap/README.md lines 404 and 407.
Confirm that all salary, revenue, and reserve figures carry ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b6-scale/01-when-to-hire.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the three hiring triggers, (2) financial sustainability arithmetic, (3) first hire role definition, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
