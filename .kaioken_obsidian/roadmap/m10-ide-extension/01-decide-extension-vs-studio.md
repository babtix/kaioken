# M10-01 · Decide extension vs Studio

> Resolve open question Q1 and the client strategy: decide whether Kaioken ships as an in-process Studio shell, an out-of-process thin extension, or both — before building redundant client layers.

| Field | Value |
|---|---|
| **Status** | `blocked` |
| **Size** | S |
| **Depends on** | [`roadmap/decisions/d3-one-studio-fork.md`](../decisions/d3-one-studio-fork.md), [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md) |
| **Blocks** | `03-daemon-thin-client-contract.md` |
| **Touches** | `roadmap/README.md`, `roadmap/decisions/` |
| **Risk** | High. An indecisive outcome commits a solo maintainer to maintaining two complex editor surfaces indefinitely. |
| **Gate-critical** | No |

## Why this exists

Operating rule 1 specifies that review capacity is the bottleneck for vibe coding, and README §7 explicitly refuses redundant client surfaces: *"Two clients is one too many for a solo maintainer."* 

Despite this rule, the repository currently maintains two separate Studio forks (`ide_kaioken/kaioken_studio_theia/` and `ide_kaioken/kaioken_studio/`). Proposing an additional VS Code / JetBrains extension on top of this creates a three-way maintenance burden. The client strategy must be decided in writing before code is written for any client surface.

Three coherent strategic outcomes exist:

1. **Studio only (Theia in-process):** Abandon the external extension entirely. Kaioken ships as a branded standalone IDE where TypeScript packages run in-process without daemon IPC. Maximum architectural control and zero version skew, but demands that users switch their primary editor to Kaioken Studio.
2. **Thin extension only:** Abandon Studio entirely. Kaioken runs as a background CLI daemon (`kaioken daemon`) and ships a thin VS Code/Cursor extension. Minimizes development effort by meeting developers in their existing environments, but reintroduces daemon lifecycle management, out-of-process IPC, and contract version skew.
3. **Both (Extension for reach, Studio as flagship):** Ship the thin extension to reach developers inside standard VS Code / Cursor, while maintaining Studio as the high-end, dedicated environment. The project's own rule says "both" is unsustainable for a solo developer — and because two Studio forks already exist, the rule is being actively violated at the shell layer right now.

## Current state

Verified against the working tree and repository documentation.

| Fact | Evidence |
|---|---|
| Two Studio forks coexist in the tree | `ide_kaioken/kaioken_studio_theia/` (Theia Blueprint) and `ide_kaioken/kaioken_studio/` (Code-OSS) |
| Master roadmap identifies Q1 as an open blocker | `roadmap/README.md:369` — "Two Studio forks... Which one ships? The plan's own rule is two clients is one too many" |
| Theia runs packages in-process | `roadmap/README.md:121` and `kaioken_v2/docs/studio-v0.1-scope.md:14` |
| Daemon command is uncommitted on disk | `kaioken_v2/apps/cli/src/commands/daemon.ts:38` (`CONTRACT_VERSION = 4`, `DAEMON_VERSION = "2.0.0"`) |
| License Zero blocks commercial reach | `roadmap/README.md:345` — License Zero Noncommercial 2.0.1 restricts commercial developer adoption |

`UNVERIFIED:` The exact market demand for a standalone IDE vs an extension among target users, as no user telemetry or user base currently exists.

## What done looks like

- [ ] A written decision document is committed under `roadmap/decisions/` answering Q1 with an explicit choice among the three options.
- [ ] If Studio-only is chosen, one of the two Studio forks (`kaioken_studio_theia` or `kaioken_studio`) is designated primary, the other is scheduled for archival, and external extension work is formally canceled.
- [ ] If Extension-only is chosen, both Studio forks are archived, and `03-daemon-thin-client-contract.md` is unblocked to build the daemon WebSocket protocol.
- [ ] If Both is chosen, a strict maintenance ceiling and shared abstraction layer are defined to prevent review burnout, and the violation of the solo-maintainer rule is formally justified in the decision record.
- [ ] The commercial licensing contradiction under License Zero Noncommercial 2.0.1 is evaluated for the chosen distribution method.

## Steps

1. **Review current shell implementations.** Compare maintenance overhead and package integration between `ide_kaioken/kaioken_studio_theia/` (which imports `@kaioken/*` packages in-process) and `ide_kaioken/kaioken_studio/` (Code-OSS fork).
2. **Evaluate distribution reach.** Assess the friction of convincing developers to install a whole new IDE shell versus installing a marketplace extension in their existing VS Code, Cursor, or Windsurf installations.
3. **Audit solo maintainer review load.** Quantify the review effort required to support electron bundling across 3 OSes versus publishing an extension to the VS Code Marketplace and Open VSX.
4. **Draft the decision record.** Create `roadmap/decisions/01-client-strategy.md` detailing the chosen path, why the alternative paths were rejected, and how the license constraint affects adoption.
5. **Update milestone statuses.** Update `roadmap/m10-ide-extension/README.md` and downstream leaves according to the decision.

## In scope

- Decision analysis and documentation in `roadmap/decisions/` and `roadmap/m10-ide-extension/`.
- Archival planning for redundant shells.
- Evaluation of client licensing implications.

## Out of scope

- Writing TypeScript code for a VS Code extension or Theia widget — this leaf is a decision gate, not a build.
- Deleting or archiving either Studio fork in this session — that action belongs to a dedicated archival task once the decision is ratified.
- Modifying `kaioken_v2/apps/cli/src/commands/daemon.ts`.

## Gates

Review the committed markdown document against the three criteria:

```bash
# Verify the decision document exists and addresses the three options
test -f roadmap/decisions/01-client-strategy.md || ls roadmap/decisions/
```

Confirm that the decision explicitly cites:
1. Which of the three outcomes is selected.
2. The rationale regarding the solo maintainer rule ("two clients is one too many").
3. The resolution of the two existing Studio forks.
4. The License Zero commercial impact.

## Traps

| Trap | Guard |
|---|---|
| Choosing "Both" without admitting the rule violation | State clearly that choosing both Studio and an extension violates README §7, and specify how a solo developer will review updates across both. |
| Ignoring that two Studio forks already exist | Acknowledge that the solo-maintainer rule is already broken at the shell layer; selecting an option must include pruning one or both Studio forks. |
| Postponing the decision while building both | Block M10-03 and any new client implementation until this decision document is signed off by the maintainer. |
| Assuming VS Code extension reach is free | Publishing an extension to corporate environments collides directly with License Zero Noncommercial 2.0.1. |

## Open questions

1. **Which Studio shell ships (or does neither)?** Resolved by [`roadmap/decisions/d3-one-studio-fork.md`](../decisions/d3-one-studio-fork.md). This decides whether `ide_kaioken/kaioken_studio_theia/` (Theia) or `ide_kaioken/kaioken_studio/` (Code-OSS) is retained as the in-process desktop client, or if both are retired in favor of an external extension over the daemon.
2. **Commercial license terms for developer tooling:** Resolved by [`roadmap/decisions/d1-license.md`](../decisions/d1-license.md). Determines whether an IDE extension or Studio can be adopted by engineers in commercial organizations under License Zero Noncommercial 2.0.1.

## Session brief

```xml
<task>
In this repository, roadmap/m10-ide-extension/01-decide-extension-vs-studio.md is blocked on the decisions in roadmap/decisions/d3-one-studio-fork.md and roadmap/decisions/d1-license.md.

The project is guided by the operating rule that "two clients is one too many for a solo maintainer" (README §7). Yet currently, TWO Studio forks exist in the repository (ide_kaioken/kaioken_studio_theia/ and ide_kaioken/kaioken_studio/), and the original v1 plan proposed a third client: a thin VS Code extension over a WebSocket daemon.

Contribute to or ratify roadmap/decisions/d3-one-studio-fork.md to resolve this trilemma:
1. Evaluate the three coherent outcomes:
   - Option A: Studio only (Theia in-process; prune Code-OSS; abandon external extension).
   - Option B: Thin extension only (abandon both Studio forks; run Kaioken as CLI daemon; ship VS Code/Cursor extension).
   - Option C: Both (extension as reach play, Studio as flagship environment).
2. Face the current state honestly: explicitly state that the solo maintainer rule is already being broken at the shell layer right now.
3. Address the license collision: License Zero Noncommercial 2.0.1 strictly forbids commercial use. An extension in VS Code lands primarily on corporate developer machines, meaning adoption is legally blocked without resolving roadmap/decisions/d1-license.md (Path A, B, or C).
4. Recommend a clear outcome, list the criteria that justify it, and detail the retirement plan for rejected surfaces.

Do not write implementation code. Ratify the decision record and update the status in roadmap/m10-ide-extension/01-decide-extension-vs-studio.md once decided.
</task>

<verification_loop>
Verify that roadmap/decisions/01-client-strategy.md exists and thoroughly analyzes:
- The three architectural options (Studio only, Extension only, Both).
- The maintenance burden relative to the solo maintainer rule.
- The fate of the two existing Studio forks (Theia vs Code-OSS).
- The License Zero commercial adoption constraint.
Confirm that roadmap/m10-ide-extension/01-decide-extension-vs-studio.md cross-references the decision document accurately.
</verification_loop>

<completeness_contract>
Do not leave the decision ambiguous or defer the trilemma to an undefined future date. The document must articulate the exact trade-offs and provide a definitive recommendation for the maintainer to ratify.
</completeness_contract>

<action_safety>
Scope strictly to documentation in roadmap/decisions/ and roadmap/m10-ide-extension/. Do NOT touch or delete any files in ide_kaioken/kaioken_studio/, ide_kaioken/kaioken_studio_theia/, or kaioken_v2/. Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of the client strategy decision, (2) files touched, (3) how the two Studio forks and the extension are reconciled, (4) any remaining open items requiring human ratification.
</structured_output_contract>
```
