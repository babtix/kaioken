# M9-02 · Structured-output fallback for malformed tool calls

> Implement resilient JSON and XML recovery heuristics for malformed tool calls — the specific, observable failure mode that actually breaks local open-weight models.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | `01-tool-call-formatters-for-open-models` |
| **Blocks** | `03-per-operation-model-routing`, `04-offline-profile` |
| **Touches** | `packages/model/src/repair.ts`, `packages/model/src/index.ts`, `packages/model/test/repair.test.ts`, `apps/cli/src/agent-host.ts` |
| **Risk** | Medium. Aggressive repair must never alter the semantic meaning of code or file paths inside arguments |
| **Gate-critical** | **Yes — P1 for local model reliability and zero-crash execution** |

## Why this exists

The source plan is explicit: **THIS is what actually breaks on local models — not capability, but malformed tool calls.**

When developers attempt to run coding agents against local 7B–32B open models (Qwen 2.5 Coder, Llama 3, Mistral), the model almost always understands what tool it needs to invoke and which files to touch. What causes the run to crash is minor syntax degradation in the tool payload: a trailing comma before a closing brace, an unquoted object key, unescaped raw newlines inside a file edit block, or an unclosed brace caused by an abrupt token boundary.

In hosted commercial APIs (Claude 3.5 Sonnet, GPT-4o), provider-side micro-grammar constraints force strictly valid JSON. Open local endpoints lack these constraints. If an agent crashes or burns a full conversational turn complaining about a syntax error every time a local model leaves a trailing comma, local execution is unusable. A robust, multi-stage repair fallback is the cornerstone of the local model path.

## Current state

Verified in `kaioken_v2/packages/model/`.

| Fact | Evidence | Notes |
|---|---|---|
| Rigid JSON extraction | `kaioken_v2/packages/model/src/index.ts:96-125` | `extractJson<T>(reply)` tests regex candidates and runs native `JSON.parse` directly |
| Zero repair on failure | `kaioken_v2/packages/model/src/index.ts:130-145` | If `JSON.parse` fails on all candidates, throws `Error("could not extract JSON from model reply")` |
| Runtime tool parser throws on invalid JSON | `kaioken_v2/apps/cli/src/agent-host.ts:67-79` | If tool parameter deserialization fails, runtime throws an error, marking the turn as failed |
| Common open-model syntax failure modes | Real-world 7B–32B traces | Trailing commas (`{"a": 1,}`), unquoted keys (`{path: "foo"}`), unescaped double quotes in code snippets, truncated closing braces |

`UNVERIFIED:` whether streaming partial-JSON parsing is required during live token generation or only on finished tool call blocks.

## What done looks like

- [ ] New module `packages/model/src/repair.ts` exporting:
  - `repairJson<T = unknown>(raw: string): { ok: true; value: T; repaired: boolean } | { ok: false; error: string }`
  - `safeExtractJson<T>(text: string): T`: drop-in replacement for `extractJson` with multi-tier recovery.
- [ ] Six-tier repair pipeline:
  1. **Fast path**: Direct `JSON.parse`.
  2. **Sanitization**: Strip JavaScript (`// ...`, `/* ... */`) and Python (`# ...`) comments; remove trailing commas before `}` and `]`.
  3. **Key quoting**: Convert unquoted object keys (`{path: "file.ts"}`) into valid quoted JSON keys (`{"path": "file.ts"}`).
  4. **String escaping**: Escape unescaped newlines and tabs inside multiline string literals.
  5. **Auto-closure**: Detect unbalanced braces, brackets, and quotes, appending missing closing delimiters.
  6. **Fuzzy Key-Value Extraction**: Fallback regex AST scanner to salvage essential fields (`path`, `content`, `command`, `query`) even from severely truncated JSON envelopes.
- [ ] Comprehensive unit test suite in `packages/model/test/repair.test.ts` testing 20+ real-world malformed JSON examples from open models, proving 100% recovery without data corruption.

## Steps

1. **Implement `packages/model/src/repair.ts`:**
   - Define multi-stage repair pipeline:
     ```ts
     export function repairJsonString(raw: string): string {
       let s = raw.trim();
       // 1. Strip markdown fences
       s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
       // 2. Remove comments
       s = s.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
       // 3. Remove trailing commas
       s = s.replace(/,(\s*[}\]])/g, "$1");
       // 4. Quote bare keys: { foo: "bar" } -> { "foo": "bar" }
       s = s.replace(/([{,]\s*)([A-Za-z0-9_$-]+)\s*:/g, '$1"$2":');
       // 5. Replace single-quoted strings with double quotes
       s = replaceSingleQuotes(s);
       // 6. Balance open delimiters
       s = balanceDelimiters(s);
       return s;
     }
     ```
   - Implement `balanceDelimiters(s: string)`:
     - Count unmatched `{`, `[`, and `"`.
     - Close open string literals, then close brackets and braces in LIFO order.
   - Implement `extractKeyValuesFallback(s: string)`:
     - Regex-based key-value extractor extracting `"name"`, `"path"`, `"command"`, `"content"` when JSON parsing completely fails.
2. **Integrate with `packages/model/src/index.ts`:**
   - Update `extractJson<T>` to utilize `repairJson` before giving up.
   - Add warning/telemetry when a repair was required so logs note that fallback parsing saved the turn.
3. **Wire into Agent Host Tool Execution (`apps/cli/src/agent-host.ts`):**
   - Wrap incoming tool arguments with `repairJson` before passing them to tool `execute()`.
4. **Exhaustive Unit Testing (`packages/model/test/repair.test.ts`):**
   - Test trailing comma in array and object.
   - Test bare unquoted keys.
   - Test truncated tool call missing final `}`.
   - Test tool call containing embedded unescaped quotes in a bash command string.
   - Verify that clean valid JSON passes through unmodified with zero overhead.

## In scope

- `kaioken_v2/packages/model/src/repair.ts`
- `kaioken_v2/packages/model/src/index.ts`
- `kaioken_v2/packages/model/test/repair.test.ts`
- Wiring repair into `kaioken_v2/apps/cli/src/agent-host.ts`

## Out of scope

- Implementing proprietary model grammar constraints.
- Modifying tree-sitter C++ grammar parsers in `packages/index`.
- Retrying model calls at the network layer (handled by `retry.ts`).

## Gates

Run from `kaioken_v2/`:

```bash
npm run typecheck
npm test
```

Specific test run:

```bash
npx vitest run packages/model/test/repair.test.ts
```

Smoke check from repo root:

```bash
node kaioken_v2/apps/cli/dist/bin.js scan --root .
```

## Traps

| Trap | Guard |
|---|---|
| Corrupting code indentation or quotes inside string values | Only quote keys outside string literals; use state machine scanner to distinguish keys from string contents |
| Replacing single quotes inside apostrophes or prose | Restrict single-quote conversion strictly to JSON structural values (`'key': 'value'`) |
| Masking catastrophic truncated calls | If a truncated file write loses more than 50% of its body, fail with a clear recovery prompt rather than writing half a file |
| Performance degradation on large payloads | Fast-path: try native `JSON.parse` first; only engage the repair pipeline if standard parsing throws |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/packages/model/, implement a resilient, multi-stage structured-output fallback parser for malformed JSON/XML tool calls emitted by open-weight models.

Current state:
- packages/model/src/index.ts lines 96-145 implements extractJson() using regex and strict native JSON.parse(). If parsing fails, it throws immediately.
- Open-weight models (7B–32B) frequently emit tool calls with trailing commas, unquoted keys, unclosed braces, or unescaped quotes, causing agent runs to crash.

1. Implement kaioken_v2/packages/model/src/repair.ts:
   - Implement repairJson<T = unknown>(raw: string): { ok: true; value: T; repaired: boolean } | { ok: false; error: string }:
     1. Fast path: try native JSON.parse(raw). If successful, return { ok: true, value, repaired: false }.
     2. Stage 1: Strip markdown code fences (```json ... ```) and leading/trailing conversational commentary.
     3. Stage 2: Remove trailing commas before closing braces and brackets (e.g. `{"a": 1,}` -> `{"a": 1}`).
     4. Stage 3: Remove JavaScript comments (// and /* */) and Python comments (#).
     5. Stage 4: Quote unquoted object keys (e.g. `{path: "foo"}` -> `{"path": "foo"}`) using state machine or robust regex that ignores colons inside string literals.
     6. Stage 5: Balance unclosed delimiters: close unclosed quotes, then close brackets `]` and braces `}` in reverse order of opening.
     7. Stage 6: Fallback regex extractor: if full JSON parsing still fails, extract recognized parameters (path, query, command, content, name) into a structured object.
   - Implement safeExtractJson<T>(text: string): T:
     - Uses repairJson on candidates. Throws with clear diagnostic explanation only if all repair stages fail.
2. Update packages/model/src/index.ts:
   - Update extractJson<T> to use safeExtractJson<T>.
   - Re-export repairJson and safeExtractJson.
3. In kaioken_v2/apps/cli/src/agent-host.ts:
   - Wrap tool argument deserialization so that malformed argument strings from open models are passed through repairJson before execution.
4. Add exhaustive unit tests in kaioken_v2/packages/model/test/repair.test.ts testing:
   - Trailing commas in objects and arrays.
   - Unquoted object keys.
   - Unclosed strings and braces due to truncation.
   - JavaScript/Python comments.
   - Single-quoted JSON structures.
   - Unescaped newlines inside string values.
   - Pass-through of already-valid JSON without mutation.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing:
  npm run typecheck
  npm test
  npx vitest run packages/model/test/repair.test.ts
Smoke check from repo root:
  node kaioken_v2/apps/cli/dist/bin.js scan --root .
Confirm working tree touches only packages/model/src/repair.ts, packages/model/src/index.ts, packages/model/test/repair.test.ts, and apps/cli/src/agent-host.ts.
</verification_loop>

<missing_context_gating>
Do not use heavy external dependencies. Implement the repair pipeline in pure TypeScript in packages/model/src/repair.ts.
</missing_context_gating>

<action_safety>
Scope strictly to packages/model/ and agent-host.ts tool parameter parsing. Do NOT run git add or git commit — the orchestrator commits after reviewing. Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with:
1. Summary of repair pipeline stages and handled malformed patterns.
2. Exact files created and modified.
3. Vitest test results with pasted counts across test cases.
4. Confirmation that valid JSON undergoes zero semantic change.
</structured_output_contract>
```
