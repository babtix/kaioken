# ADR-003: Context management — prune → compact, under cache-stable layering

- **Status:** Accepted (D4)
- **Date:** 2026-08-22 · v1.1

## Context

D4 required that all three context doctrines be clarified individually and then
composed. Full analysis with mechanisms and rejection rationale:
`../kaioken-v2-architecture.md` §5.

## Decision

Composition order per turn:

1. **Prologue boundary:** apply queued structural changes (tool-list changes,
   skill installs); inject volatile reminders ONLY into the designated tail of
   a byte-stable layered system prompt. Memory enters prompts ONLY as a frozen
   session-start snapshot — this is a code-level rule in the composition module,
   not a convention (doc_final N1). Rebuilt prefixes adopted only on literal
   byte-match (Hermes' mechanical enforcement).
2. **Pre-call reduction, stage 1:** deterministic prune with tombstones — free,
   always on, acts while overflow is still hypothetical.
3. **Pre-call reduction, stage 2:** threshold LLM compaction when still over —
   head/tail split at user-message boundaries, aux-model summary via a FIXED
   TEMPLATE with cumulative reconciliation (doc_final N6, opencode-derived),
   chained summaries (never stacked), user messages extracted from head and
   re-injected verbatim (backlog #5).
4. **Send:** stable prefix + volatile tail.
5. **Backstop:** overflow replay handling (existing).

Continuous micro-compaction is evaluated and rejected for the default path:
it invalidates the prompt cache every turn (defeating step 1) and adds
2–35 s auxiliary latency per turn. Recorded nuance: Hermes' background review
forks DO inherit byte-exact prefixes and get cheaper for it — that specific
pattern carries into our reflection fork (ADR-004). Revisit micro-compaction
only for months-long gateway conversations if they materialise.

## Consequences

- New prompt-composition module owns layer assembly; CI test asserts
  stable-prefix byte-equality across turns.
- Compaction prompt tested against small aux models deliberately
  (opencode retuned theirs for DeepSeek-class mis-following).
- Token accounting extended to aux-model calls so reduction cost is visible.
