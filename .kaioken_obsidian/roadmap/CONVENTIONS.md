# Roadmap conventions

How these files are structured, and how to run one. Read this before writing a new leaf file or
starting a session against an existing one.

## The premise: this project is fully vibe coded

Every leaf file in this tree is written to be handed to a coding agent as a **single session**. That
constraint drives the whole format:

| Because the implementer is an agent… | …the file must |
|---|---|
| It has no memory of any prior conversation | Restate every load-bearing fact inline. Never say "as discussed" |
| It cannot ask a clarifying question mid-run | Resolve ambiguity up front, or list it under **Open questions** and mark the file `blocked` |
| It will confidently invent a plausible answer if a fact is missing | Cite real paths, real commands, real line numbers — and say explicitly when something is unverified |
| It drifts into adjacent refactors when the scope is fuzzy | Carry an explicit **Out of scope** list, not just an in-scope one |
| Its self-report is not evidence | Name the exact gate commands, and require pasted counts |
| Review capacity is the real bottleneck (see README §10 rule 1) | Stay small enough that one human can review the diff in one sitting |

The rule that follows from all of it: **a leaf file that cannot be executed without asking a question
is not finished.** Fix the file, then run it.

## Tree layout

```
roadmap/
  README.md              # master index — milestone table, verdicts, gaps, non-goals
  CONVENTIONS.md         # this file
  m01-…/ … m12-…/        # one folder per milestone
    README.md            # milestone brief: goal, done-when, ordered leaf list, dependency graph
    NN-<slug>.md         # one leaf = one sub-deliverable = one vibe-coding session
  studio-v0.1/           # the Theia build (supersedes M3 + M10)
  cross-cutting/         # architectural enablers that span milestones
  gaps/                  # G-1…G-6, the documented-but-unscheduled gaps
  decisions/             # license, version base, one-fork question — decisions, not builds
```

Leaf files are numbered in **execution order** within their folder. A leaf that must run before
another gets the lower number.

## Leaf file contract

Every leaf file has these sections, in this order. Sections are not optional; write "None." rather
than dropping one, so a missing section always means the file is unfinished.

| Section | Contains |
|---|---|
| `# <ID> · <Title>` | ID is `<folder>-<NN>`, e.g. `M1-01`. Title is an imperative phrase |
| Blockquote one-liner | The whole job in one sentence a human can scan |
| **Status table** | Status · Size · Depends on · Blocks · Touches · Risk · Gate-critical |
| `## Why this exists` | The reason, tied back to a README section or an operating rule. Two to four sentences |
| `## Current state` | **Verified facts only**, with `path:line` citations. Mark anything unverified as `UNVERIFIED:` |
| `## What done looks like` | A checklist of observable outcomes. Each item must be checkable by running something, not by opinion |
| `## Steps` | Numbered, ordered, each one a concrete action. Include the commands |
| `## In scope` / `## Out of scope` | Explicit file and directory lists. Out of scope is the drift guard |
| `## Gates` | The literal commands, copy-pasteable, that must pass before the session ends |
| `## Traps` | Known ways this specific task goes wrong. Draw from README §10 and the build gotchas |
| `## Open questions` | Anything unresolved. A non-empty list here means Status is `blocked` |
| `## Session brief` | A fenced XML block, ready to paste into an agent. See below |

## Status vocabulary

| Value | Meaning |
|---|---|
| `ready` | Fully specified. An agent can start it now with no questions |
| `blocked` | Open questions must be answered by a human first. Says which |
| `in-progress` | A session is live against it |
| `done` | Gates passed, diff reviewed, committed. Record the commit SHA |
| `superseded` | The rewrite or another milestone absorbed it. Says what replaced it, and why |

## Size vocabulary

Sized in **review effort**, not agent effort — see README §10 rule 1.

| Value | Meaning |
|---|---|
| `S` | Under an hour to review. Single file or a mechanical change |
| `M` | A half-day session. One package, a handful of files |
| `L` | Needs splitting or a written plan first. **Prefer splitting** — an `L` leaf is usually two `M` leaves that were not separated |

## The session brief block

The last section of every leaf is a ready-to-paste prompt. It uses the four-block skeleton that
works reliably across agents:

```xml
<task>
The concrete job and where it lives. Current state, what to change, and explicitly what to leave
untouched.
</task>

<verification_loop>
Run these from kaioken_v2/ before finishing and fix what they surface — do not just report it:
  npm test
  npm run typecheck
Confirm the working tree shows only the intended changes afterward.
</verification_loop>

<action_safety>
Scope strictly to this task. No unrelated refactors, renames, or cleanup unless required for
correctness. Do NOT run git add or git commit — the orchestrator commits after reviewing.
Leave the work uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) what changed and why, (2) files touched, (3) gate outcomes with pasted counts,
(4) anything you deviated on, left open, or want a decision on.
</structured_output_contract>
```

Add `<completeness_contract>` for open-ended debugging (resolve fully, do not stop at the first
plausible fix) and `<missing_context_gating>` for tasks where a missing repo fact would be invented
(find it or state it is unknown — never guess).

## The real gates

Copy these verbatim into `<verification_loop>`. Do not write "run the tests."

All commands run from `kaioken_v2/`. Node `>=22` is required (`engines` in `kaioken_v2/package.json`).
The workspace globs are `packages/*` and `apps/*`.

| Gate | Command | Notes |
|---|---|---|
| Engine tests | `npm test` | Runs `npm run build && vitest run` — the build is not separate. **Phase 1 is deterministic and offline by design**: a test needing a network call or an API key is wrong by design, not by oversight |
| Typecheck | `npm run typecheck` | Is `tsc --build --force` |
| Build only | `npm run build` | `tsc --build` plus `node packages/index/scripts/copy-queries.mjs` — the tree-sitter `.scm` query files must be copied or `packages/index` fails at runtime |
| Smoke | `node apps/cli/dist/bin.js scan --root .` | Deterministic, offline, needs no credentials |

> **`--force` matters.** The root `tsconfig.json` is a solution file with `"files": []`; a plain
> `tsc --noEmit` on it checks nothing, because the real sources are only reached through project
> references. Use `-b`, and use `--force`.

## Standing rules every session inherits

From README §10. Restate the relevant ones inside each leaf's `<action_safety>` block rather than
relying on the agent to have read this file.

1. **Review is the bottleneck, not generation.** One substantial feature per week. If a leaf cannot
   be reviewed in one sitting, split it.
2. **Green build is a precondition, not a milestone.** An agent starting on a red build will "fix"
   things that were never broken. If the build is red, the only allowed task is making it green.
3. **One package per session.** Give an agent `packages/wiki`, not "the wiki system." Cross-package
   work gets a written plan first, then one session per package, gates green between.
4. **Characterization tests before every refactor.** Snapshot current output as golden files first,
   so "didn't break anything" does not depend on memory.
5. **Dogfood.** Run `wiki` and `skills` on Kaioken itself monthly, commit the output. When Kaioken's
   docs of Kaioken get worse, the engine regressed.
6. **Release train every two weeks.** Scope discipline comes from the calendar, not willpower.
7. **Build-then-swap** for anything packaged — a running executable is locked on Windows.

## Delegation notes

These files are written to be run by any agent, but a few things are known about this setup:

- **Delegates break explicit whitelists by being helpful.** Read the added-file list in the report.
  Never `git add -A` after a delegated run — stage the named files.
- **The orchestrator commits, never the implementer.** Gates pass, diff reviewed, then commit.
- **Never trust a self-report.** Re-run the gates yourself. `touchedFiles` is a starting point for
  review, not a conclusion.
