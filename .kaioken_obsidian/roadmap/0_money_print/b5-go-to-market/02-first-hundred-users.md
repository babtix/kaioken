# B5-02 · Acquiring the first hundred users: channels, effort, and yield

> Structure the concrete acquisition pipeline for the first 100 active users, sequencing channels by effort and yield to establish genuine adoption before attempting monetization.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`01-launch-narrative.md`](01-launch-narrative.md), [`03-docs-and-onboarding-funnel.md`](03-docs-and-onboarding-funnel.md) |
| **Blocks** | [`04-pricing-page-and-checkout.md`](04-pricing-page-and-checkout.md), [`roadmap/money_print/b6-scale/03-revenue-milestones-and-decision-gates.md`](03-revenue-milestones-and-decision-gates.md) |
| **Touches** | User acquisition pipeline, developer outreach campaigns, onboarding tracking |
| **Risk** | High. Broadcasting generic marketing messages into noisy social media feeds yields zero active users. A solo maintainer must acquire early adopters through high-touch, targeted technical engagement. |
| **Gate-critical** | Yes |

---

## Why this exists

Quarterly Checkpoint Question 2 ([`roadmap/README.md:421`](../../README.md#L421)) demands an honest accounting: *"How many people other than you ran Kaioken this quarter?"*

Currently, that number is zero. Trying to sell a paid inference subscription (`b2/05`) or team tier (`b3/03`) to zero users is impossible. In developer tools, **free adoption is the distribution engine**. Developers do not pay for software they have not tested, verified, and integrated into their habits.

The primary goal of this phase is not revenue. **The goal is getting 100 developers to successfully run `kaioken scan` and `kaioken wiki` on their own real-world repositories.** Once 100 engineers experience the utility of a durable, verified knowledge base, the subset who want managed inference and hosted collaboration will emerge naturally.

This leaf provides a concrete, sequenced battle plan for acquiring those first 100 users, detailing the exact channels, required effort, and expected yield.

---

## Current state

Verified against project status:

| Metric | Current value | Target for this leaf |
|---|---|---|
| **External installations** | 0 | 100 active developer runs |
| **Public releases** | Unreleased (archived v1 in `.kaioken_v1/`, v2 in `kaioken_v2/`) | v2.0 npm package published (`@kaioken/cli`) |
| **Showcase repositories** | 1 (Kaioken dogfooding itself in `roadmap/README.md §10 rule 5`) | 5 public popular open-source repos with published Kaioken wikis |

`UNVERIFIED:` Historical conversion rates from Hacker News "Show HN" posts to local CLI tool execution (typically estimated at 0.5%–2% of post visitors running terminal commands).

---

## The channel sequence: effort vs expected yield

The first 100 users are not acquired via broad Google Ads or generic tweets. They are acquired in four distinct waves, ordered from highest-conviction personal outreach to structured public launches:

| Wave | Channel & Method | Effort required | Expected active users | Tactical execution details |
|---|---|---|---|---|
| **Wave 1** | **Direct 1-on-1 "Artifact-First" Outreach** | High (20–30 hours) | **15 – 25 users** | Identify 20 maintainers of complex TypeScript/Python/Go open-source repos (5k–20k GitHub stars). Run `kaioken wiki` on their repo locally. Host the generated markdown on a public demo link. Message the maintainer: *"I ran my local knowledge engine on your repo; here is a verified architectural breakdown of your core packages with zero hallucinated symbols. Would this be useful in your repo's CI?"* |
| **Wave 2** | **"Show HN" on Hacker News & Lobste.rs** | Medium (5–10 hours) | **30 – 50 users** | Post a highly technical, honest breakdown: *"Show HN: Kaioken – A local repository knowledge engine with CI drift verification"*. Lead with the problem (agents hallucinating architecture) and the offline Tree-sitter verification mechanism. No marketing jargon; link directly to GitHub repo and web demo. |
| **Wave 3** | **Specialized Developer Communities (Reddit & Discord)** | Medium (8–12 hours) | **20 – 35 users** | Targeted posts in technical subreddits: `r/typescript`, `r/rust`, `r/golang`, and `r/LocalLLaMA`. Frame around concrete technical challenges: *"How we use Tree-sitter AST queries to verify LLM claims against code before writing markdown documentation."* |
| **Wave 4** | **MCP Ecosystem & AI Tool Directories** | Low (3–5 hours) | **10 – 20 users** | List Kaioken as a Model Context Protocol (MCP) server in Cursor directories, Awesome-MCP-Servers, and Smithery. Developers looking for deep repo context tools install Kaioken to power their existing Cursor/Claude setups. |
| **Total** | **Combined Target** | **~45 hours** | **75 – 130 users** | **Sufficient critical mass to validate Checkpoint Question 2.** |

---

## Tactical outreach script (Wave 1)

When reaching out to experienced open-source maintainers, generic flattery fails. Use the **Artifact-First** formula:

```text
Subject: Verified architectural map of [Repo Name] (no hallucinated symbols)

Hi [Maintainer],

I've been building Kaioken, an open-source knowledge engine that parses ASTs locally 
to compile verified repository documentation.

I ran it on [Repo Name] and generated an architectural wiki covering your core 
data structures: [Link to hosted demo/PR].

Notice that every function signature and module dependency is cross-referenced 
against your real Tree-sitter ASTs, so there are no hallucinated imports. It also 
includes a `status --check` command that runs in GitHub Actions to alert you if 
code drifts past the documentation on pull requests.

If this is useful, feel free to merge the PR or copy the markdown. If you want 
to run it yourself locally: `npx @kaioken/cli init`.

Feedback on where the AST parser struggled with your codebase would be invaluable.
```

---

## Defining an "Active User"

To prevent vanity metrics (e.g. counting npm downloads from automated CI bots), an active user is strictly defined as:

1. **A developer who has executed `kaioken init` and `kaioken scan`** on a repository containing at least 20 source files.
2. **Who subsequently ran `kaioken cards` or `kaioken wiki`** to generate structured repository documentation.
3. **Who ran `kaioken status` at least once** following a local code modification.

If a developer installs the package and never executes a scan, they do not count toward the first 100.

---

## What done looks like

- [ ] Wave 1 outreach completed to at least 20 open-source maintainers, with at least 5 merged PRs or public demo links acknowledged.
- [ ] Show HN post published and monitored, engaging in technical discussions in the comments.
- [ ] At least 100 verified developers have completed a full initialization and scan run.
- [ ] A lightweight feedback loop established: qualitative issues and feedback logged directly in GitHub Issues.
- [ ] Quarterly Checkpoint Question 2 records a verified count $\ge 100$.

---

## Steps

1. **Package the CLI for Zero-Friction Invocation.**
   Ensure `@kaioken/cli` is published on npm so users can run `npx @kaioken/cli init` without manual repository cloning.
2. **Build the "Hall of Fame" Showcase Demos.**
   Run Kaioken on 5 widely respected repositories:
   - TypeScript: `trpc/trpc` or `expressjs/express`
   - Python: `tiangolo/fastapi`
   - Go: `gin-gonic/gin`
   Publish the generated wikis on `website/showcase/` as live proof of quality.
3. **Execute Wave 1 (Maintainer Outreach).**
   Send 20 personalized emails/DMs with pre-compiled wikis attached. Iterate on parser bugs reported by maintainers.
4. **Launch Wave 2 (Show HN & Lobste.rs).**
   Time the launch for a Tuesday or Wednesday morning (13:00 UTC). Stay online for 8 continuous hours to answer technical architecture questions personally.
5. **Monitor and Engage Waves 3 and 4.**
   Participate in community discussions on Reddit and Discord. Capture incoming feedback into the issue backlog.

---

## In scope

- Designing the four-wave user acquisition funnel.
- Establishing the criteria for verified active users.
- Writing technical outreach templates and demo collateral.
- Planning the Show HN launch mechanics.

---

## Out of scope

- Paid PPC advertising (Google Search, Reddit Ads, LinkedIn Ads).
- Hiring a growth marketing agency.
- Monetizing users before the 100-user active threshold is reached.

---

## Gates

1. 100 unique developers confirmed to have executed a local scan and generation workflow.
2. At least 5 external open-source repositories hosting Kaioken-generated `.kaioken/` artifacts in public branches or PRs.
3. Written retrospective on the first 100 users committed to `roadmap/money_print/b5-go-to-market/02-first-hundred-users.md`.

---

## Traps

| Trap | Guard |
|---|---|
| Relying on npm download counts | npm counts automated CI downloads, mirrors, and bots. Track real user engagement via GitHub stars, issues filed, and community interactions. |
| Pitching to non-developers | Do not waste time pitching to business executives or product managers. Kaioken's value is immediately obvious only to developers who maintain large codebases. |
| Arguing with cynical commenters | Commenters will claim "I can just ask ChatGPT". Respond politely: "ChatGPT is great for ad-hoc questions; Kaioken compiles verified ground for your whole team and checks drift in CI. Here's a live demo." |

---

## Open questions

None. The channels, execution order, and effort-to-yield ratios are clearly specified.

---

## Session brief

```xml
<task>
In roadmap/money_print/b5-go-to-market/02-first-hundred-users.md, formulate the concrete acquisition plan for Kaioken's first 100 active users.

Sequence the channels by effort and expected yield:
1. Wave 1: Direct 1-on-1 "Artifact-First" outreach to open-source maintainers (high effort, high yield).
2. Wave 2: Show HN on Hacker News and Lobste.rs (medium effort, high spike).
3. Wave 3: Targeted developer subreddits (r/typescript, r/LocalLLaMA).
4. Wave 4: MCP ecosystem directories (Cursor/Claude integration).

Define what an "active user" strictly means, provide the outreach script for maintainers, and affirm the core principle: free adoption must precede paid conversion.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Roadmap §11 Question 2 ("How many people other than you ran Kaioken this quarter?"), current user baseline (0), and CLI command surface.
- INFERENCES: Why developer trust is won through pre-computed artifacts rather than cold sales pitches.
- OPEN QUESTIONS: Exact scheduling of the Show HN launch date.
</research_mode>

<verification_loop>
Verify citations to roadmap/README.md lines 421 and §10 rule 5.
Confirm that all yield numbers carry ASSUMPTION labels where applicable.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b5-go-to-market/02-first-hundred-users.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) four-wave acquisition table, (2) outreach template, (3) active user definition, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
