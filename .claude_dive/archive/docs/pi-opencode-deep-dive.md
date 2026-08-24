# pi & opencode: a deep read, mapped to Kaioken

> Companion to [`opencode-map.md`](opencode-map.md) (what was ported) and
> [`../PI_KAIOKEN_ANALYSIS.md`](../PI_KAIOKEN_ANALYSIS.md) (the phased roadmap).
> Those two cover *architecture* and *plans*. This one covers **mechanism** —
> the constants, heuristics, and edge cases the other documents skip, gathered
> by reading the source rather than the structure.
>
> Sources read: `pi/packages/{agent,coding-agent,ai}/src`,
> `.reference/opencode/packages/{core,opencode}/src`. Every claim below cites a
> file. Line numbers are from the pinned checkouts (opencode `7534d23`) and will
> drift; the file paths will not.

---

## 0. The one-paragraph version of each

**opencode** is an Effect-TS service graph. Everything — tools, permissions,
sessions, LSP, providers — is a `Context.Service` wired through `LayerNode`.
Sessions are message+part trees persisted through a storage service; a "part"
is the atomic unit (text, tool call, file, compaction marker). The interesting
engineering is concentrated in three places: `provider/transform.ts` (1832
lines of per-provider quirk handling), `tool/edit.ts` (a 9-strategy fuzzy
replacer chain), and `session/compaction.ts` (chained summaries with turn
splitting).

**pi** is a plain-TypeScript harness with an explicit event bus. Its defining
choice is that **a session is an append-only tree** of `{id, parentId}` entries
in JSONL with a movable `leaf` pointer — branching is just moving the pointer,
history is never rewritten. Its second defining choice is **hybrid token
accounting**: anchor on the provider's reported usage, estimate only what came
after.

---

## 1. Token accounting — the single highest-value delta

### What they do

pi (`coding-agent/src/core/compaction/compaction.ts:146-230`):

```ts
calculateContextTokens(usage) =
  usage.totalTokens || usage.input + usage.output + usage.cacheRead + usage.cacheWrite

estimateContextTokens(messages):
  find last assistant message with valid usage   // skips aborted/error/all-zero
  tokens = thatUsage + Σ estimateTokens(messages after it)
```

opencode (`session/overflow.ts`) does the same thing from the other end:

```ts
count = tokens.total || input + output + cache.read + cache.write
usable = model.limit.input                       // when the provider publishes a
  ? model.limit.input - reserved                 // separate INPUT limit
  : context - maxOutputTokens(model)
isOverflow = count >= usable
```

### Details worth stealing

- **Cache tokens count toward the window.** Both include `cache.read` and
  `cache.write` in the total. Omit them and you under-count badly on Anthropic.
- **`model.limit.input` is not `model.limit.context`.** Some providers publish
  a separate input ceiling; opencode prefers it when present.
- **Skip usage from aborted/error turns** — it is partial and will under-report.
- **Images cost a flat estimate**: pi uses `ESTIMATED_IMAGE_CHARS = 4800`
  (`compaction.ts:244`).
- Defaults: pi `reserveTokens: 16384`, `keepRecentTokens: 20000`
  (`compaction.ts:132`). opencode `COMPACTION_BUFFER = 20_000`,
  tail budget `clamp(usable * 0.25, 2_000, 8_000)` (`compaction.ts:33-34, 80-85`).

### Kaioken delta

`agent/compact.go` `ShouldCompact` uses `llm.EstimateTokens(conv)` — a pure
character-count estimate — for the whole conversation, every turn. The provider
already tells us the true number in every response. **This is the most valuable
single change in this document**: adopt pi's hybrid. Kaioken's own comment in
`Usable()` admits the problem ("EstimateTokens counts characters, not tokens,
so it can run under the truth. A tenth of the window absorbs that error") — the
10% slack exists purely to paper over an estimate we don't need to make.

Kaioken's tail clamp (`minTailTokens = 2_000`, `maxTailTokens = 8_000`,
`keepRecentRatio = 0.25`) is already identical to opencode's. Good sign.

---

## 2. Compaction

### Chained summaries, not stacked ones

Both feed the **previous summary** into the next compaction rather than
re-summarizing raw history:

- opencode `session/compaction.ts:62-78, 334-348`: `completedCompactions()`
  finds prior summary messages, their indices go into a `hidden` set that is
  excluded from the next compaction's input, and `previousSummary` is passed to
  `buildPrompt()`.
- pi `compaction.ts:500-537`: a separate `UPDATE_SUMMARIZATION_PROMPT` that
  takes `<previous-summary>` plus only the new messages, with explicit rules —
  *PRESERVE all existing information*, *move items from "In Progress" to "Done"*,
  *UPDATE "Next Steps"*.

Kaioken re-summarizes from the conversation each time and keeps the old summary
message in history. Adopting the update-prompt shape would make repeated
compactions accumulate knowledge instead of eroding it.

pi's two prompts are worth reading verbatim (`compaction.ts:467-537`) — the
section structure is nearly identical to Kaioken's `CompactSystem`, which
suggests convergent design, but the *update* variant has no Kaioken equivalent.

### Cut points: they can split a turn, Kaioken cannot

Kaioken's `splitForCompaction` only cuts on `user` messages. Both references go
finer:

- pi (`compaction.ts:308-461`): valid cut points are user **or assistant**
  messages — never `toolResult`. Cutting at an assistant with tool calls is safe
  because its results follow it and are kept. It also records `isSplitTurn` and
  `turnStartIndex` so the summary can note the turn was cut mid-way.
- opencode (`compaction.ts:105-128` `splitTurn`): when the newest turn alone
  blows the tail budget, it scans forward *within* that turn for the largest
  suffix that fits, instead of dropping the whole turn.

Consequence for Kaioken: a single huge final turn currently forces
`cut == lastTurn` and the tail budget is ignored entirely.

### Prune: tombstones, not mutation

opencode marks a pruned tool part with `state.time.compacted = Date.now()`
rather than overwriting its content (`compaction.ts:279-283`). Idempotent, the
UI can still show what was there, and the next prune pass stops when it hits one
(`break loop`). Kaioken overwrites `Content` with `prunedStub` — a
one-way operation that loses the original.

opencode also **protects `skill` tool outputs from pruning**
(`PRUNE_PROTECTED_TOOLS = ["skill"]`) — a loaded skill is standing instruction,
not a stale file read. Kaioken has skills; they are not protected.

Shared constants (Kaioken already matches): `PRUNE_MINIMUM = 20_000`,
`PRUNE_PROTECT = 40_000`, protect the last 2 turns.

### Auto-continue after compaction

opencode injects a synthetic user message after an automatic compaction
(`compaction.ts:481-485`):

> "Continue if you have next steps, or stop and ask for clarification if you are
> unsure how to proceed."

So the agent resumes work rather than handing control back. Kaioken compacts and
returns to the user.

### Overflow replay

The subtle one (`compaction.ts:310-326, 424-449`). When compaction is triggered
*by an overflow error* rather than proactively, opencode finds the last real
user message, compacts everything **before** it, then **replays that user
message** — so the request that blew the window still gets answered. Media parts
are swapped for `[Attached image/png: file]` placeholders on replay.

`ContextOverflowError` is explicitly **never retried** (`session/retry.ts:70`).

---

## 3. Tool output bounding

`session/tool/truncate.ts` (opencode) and `core/tools/truncate.ts` (pi) are the
same algorithm — the one Kaioken now uses after the byte-cap fix:

```
accumulate whole lines from head or tail
  size = byteLength(line) + (1 if not first)
  stop when lines > maxLines OR bytes + size > maxBytes
```

Details Kaioken has adopted or should:

| Detail | opencode | pi | Kaioken |
|---|---|---|---|
| Limits | 2000 lines / 50 KB | 2000 / 50 KB | 1500 / 64 KB |
| Direction | `head` \| `tail` | `truncateHead` / `truncateTail` | ✅ per-tool |
| Single over-long line | — | cut on UTF-8 boundary from end | ✅ |
| Spill full output to disk | ✅ `TRUNCATION_DIR` | ✅ `fullOutputPath` | ✅ |
| Retention sweep | 7 days, hourly, background | — | 7 days, on write |
| Grep line cap | — | `GREP_MAX_LINE_LENGTH = 500` | ❌ |

**The hint text is doing real work.** opencode varies it by whether the agent
*has* a task tool:

> "Full output saved to: {file}\nUse the Task tool to have explore agent process
> this file with Grep and Read (with offset/limit). Do NOT read the full file
> yourself - delegate to save context."

versus, without task: "Use Grep to search the full content or Read with
offset/limit to view specific sections." Kaioken's hint names `read_file` and
`search` but does not know about `task` — an easy improvement since Kaioken has
delegation.

pi additionally caps **each grep match line at 500 chars** with a `... [truncated]`
suffix. Kaioken's `search` emits whole matched lines — one minified-JS hit can
still be enormous even under the byte cap.

---

## 4. Edit matching — opencode's replacer chain

`packages/opencode/src/tool/edit.ts:695-703`. Nine strategies, tried in order,
each a generator yielding candidate spans:

1. **SimpleReplacer** — exact `indexOf`.
2. **LineTrimmedReplacer** — compare line-by-line with both sides `.trim()`ed.
   Fixes trailing-whitespace and indentation drift.
3. **BlockAnchorReplacer** — for blocks ≥3 lines. Anchor on first and last line
   (trimmed); accept candidates whose block size differs by
   `≤ max(1, floor(size * 0.25))`; score the *middle* lines by Levenshtein
   similarity; require `≥ 0.65`. This is the one that rescues "the model
   reproduced the function but got a middle line slightly wrong".
4. **WhitespaceNormalizedReplacer** — collapse all `\s+` to one space; also
   builds a `\s+`-joined regex from the search words for substring hits.
5. **IndentationFlexibleReplacer** — strip the common minimum indent from both
   sides before comparing.
6. **EscapeNormalizedReplacer** — normalize escape sequences.
7. **TrimmedBoundaryReplacer**
8. **ContextAwareReplacer**
9. **MultiOccurrenceReplacer** — only when `replaceAll` is set.

And the guard that makes the fuzzy chain safe
(`edit.ts:731`):

```ts
isDisproportionateMatch(search, oldString):
  searchLines >= max(oldLines + 3, oldLines * 2)              → reject
  oldLines === 1                                              → accept
  search.trim().length > max(old.trim().length + 500, old*4)  → reject
```

with the model-facing error: *"Refusing replacement because the matched span is
much larger than oldString. Re-read the file and provide the full exact
oldString for the intended replacement."*

### Kaioken delta

`agent/editmatch.go` has exact → NFKC/quote/dash/space-normalized → (new)
line-number-stripped. That covers replacer 1, parts of 4, and a case opencode
handles only in the prompt. **Missing and worth adding, in value order:**

1. **LineTrimmedReplacer** — cheapest, highest hit rate. Kaioken already trims
   trailing whitespace per line inside `normalizeForFuzzyMatch`, but does not
   trim *leading* whitespace, so indentation drift still misses.
2. **BlockAnchorReplacer** — the big one for multi-line edits. Needs a
   Levenshtein helper (~30 lines).
3. **IndentationFlexibleReplacer** — common-indent stripping; trivial.
4. **`isDisproportionateMatch`** — a *safety* addition, not a matching one. As
   Kaioken adds looser strategies it needs this guard, and it should land in the
   same change as strategy 2.

Note the interaction with Kaioken's `applyPreservingUnchangedLines`: it requires
the normalized view to have the same line count as the original. Line-trimmed
and indentation-flexible matching preserve line counts, so they compose. Block
anchor does too. Whitespace-collapsing (replacer 4) does **not** — it would need
the span-based path instead.

---

## 5. File mutation safety

opencode V2 (`core/src/tool/edit.ts:110-119`) raises
`FileMutation.StaleContentError` →

> **"File changed after permission approval. Read it again before editing."**

pi (`core/tools/file-mutation-queue.ts`) serializes mutations per file through a
promise queue **keyed on `realpath`** — so two paths that are the same file
through a symlink share one queue.

Kaioken now does both (per-path `sync.Map` lock + `verifyUnchanged` after the
approval gate). Two refinements from the references:

- **Key the lock on the resolved real path**, as pi does. Kaioken keys on the
  pre-symlink absolute path, so `a/link/f.txt` and `real/f.txt` take different
  locks. Kaioken already computes the real path inside `resolve()` — it just
  isn't the value returned.
- Neither reference actually enforces read-before-edit in code. opencode's
  `edit.txt` *claims* it does ("This tool will error if you attempt an edit
  without reading the file") but no such check exists anywhere in the tree —
  verified by grep. Treat it as a prompt-level nudge, not a mechanism.

---

## 6. Undo — opencode snapshots the whole tree, Kaioken tracks single files

`packages/opencode/src/snapshot/` runs a **shadow git repository**: a separate
`--git-dir` with `--work-tree` pointed at the real tree. It commits tree state
around tool execution, and `session/revert.ts` restores by applying patches.

Setup details (`snapshot.ts:325-333`) — all of them earned:

```
git init                       (into the shadow gitdir)
core.autocrlf   false          # never rewrite line endings in snapshots
core.longpaths  true           # Windows
core.symlinks   true
core.fsmonitor  false          # don't fight the user's fsmonitor
feature.manyFiles true
```

It also reuses the real repo's `--git-common-dir` object store so that snapshotting
a chromium-sized checkout doesn't rebuild every hash.

`revert` / `unrevert` are symmetric, and reverting is blocked while the session
is busy (`state.assertNotBusy`).

### Kaioken delta

`UndoEntry` captures one file's previous content per `write_file`/`edit_file`.
**Anything `run_command` changes is invisible to `/undo`** — a codemod, a
formatter, `npm install`, a generator. That is the real gap, and a
git-snapshot approach closes it without tracking individual writes at all.
Kaioken already has `internal/gitx`.

---

## 7. Command approval — `BashArity`

`packages/opencode/src/permission/arity.ts`. A curated dictionary mapping a
command prefix to **how many tokens make up the human-meaningful command**,
flags excluded:

```
cat: 1     git: 2            npm: 2        "npm run": 3
ls: 1      docker: 2         "docker compose": 3
rm: 1      cargo: 2          "cargo add": 3
aws: 3     "bun run": 3      "deno task": 3
```

`prefix(tokens)` walks from the longest prefix down, returns the first match's
arity worth of tokens, defaulting to `tokens.slice(0, 1)`.

So approving `npm run dev` stores an approval for exactly `npm run dev` — not
for all of `npm`, and not only for that literal invocation with those flags.
The dictionary's generation prompt is committed in a comment above it, which is
a nice reproducibility touch.

Permission evaluation itself (`permission/index.ts:29-38`) is wildcard rules
with **last match wins**, defaulting to `ask`:

```ts
rulesets.flat().findLast(r =>
  Wildcard.match(permission, r.permission) && Wildcard.match(pattern, r.pattern)
) ?? { action: "ask", permission, pattern: "*" }
```

### Kaioken delta

Kaioken's approval is binary and per-invocation: `Approve()` or global
`AutoApprove`. There is no "always allow this command", no per-pattern rule, no
persistence of a decision. `BashArity` + a wildcard ruleset in
`.kaioken/config.yaml` would be a large usability win and is self-contained.

---

## 8. Provider quirks — `transform.ts` is a bug catalogue

`packages/opencode/src/provider/transform.ts`, 1832 lines. Kaioken supports 20+
providers through one OpenAI-compatible path plus an Anthropic path; every entry
here is a failure Kaioken can hit.

**Message-shape fixes**

- **Anthropic and Bedrock reject empty content.** Drop empty-string messages and
  filter empty `text` parts; keep empty `reasoning` parts only when they carry a
  `signature` or `redactedData` (lines 166-221).
- **Mistral: tool-call IDs must be exactly 9 alphanumeric chars.** Strip
  non-alphanumerics, take 9, right-pad with `0` (257-262).
- **Claude: tool-call IDs must match `[a-zA-Z0-9_-]`** — scrub the rest to `_`
  (223-250).
- **Mistral: a `tool` message may not be followed by a `user` message.** Inject
  a synthetic `assistant: "Done."` between them (286-297). *This is exactly the
  orphan-adjacency class of bug Kaioken hit with cancellation.*
- **DeepSeek requires every assistant message to carry `reasoning`** — append an
  empty reasoning part when absent, and always send the field back even when
  empty (302-340).
- **`sanitizeSurrogates`** (line 25) — strip lone UTF-16 surrogates before
  serialization. Go is UTF-8 so Kaioken is mostly immune, but invalid UTF-8 from
  a tool result becomes `U+FFFD` soup in `json.Marshal`; the same defence
  applies.
- Empty base64 image data is checked and dropped (line 415).

**JSON-Schema fixes** (`schema()`, line 1489)

- **OpenAI/Azure**: a full "compatibility lowering" pass (`sanitizeOpenAISchema`,
  1406). Boolean-form schemas (`true`/`false`) become `{type:"string"}`; `const`
  becomes a one-element `enum`; unknown keywords are dropped; and when `type` is
  missing it is **inferred** from the keywords present (`properties`→object,
  `items`→array, `enum`/`format`→string, `minimum`/`maximum`→number). Objects
  without `properties` get `{}`, arrays without `items` get `{type:"string"}`.
- **Moonshot/Kimi**: `$ref` may not have sibling keywords — reduce such a node to
  `{$ref}` alone. Tuple-form `items` arrays are unsupported — take `items[0]`.
- **Google/Gemini**: integer enums must be converted to string enums.

**Sampling and reasoning**

- Per-model `temperature` / `topP` / `topK` (519-560).
- `maxOutputTokens = min(model.limit.output, OUTPUT_TOKEN_MAX=32_000) || 32_000`.
- Reasoning-effort tiers are **date-gated**: OpenAI models released before the
  rollout date of `none` (and separately `xhigh`) return 400 for those values,
  so opencode only advertises a tier to models new enough to accept it
  (567-640). A regex family-matcher handles `gpt-5`, `gpt-5-nano`, `gpt-5.4`,
  `openai/gpt-5.4-codex` while excluding `gpt-50` and `gpt-5o`.

### Kaioken delta

`internal/llm/` has a provider registry and retry logic, but no per-provider
*message/schema* transform layer. The Mistral tool-id rule and the
tool→user adjacency rule in particular will produce opaque 400s that look like
Kaioken bugs. A small `llm/transform.go` applying these by provider/model
substring would pay for itself the first time someone uses Mistral or DeepSeek.

---

## 9. Retry

`session/retry.ts` — worth comparing against `internal/llm/retry.go`:

- `retry-after-ms` (float, milliseconds) is checked **before** `retry-after`.
- `retry-after` is parsed as seconds *and*, failing that, as an **HTTP date**.
- **All 5xx are retryable even when the SDK says otherwise**:
  `if (!error.data.isRetryable && !(status >= 500)) return undefined`.
- Backoff `2000ms * 2^(attempt-1)`, capped at **30 s when no headers were
  present**, uncapped (well, `2^31-1`) when the server did send headers — i.e.
  trust an explicit long `retry-after`.
- Plain-text fallbacks: match `"rate increased too quickly"`, `"rate limit"`,
  `"too many requests"` in the message body; then JSON shapes
  (`error.type === "too_many_requests"`, codes containing `exhausted` /
  `unavailable` / `rate_limit`).
- Context overflow is never retried.

---

## 10. Instructions and prompts

### Nested `AGENTS.md`, loaded lazily on read

`session/instruction.ts:179-221`. This is the feature Kaioken most visibly
lacks. When the `read` tool opens a file, opencode walks **up** from that file
to the project root, and for each intermediate directory containing an
`AGENTS.md`/`CLAUDE.md`/`CONTEXT.md` that has not already been attached, appends
its contents to the tool result as:

```
<system-reminder>
Instructions from: /repo/packages/api/AGENTS.md
...
</system-reminder>
```

Deduped three ways: against files already in the system prompt (`systemPaths`),
against files already loaded in this conversation (`extract()` scans prior read
tool parts for `metadata.loaded`), and per-assistant-message via a `claims` map.

Kaioken reads exactly one `AGENTS.md` at the repo root, at prompt-build time
(`agent/context.go` `renderProjectInstructions`). In a monorepo, per-package
conventions never reach the model.

Also supported: `config.instructions` accepting globs **and `http(s)` URLs**
(fetched with a 5 s timeout, 4-way concurrency).

### Per-model system prompts

`session/system.ts:27-42` picks a whole prompt file by model-id substring:
`anthropic.txt`, `gpt.txt`, `beast.txt` (gpt-4/o1/o3), `codex.txt`, `gemini.txt`,
`kimi.txt`, `meta.txt`, `trinity.txt`, `default.txt`. Kaioken's `prompts.go`
appends per-family *guidance* to one shared prompt — a deliberate and probably
better-factored choice, already noted in `opencode-map.md`.

The environment block is worth copying verbatim in shape
(`system.ts:65-76`) — model id, cwd, worktree root, is-git-repo, platform,
today's date, in an `<env>` block. Kaioken's identity section names the root but
not the platform, git status, or date.

### Skills in the prompt

`system.ts:98-110` carries an explicit finding worth recording:

> "the agents seem to ingest the information about skills a bit better if we
> present a more verbose version of them here and a less verbose version in tool
> description, rather than vice versa."

Kaioken independently arrived at the same split: skills are listed with their
full descriptions in the prompt's knowledge catalog (`knowledge.go:37-63`, via
`renderKnowledge`) while `read_knowledge`'s tool description stays a single
sentence. No change needed — but the reasoning is now on record rather than
accidental.

Kaioken is ahead in one respect here: its catalog **ranks skills by `UseCount`
then name** so that when the catalog is trimmed to `catalogMaxEntries`, skills
the agent actually uses survive instead of whatever sorts first. opencode lists
skills unranked. Extension-contributed skills sort after the repo's own, with the
extension id in the label so provenance is visible in the prompt — also a nicety
opencode lacks.

The structural difference: opencode has a dedicated `skill` tool that injects a
skill's instructions on demand, and protects those outputs from pruning
(§2). Kaioken loads skills through `read_knowledge` like any other doc, so a
loaded skill is prunable — see §2's `PRUNE_PROTECTED_TOOLS` note.

---

## 11. Session model — pi's tree

`coding-agent/src/core/session-manager.ts:844-854`:

> Each session entry has an id and parentId forming a tree structure. The "leaf"
> pointer tracks the current position. Appending creates a child of the current
> leaf. Branching moves the leaf to an earlier entry, allowing new branches
> without modifying history.

Entry types are first-class rows in the JSONL, not just messages
(`agent/src/harness/types.ts:383-449`):

```
message | compaction | branch_summary | custom | custom_message
label | leaf | session_info | thinking_level_change | model_change
active_tools_change
```

So `leaf` moves and `label` assignments are *events*, replayed on load to
rebuild `labelsById` and the current position. `buildSessionContext()` resolves
root→leaf, expanding compaction and branch summaries along the way.

Branch summarization (`compaction/branch-summarization.ts`) summarizes an
*abandoned* branch so switching away doesn't lose what was learned there.

### Kaioken delta — mostly closed already

`PI_KAIOKEN_ANALYSIS.md` lists session branching as an open Phase 3. **That is
stale.** Reading `internal/session/` shows the design is already ported:

- `session.go` — `Entries []Entry` + `Leaf string` + `ParentID`/`ForkedAt` lineage.
- `tree.go` — `pathTo()` walks root→leaf, `Leaves()` enumerates branch tips,
  `Messages` is maintained as the root→leaf path.
- `fork.go` — `ForkAt`, `CutAfterTurn`, `Import`, and a `SafeCut` that clamps a
  fork boundary to a position a provider will accept (never between an assistant's
  tool calls and their results — the same invariant class as the cancellation bug).
- `internal/tui/tree.go` — `/tree` plus branch summarization of abandoned branches.

Three real differences remain, and only the first is clearly worth acting on:

1. **Kaioken writes one entry type.** `tree.go:47` — *"entryTypeMessage is the
   only entry type currently written."* Model switches, mode switches, and
   thinking-level changes live as scalar fields in the file header, so only the
   latest value survives; pi records each as an entry and can replay when a
   setting changed and what the model saw at that point. Epochs are similarly a
   header array rather than tree nodes, which is why an epoch cannot be attributed
   to a branch.
2. **Kaioken rewrites the whole file per save** (`SaveForce` → `os.WriteFile`);
   pi appends. Append-only is crash-safer — a torn write costs the tail, not the
   session — and cheaper on long sessions. The header-line design already
   separates mutable state from entries, so switching the entry writes to an
   append and rewriting only on header change is a contained change.
3. No `label` entries, so branches are identified positionally rather than named.

---

## 12. Event/hook taxonomy

pi's full set (`agent/src/harness/types.ts:562-710`):

```
before_agent_start   context                before_provider_request
before_provider_payload                     after_provider_response
tool_call            tool_result
session_before_compact   session_compact
session_before_tree      session_tree
retry_scheduled      retry_attempt_start    retry_finished
model_update         thinking_level_update  tools_update
resources_update     queue_update           save_point
abort                settled
```

Kaioken's `agent/events` already covers agent/turn/message/tool/compaction plus
`before_provider_request`. **Not yet present and genuinely useful:**

- `before_provider_payload` — fires *after* transforms, immediately before the
  wire. The right place for a redaction or logging hook; `before_provider_request`
  is too early because transforms have not run.
- `after_provider_response` — raw response before parsing.
- `retry_scheduled` / `retry_attempt_start` / `retry_finished` — Kaioken retries
  at transport level with no observability.
- `save_point` / `settled` — natural persistence and quiescence signals.

---

## 13. LSP diagnostics after edits

`packages/opencode/src/tool/edit.ts:195-205` and `write.ts:76-95`. After an edit
succeeds, opencode touches the file in the LSP, pulls diagnostics, and appends:

```
LSP errors detected in this file, please fix:
<diagnostics file="/path/x.ts">
ERROR [12:5] Type 'string' is not assignable to type 'number'.
</diagnostics>
```

Format (`lsp/diagnostic.ts`): **errors only** (`severity === 1`), capped at
`MAX_PER_FILE = 20`, `SEVERITY [line:col] message`.

### Kaioken delta

Nothing equivalent. The model learns it broke the build only when it next
chooses to run tests. A full LSP client is a large project, but the *shape* —
"append a bounded, machine-readable error block to the edit result" — is
reusable with a cheaper backend: a debounced `go build ./...` / `tsc --noEmit`
per language, or reusing whatever `internal/review` already knows. Even a
best-effort version changes the agent's error-correction loop materially.

---

## 14. Smaller things worth having

- **`question` tool** (`tool/question.txt`) — the agent can ask the user a
  multiple-choice question mid-turn. Notable prompt rules: a "Type your own
  answer" option is added automatically so the model must *not* invent an
  "Other"; recommended options go first and are labelled "(Recommended)".
  Kaioken has no way for the agent to ask a structured question — only prose.
- **`todowrite` prompt** (`tool/todowrite.txt`). Kaioken's `todo` already
  enforces the important structural rule — exactly one `in_progress`, checked in
  code (`todo.go:102`), not merely asked for. Three things opencode's prompt adds
  that Kaioken's does not say: mark `completed` only after the work is *verified*,
  "never based on intent"; a blocked item stays `in_progress` with a follow-up
  todo naming the blocker; and "preserve user-provided commands verbatim (flags,
  args, order)". It also has a fourth state, `cancelled`, for work that stopped
  being needed — Kaioken's enum is `pending|in_progress|completed`, so the model
  has to either lie (`completed`) or leave it dangling.
- **Tool descriptions cross-reference each other.** `glob.txt` and `grep.txt`
  both end with "when you are doing an open-ended search that may require
  multiple rounds of globbing and grepping, use the Task tool instead", and
  `glob.txt` explicitly encourages speculative parallel batching. Kaioken's
  `task` description sells itself but the read/search descriptions do not point
  at it.
- **`grep.txt` steers away from a footgun**: "If you need to identify/count the
  number of matches within files, use the Bash tool with `rg` directly. Do NOT
  use `grep`."
- **`read.txt` / read tool** — `MAX_LINE_LENGTH = 2000` per line with a
  `... (line truncated to 2000 chars)` suffix, on top of the byte cap. Kaioken
  caps total bytes but not per-line.
- **Binary detection** (`tool/read.ts`) — extension allowlist first (`.zip`,
  `.exe`, `.pyc`, …), then NUL byte, then >30% non-printable in the first 4 KB.
  Kaioken now implements the byte heuristic; the extension fast-path is free.
- **Read on a directory** returns a listing rather than an error, with
  offset/limit paging over entries.
- **"Did you mean?" on a missed read** (`tool/read.ts` `miss()`) — on
  file-not-found it lists up to 3 siblings whose names case-insensitively
  contain, or are contained by, the requested basename. Cheap, and it converts a
  dead turn into a recovery.
- **pi's macOS path repair** (`core/tools/path-utils.ts`) — retries a failed
  path with NFD normalization, curly-apostrophe substitution, and the narrow
  no-break space before AM/PM that macOS screenshots use. Very macOS-specific;
  the *pattern* (try normalized variants before failing) is what generalizes.

---

## 15. Ranked recommendations for Kaioken

Ordered by (value × confidence) ÷ effort.

| # | Change | Where | Why it's first |
|---|---|---|---|
| 1 | **Hybrid token accounting** — anchor on provider-reported usage, estimate only the tail | `agent/compact.go`, `llm/` | Replaces a guess with the truth on the single number that governs compaction. ~60 lines. |
| 2 | **`isDisproportionateMatch` + LineTrimmed/IndentationFlexible replacers** | `agent/editmatch.go` | Directly raises edit success rate; the guard keeps it safe. Composes with the existing line-overlay path. |
| 3 | **Nested `AGENTS.md` on read** | `agent/tools.go`, `agent/context.go` | Monorepo conventions currently never reach the model. Self-contained. |
| 4 | **Command-prefix approvals (`BashArity`) + wildcard permission rules** | new `agent/permission.go`, config | Biggest daily-friction win. Today it's approve-every-time or approve-everything. |
| 5 | **Provider transform layer** | new `llm/transform.go` | Mistral tool-id and tool→user adjacency will look like Kaioken bugs. Cheap per-rule. |
| 6 | **Git-snapshot undo** | `agent/`, `internal/gitx` | Closes the `run_command` hole in `/undo`, which no per-file tracking can. |
| 7 | **Compaction: chained summaries + turn splitting + prune tombstones** | `agent/compact.go`, `prune.go` | Repeated compactions currently erode rather than accumulate. |
| 8 | **Diagnostics block after edits** | `agent/tools.go` | Highest ceiling of anything here, highest effort. Start with one language. |
| 9 | Retry parity: `retry-after-ms`, HTTP-date, 5xx-always | `llm/retry.go` | Small, verifiable. |
| 10 | Read polish: per-line cap, extension fast-path, "did you mean", directory listing | `agent/tools.go` | An afternoon, all of it. |

**Deliberately not recommended:** opencode's Effect service graph, its
part-based message model, per-model prompt *files*, and the 30+ provider ports —
all noted as de-scoped in `PI_KAIOKEN_ANALYSIS.md` §1.3 and nothing read here
changes that. pi's `output-guard.ts` (stdout takeover) is Node-specific and has
no Go analogue.

**Corrections to `PI_KAIOKEN_ANALYSIS.md` this read turned up.** Its §1.2 gap
table is out of date in five of twelve rows — the work shipped after that
document was written, so anyone planning from it will re-implement what exists:

| Gap | Claimed | Actually |
|---|---|---|
| 1 Event/hook bus | "Direct calls + tea.Msg only; nothing interceptable" | `agent/events` — `Bus.Subscribe/SubscribeAll/HasHandlers/Emit`, `Event.Block` |
| 2 Session branching | "Linear sessions only" | tree + leaf + `ForkAt`/`Import`/`SafeCut` + `/tree` (§11) |
| 3 Parallel tools | "Strictly sequential" | `tool_executor.go` batches consecutive read-only calls |
| 4 Streaming tool updates | "Complete result only" | `run_command` streams via `liveWriter` → `ToolExecutionUpdate` |
| 5 Before/after tool hooks | "None" | `applyCallHook` (veto + arg rewrite), `filterResult` (result rewrite) |
| 12 Branch summarization | "n/a (no branches yet)" | `internal/tui/tree.go` |

Still genuinely open from that table: thinking levels (#6), extension
hooks/commands (#7), prompt templates (#8), themes (#9), model cycling (#10),
agent-level retry (#11). Plus the four missing event types in §12 above.

---

*Read and written 2026-08-01 against opencode `7534d23` and the vendored pi
checkout. Claims are from source; where a reference's own comment states the
rationale, it is quoted rather than paraphrased.*
