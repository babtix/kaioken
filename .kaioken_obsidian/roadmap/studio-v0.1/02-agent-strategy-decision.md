# STUDIO-02 · Agent strategy and workspace linkage decision

> Decide whether Kaioken replaces Theia's shipped Coder/Architect agents or exposes its grounded
> tools via MCP, and resolve whether Kaioken and Studio share an npm monorepo or published packages.

| Field | Value |
|---|---|
| **Status** | `blocked` (awaits human decision on two architectural forks) |
| **Size** | M |
| **Depends on** | `01-spike-and-stop` |
| **Blocks** | `04-chat-pane-and-approval-dialog`, M2 (distribution), M12 (SDK GA) |
| **Touches** | Documentation and architectural contracts (no runtime code touched until decided) |
| **Risk** | High — determines whether Studio builds a custom chat loop or uses Theia AI's UI |
| **Gate-critical** | **Yes — blocks the chat pane and approval dialog** |

## Why this exists

Theia 1.74+ ships with a complete AI framework: Theia AI, featuring an AI Registry, Agent
Capabilities, a Coder agent, an Architect agent, and a chat transcript. Kaioken also ships an agent
framework: `packages/agent` (`skills.ts`, `prompt.ts`, `tools.ts`, `gate.ts`) and `apps/cli`'s
`agent-host.ts`.

If Studio builds its own chat panel while Theia AI's Coder agent is active, the app contains two
competing agent systems, double memory footprint, and conflicting configuration. Conversely, if
Kaioken simply contributes MCP tools into Theia AI, Kaioken's custom gate verification and
safety-critical approval dialogs may be bypassed by Theia's generic execution loop.

Simultaneously, `kaioken_v2/docs/studio-v0.1-scope.md:127-128` insists that the workspace
relationship — a shared npm monorepo workspace versus Studio consuming published packages — must be
settled at step 1 of the build rather than deferred. Both decisions must be resolved in writing
before building `04-chat-pane-and-approval-dialog`.

## Current state

Verified against [`kaioken_v2/packages/agent/src/skills.ts:1-58`](../../kaioken_v2/packages/agent/src/skills.ts#L1-L58),
[`kaioken_v2/docs/theia-studio-research.md:95-132`](../../kaioken_v2/docs/theia-studio-research.md#L95-L132),
and [`kaioken_v2/docs/studio-v0.1-build-notes.md:49-72`](../../kaioken_v2/docs/studio-v0.1-build-notes.md#L49-L72):

| Fact | Evidence |
|---|---|
| Kaioken skills model is lightweight Markdown procedure | `packages/agent/src/skills.ts:22-30` defines `Skill` with `name`, `description`, `content`, `path` under `.kaioken/skills/` |
| Theia AI ships Agent Capabilities | Theia 1.73+ unifies MCP servers, skills, and sub-agents under a single UI and discovery registry |
| Stopgap workspace linkage is runtime path resolution | `studio-v0.1-build-notes.md` §3: `kaioken_studio_theia` dynamically imports built dist via `KAIOKEN_ENGINE_ROOT` |
| Shared tree-sitter native dependencies | `@kaioken/index` depends on tree-sitter grammars (Go, JS, TS, Python, Rust); compiling across two Node/Electron ABIs in a naive monorepo causes native collision |
| Chat pane implementation is paused | `studio-v0.1-build-notes.md` §8 lists the chat pane as intentionally unbuilt pending this decision |

## What done looks like

- [ ] A written decision record for Question 1: Kaioken **replaces** Theia's Coder/Architect agents (Option A) OR **coexists / exposes tools via MCP** (Option B).
- [ ] A written decision record for Question 2: Kaioken and Studio use a **monorepo npm workspace** (Option A), **published npm packages** (Option B), or formalised **runtime path resolution** (Option C).
- [ ] The precise integration touchpoint for the chat pane (`04-chat-pane-and-approval-dialog`) is defined: either a custom `ReactWidget` chat transcript or registering a `ChatAgent` / `ToolProvider` within Theia AI.
- [ ] The approval gate contract is verified to remain uncompromised regardless of which option is chosen.

## Steps

1. **Audit Theia AI's Agent Capabilities:** Examine Theia's `Agent` and `ToolProvider` interfaces in the Theia 1.75 platform definitions. Evaluate whether Theia's approval prompt can enforce Kaioken's safety protocol (focus never on Approve, 5-minute auto-deny, Y/N/A/Esc keys).
2. **Compare `skills.ts` with Theia Skills:** Compare how `.kaioken/skills/*.md` are indexed versus Theia's AI Registry skill format.
3. **Evaluate Workspace Packaging Options:**
   - *Option A (Monorepo):* Unify `kaioken_v2` and `ide_kaioken/kaioken_studio_theia` into a single root `package.json` workspace. Test native module ABI build constraints.
   - *Option B (Published Packages):* Publish `@kaioken/*` packages to a registry. Assess versioning friction during rapid development.
   - *Option C (Runtime Path Resolution):* Formalise the existing `KAIOKEN_ENGINE_ROOT` approach with strict contract version validation.
4. **Formulate Recommendation:** Document the trade-offs and submit recommendation to the human maintainer.
5. **Update Leaf Status:** Once approved, update this leaf to `done` and unblock `04-chat-pane-and-approval-dialog`.

## In scope

- Analysis and decision recording for agent integration and workspace structure.
- Specifications in `roadmap/studio-v0.1/` and `roadmap/decisions/`.

## Out of scope

- Writing the chat UI widget — that is `04`.
- Rebuilding `package.json` configurations before the decision is signed off.
- Modifying Theia AI platform code.

## Gates

This is a decision leaf. The gate is a written architectural determination committed to the repository resolving:
1. Agent strategy (Replace vs MCP Coexist).
2. Workspace structure (Monorepo vs Published vs Path Resolution).

Neither `04-chat-pane-and-approval-dialog.md` nor `06-package-once-unsigned.md` may proceed without this sign-off.

## Traps

| Trap | Guard |
|---|---|
| Assuming Theia AI's approval dialog meets Kaioken safety standards | Theia's default approval dialog may default focus to "Allow" or lack auto-deny. If so, Kaioken must own the approval surface. |
| Merging workspaces before solving native tree-sitter ABIs | Electron and Node run different V8 ABI versions. Merging npm dependencies naively will corrupt tree-sitter bindings. |
| Implementing a hybrid where both agents run simultaneously | Creates user confusion and duplicate API calls. One agent system must clearly own the user's prompt. |

## Open questions

1. **Agent Strategy:** Does Kaioken replace Theia's Coder/Architect agents, or expose itself as MCP tools inside Theia AI?
   - *Unblocks:* Leaf `04-chat-pane-and-approval-dialog.md`.
   - *Who unblocks:* Solo maintainer (human).
2. **Workspace Architecture:** Does Studio link to `kaioken_v2` via monorepo workspace, published npm packages, or runtime path resolution?
   - *Unblocks:* Leaf `06-package-once-unsigned.md` and release workflow.
   - *Who unblocks:* Solo maintainer (human).

## Session brief

```xml
<task>
Perform the architectural research required to resolve the two blocking Studio v0.1 decisions:

Decision 1: Agent Strategy (Replace vs MCP Coexist)
Compare Kaioken's agent implementation in kaioken_v2/packages/agent/src/skills.ts, prompt.ts, and
apps/cli/src/agent-host.ts against Eclipse Theia 1.75's Agent Capabilities and Theia AI chat framework.
Determine:
- Can Theia AI's ChatAgent host Kaioken's multi-tier grounding tools and deterministic gate verification?
- Can Theia AI's approval flow satisfy Kaioken's non-negotiable safety rules: focus NEVER on Approve,
  5-minute timeout auto-deny, and inline diff inspection?
- If yes, what is the implementation cost of Option B (MCP/ToolProvider) vs Option A (own the Chat pane)?

Decision 2: Workspace Structure (Monorepo vs Published vs Path Resolution)
Examine kaioken_v2/package.json and ide_kaioken/kaioken_studio_theia/package.json. Evaluate the native
module ABI collision risk (tree-sitter in @kaioken/index vs Electron runtime in Theia).
Determine whether the current stopgap (runtime path resolution via KAIOKEN_ENGINE_ROOT) should be
formalised for v0.1 or replaced with an npm workspace monorepo.

Synthesise the options, trade-offs, and clear recommendations into a decision brief. Do not edit
code until the human orchestrator signs off.
</task>

<verification_loop>
Verify that:
1. Every cited Theia AI extension point actually exists in the platform definitions.
2. The comparison with skills.ts accurately reflects the 155-line implementation in packages/agent.
3. Native module ABI implications on Windows for tree-sitter are clearly articulated.
</verification_loop>

<action_safety>
Do NOT write code, edit package.json, or attempt npm/yarn install. This is a research and decision
task. Leave the working tree untouched.
</action_safety>

<structured_output_contract>
End with: (1) recommended Agent Strategy with explicit reasoning, (2) recommended Workspace
Structure with ABI risk assessment, (3) the exact impact on Leaf 04 and Leaf 06.
</structured_output_contract>
```
