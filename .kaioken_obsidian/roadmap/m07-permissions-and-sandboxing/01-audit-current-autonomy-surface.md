# M7-01 · Audit the current autonomy and execution surface

> Inspect `packages/agent` and `apps/cli` to produce an exhaustive, verified inventory of all tools, execution paths, approval gates, and unattended exposures in the v2 engine.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `M1-01` (retargeted CI workflow baseline) |
| **Blocks** | `02-git-worktree-isolation`, `03-tool-permission-policy`, `04-run-command-allow-deny-list`, `05-resource-ceilings`, `06-audit-log` |
| **Touches** | Documentation and report artifact; zero engine code touched |
| **Risk** | Low. Read-and-report task establishing ground truth |
| **Gate-critical** | **Yes — input specification for all remaining M7 leaves** |

## Why this exists

You cannot guard what you have not enumerated. The v2 TypeScript rewrite introduced agent capabilities, execution environments, MCP extensions, and background daemon commands across multiple packages. Before implementing worktree sandboxes (M7-02), permission matrices (M7-03), or command denylists (M7-04), we must document the exact lines where tools are defined, where writes and command executions take place, what approval mechanisms exist today, and where autonomous execution runs completely unguarded.

This leaf establishes the authoritative audit report against which the rest of milestone M7 will be engineered and verified.

## Current state

Verified by direct inspection of `kaioken_v2/packages/agent/` and `kaioken_v2/apps/cli/`.

| Fact | Evidence | Notes |
|---|---|---|
| Knowledge tools are read-only | `kaioken_v2/packages/agent/src/tools.ts:22-28` | Five tools: `symbol_lookup`, `wiki_search`, `impact`, `skill_load`, `read_file`. Bounded by `resolveInside` (`tools.ts:422`) |
| Mutating tools explicitly identified | `kaioken_v2/apps/cli/src/agent-host.ts:85` | `MUTATING_TOOLS = new Set(["edit", "write", "bash"])` |
| Execution tools bound to repository root | `kaioken_v2/apps/cli/src/agent-host.ts:182-190` | `new nodeRuntime.NodeExecutionEnv({ cwd: root })` providing `createReadTool()`, `createEditTool()`, `createWriteTool()`, and `createBashTool()` |
| Shell execution tool has zero argument restrictions | `kaioken_v2/apps/cli/src/agent-host.ts:189` | `createBashTool()` executes arbitrary commands in the host shell under `root` |
| MCP tools can invoke external side-effects | `kaioken_v2/apps/cli/src/agent-host.ts:100-145` | Trusted MCP extensions expose arbitrary tools via `callMcpTool`; bypassed if extension is trusted |
| `--yes` flag bypasses all approval | `kaioken_v2/apps/cli/src/commands/chat.ts:156-163`, `226` | When `--write` and `--yes` are passed, `prompts` is `null` and `options.approve` is omitted |
| Unattended runs execute unguarded | `kaioken_v2/apps/cli/src/agent-host.ts:262-275` | If `options.approve` is undefined, `beforeToolCall` is never configured on `runtime.Agent` |
| `agent-serve` exposes bare tool and turn execution | `kaioken_v2/apps/cli/src/commands/agent-serve.ts:80-146` | Bare tool calls run knowledge tools directly (`:80-106`); turns wire interactive approvals over stdio (`:130-137`) |
| `daemon` command carries in-flight run system | `kaioken_v2/apps/cli/src/commands/daemon.ts:80-109` | Uncommitted file declaring `RunRecord` and `ApprovalRequest` with timer auto-resolution |
| Verification gate runs only post-hoc | `kaioken_v2/packages/agent/src/gate.ts:84-120` | `runGate` executes detected repository scripts (`package.json`) after completion; does not guard execution during turns |

`UNVERIFIED:` whether external MCP servers invoked through `callMcpTool` enforce internal path restrictions or inherit root process environment variables.

## What done looks like

- [ ] An audit document committed to `roadmap/m07-permissions-and-sandboxing/audit-report.md` (or detailed in the leaf report) detailing all 4 tool tiers:
  1. Safe Knowledge Tools (`symbol_lookup`, `wiki_search`, `impact`, `skill_load`, `read_file`).
  2. Mutating Workspace Tools (`edit`, `write`).
  3. Arbitrary Shell Execution (`bash`).
  4. Extension / MCP Tools (`mcp_*`).
- [ ] Complete mapping of all entry points where tools are invoked without interactive TTY confirmation (`chat --write --yes`, `agent-serve`, `daemon`).
- [ ] Explicit gap analysis showing why `createBashTool()` currently allows destructive commands (`rm`, `git reset`, process killing) and how M7-04 will constrain it.
- [ ] A clean summary specifying exact interfaces required for M7-02 (worktree runner), M7-03 (permission policy evaluator), and M7-05 (resource ceiling tracker).

## Steps

1. **Audit Tool Registry and Instantiation:**
   - Trace tool definitions in `kaioken_v2/packages/agent/src/tools.ts` and runtime adaptation in `kaioken_v2/apps/cli/src/agent-host.ts`.
   - Document parameter shapes, file path boundary checks (`resolveInside`), and return types.
2. **Audit Approval Interceptors:**
   - Trace `beforeToolCall` hook in `kaioken_v2/apps/cli/src/agent-host.ts:262-275`.
   - Document how `hooks.approve` is passed from `apps/cli/src/commands/chat.ts` and `apps/cli/src/commands/agent-serve.ts`.
   - Identify the exact condition under which `options.approve` evaluates to `undefined`, allowing unrestricted tool execution.
3. **Audit Execution & Shell Privileges:**
   - Inspect `@earendil-works/pi-agent-core/node` usage in `kaioken_v2/apps/cli/src/agent-host.ts:182-190`.
   - Verify that `createBashTool()` inherits process environment, current working directory, and standard shell binary paths with zero filtering.
4. **Audit Background Services:**
   - Analyze `kaioken_v2/apps/cli/src/commands/agent-serve.ts` stdio message protocol.
   - Analyze `kaioken_v2/apps/cli/src/commands/daemon.ts` HTTP and run management endpoints.
5. **Compile and Verify Findings:**
   - Verify every file path and line number cited against the working tree.
   - Hand the compiled inventory over as the technical baseline for M7-02 through M7-06.

## In scope

- Analysis and reporting of `kaioken_v2/packages/agent/src/tools.ts`
- Analysis and reporting of `kaioken_v2/packages/agent/src/gate.ts`
- Analysis and reporting of `kaioken_v2/apps/cli/src/agent-host.ts`
- Analysis and reporting of `kaioken_v2/apps/cli/src/commands/chat.ts`
- Analysis and reporting of `kaioken_v2/apps/cli/src/commands/agent-serve.ts`
- Analysis and reporting of `kaioken_v2/apps/cli/src/commands/daemon.ts`

## Out of scope

- Modifying any engine code or command implementations (this is an audit leaf).
- Refactoring `agent-host.ts` or adding permission wrappers (that is M7-03).
- Implementing worktree spawning (that is M7-02).
- Implementing command denylists (that is M7-04).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

From the repo root, run the offline smoke verification:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

Verify that the working tree remains clean with zero modified engine files.

## Traps

| Trap | Guard |
|---|---|
| Assuming `read_file` is completely safe without checking | Verify `resolveInside` prevents directory traversal (`../`) outside the repository root |
| Missing MCP tool execution vectors | Include `mcpAgentTools()` in the audit; MCP servers can execute network or filesystem calls |
| Believing `--write` requires human confirmation in all cases | `--write` combined with `--yes` completely disables `approve` prompts and executes silently |
| Confusing the post-run verification gate with execution safety | `gate.ts` runs *after* work is done; it does not protect the repo while the agent is running |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
Perform a comprehensive security audit of the autonomy and execution surface across the TypeScript engine in kaioken_v2/. You are documenting the exact reality of the codebase today, producing the baseline report that will govern leaves M7-02 through M7-06.

Specifically inspect and report on:
1. All tool definitions in kaioken_v2/packages/agent/src/tools.ts (lines 22-28, 344-406, 422-429). Note how paths are confined by resolveInside() and what data each tool returns.
2. The runtime execution adapter in kaioken_v2/apps/cli/src/agent-host.ts:
   - MUTATING_TOOLS definition at line 85.
   - executionTools() at lines 177-209: how NodeExecutionEnv({ cwd: root }) binds createReadTool(), createEditTool(), createWriteTool(), and createBashTool().
   - mcpAgentTools() at lines 100-145: how MCP tools are loaded and executed.
   - createSession() at lines 251-276: how beforeToolCall() gates calls when options.approve is provided, and what happens when options.approve is absent.
3. The CLI execution harness in kaioken_v2/apps/cli/src/commands/chat.ts:
   - Lines 156-163: how flags.write, interactive, flags.yes, and hooks.approve interact.
   - Lines 216-220: when executionTools and mcpAgentTools are injected into the agent session.
   - Lines 225-275: how interactive approvals work vs non-interactive --yes mode.
4. Background runtime surfaces:
   - kaioken_v2/apps/cli/src/commands/agent-serve.ts (lines 80-146): bare tool calls vs conversational turns.
   - kaioken_v2/apps/cli/src/commands/daemon.ts (lines 80-115): run records, approval structures, and execution.

Compile an exhaustive findings matrix documenting:
- Every tool available to the agent, its category (read-only, write, shell, external), and whether it checks paths.
- Every scenario where an agent can alter files or execute commands without an interactive approval prompt.
- The precise interfaces needed by M7-02 (worktree runner), M7-03 (permission policy), and M7-04 (command denylist).

Do NOT modify any code in kaioken_v2/. This is an audit and reporting task only.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm git status shows zero modifications to kaioken_v2/ engine files.
</verification_loop>

<missing_context_gating>
Cite exact file paths and line numbers for every finding. Do not extrapolate or guess tool capabilities from external documentation — rely strictly on the code in kaioken_v2/packages/agent/ and kaioken_v2/apps/cli/. If an execution boundary cannot be verified in the local code (e.g. internal behavior of @earendil-works/pi-agent-core binary tools), mark it explicitly as UNVERIFIED:.
</missing_context_gating>

<action_safety>
Scope strictly to reading files and producing the audit findings report. No code modifications, refactoring, or renames. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Executive summary of autonomy safety gaps in v2.
2. Verified tool inventory table (name, source, mutating status, sandboxing status, approval requirement).
3. Detailed breakdown of unattended execution paths (chat --yes, daemon, agent-serve).
4. Direct technical requirements and interface recommendations for M7-02, M7-03, M7-04, M7-05, and M7-06.
5. Confirmation that no engine files were modified.
</structured_output_contract>
```
