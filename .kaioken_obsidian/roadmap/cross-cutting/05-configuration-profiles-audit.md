# CROSS-05 · Audit and formalise configuration profiles for M9

> Audit the codebase against the roadmap claim that "Configuration profiles" are shipped, record the
> real state honestly, and specify the named profile system that Milestone M9's offline profile builds upon.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | Milestone M1 (Green everywhere) |
| **Blocks** | Milestone M9 (Local-model path & documented offline profile) |
| **Touches** | `kaioken_v2/apps/cli/src/main.ts`, `apps/cli/src/model.ts`, `docs/` |
| **Risk** | Low — audits reality vs documentation claim |
| **Gate-critical** | No |

## Why this exists

The master roadmap ([`roadmap/README.md:311`](../README.md#L311)) lists:
> `| Configuration profiles | Named profiles (review, wiki, chat) presetting model, tokens, tools, prompt | ✅ | — |`

However, operating rule 1 and the project's guiding philosophy state that *a confident wrong answer
is the failure mode this engine exists to avoid*. An audit of `kaioken_v2` reveals that no formal
`--profile` CLI flag, no `packages/profile`, and no named profile presets (`review`, `wiki`, `chat`)
actually exist in the TypeScript code. Instead, what exists is a collection of ad-hoc flags
(`--model`, `--thinking`, `--write`), environment variables, and per-repository config files
(`.kaioken/config.json`).

Milestone M9 (Local-model path) is explicitly gated on having a *"documented offline profile"* that
presets local models, tool-call fallbacks, and zero network timeouts. If we pretend profiles already
shipped, M9 builds on a phantom foundation. This leaf audits reality and provides the concrete
specification to formalise configuration profiles.

## Current state

Verified against [`kaioken_v2/apps/cli/src/main.ts:31-70`](../../kaioken_v2/apps/cli/src/main.ts#L31-L70)
and [`kaioken_v2/apps/cli/src/model.ts`](../../kaioken_v2/apps/cli/src/model.ts):

| Fact | Evidence |
|---|---|
| No `--profile` flag in CLI | `apps/cli/src/main.ts:31-70` lists CLI usage flags: `--json`, `--force`, `--write`, `--root`, etc. No `--profile` option exists |
| No profile configuration files | Grep for `profile` across `kaioken_v2/packages/` returns zero matches in code |
| What actually exists | 1. Global `~/.kaioken/config.yaml` storing provider API keys and `default_provider`/`default_model`.<br>2. Local repository `.kaioken/config.json` storing per-repo model and provider.<br>3. Hardcoded command defaults (e.g. `runWikiCommand` defaulting to `minimax-m3`). |
| Milestone M9 dependency | `roadmap/README.md:90` specifies M9 success as `kaioken wiki x2` completing fully local via documented offline profile |

## What done looks like

- [ ] A written audit report documenting the exact configuration resolution hierarchy across `apps/cli`, `apps/tui`, and `daemon.ts`.
- [ ] Correction in the roadmap status: marking "Configuration profiles" as `PARTIAL / AUDIT` rather than unconditional `SHIPPED`.
- [ ] Specification of the formal Profile Schema (`.kaioken/profiles.yaml` or global `~/.kaioken/profiles.yaml`):
  ```yaml
  profiles:
    offline:
      provider: ollama
      model: llama3.2
      thinking: minimal
      max_tokens: 4096
      tools: [symbol_lookup, read_file, wiki_search]
    review:
      provider: anthropic
      model: claude-3-7-sonnet
      thinking: medium
      max_tokens: 8192
    chat:
      provider: openrouter
      model: minimax/minimax-m3:free
  ```
- [ ] A design for integrating `--profile <name>` into `apps/cli/src/main.ts` and `resolveModel()`.

## Steps

1. **Verify Configuration Sources in Engine:**
   - Document how `resolveModel()` in `apps/cli/src/model.ts` reads `modelSpec` and resolves against
     provider pools.
   - Document how `daemon.ts:164-236` reads `~/.kaioken/config.yaml`.
2. **Draft the Profile Engine Specification:**
   - Define schema for named profiles specifying: `provider`, `model`, `thinking`, `temperature`,
     `maxTokens`, `allowedTools`, and `systemPromptSuffix`.
   - Specify fallback resolution: CLI flag `--profile <name>` > Repo `.kaioken/profiles.yaml` >
     Global `~/.kaioken/profiles.yaml` > Command defaults.
3. **Specify the M9 "offline" Profile Preset:**
   - Define the exact preset targeting local Ollama / LMStudio endpoints with zero telemetry calls.
4. **Update Documentation:**
   - Update `roadmap/cross-cutting/README.md` and `roadmap/README.md` with honest status.

## In scope

- Audit of configuration handling in `kaioken_v2/apps/cli/`.
- Specification of the configuration profiles schema and CLI integration plan for M9.

## Out of scope

- Implementing the entire M9 local-model tool formatters — that is Milestone M9.
- Modifying provider connection pools in `packages/model`.

## Gates

This is an audit and specification leaf. The gate is a written report committed to the repository that accurately reconciles the roadmap claim against the working tree and delivers the profile specification.

## Traps

| Trap | Guard |
|---|---|
| Papering over the missing profile code | Be ruthlessly honest: the code does not exist. Say so clearly in the audit report. |
| Making profile schemas too complex | Keep it to a single YAML dictionary of string/number properties. Do not build custom expression languages into profile configs. |
| Breaking existing `--model` flag precedence | Explicit CLI flags (`--model`, `--write`) must always override profile settings. |

## Open questions

None. The audit findings are verified by searching the codebase.

## Session brief

```xml
<task>
Perform a forensic code audit of "Configuration Profiles" in kaioken_v2/:

1. Examine how model and runtime configuration is currently resolved:
   - Check apps/cli/src/model.ts (resolveModel function).
   - Check apps/cli/src/commands/daemon.ts (loadUserConfigYaml function).
   - Check apps/cli/src/main.ts (Flags interface and CLI parser).
2. Confirm the finding that named profiles ("review", "wiki", "chat") do not exist in code, despite
   being marked shipped in roadmap/README.md line 311.
3. Author a concise specification for the Profile System to be built for Milestone M9:
   - File locations: .kaioken/profiles.yaml (repo-level) and ~/.kaioken/profiles.yaml (user-level).
   - Schema: model, provider, thinking, maxTokens, allowedTools.
   - CLI syntax: kaioken <cmd> --profile <name>.
   - Precedence: CLI explicit flag > profile setting > config.yaml default > hardcoded default.
4. Define the exact "offline" profile specification required by Milestone M9.
</task>

<verification_loop>
Verify that:
- Grepping for "profile" in apps/cli/src/ confirms no pre-existing profile resolver exists.
- The proposed specification directly satisfies Milestone M9's done-criterion in roadmap/README.md:90.
</verification_loop>

<action_safety>
Do not write new engine code in this audit session. Document the findings and design.
Do NOT run git add or git commit.
</action_safety>

<structured_output_contract>
End with: (1) audit summary of existing configuration mechanics, (2) formal discrepancy statement
regarding roadmap/README.md line 311, (3) completed Profile Schema specification, (4) design for
Milestone M9 offline profile.
</structured_output_contract>
```
