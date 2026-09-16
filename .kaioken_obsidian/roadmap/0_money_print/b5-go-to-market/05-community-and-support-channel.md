# B5-05 · Sustainable community channels and support boundaries

> Establish sustainable, bounded community and support channels for Kaioken, resolving the apparent contradiction with the roadmap's refusal of chat bots and protecting solo maintainer focus from real-time communication debt.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | [`roadmap/README.md`](../../README.md), [`roadmap/money_print/b3-hosted-surface/04-uptime-and-support-promise.md`](04-uptime-and-support-promise.md) |
| **Blocks** | Long-term user retention, developer community growth |
| **Touches** | GitHub Discussions configuration, community Discord server, issue templates |
| **Risk** | Medium. Unbounded community channels (such as open Discord DMs) generate constant, unstructured interruptions that destroy deep engineering focus and lead directly to solo founder burnout. |
| **Gate-critical** | No |

---

## Why this exists

A thriving developer tool requires a gathering place where developers can ask questions, share custom extension configurations, report edge-case parser failures, and showcase generated knowledge bases.

However, for a solo maintainer, open community channels can quickly become a destructive trap. If users expect immediate, real-time responses to every configuration question, the maintainer's day dissolves into answering fragmented chat messages instead of reviewing code and advancing the roadmap.

Operating rule 1 ([`roadmap/README.md:404`](../../README.md#L404)) establishes that *the bottleneck is review, not generation*. Unstructured community demands amplify this bottleneck. A sustainable support strategy must establish **strict boundaries that channel user inquiries into asynchronous, searchable, and community-assisted forums**.

---

## Reconciling the bot refusal: product feature vs community channel

In the master engineering roadmap, Slack and Discord are explicitly named as refused non-goals:
- [`roadmap/README.md:264`](../../README.md#L264): *"Slack / Discord bot — Team Q&A over the knowledge engine — non-goal (§7)"*
- [`roadmap/README.md:345`](../../README.md#L345): *"Cheap to build, near-zero payoff before adoption exists."*

It is vital to state the distinction clearly so this does not read as a contradiction:

| Dimension | The Refused Non-Goal (Engineering Roadmap §7) | The Approved Community Channel (Business Path B5) |
|---|---|---|
| **What it is** | Building a software integration: writing TypeScript code that connects Kaioken's daemon to Slack/Discord Webhooks or Bot APIs to answer chat prompts in team channels. | Setting up a communication platform: creating a GitHub Discussions board or Discord server where **human developers talk to one another and the maintainer**. |
| **Engineering cost** | High. Writing WebSocket clients, handling Discord rate limits, managing token auth across third-party chat platforms. | Zero code. A purely operational communication channel. |
| **Maintainer verdict** | **PERMANENTLY REFUSED AS PRODUCT CODE.** Competing with Slack bot frameworks is a zero-payoff distraction before adoption exists. | **APPROVED AS COMMUNITY INFRASTRUCTURE.** Essential for user feedback, debugging triage, and peer support. |

The refusal in §7 is about **what code to write into the engine**, not about whether users are allowed to talk to each other.

---

## Current state

Verified against repository communication channels:

| Channel | Current status | Triage SLA | Primary purpose |
|---|---|---|---|
| **GitHub Issues** | Active on repository | Asynchronous (triaged during bi-weekly release trains, [`roadmap/README.md:409`](../../README.md#L409)) | Confirmed bugs, AST parser failures, reproducible test defects. |
| **GitHub Discussions** | Enabled | Community-assisted, best-effort | Open-ended architectural questions, "how do I configure X", showcase. |
| **Discord Server** | In staging | Community-assisted; maintainer "office hours" only | Real-time troubleshooting among community members, release announcements. |
| **Private Paid Email** | Specified in [`b3/04`](04-uptime-and-support-promise.md) (`support@kaioken.dev`) | 48 business hours priority SLA | Billing disputes, account recovery, enterprise pilot inquiries. |

---

## The three rules of sustainable solo community management

To prevent community triage from overwhelming solo development capacity:

### 1. The "No Tech Support in Private DMs" Rule
- The maintainer's personal email, Twitter/X DMs, and Discord DMs are strictly closed to technical debugging requests.
- Any direct message asking for troubleshooting receives a standard polite auto-response: *"Thanks for reaching out! To make sure solutions are searchable for all developers, please open a thread in GitHub Discussions or our community Discord help channel."*
- *Rationale:* Solving a bug in a private 1-on-1 DM helps one developer once. Solving it in a public forum creates an indexed answer that helps 1,000 developers via Google search.

### 2. The Asynchronous "Office Hours" Cadence
- The maintainer does **not** keep Discord or email open in a background tab during coding sessions.
- Inquiries are triaged during designated time blocks: **one hour at the start of the day and 30 minutes at the close of the day**.
- Urgent pager alerts exist solely for infrastructure downtime (`b3/04`), never for user configuration questions.

### 3. Issue Template Guardrails
- GitHub Issue creation requires completing structured issue templates:
  - Repro repository link or minimal code snippet.
  - OS and Node version (`node >= 22`).
  - Output of `kaioken scan --verbose`.
  - Confirmation that `kaioken_v2` gates pass locally.
- Incomplete issues missing reproduction steps are tagged `needs-repro` and closed automatically after 7 days of inactivity.

---

## What done looks like

- [ ] GitHub Discussions enabled and categorized: Announcements, Q&A, Show & Tell, and Ideas.
- [ ] Issue templates configured under `.github/ISSUE_TEMPLATE/` enforcing structured bug reports.
- [ ] A public Discord server launched with clear channel architecture (`#announcements`, `#general`, `#troubleshooting`, `#showcase`).
- [ ] Community rules pinned prominently in Discord and GitHub, explicitly stating that maintainer support is asynchronous and directing paid billing inquiries to `support@kaioken.dev`.

---

## Steps

1. **Configure GitHub Repository Features.**
   In repository settings, enable Discussions. Configure discussion categories and link them from the root `README.md`.
2. **Author Issue Templates.**
   Create `.github/ISSUE_TEMPLATE/bug_report.yml` and `.github/ISSUE_TEMPLATE/feature_request.yml`. Require concrete repro steps and CLI output.
3. **Launch Community Discord Server.**
   Set up a bare-bones Discord server with role verification to prevent spam bots. Include a `#welcome-and-rules` channel codifying the asynchronous support policy.
4. **Link Support Channels from Website and CLI.**
   Ensure `website/src/pages/docs/DocsIndex.tsx` and `kaioken --help` display clean links to GitHub Discussions and community chat.

---

## In scope

- Designing sustainable community and support channels.
- Formally clarifying the distinction between chat bots (refused non-goal) and community chat rooms.
- Establishing the "no private support" boundary and asynchronous triage cadence.
- Configuring structured GitHub issue templates.

---

## Out of scope

- Writing code for Discord or Slack bots (remains refused non-goal).
- 24/7 real-time customer support chat.
- Moderating non-technical social discussions.

---

## Gates

1. Structured GitHub issue and discussion templates committed to `.github/`.
2. Community channels linked on `website/` and root `README.md`.
3. Support boundaries clearly documented in public terms.

---

## Traps

| Trap | Guard |
|---|---|
| Leaving Discord notifications on all day | A chime every 5 minutes destroys cognitive flow. Turn off all Discord notifications and check the server strictly during scheduled office hours. |
| Answering duplicate questions repeatedly in chat | When a question is answered in Discord, immediately document it in the website FAQ or a GitHub Discussion Q&A so it becomes permanently searchable. |
| Feeling guilty for a 24-hour response time | Developer tools are not emergency medical services. A thoughtful, accurate response within 24–48 hours is standard and respected across open source. |

---

## Open questions

None. The community boundaries and triage protocols are fully established.

---

## Session brief

```xml
<task>
In roadmap/money_print/b5-go-to-market/05-community-and-support-channel.md, formulate the community channels and support boundaries for Kaioken.

Explicitly address and resolve the apparent contradiction with the engineering roadmap:
1. Roadmap README §7 and §5 line 264 formally refused Slack and Discord bots as product features (writing bot code into the engine).
2. Clarify that this refusal does NOT prohibit having a human Discord or GitHub community channel for users to ask questions.
3. Establish the three rules of sustainable solo community management: no private DMs, asynchronous office hours, and strict issue templates.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: Refused Slack/Discord bots in roadmap/README.md lines 264 and 345, support commitments in b3/04, and operating rule 1.
- INFERENCES: Why answering support in public threads creates compound SEO value compared to private DMs.
- OPEN QUESTIONS: Selection of primary community platform (Discord vs GitHub Discussions vs Discourse).
</research_mode>

<verification_loop>
Verify citations to roadmap/README.md lines 264, 345, and 404.
Confirm cross-references to b3/04.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b5-go-to-market/05-community-and-support-channel.md.
Do NOT modify engine source code.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) resolution of the bot refusal vs community distinction, (2) the three support management rules, (3) channel triage table, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
