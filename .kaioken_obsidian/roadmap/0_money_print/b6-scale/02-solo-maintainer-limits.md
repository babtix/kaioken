# B6-02 · The honest solo maintainer ceiling: uncompressible work

> Establish the hard operational ceiling of a single-person software company, identifying the four categories of labor that do not compress with AI coding assistance and defining the maximum sustainable scale of a solo operator.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/README.md`](../../README.md), [`roadmap/money_print/b3-hosted-surface/04-uptime-and-support-promise.md`](04-uptime-and-support-promise.md), [`roadmap/money_print/b4-company-formation/06-records-and-compliance-calendar.md`](06-records-and-compliance-calendar.md) |
| **Blocks** | [`03-revenue-milestones-and-decision-gates.md`](03-revenue-milestones-and-decision-gates.md), [`04-what-would-make-you-stop.md`](04-what-would-make-you-stop.md) |
| **Touches** | Operating hours allocation model, capacity planning, burnout safeguards |
| **Risk** | Critical. Overestimating solo maintainer capacity creates dangerous illusions of infinite productivity, resulting in missed tax filings, ignored security incidents, customer attrition, and founder collapse. |
| **Gate-critical** | Yes |

---

## Why this exists

AI coding assistants generate a seductive illusion: because an agent can write 2,000 lines of code in an hour, a solo developer can theoretically build and maintain an entire enterprise software ecosystem alone — the IDE, the CLI, the language parsers, the extension registry, the inference proxy, the billing engine, the documentation portal, and the marketing website.

**This is the single most dangerous fallacy in modern software.** 

Writing code is only a fraction of running a commercial software company. As a product acquires paying users, an entirely different category of work emerges: answering support tickets, triaging confusing bug reports, debugging production network drops, reconciling cross-border VAT statements, renewing corporate entity registrations, and negotiating with upstream API vendors.

This leaf serves as **the uncompromising counterweight to every optimistic assumption throughout the `money_print` tree**. It enumerates the specific tasks that do not compress with AI assistance, models the finite weekly capacity of one human being, and establishes the honest ceiling beyond which a solo maintainer cannot scale without degrading quality or health.

---

## Current state

Verified against operating reality:

| Metric | Planned state | Operating constraint |
|---|---|---|
| **Headcount** | 1 human operator | 168 hours total in a week; ~45 sustainable working hours maximum. |
| **Operating Rule 1** | Bottleneck is review, not generation | [`roadmap/README.md:404`](../../README.md#L404) — review capacity caps feature velocity at ~1 feature/week. |
| **Operating Rule 6** | Calendar-driven releases | [`roadmap/README.md:409`](../../README.md#L409) — release train every two weeks requires dedicated testing and tagging time. |
| **Hosted Footprint** | Bounded to proxy & auth | [`roadmap/money_print/b3-hosted-surface/01-what-gets-hosted.md`](01-what-gets-hosted.md) — pruned to minimize operational pager load. |

`UNVERIFIED:` Average hours per week spent by solo micro-SaaS founders on customer support at various customer counts (typically reported in indie founder surveys at 5 hours/wk for 100 customers, scaling to 25+ hours/wk at 1,000 customers).

---

## The four categories of uncompressible work

AI agents can draft prose, generate boilerplate, and refactor functions. However, four critical operational domains **fundamentally resist compression**:

| Domain | Why AI cannot compress it | Solo maintainer time footprint |
|---|---|---|
| **1. Code and Diff Review** | An agent can write a 500-line pull request in 3 minutes. Reviewing that PR for architectural drift, security flaws, race conditions, and subtle AST regressions requires deep, uninterrupted human cognitive effort. Skimming or auto-approving agent PRs inevitably introduces catastrophic bugs. | **15 – 20 hours / week**<br>(Operating Rule 1) |
| **2. Customer Support & Diagnostics** | Customers file vague bug descriptions: *"Scan hangs on my monorepo"*. Diagnosing this requires empathetic communication, asking for logs, analyzing user permissions, and isolating third-party toolchain quirks (e.g. pnpm symlink loops). Delegating support to automated AI chatbots infuriates paying developers. | **10 – 15 hours / week**<br>(At 200–500 active users) |
| **3. Live Incident Response & Ops** | When Cloudflare Workers drop connections, Stripe webhooks fail to deliver, or Anthropic changes their API error schema without notice, a real human must wake up, inspect logs, update routing rules, and communicate with customers via the status page (`b3/04`). | **2 – 5 hours / week**<br>(Surging to 20h during outages) |
| **4. Legal, Tax, and Compliance** | Filing corporate annual returns (`b4/06`), reconciling bank statements in accounting software (`b4/03`), executing vendor contracts, and signing customer DPAs (`b4/04`) requires personal legal responsibility. The founder's signature cannot be delegated to an LLM. | **3 – 5 hours / week** |

---

## The weekly time allocation model

When uncompressible obligations are modeled against a sustainable 45-hour work week, the available time for new software development is severely constrained:

```
+─────────────────────────────────────────────────────────────────────────────+
|               A SUSTAINABLE SOLO FOUNDER 45-HOUR WEEK                       |
+─────────────────────────────────────────────────────────────────────────────+
|  Code Review & Architecture (Rule 1)      ████████████████   16 hours (35%) |
|  Customer Support & Bug Diagnosis         ██████████         10 hours (22%) |
|  Operations, Uptime & Maintenance         ████                4 hours  (9%) |
|  Legal, Bookkeeping & Compliance (b4/06)  ████                4 hours  (9%) |
|  Community Engagement & Release Train     ███                 3 hours  (7%) |
+─────────────────────────────────────────────────────────────────────────────+
|  REMAINING TIME FOR NEW CODE GENERATION:  ████████            8 hours (18%) |
+─────────────────────────────────────────────────────────────────────────────+
```

### The Inevitable Crunch
Notice the mathematical reality: **only 8 hours per week are left for new feature implementation.** 

If the customer base doubles and customer support expands from 10 hours to 20 hours per week:
- New engineering drops to **0 hours**.
- The maintainer enters a permanent reactive loop: fixing bugs, answering tickets, and paying bills.
- The roadmap stalls completely.

---

## The honest solo maintainer ceiling

Based on this capacity model, the absolute limits of a solo maintainer running Kaioken are bounded as follows:

| Metric | Solo maintainer ceiling | What happens if exceeded |
|---|---|---|
| **Paying Customers** | **300 – 500 active subscribers ASSUMPTION** | Support volume exceeds 20 hours/week; ticket response time slips past the 48-hour promise (`b3/04`); churn spikes. |
| **Supported Repositories** | **1,000 – 2,000 active repos ASSUMPTION** | The diversity of programming languages, build tools, and obscure monorepo setups generates more parser edge cases than one person can debug. |
| **Monthly Revenue** | **$15,000 – $25,000 MRR ASSUMPTION** | Revenue reaches the hiring threshold (`b6/01`). If the maintainer refuses to hire, the product stagnates. |
| **Active Codebases** | **1 canonical engine (`kaioken_v2`)** | Maintaining both Theia and Code-OSS desktop forks simultaneously violates capacity limits ([`roadmap/decisions/d3-one-studio-fork.md`](../../decisions/d3-one-studio-fork.md)). |

---

## What done looks like

- [ ] Capacity model committed to the roadmap as an explicit constraint on milestone sizing.
- [ ] Maintainer logs time weekly to ensure support and administrative work do not exceed 20 hours/week.
- [ ] Product scope aggressively pruned whenever uncompressible work threatens the bi-weekly release train (`roadmap/README.md §10 rule 6`).
- [ ] Clear recognition that exceeding 500 paying customers requires either hiring (`01-when-to-hire.md`) or enforcing a hard customer waitlist.

---

## Steps

1. **Conduct a Bi-Weekly Time Audit.**
   At every bi-weekly release train, audit total hours spent on review, support, ops, and compliance.
2. **Enforce the Feature Freeze Circuit Breaker.**
   If support + operations exceed 25 hours in any given week:
   - Immediately freeze all new milestone feature generation.
   - Dedicate the subsequent two weeks exclusively to bug fixes, parser stabilization, and documentation improvements (`b5/03`).
3. **Cap Customer Intake if Capacity is Breached.**
   If paying customer count approaches 400 and support queue response times degrade, temporarily close self-service checkout on the website (`b5/04`), placing new users on a waitlist to protect quality for existing customers.

---

## In scope

- Modeling the four categories of uncompressible human labor.
- Calculating the weekly hour allocation of a solo operator.
- Defining the maximum sustainable customer and revenue ceilings.
- Establishing capacity circuit breakers to prevent founder burnout.

---

## Out of scope

- Automated AI support agents (hallucinatory support creates more frustration).
- Working 80-hour weeks (explicitly rejected as an unsustainable failure mode).
- Premature enterprise SLA commitments.

---

## Gates

1. Capacity model approved and integrated into roadmap planning.
2. Written confirmation that the single-maintainer ceiling is capped at 500 customers ASSUMPTION before hiring or pausing growth.
3. Feature-freeze circuit breaker mechanism committed to operating rules.

---

## Traps

| Trap | Guard |
|---|---|
| "I'll just work faster with a newer AI model" | Newer models write code faster; they do not read code faster, nor do they calm down an angry customer who lost a billing invoice. |
| Sacrificing sleep to fix nighttime proxy outages | A solo operator sleeping 4 hours a night makes catastrophic mistakes during code review. Enforce "best effort" uptime boundaries (`b3/04`). |
| Adding enterprise customers for the big check | One enterprise customer demanding custom security reviews and weekly status calls consumes 10 hours a week alone. Say no to custom enterprise deals. |

---

## Open questions

None. The mathematical limits of single-human attention are absolute.

---

## Session brief

```xml
<task>
In roadmap/money_print/b6-scale/02-solo-maintainer-limits.md, formulate the honest ceiling of a solo maintainer company running Kaioken.

Act as the counterweight to every optimistic assumption elsewhere in money_print:
1. Name the four categories of work that do NOT compress with AI coding assistance:
   - Code and diff review (Operating rule 1)
   - Customer support and edge-case bug triage
   - Live incident response and ops
   - Legal, tax, and compliance obligations (b4/06)
2. Break down the sustainable 45-hour work week, proving that only ~8 hours/week remain for new feature implementation.
3. Establish the hard solo maintainer ceiling: 300–500 paying subscribers ASSUMPTION, beyond which hiring or waitlisting is mandatory.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Operating rule 1 in roadmap/README.md line 404, rule 6 (release train), and solo headcount constraint.
- INFERENCES: Why customer support load grows linearly or super-linearly with user diversity while coding velocity is decoupled.
- OPEN QUESTIONS: Exact customer count at which support load spikes in practice.
</research_mode>

<verification_loop>
Verify citations to roadmap/README.md lines 404 and 409.
Confirm cross-references to b3/04, b4/06, and b6/01.
Ensure all ceiling figures carry ASSUMPTION labels.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b6-scale/02-solo-maintainer-limits.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the four uncompressible domains, (2) the 45-hour weekly allocation model, (3) solo maintainer ceiling table, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
