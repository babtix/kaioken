# M9-04 · Documented offline configuration profile

> Ship a named, documented "runs fully offline" configuration profile specifying recommended open-weight models, hardware baselines, multiplier bounds, and zero-network execution.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | `01-tool-call-formatters-for-open-models`, `02-structured-output-fallback` |
| **Blocks** | Milestone M9 completion |
| **Touches** | `packages/model/src/profiles.ts`, `packages/model/src/index.ts`, `apps/cli/src/profiles.ts`, `docs/offline-guide.md` |
| **Risk** | Low. Configuration and documentation bundle built on existing architectural enabler |
| **Gate-critical** | No — user-facing preset and onboarding |

## Why this exists

Configuration profiles already ship as an architectural enabler in Kaioken (README §5). While leaves 01–03 build the mechanics of formatters, structured repair, and model routing, a developer who wants to run Kaioken completely offline should not have to manually stitch together low-level JSON configuration files, guess which model size fits in their VRAM, or figure out why a `x5` multiplier crawl stalls their machine.

The `offline` profile provides a single, turn-key preset: `kaioken --profile offline wiki`. It configures zero-credential operation, points to standard local endpoints (Ollama / vLLM), selects vetted open models, clamps the generative multiplier to realistic local throughput (`x1`–`x2`), and documents exactly what hardware is required and what quality to expect.

## Current state

Verified in `kaioken_v2/` and `roadmap/README.md`.

| Fact | Evidence | Notes |
|---|---|---|
| Configuration profiles exist as an architectural enabler | `roadmap/README.md` §5 | *"Named profiles (review, wiki, chat) presetting model, tokens, tools, prompt — Shipped in v2"* |
| Offline and deterministic engine by design | `roadmap/CONVENTIONS.md` §Real gates | Phase 1–5 indexing, scanning, and search require zero credentials and zero network calls |
| Multiplier scaling is strictly calibrated | `kaioken_v2/packages/model/src/index.ts:69-86` | Multiplier `x1` produces 7 target modules and 1 repair pass; `x5+` adds rubric critique |
| Zero bundled local profile definition | `kaioken_v2/packages/model/` | No built-in `offline` profile preset or hardware reference documentation currently exists |

`UNVERIFIED:` whether Ollama auto-pulls missing model tags or requires explicit user pre-pull commands before first invocation.

## What done looks like

- [ ] A built-in profile named `offline` available out of the box:
  ```json
  {
    "name": "offline",
    "description": "Runs fully offline with zero external credentials using local Ollama or vLLM",
    "model": "ollama/qwen2.5-coder:14b",
    "multiplier": 2,
    "concurrency": 2,
    "features": {
      "web_search": false,
      "hermes_formatting": true,
      "structured_repair": true
    },
    "routing": {
      "plan": "ollama/qwen2.5-coder:14b",
      "compact": "ollama/qwen2.5-coder:7b",
      "card": "ollama/qwen2.5-coder:14b",
      "wiki": "ollama/qwen2.5-coder:14b"
    }
  }
  ```
- [ ] User documentation in `docs/offline-guide.md` detailing:
  - Minimum hardware requirements (VRAM, Apple Silicon Unified Memory, CPU fallback).
  - Recommended models: `qwen2.5-coder:14b` (recommended balance), `qwen2.5-coder:7b` (8GB VRAM laptops), `qwen2.5-coder:32b` (24GB VRAM workstations).
  - Multiplier calibration: why `x1` or `x2` is recommended locally to balance generation time vs structural depth.
- [ ] CLI support: `kaioken --profile offline <command>` automatically loads the preset without requiring manual flags.

## Steps

1. **Implement Builtin Profile Definition (`packages/model/src/profiles.ts`):**
   - Define interface `ProfileConfig`.
   - Add `OFFLINE_PROFILE` preset with model mappings, clamped multiplier (`x2`), concurrency (`2`), and disabled network research.
   - Add helper `resolveProfile(name: string, repoRoot?: string): ProfileConfig`.
2. **Expose Profile in CLI (`apps/cli/src/profiles.ts`):**
   - Wire `--profile <name>` flag in `apps/cli/src/main.ts`.
   - If `--profile offline` is selected:
     - Set default model to `ollama/qwen2.5-coder:14b` if no explicit model flag passed.
     - Clamp default concurrency to `2` to prevent local VRAM thrashing.
     - Enforce offline behavior on `research` and `web_search` tools.
3. **Author Developer Guide (`docs/offline-guide.md`):**
   - Provide step-by-step setup for Ollama and vLLM.
   - Document expected runtimes: ~3–5 minutes for `kaioken wiki x2` on a 15k LOC codebase using an M2/M3 Mac or RTX 3080.
   - Explain output expectations: factual, grounded, concise prose without hallucinated packages.
4. **Testing (`packages/model/test/profiles.test.ts`):**
   - Test resolving the `offline` profile.
   - Verify multiplier clamping and route assignments.

## In scope

- `kaioken_v2/packages/model/src/profiles.ts`
- `kaioken_v2/packages/model/src/index.ts`
- `kaioken_v2/apps/cli/src/profiles.ts`
- `kaioken_v2/docs/offline-guide.md`
- `kaioken_v2/packages/model/test/profiles.test.ts`

## Out of scope

- Packaging and bundling llama.cpp C++ binaries directly into npm.
- Managing background Ollama daemon processes or systemd services.
- Providing cloud proxy endpoints for offline fallbacks.

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/model/test/profiles.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Recommending local models that exceed average developer VRAM | Default to `qwen2.5-coder:14b` (requires ~9GB VRAM in 4-bit quant); document `7b` for 8GB machines |
| Permitting default concurrency of 4 on local GPU inference | Clamp local profile concurrency to 1 or 2 to avoid VRAM out-of-memory crashes |
| Attempting web research in offline mode | Explicitly disable web research tools in the offline profile definition |
| Letting multiplier default to x5 on local models | Cap offline profile multiplier to x2; higher multipliers take hours locally for diminishing gains |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, implement a built-in "offline" configuration profile and documentation guide, enabling turn-key execution against local open-weight models (Ollama/vLLM) with calibrated multipliers and hardware expectations.

Current state:
- Configuration profiles are listed as an architectural enabler in roadmap/README.md §5, but no built-in "offline" profile is defined in code.
- Running locally requires manual configuration of endpoints, formatters, and flags.

1. Implement kaioken_v2/packages/model/src/profiles.ts:
   - Define interface ProfileConfig with name: string, description: string, model: string, multiplier: number, concurrency: number, routes?: Record<string, string>, flags?: Record<string, unknown>.
   - Define BUILTIN_PROFILES: Record<string, ProfileConfig> containing the "offline" profile:
     - model: "ollama/qwen2.5-coder:14b"
     - multiplier: 2
     - concurrency: 2
     - routes: { plan: "ollama/qwen2.5-coder:14b", compact: "ollama/qwen2.5-coder:7b", wiki: "ollama/qwen2.5-coder:14b" }
   - Implement getProfile(name: string): ProfileConfig | undefined.
2. Re-export profiles from kaioken_v2/packages/model/src/index.ts.
3. In kaioken_v2/apps/cli/src/main.ts and apps/cli/src/model.ts:
   - Support --profile flag. When --profile offline is supplied:
     - Apply offline profile defaults unless overridden by explicit CLI flags.
4. Author user guide kaioken_v2/docs/offline-guide.md:
   - Detail setup with Ollama (`ollama pull qwen2.5-coder:14b`).
   - Hardware guidance (8GB VRAM -> 7b, 16GB -> 14b, 32GB+ -> 32b).
   - Explain why multiplier is clamped to x1/x2 for local runs.
5. Add unit tests in kaioken_v2/packages/model/test/profiles.test.ts testing profile loading and fallback logic.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/model/test/profiles.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/model/src/profiles.ts, packages/model/src/index.ts, packages/model/test/profiles.test.ts, apps/cli/src/main.ts, and docs/offline-guide.md.
</verification_loop>

<missing_context_gating>
Do not invent complex configuration formats. Match the existing profile structures noted in roadmap/README.md.
</missing_context_gating>

<action_safety>
Scope strictly to packages/model/ and apps/cli profile flag wiring. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of the offline profile definition and default hardware bounds.
2. Exact files created and modified.
3. Vitest test results and counts.
4. Confirmation of user guidance in docs/offline-guide.md.
</structured_output_contract>
```
