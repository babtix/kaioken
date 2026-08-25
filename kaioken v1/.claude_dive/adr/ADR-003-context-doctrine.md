# ADR-003: Context management — prune → compact, under cache-stable layering

- **Status:** Accepted (L4) · **rewritten 2026-08-24 — two prior claims corrected**
- **Supersedes:** `archive/hermes_dive/adr/ADR-003`

## What changed in this revision, and why it matters

Two claims in the predecessor ADR did not survive a direct source read, and both distort the
roadmap if uncorrected:

1. **Step 5 claimed an "overflow replay handling backstop (existing)."** No such mechanism
   exists. [agent.go:159-163](../../cli/internal/agent/agent.go:159) states the opposite as
   the *design rationale* for doctrine 1 running where it does: *"Overflow is not recoverable
   in place: once the request fails, the history that failed to send is the only history
   there is... so the reduction has to happen while the failure is still hypothetical."*
   Doctrine 2's own rationale below ("acts while overflow is still hypothetical") is drawn
   from this same comment. The predecessor read the comment, borrowed its reasoning, and then
   asserted the thing the comment says does *not* exist as already built. Because it was
   marked "(existing)", no wave in the predecessor roadmap scheduled it — a real gap hidden
   by a false claim of completeness.
2. **Doctrine 3 was proposed as a new prompt-composition module.** [epoch.go](../../cli/internal/agent/epoch.go)
   already implements roughly 60–70% of it: `ContextEpoch` holds per-source sha256
   `Snapshots`, `Reconcile()` diffs current sources against the baseline, and
   `BuildMidConversationMessage()` emits a `<system_context_update>` instead of mutating the
   cached prefix — precisely the mechanism doctrine 3 asks for. `InitializeEpoch`
   ([context.go:88](../../cli/internal/agent/context.go:88)) is the wiring point. **It has
   zero callers and zero tests.** Three independent audits of this corpus found this file
   independently; none of the five documents that fed the predecessor ADR opened it.

## Context

L4 required all three context doctrines clarified individually, then composed. Full mechanism
analysis in `../ARCHITECTURE.md` §6.

## Decision

Composition order per turn:

1. **Prologue boundary:** apply queued structural changes (tool-list changes, skill
   installs); inject volatile reminders ONLY into the designated tail of a byte-stable
   layered system prompt. Memory enters prompts ONLY as a frozen session-start snapshot —
   code-level rule, not a convention. Rebuilt prefixes adopted only on literal byte-match.
   **Fix in scope here, not new machinery:**
   [reminders.go:95-103](../../cli/internal/agent/reminders.go:95) currently strips reminder
   blocks from *every* historical user message on each turn, rewriting bytes that
   `applyCacheBreakpoints` marked the previous turn
   ([anthropic.go:76-89](../../cli/internal/llm/anthropic.go:76)) — a real, measurable cache
   defect found in this corpus's verification pass, and a smaller, more precise fix than
   anything the predecessor ADRs proposed for this doctrine.
2. **Pre-call reduction, stage 1:** deterministic prune with tombstones — free, always on,
   acts while overflow is still hypothetical. **Already built and correctly scoped** —
   `internal/agent/prune.go`, driven from `manageContext`
   ([compact.go:288](../../cli/internal/agent/compact.go:288)). Nothing to do here.
3. **Pre-call reduction, stage 2:** threshold LLM compaction when still over — head/tail
   split at user-message boundaries, aux-model summary via fixed template with cumulative
   reconciliation (N6, opencode-derived), chained summaries never stacked (**already true** —
   [compact.go:378-380](../../cli/internal/agent/compact.go:378) folds a prior summary in
   rather than stacking a new one), user messages extracted from head and re-injected
   verbatim (#5 — genuinely open; [compact.go:323-363](../../cli/internal/agent/compact.go:323)
   still summarises every non-final user turn away).
4. **Send:** stable prefix + volatile tail.
5. **Wire the existing epoch module — do not rebuild it.** `agent/epoch.go` +
   `InitializeEpoch` become the doctrine-3 implementation. Task: call `InitializeEpoch` where
   the system prompt is first assembled, call `Reconcile` at the prologue boundary, and route
   its output through the existing `ContextUpdate`/`ModeSwitch` mechanism
   ([reminders.go:164-175](../../cli/internal/agent/reminders.go:164)), which already emits
   updates instead of mutating the prefix. Add the CI byte-equality test against the wired
   module, not a new one. This closes both the "flagship import" and step 5's real gap (an
   overflow backstop can now hook the same reconciliation point) in one task instead of two.
6. **Compaction split limitation, recorded not silently absorbed:** the user-boundary-only
   cut forces `cut == lastTurn` when the final turn alone exceeds the tail budget. Both
   Hermes and opencode solve this (pi cuts at assistant boundaries; opencode scans for the
   largest fitting suffix). v2 accepts the limitation for the default path; opencode's
   `splitTurn` refinement is an optional W4 item, not silently undiscovered debt.

Continuous micro-compaction evaluated and REJECTED for the default path: invalidates the
prompt cache every turn, adds 2–35 s aux latency per turn. Recorded nuance: Hermes'
background review forks DO inherit byte-exact prefixes and get cheaper for it — that pattern
carries into the reflection fork (`adr/ADR-004`). Revisit micro-compaction only for
months-long gateway conversations if they materialise.

**N9 — dynamic cache-control tag placement, citation corrected:** the predecessor cited
`agent/turn_context.py:42-48` for Hermes' cache-tag placement. That range is an import block;
`cache_plan` does not appear in that file. The real function is
`prompt_caching.py:385 build_prompt_cache_plan`. Substance largely ships already —
[anthropic.go:73](../../cli/internal/llm/anthropic.go:73) and `:86` already emit
`cache_control: {"type":"ephemeral"}` at the system prompt and the latest message. Remaining
work after the epoch module is wired: extend tagging to additional stable boundaries the
composition module creates (tool definitions), and add the equivalent for providers other
than Anthropic where their APIs support it.

## Consequences

- New prompt-composition module owns layer assembly — **the module is `epoch.go`, wired, not
  a new file.** CI test asserts stable-prefix byte-equality across turns.
- Compaction prompt tested against small aux models deliberately (opencode retuned theirs for
  DeepSeek-class mis-following).
- Token accounting extended to aux-model calls so reduction cost is visible — this is not
  optional polish: `Budget.Check` currently reads only the workspace client's spend, so aux
  spend on `routedClient("compact")` escapes the hard-stop guard entirely, not just the
  display.
