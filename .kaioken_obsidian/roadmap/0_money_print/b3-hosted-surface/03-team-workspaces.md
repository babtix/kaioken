# B3-03 · Team workspaces and re-evaluating collaboration non-goals

> Establish the explicit commercial and architectural thresholds required to unfreeze the collaboration non-goals (shared sessions, pair programming, RBAC) for paying teams, affirming that the refusal stands unconditionally until those thresholds are met.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | [`roadmap/README.md`](../../README.md), [`roadmap/m11-team-and-ci-surface/`](../../m11-team-and-ci-surface/) |
| **Blocks** | [`roadmap/money_print/b6-scale/01-when-to-hire.md`](01-when-to-hire.md), [`roadmap/money_print/b6-scale/03-revenue-milestones-and-decision-gates.md`](03-revenue-milestones-and-decision-gates.md) |
| **Touches** | Collaboration roadmap, product tier definitions, multi-user architecture |
| **Risk** | High. Multi-tenant distributed state synchronization is an engineering sinkhole that can consume 100% of solo maintainer capacity with zero revenue payoff if built prematurely. |
| **Gate-critical** | No |

---

## Why this exists

In the master engineering roadmap, the entire collaboration category was formally marked as a non-goal:
- [`roadmap/README.md:278`](../../README.md#L278): *"08 · Collaboration — entire category is a §7 non-goal until users exist."*
- [`roadmap/README.md:342-344`](../../README.md#L342-L344): *"Real multi-user is a distributed-systems project, not a feature. Not until there are users."*

The engineering roadmap correctly refused these features because solo developers building multi-user tools for hypothetical users almost always build distributed-systems complexity that nobody uses.

However, the **business path introduces a fundamental shift: paying teams ARE users.** When an engineering manager at a 50-person software company wants to buy 20 seats of Kaioken, their primary questions are immediately: "Can my team share the generated wiki? Can we share repository steering notes? Can we centrally manage API keys and model quotas? Who has permission to approve updates?"

Ignoring these requests permanently cuts off the highest-margin B2B tier. Conversely, building them today derails the single-maintainer engine before reaching first revenue. This leaf resolves the tension by establishing **the exact, measurable conditions under which the refusal is revisited**, ensuring the solo maintainer builds collaboration only when paid demand justifies the operational and architectural cost.

---

## Current state

Verified against the working tree:

| Refused non-goal | Engineering roadmap status | Operational reality for a solo maintainer |
|---|---|---|
| **Shared session server** | Refused in [`roadmap/README.md:282`](../../README.md#L282) | Requires a stateful WebSocket cluster, presence tracking, and distributed consensus. Operational pager risk is severe. |
| **Knowledge review workflow** | Refused in [`roadmap/README.md:283`](../../README.md#L283) | Can be solved asynchronously without server infrastructure by using standard Git Pull Requests over `.kaioken/wiki/`. |
| **Team steering notes** | Partially preserved in [`roadmap/README.md:284`](../../README.md#L284) (`M11`) | Stored in version control (`.kaioken/notes/`). Requires zero hosted infrastructure. |
| **Role-based permissions (RBAC)** | Refused in [`roadmap/README.md:285`](../../README.md#L285) | Requires an identity provider, organization tenant data model, group management, and fine-grained authorization checks on every action. |
| **Activity feed** | Refused in [`roadmap/README.md:286`](../../README.md#L286) | Overlaps local audit logs (`packages/session`). Multi-user feed requires persistent centralized database event streams. |
| **Pair programming mode** | Refused in [`roadmap/README.md:287`](../../README.md#L287) | Real-time operational transform / CRDT synchronization. High engineering complexity, low corporate willingness-to-pay. |

`UNVERIFIED:` Willingness of enterprise engineering teams to adopt Git-native asynchronous collaboration as a complete substitute for real-time multiplayer editing.

---

## The three conditions to unfreeze collaboration

The roadmap refusal on Category 08 collaboration remains **in full effect**. It is revisited if and only if all three of the following conditions are met simultaneously:

### 1. The Customer Demand Gate
- At least **3 distinct commercial teams** have completed paid pilots or signed written Letters of Intent (LOIs) specifying team collaboration features as their sole blocker to annual multi-seat contracts.
- Inbound inquiries from free-tier users or community requests do **not** satisfy this condition. Only verified, paying corporate buyers count.

### 2. The Revenue Floor Gate
- B2B Team revenue must reach a sustained floor of at least **$5,000/month ASSUMPTION** (e.g. 10 teams of 10 seats at $50/seat/mo ASSUMPTION, or equivalent custom tiers).
- Building distributed multi-user backend infrastructure incurs hosting costs, data storage obligations, and enterprise support inquiries that cannot be sustained on a lower revenue run-rate without diluting core solo engineering.

### 3. The "Git-First" Architectural Gate
- Any un-frozen team feature must be designed as a **decentralized, Git-backed, or asynchronous relay feature first**, rather than a real-time stateful database monolith.
- Examples of compliant architectures:
  - *Team Knowledge Sync:* Syncing `.kaioken/` files across branches via Git or an authenticated S3/R2 bucket, completely offline-first.
  - *Centralized Quotas:* A lightweight team API key managed by the existing inference gateway (`b2/05`), requiring no shared runtime engine state.
  - *Review Workflow:* Using GitHub PR review comments on generated markdown rather than building an in-app approval engine.

**Until ALL THREE conditions are met, the refusal stands unconditionally.**

---

## What done looks like

- [ ] A written policy committed to the roadmap affirming that shared sessions, real-time pair programming, and centralized RBAC remain refused non-goals.
- [ ] Explicit threshold criteria (3 paying enterprise pilots, $5,000/mo MRR ASSUMPTION, Git-first architecture) codified as binding gates.
- [ ] An architectural guideline defining how team knowledge is shared asynchronously via Git (leveraging Milestone M11) without building a centralized session cluster.
- [ ] Product positioning documentation confirms that Kaioken is sold to teams today as "a per-seat engine that coordinates via Git", not as a real-time multiplayer SaaS.

---

## Steps

1. **Re-evaluate Category 08 Collaboration Features.**
   Systematically classify each item in [`roadmap/README.md:278-288`](../../README.md#L278-L288):
   - *Permanently Out of Scope:* Real-time pair programming mode (CRDT/OT) and hosted multi-user WebSocket session servers. (Competing with Slack/Tuple/LiveShare is a fatal distraction).
   - *Asynchronous Team Enablers (Admissible when gates pass):* Centralized team billing/quotas, shared team steering notes via Git (`M11`), and organization-level license keys.
2. **Codify the "Git is the Team Server" Principle.**
   Establish the technical thesis that eliminates 90% of team server complexity:
   - Git is already a distributed, authenticated, versioned, audit-logged multi-user data store.
   - Team members share knowledge by committing `.kaioken/wiki/`, `.kaioken/cards/`, and `.kaioken/skills/` to the repository.
   - Milestone M11 (`roadmap/m11-team-and-ci-surface/`) automates knowledge generation in CI (GitHub Actions) on merge to `main`.
   - By making CI and Git the synchronization layer, Kaioken delivers team collaboration with zero hosted multi-user server infrastructure.
3. **Establish the Enterprise Feature Gatekeeper.**
   When enterprise prospects request "Team Workspaces" on sales calls, the response is standardized: "Kaioken supports teams today via Git and CI integration. Centralized hosted workspaces unlock when our enterprise pilot quota is filled."

---

## In scope

- Defining the boundary between single-user engine and multi-user team features.
- Establishing quantitative criteria to revisit refused non-goals.
- Specifying the "Git-first" asynchronous alternative to hosted multi-user servers.
- Protecting solo maintainer focus from premature distributed systems development.

---

## Out of scope

- Implementing WebSocket session servers or CRDT synchronization.
- Building an organization dashboard with RBAC and SAML/SSO.
- Changing the local-first execution model of `packages/session`.

---

## Gates

1. Binding refusal gates committed to `roadmap/money_print/b3-hosted-surface/03-team-workspaces.md`.
2. Explicit criteria checklist requiring 3 paying pilots and $5,000/mo MRR ASSUMPTION before any Category 08 task may be scheduled.
3. Written confirmation that Git and CI (M11) are the official team collaboration mechanisms for v2.0.

---

## Traps

| Trap | Guard |
|---|---|
| Building a "quick" WebSocket server for pair programming | A stateful WebSocket server requires reconnection logic, conflict resolution, message ordering, heartbeat monitoring, and edge presence. It is never "quick". |
| Confusing enterprise willingness-to-pay with enterprise feature bloat | Enterprises will ask for SAML SSO and RBAC simply because it is on their procurement checklist. Do not build them until money is committed on a contract. |
| Re-inventing Git inside the engine | Teams already have a battle-tested collaboration and review tool: Git pull requests. Keep knowledge cards and wikis in plain files in the repo so teams use existing review workflows. |

---

## Open questions

None. The threshold criteria are fixed, and the refusal stands until they are satisfied.

---

## Session brief

```xml
<task>
In roadmap/money_print/b3-hosted-surface/03-team-workspaces.md, re-evaluate the collaboration non-goals from roadmap/README.md §7 and §5 Category 08 (shared sessions, pair programming, role-based permissions).

Recognize that paying teams ARE users. Define the precise, quantitative conditions under which the refusal of multi-user features is revisited:
1. Customer demand gate (at least 3 paying team pilots)
2. Revenue floor gate (at least $5,000/mo MRR ASSUMPTION)
3. "Git-first" architectural gate (decentralized/asynchronous rather than stateful centralized servers)

Affirm clearly that until all three conditions are satisfied, the roadmap refusal stands unconditionally.
</task>

<research_mode>
In your analysis, strictly separate:
- OBSERVED FACTS: What roadmap/README.md lines 278-288 and 342-344 state regarding refused collaboration features.
- INFERENCES: Why Git-backed asynchronous synchronization fulfills team needs without operational pager debt.
- OPEN QUESTIONS: Exact pricing structure for future team tiers.
</research_mode>

<verification_loop>
Verify line references in roadmap/README.md for Category 08 and §7 non-goals.
Ensure all revenue figures carry the ASSUMPTION label.
</verification_loop>

<action_safety>
Scope strictly to roadmap/money_print/b3-hosted-surface/03-team-workspaces.md.
Do NOT modify engine code or unfreeze any engineering milestone.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) summary of the team workspace policy, (2) the three gate conditions, (3) explanation of the "Git-as-server" strategy, (4) uncommitted working tree confirmation.
</structured_output_contract>
```
