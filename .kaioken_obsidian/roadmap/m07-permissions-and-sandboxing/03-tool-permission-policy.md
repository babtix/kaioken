# M7-03 · Tool permission policy

> Replace hardcoded CLI approval gates with a declarative per-tool, per-mode policy matrix (allow / deny / ask) configured in `.kaioken/permissions.json`.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-audit-current-autonomy-surface` |
| **Blocks** | `04-run-command-allow-deny-list`, `06-audit-log`, `M8-01` |
| **Touches** | `packages/agent/src/permissions.ts`, `packages/agent/src/index.ts`, `packages/agent/test/permissions.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | Medium. Must ensure breaking changes to approval flow fail closed (deny/ask), never open |
| **Gate-critical** | **Yes — governs execution decisions across all run modes** |

## Why this exists

Operating rule 1 specifies that review capacity is the bottleneck. Today, tool permissions are hardcoded into an all-or-nothing binary switch: either a human is prompted on stdin for every mutation in `chat.ts`, or `--yes` is passed and every tool—including arbitrary shell execution—runs with zero gating.

A robust agent engine requires fine-grained, declarative governance. Different operating modes (`interactive`, `unattended`, `daemon`) have radically different trust boundaries. In unattended mode, reading files should be allowed silently, edits should be permitted only inside isolated worktrees, and shell commands should default to denied unless specifically cleared. Declaring this in configuration (`.kaioken/permissions.json`) separates security policy from CLI flags.

## Current state

Verified in `kaioken_v2/packages/agent/` and `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Hardcoded mutating tool set | `kaioken_v2/apps/cli/src/agent-host.ts:85` | `MUTATING_TOOLS = new Set(["edit", "write", "bash"])` |
| Approval interceptor in agent loop | `kaioken_v2/apps/cli/src/agent-host.ts:262-275` | `beforeToolCall` checks `options.approve?(name, args)`. If false, returns `block: true` |
| CLI `--yes` completely disables approval | `kaioken_v2/apps/cli/src/commands/chat.ts:156-163`, `226` | When `flags.yes` is set, `options.approve` is omitted entirely; all tools run unrestricted |
| Zero declarative permission system | `kaioken_v2/packages/agent/src/index.ts:1-22` | No permissions module or policy parser exists in `@kaioken/agent` |
| MCP tools unmanaged by policy | `kaioken_v2/apps/cli/src/agent-host.ts:128-140` | MCP tools are only checked for static installation trust, not per-invocation permissions |

`UNVERIFIED:` whether external MCP servers invoked via `callMcpTool` emit structured parameter shapes consistent enough for generic schema-level permission policies.

## What done looks like

- [ ] New module `packages/agent/src/permissions.ts` defining:
  - `ExecutionMode`: `"interactive" | "unattended" | "daemon"`
  - `PolicyAction`: `"allow" | "deny" | "ask"`
  - `PermissionPolicyConfig`: schema for `.kaioken/permissions.json`
  - `evaluatePermission(toolName: string, mode: ExecutionMode, policy?: PermissionPolicyConfig): PolicyDecision`
- [ ] Default baseline policy built into `@kaioken/agent`:
  - **Knowledge tools** (`symbol_lookup`, `wiki_search`, `impact`, `skill_load`, `read_file`): `allow` in all modes.
  - **Mutating tools** (`edit`, `write`): `ask` in `interactive`; `allow` in `unattended` ONLY if worktree is active; else `deny`.
  - **Execution tools** (`bash`): `ask` in `interactive`; `deny` in `unattended` by default.
  - **MCP tools** (`mcp_*`): `ask` in `interactive`; `deny` in `unattended` by default unless explicitly allowed.
- [ ] Safe resolution: if a policy cannot be evaluated or contains unknown actions, it **fails closed** to `deny` (or `ask` if interactive TTY exists).
- [ ] Integration in `agent-host.ts`: `beforeToolCall` evaluates policy first before checking human approval callbacks.
- [ ] Full unit test coverage in `packages/agent/test/permissions.test.ts`.

## Steps

1. **Design Policy Schema (`packages/agent/src/permissions.ts`):**
   - Create typed configuration structure:
     ```json
     {
       "$schema": "https://kaioken.dev/schemas/permissions.json",
       "modes": {
         "interactive": { "default": "ask", "rules": { "read_file": "allow" } },
         "unattended": { "default": "deny", "rules": { "symbol_lookup": "allow", "edit": "allow" } },
         "daemon": { "default": "deny", "rules": {} }
       }
     }
     ```
2. **Implement Policy Evaluator:**
   - Write `loadPermissionPolicy(root: string): Promise<PermissionPolicyConfig>`.
   - Implement `evaluatePermission(toolName, mode, policy)`:
     1. Exact match on `toolName` in `mode.rules`.
     2. Glob/prefix match (e.g. `mcp_*`).
     3. Mode default action (`allow` / `deny` / `ask`).
     4. Global safety fallback: if unknown or error, return `deny` for mutating tools, `allow` for read-only knowledge tools.
3. **Connect to Agent Runtime (`apps/cli/src/agent-host.ts`):**
   - Update `SessionOptions` to accept `mode: ExecutionMode` and `permissions?: PermissionPolicyConfig`.
   - In `createSession`:
     - In `beforeToolCall`:
       - Evaluate `evaluatePermission(toolCall.name, mode, permissions)`.
       - If decision is `"deny"`, return `{ block: true, reason: `Policy forbids tool "${toolCall.name}" in ${mode} mode.` }`.
       - If decision is `"allow"`, proceed without prompt.
       - If decision is `"ask"`:
         - If `options.approve` is defined, call `await options.approve(...)`.
         - If `options.approve` is absent (unattended), block execution with `{ block: true, reason: `Tool "${toolCall.name}" requires interactive approval, but session is running unattended.` }`.
4. **Unit and Integration Tests:**
   - Test default resolution across all three modes.
   - Test custom `.kaioken/permissions.json` overrides.
   - Test that omitting `--yes` in unattended mode blocks rather than crashes.

## In scope

- `kaioken_v2/packages/agent/src/permissions.ts`
- `kaioken_v2/packages/agent/src/index.ts`
- `kaioken_v2/packages/agent/test/permissions.test.ts`
- Wiring policy checks into `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- Regex pattern matching on shell arguments inside `bash` (that is M7-04).
- Persistent audit logging of permission decisions (that is M7-06).
- Daemon UI approval widgets (that is M8 / Studio).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/agent/test/permissions.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Failing open on missing or corrupted configuration | Any syntax error or missing permission config must fall back to the secure hardcoded default, never grant blanket access |
| An unattended run treating `"ask"` as approval | If mode is `unattended` and policy is `"ask"` with no human hook, it MUST block execution |
| Renamed or prefixed tools slipping past policies | Standardize tool name normalization before evaluation (trimming, lowercasing, matching `mcp_*` prefixes) |
| Hardcoding tool lists in the evaluator | Knowledge tools are detected via `KNOWLEDGE_TOOLS` list; mutating tools via `MUTATING_TOOLS` set |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement a declarative, configuration-driven tool permission policy (allow / deny / ask) per execution mode, replacing the hardcoded all-or-nothing approval logic.

Current state:
- apps/cli/src/agent-host.ts hardcodes MUTATING_TOOLS = new Set(["edit", "write", "bash"]) at line 85.
- apps/cli/src/agent-host.ts lines 262-275 wire beforeToolCall only if options.approve is provided. When --yes is used, options.approve is omitted and all tools execute unrestricted.
- packages/agent has no concept of execution modes or permission policy matrices.

1. Implement kaioken_v2/packages/agent/src/permissions.ts:
   - Define ExecutionMode = "interactive" | "unattended" | "daemon".
   - Define PolicyAction = "allow" | "deny" | "ask".
   - Define interface PermissionPolicyConfig.
   - Define evaluatePermission(toolName: string, mode: ExecutionMode, config?: PermissionPolicyConfig): PolicyDecision.
   - Implement default safety matrix:
     - Knowledge tools (symbol_lookup, wiki_search, impact, skill_load, read_file): allow in all modes.
     - Mutating tools (edit, write): ask in interactive, allow in unattended (intended for worktree runs), deny in daemon by default.
     - Shell tool (bash): ask in interactive, deny in unattended, deny in daemon.
     - MCP tools (mcp_*): ask in interactive, deny in unattended unless explicitly overridden in config.
   - Implement loadPermissionPolicy(root: string): Promise<PermissionPolicyConfig> reading from .kaioken/permissions.json if present.
2. Re-export permissions types and functions from kaioken_v2/packages/agent/src/index.ts.
3. Wire policy evaluation into kaioken_v2/apps/cli/src/agent-host.ts:
   - Extend SessionOptions to accept `mode?: ExecutionMode` (default "interactive") and `permissions?: PermissionPolicyConfig`.
   - In createSession beforeToolCall:
     - Check evaluatePermission.
     - If "deny": block with clear reason.
     - If "allow": return undefined (proceed).
     - If "ask": call options.approve if present; if options.approve is missing, block with "Tool requires human approval, but current mode is unattended".
4. Add comprehensive unit tests in kaioken_v2/packages/agent/test/permissions.test.ts testing all modes, overrides, and fail-closed behaviors.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/agent/test/permissions.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/agent/src/permissions.ts, packages/agent/src/index.ts, packages/agent/test/permissions.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not invent new permission schemas that conflict with the existing tool signatures in packages/agent/src/tools.ts. All policy decisions must strictly return 'allow', 'deny', or 'ask'.
</missing_context_gating>

<action_safety>
Do not modify packages/gitops or any files outside packages/agent and apps/cli/src/agent-host.ts. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of permission policy implementation and the default mode matrix.
2. Exact files modified and created.
3. Test suite results with pasted counts.
4. Any edge cases regarding MCP tool naming or unattended mode fallbacks.
</structured_output_contract>
```
