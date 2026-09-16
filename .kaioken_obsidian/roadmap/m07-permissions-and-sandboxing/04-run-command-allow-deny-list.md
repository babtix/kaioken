# M7-04 · Run-command allow and deny list

> Enforce pattern-based command inspection for shell execution tools, with the fundamental safety invariant that the **deny list strictly wins**.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `03-tool-permission-policy` |
| **Blocks** | `M8-01` (daemon-hosted long-running tasks), `M8` background worker queue |
| **Touches** | `packages/agent/src/command-filter.ts`, `packages/agent/src/index.ts`, `packages/agent/test/command-filter.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | High. Any bug in pattern precedence or shell command tokenization permits arbitrary code execution |
| **Gate-critical** | **Yes — the primary line of defense against destructive shell operations** |

## Why this exists

Operating rule 1 states that the review capacity of the developer is the limiting factor. The `bash` tool (`apps/cli/src/agent-host.ts:189`) executes arbitrary shell commands with the host user's full privileges. In unattended or background worker scenarios, a hallucinated command like `rm -rf .git`, `git push --force`, or an exfiltration pipeline (`curl ... | sh`) can irrevocably destroy the repository or leak sensitive data before human review can intervene.

A pattern-based command evaluation engine is essential. Crucially, the precedence rule must be absolute and unambiguous: **THE DENY LIST WINS**. If a command matches an allow rule (such as `git *`) but also matches a deny rule (such as `git push --force`), the deny rule unconditionally trumps the allow rule. This precedence must be enforced in code and backed by exhaustive unit tests.

## Current state

Verified in `kaioken_v2/apps/cli/` and `kaioken_v2/packages/agent/`.

| Fact | Evidence | Notes |
|---|---|---|
| Shell tool executes via NodeExecutionEnv | `kaioken_v2/apps/cli/src/agent-host.ts:182-190` | `agentRuntime.createBashTool()` bound to `{ env: new nodeRuntime.NodeExecutionEnv({ cwd: root }) }` |
| Raw command string passed to shell | `kaioken_v2/apps/cli/src/agent-host.ts:194-207` | Parameters passed to `bash` tool are forwarded with zero inspection or pattern filtering |
| Verification gate commands discovered from manifests | `kaioken_v2/packages/agent/src/gate.ts:84-120` | `detectCommands(root)` reads `package.json` scripts (`typecheck`, `test`, `build`); no shell safety filters applied |
| Zero command filtering infrastructure | `kaioken_v2/packages/agent/src/index.ts:1-22` | No command filter or regex scanner exists in the agent package |

`UNVERIFIED:` whether sub-shells, chained commands (`&&`, `;`, `|`), or subshell interpolations (`$(...)`) bypass simple prefix matching without full lexical tokenization.

## What done looks like

- [ ] New module `packages/agent/src/command-filter.ts` defining:
  - `CommandFilterConfig`: schemas for `allow` patterns, `deny` patterns, and fallback behavior.
  - `evaluateCommand(command: string, config: CommandFilterConfig): CommandVerdict`
  - Explicit precedence rule: **Deny list checked first; any deny match yields `{ allowed: false, reason }` immediately**.
- [ ] Built-in default baseline denylist covering catastrophic actions:
  - Destructive filesystem deletions (`rm -rf /`, `rm -rf ~`, `rm -rf .git*`).
  - Destructive git commands (`git reset --hard`, `git clean -fdx`, `git push --force`, `git push -f`, `git branch -D main`).
  - System modification / privilege escalation (`sudo *`, `chmod -R 777 *`, `chown *`).
  - Direct network execution / piping (`curl * | sh`, `curl * | bash`, `wget * | sh`).
  - Process killing and host control (`kill -9`, `shutdown`, `reboot`).
- [ ] Lexical normalization handling command chaining (`&&`, `||`, `;`, `|`), whitespace normalization, and path separators across Windows (`cmd.exe`/`powershell`) and POSIX shells.
- [ ] Dedicated test suite `packages/agent/test/command-filter.test.ts` verifying that overlapping allow/deny rules (e.g. `git *` allowed, `git reset --hard` denied) consistently and cleanly reject the forbidden operation.
- [ ] Integration into `agent-host.ts`: `createBashTool()` wrapped with command filter before invocation.

## Steps

1. **Implement Command Tokenizer and Normalizer (`packages/agent/src/command-filter.ts`):**
   - Split compound commands by operators (`&&`, `||`, `;`, `|`).
   - Trim and normalize command tokens, resolving aliases and case variations where applicable.
2. **Implement Deny-List-Winning Evaluator:**
   - Define structure:
     ```ts
     export interface CommandFilterConfig {
       allow?: string[];
       deny?: string[];
       defaultAction?: "allow" | "deny";
     }
     ```
   - Evaluation algorithm:
     1. For each sub-command in a chain:
        a. Check against every pattern in `config.deny` (and `DEFAULT_DENY_PATTERNS`).
        b. If ANY pattern matches: **RETURN REJECTED IMMEDIATELY** with matched pattern.
     2. If `config.allow` is specified and non-empty:
        a. Check if every sub-command matches at least one allow pattern.
        b. If any sub-command fails to match: **RETURN REJECTED** ("command not on allowlist").
     3. If no deny matched and either allow matched or default is allow: **RETURN ALLOWED**.
3. **Wrap `createBashTool` in `apps/cli/src/agent-host.ts`:**
   - In `executionTools()`, wrap `createBashTool.execute`:
     - Inspect `params.command`.
     - Run `evaluateCommand(params.command, filterConfig)`.
     - If rejected, throw an error or return `{ isError: true, text: `Refused: command violates safety policy: ${verdict.reason}` }`.
4. **Build Exhaustive Test Suite (`packages/agent/test/command-filter.test.ts`):**
   - Test allow without deny.
   - Test deny without allow.
   - **Crucial test**: Allow `["git *"]`, Deny `["*--force*"]`, Input `"git push --force"`. Verify Deny strictly wins.
   - Test compound commands: `"npm test && rm -rf .git"`. Verify compound chains are rejected even if the first command is allowed.
   - Test shell evasions (extra spaces, quotes, subshell invocations).

## In scope

- `kaioken_v2/packages/agent/src/command-filter.ts`
- `kaioken_v2/packages/agent/src/index.ts`
- `kaioken_v2/packages/agent/test/command-filter.test.ts`
- Wrapping `createBashTool` in `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- Sandbox virtualization (Docker/devcontainer isolation is a future enabler).
- Operating system level seccomp / AppArmor filtering.
- General tool permissions (that is M7-03).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/agent/test/command-filter.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Chained commands evading inspection (`npm test ; rm -rf /`) | Tokenize on `;`, `&&`, `\|\|`, and `\|` and evaluate every sub-command segment against the deny list |
| Allowing `*` which accidentally overrides a deny rule | Deny evaluation is performed first and aborts before the allowlist is even consulted |
| Windows vs POSIX command path divergence (`rm` vs `rmdir /s /q`) | Default deny list includes both POSIX and Windows destructive primitives (`del /f /s /q`, `rmdir /s /q`, `format`, `Remove-Item -Recurse -Force`) |
| Escaping via shell script execution (`./hack.sh`) | Running local executable scripts must require explicit allowlist approval in unattended mode |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement a pattern-based command filter for shell execution (the bash tool in agent-host.ts), enforcing the non-negotiable rule that THE DENY LIST WINS.

Current state:
- apps/cli/src/agent-host.ts lines 182-209 binds createBashTool() from @earendil-works/pi-agent-core to NodeExecutionEnv({ cwd: root }).
- Shell commands are executed with zero argument inspection. An agent can run `rm -rf .git` or `git push --force` with no filter.
- No command filter exists in packages/agent/.

1. Implement kaioken_v2/packages/agent/src/command-filter.ts:
   - Define interface CommandFilterConfig with allow: string[], deny: string[], defaultAction?: "allow" | "deny".
   - Define DEFAULT_DENY_PATTERNS containing:
     - Destructive deletions: rm -rf /, rm -rf ~, rm -rf .git*, del /f /s /q, rmdir /s /q, Remove-Item -Recurse
     - Force pushes and branch deletions: git push *--force*, git push *-f *, git branch -D*, git reset --hard*
     - Privilege escalation / security bypass: sudo *, chmod -R 777*, chown *
     - Network piping: *curl*|*sh*, *curl*|*bash*, *wget*|*sh*, *wget*|*bash*
     - Process termination: kill -9*, shutdown*, reboot*
   - Implement evaluateCommand(command: string, config?: CommandFilterConfig): { allowed: boolean; reason?: string }:
     - Split compound commands by &&, ||, ;, and | pipes.
     - For EACH segment:
       1. Match against deny patterns. If ANY matches: return { allowed: false, reason: `Command "${segment}" matched deny rule "${pattern}"` } immediately.
       2. If config.allow is provided: verify segment matches an allow pattern. If none match: return { allowed: false, reason: `Command "${segment}" is not permitted by allow rules` }.
     - If all segments pass without a deny match and satisfy allow constraints, return { allowed: true }.
2. Re-export command filter from kaioken_v2/packages/agent/src/index.ts.
3. In kaioken_v2/apps/cli/src/agent-host.ts:
   - Wrap the bash tool's execute function so that params.command is validated with evaluateCommand before execution.
   - If allowed is false, refuse the tool call with an error message detailing the reason.
4. Write exhaustive characterization tests in kaioken_v2/packages/agent/test/command-filter.test.ts:
   - Explicit precedence test: an allow pattern of "git *" and a deny pattern of "*--force*" must REJECT "git push --force origin main".
   - Chained execution test: "npm test && rm -rf .git" must be REJECTED.
   - Normalization test: whitespace and quotation variations are properly handled.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/agent/test/command-filter.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/agent/src/command-filter.ts, packages/agent/src/index.ts, packages/agent/test/command-filter.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not guess shell semantics. Standardize on splitting by standard shell control operators (&&, ||, ;, |). Ensure the deny list test explicitly asserts that deny beats allow.
</missing_context_gating>

<action_safety>
Scope strictly to packages/agent/src/command-filter.ts, index re-exports, test file, and agent-host.ts bash tool interception. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Confirmation of the deny-list-winning evaluation logic and default deny patterns.
2. Exact files touched.
3. Test suite counts proving the precedence invariant and chained-command rejection.
4. Any edge cases on Windows command shell vs bash syntax.
</structured_output_contract>
```
