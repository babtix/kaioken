# ADR-010: Skill safety foundation precedes all authoring

- **Status:** Accepted (constraint from corpus; implements D3 ordering)
- **Date:** 2026-08-22 · v1.1

## Context

Kaioken generates skills today but never retires them, and `skills.Parse`
validates YAML and nothing else. The corpus is unambiguous (`docs/inspire-phases.md`
phase 4): enabling autonomous authoring before the safety foundation means the
agent generates unscanned, unreversible content. This ADR pins the ordering as
a hard invariant, independent of schedule pressure.

## Decision

The following ship BEFORE any feature that lets the agent write or modify
skills (including the reflection fork's skill proposals):

1. **Multi-file skill directory contract** (#10) — defines what a skill may
   contain (`SKILL.md` + `references/ templates/ scripts/`).
2. **Threat guard** (#12) — static scanning for credential exfiltration,
   prompt injection, destructive commands.
3. **Linter** — frontmatter and convention validation.
4. **Audit ledger** (#18) — append-only JSONL, actor provenance, sha256
   content-addressed blobs, exact per-mutation rollback.
5. **Lifecycle pruner** (#15) — non-destructive active→stale→archived.

Gate tests: a known-malicious skill fixture is REJECTED; a ledger rollback
restores exact prior content.

## Consequences

- Roadmap Wave 2 is a hard prerequisite for Wave 3; branches must not merge
  out of order regardless of individual item readiness.
- The approval gate (ADR-004) sits on top of this foundation; neither
  substitutes for the other.
