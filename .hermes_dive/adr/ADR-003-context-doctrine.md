# ADR-003: Context management — prune → compact, under cache-stable layering

- **Status:** Accepted (L4) · re-verified 2026-08-23
- **Supersedes:** `docs/hermes_res/adr/ADR-003`

## Context

L4 required all three context doctrines clarified individually, then composed.
Full mechanism analysis: `../README.md` §6.

## Decision

Composition order per turn:

1. **Prologue boundary:** apply queued structural changes (tool-list changes,
   skill installs); inject volatile reminders ONLY into the designated tail of
   a byte-stable layered system prompt. Memory enters prompts ONLY as a frozen
   session-start snapshot — code-level rule in the composition module (N1),
   not a convention. Rebuilt prefixes adopted only on literal byte-match
   (Hermes' mechanical enforcement).
2. **Pre-call reduction, stage 1:** deterministic prune with tombstones —
   free, always on, acts while overflow is still hypothetical.
3. **Pre-call reduction, stage 2:** threshold LLM compaction when still over —
   head/tail split at user-message boundaries, aux-model summary via FIXED
   TEMPLATE with cumulative reconciliation (N6, opencode-derived), chained
   summaries never stacked, user messages extracted from head and re-injected
   verbatim (#5).
4. **Send:** stable prefix + volatile tail.
5. **Backstop:** overflow replay handling (existing).

Continuous micro-compaction evaluated and REJECTED for the default path:
invalidates the prompt cache every turn, adds 2–35 s aux latency per turn.
Recorded nuance: Hermes' background review forks DO inherit byte-exact
prefixes and get cheaper for it — that pattern carries into our reflection
fork (ADR-004). Revisit micro-compaction only for months-long gateway
conversations if they materialise.

**NEW (N9) — dynamic cache-control tag placement:** after the composition
module exists, the transform layer adds provider-appropriate ephemeral
cache-control tags at stable boundaries (Hermes places these strategically —
system prompt, tool definitions, recent turns — `agent/turn_context.py:42-48`).
Tags must point at boundaries that only doctrine 3 creates, hence sequenced
after composition (W1 → WP).

## Consequences

- New prompt-composition module owns layer assembly; CI test asserts
  stable-prefix byte-equality across turns.
- Compaction prompt tested against small aux models deliberately (opencode
  retuned theirs for DeepSeek-class mis-following).
- Token accounting extended to aux-model calls so reduction cost is visible.
