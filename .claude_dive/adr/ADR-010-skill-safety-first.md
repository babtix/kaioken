# ADR-010: Skill safety foundation precedes all authoring

- **Status:** Accepted (constraint from corpus; implements L3 ordering) · **rewritten
  2026-08-24 — Context corrected to match what actually ships today**
- **Supersedes:** `archive/hermes_dive/adr/ADR-010`

## What changed in this revision, and why it matters

The predecessor Context read: *"Kaioken generates skills today but never retires them, and
`skills.Parse` validates YAML and nothing else."* True as far as it goes, and it dramatically
understates the situation. Kaioken does not merely generate skill *candidates* — it **writes
them to disk unattended**, live, in three call paths, gated only by a config threshold that
one command (`/learn`) fully bypasses. See `../00-STOPGAP.md` for the finding and the
immediate fix, which must be in place before this ADR's ordering invariant means what it
says. Before the stopgap, "safety precedes autonomy" was true of the *plan* and false of the
*binary*.

## Context

Kaioken already writes model-generated skills to disk with no threat scan, no linter, no
ledger entry, and no rollback record — see `../00-STOPGAP.md`. `skills.Parse` validates YAML
frontmatter and nothing else. The corpus is unambiguous (`inspire-phases.md` phase 4):
enabling autonomous authoring before the safety foundation means the agent generates
unscanned, unreversible content. This ADR pins the ordering as a hard invariant, independent
of schedule pressure — and, as of this revision, independent of the fact that the thing it
gates is already live.

## Decision

The following ship BEFORE the stopgap's temporary gate is lifted and autonomous writing is
re-enabled by design:

1. **Multi-file skill directory contract** (#10) — the directory shape
   (`SKILL.md` + `references/ templates/ scripts/`) is defined here, but note
   `skills.Path` ([skills.go:75-77](../../cli/internal/skills/skills.go:75)) already returns
   `Dir(repo)/name/SKILL.md` — the per-skill *directory* already exists on master. What's
   missing is the sibling asset directories and their on-demand loading, not the directory
   contract itself. Scope the task as an extension, not a from-scratch build.
2. **Threat guard** (#12) — static scanning for credential exfiltration, prompt injection,
   destructive commands.
3. **Linter** — frontmatter and convention validation. Likely underestimated at 1 day if
   directory-contract validation from item 1 is meant to be covered seriously; size
   accordingly.
4. **Audit ledger** (#18) — append-only JSONL, actor provenance, sha256 content-addressed
   blobs, exact per-mutation rollback. Design the schema once, with `adr/ADR-005`'s
   layer-wide ledger extension in mind (Wave 3 folds wiki/memory/session mutations into the
   same ledger) — otherwise Wave 3 breaks Wave 2's format.
5. **Lifecycle pruner** (#15) — non-destructive active→stale→archived. Wires
   `reinforce.go:127` `PruneStale`, which already implements the query side with a
   never-hard-delete invariant and an `OriginHuman` exemption, with zero callers today.

Gate tests: a known-malicious skill fixture is REJECTED; a ledger rollback restores exact
prior content; **and** — new in this revision — a test asserting the stopgap's temporary gate
is still in effect for every call path into `Distill` until this wave's own gate replaces it,
so there is no window where removing the stopgap precedes this foundation actually landing.

## Consequences

- Roadmap Wave 2 is a hard prerequisite for Wave 3; branches must not merge out of order
  regardless of individual item readiness.
- The approval gate (`adr/ADR-004`) sits on top of this foundation; neither substitutes for
  the other.
- "No deletion path exists" needs a negative-test inventory — assert the absence of delete
  calls in the skills package, or a build-tag guard — cheap to specify now rather than
  discovered missing later.
