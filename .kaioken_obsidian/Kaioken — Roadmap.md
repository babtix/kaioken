
---
**The canonical roadmap now lives in the repository, not in this vault.**

> `D:\project\ai_now_know\roadmap\`

This note is the navigator. It says what is in that tree, how to read it, and where the decisions
sit. It deliberately does **not** duplicate the content — the repo tree is the source of truth, and
a second copy here would silently drift out of date.

Companion notes: [[Kaioken]] (the thesis) · [[Kaioken — Build Reference]] (how it was built) ·
[[Kaioken V2 — Command Test Checklist]] · [[Kaioken V2 — 57 Terminal Commands]] · [[Theia Research]]

---

## What the tree is

144 markdown files — 98 engineering, 46 business. One folder per milestone, and inside it **one file per sub-deliverable** — each
written as a complete, self-contained brief for a single vibe-coding session. Every leaf carries a
paste-ready `<task>` block, an explicit out-of-scope list, the real gate commands, and a traps
section.

The premise the whole format is built on: the implementer is an agent with no memory of any prior
conversation, that cannot ask a clarifying question mid-run and will confidently invent a plausible
answer if a fact is missing. So a leaf that cannot be executed without asking a question is not
finished.

| | Count |
|---|---|
| Files | 144 |
| Executable leaves | 139 |
| `ready` — an agent can start now | **111** |
| `blocked` — a human decision comes first | 25 |
| `done` / `in-progress` / `superseded` | 3 |

## The map

| Folder | Files | What it holds |
|---|---|---|
| `README.md` | — | Master index: the M1–M12 table with a v2 verdict per milestone, the v1→v2 translation layer, the public feature board, gaps, non-goals, license paths, open questions, operating rules |
| `CONVENTIONS.md` | — | The leaf contract, status and size vocabulary, the real gate commands, the session-brief skeleton |
| `m01-green-everywhere/` | 7 | **Start here.** CI is dead; this rebuilds the gate |
| `m02-trusted-distribution/` | 7 | Re-spec'd entirely — there is no Go binary to sign any more |
| `m03-desktop-depth-pass/` | 8 | Superseded by Studio; the individual requirements carry over |
| `m04-retrieval-that-earns-its-keep/` | 6 | The highest-value open milestone |
| `m05-tree-sitter-codemap/` | 5 | Already shipped — verification and remainder only |
| `m06-incrementality-everywhere/` | 5 | Largely shipped — snapshots and card schemas remain |
| `m07-permissions-and-sandboxing/` | 7 | **Promoted to P1.** See below |
| `m08-background-workers/` | 6 | Gated behind M7 |
| `m09-local-model-path/` | 5 | The biggest adoption lever |
| `m10-ide-extension/` | 4 | Superseded; knowledge-on-hover survives as the demo |
| `m11-team-and-ci-surface/` | 5 | Team and CI surface |
| `m12-ecosystem-ga/` | 6 | v2.0 |
| `studio-v0.1/` | 7 | The active build. **Spike is complete** |
| `cross-cutting/` | 6 | Architectural enablers spanning milestones |
| `gaps/` | 7 | G-1…G-6, documented but unscheduled |
| `decisions/` | 5 | D1–D4 — decision records, not build briefs |
| `money_print/` | **46** | **The business path.** Seven phases B0–B6 — see below |

## How to run one

1. Open the milestone folder's `README.md` for the ordered leaf list and its dependency graph.
2. Pick a leaf whose Status is `ready`.
3. Paste its **Session brief** block into a coding agent.
4. Re-run the gates yourself. Read the diff. Then *you* commit — never the implementer.

Gates, all from `kaioken_v2/`: `npm test` (which is `npm run build && vitest run`) and
`npm run typecheck` (which is `tsc --build --force`). Never `tsc --noEmit` — the root config is a
solution file with `"files": []`, so it checks nothing.

## The four things worth knowing before you read it

**CI is dead, not stale.** All four jobs in `.github/workflows/ci.yml` point at `kaioken v1/`, a
directory archived out of tracking. Every job fails before running a test, so "green build is a
precondition" currently has nothing behind it. This is gap G-6, and
`m01-green-everywhere/01-retarget-ci-workflow.md` is the P0 fix for the whole tree.

**Autonomy ships unguarded, and that inverts the plan's own sequencing.** `kaioken chat --write
--yes` exposes `edit`, `write` and unconstrained `bash` with no human confirmation. The rule was
that sandboxing ships *before* unattended execution. M7 is therefore promoted out of Q3 to P1, and
M8 is gated behind it.

**Two milestones landed early.** M5 (tree-sitter) and M6 (incrementality) were largely absorbed by
the TypeScript rewrite. M5 in particular was called "the riskiest refactor of the year" and it is
simply done. Their folders are about verifying and closing the remainder — read them before
assuming there is a year of work in front of you.

**Four decisions gate the back half.** `decisions/` holds them: the license (deadline March 2027,
and it gets harder with every outside contributor), the version base, which of the two Studio forks
ships, and monorepo versus published packages. Twelve leaves are blocked on these four files and
nothing else.

## money_print — the business path

The second roadmap, inside the first. Where `roadmap/` answers *what do I build*, `money_print/`
answers *how does this become a company that earns money* — on the model you named: open-source
client as the distribution mechanism, revenue from subscription plus metered inference sold at a
margin, the way Kilo Code and OpenCode do it.

| Phase | For |
|---|---|
| **B0** preconditions | What must be legally true before anyone can pay you |
| **B1** model & positioning | What is sold, to whom, at what price |
| **B2** billing engineering | Accounts, payments, entitlements, metering, inference proxy, quotas |
| **B3** hosted surface | What gets hosted — and therefore what you must keep running forever |
| **B4** company formation | Entity, banking, tax, terms, contributor agreement, compliance calendar |
| **B5** go to market | First hundred users, funnel, pricing page, metrics |
| **B6** scale | When to hire, the solo ceiling, and the kill criteria |

**Three things to read first.**

*The entry condition.* money_print does not begin until the engineering roadmap can support a paying
user — M1 (a build gate that runs), M7 (sandboxing, because you cannot sell unattended execution
with no guardrails), M2 (a stranger can install and verify what they paid for). Selling before those
exist sells a promise.

*Precondition zero is the license.* `kaioken_v2/` has no LICENSE file, and neither does the repo
root. The noncommercial licence covers only the archived Go v1. So the engine is currently
unlicensed — all rights reserved by default — and the open-source half of this model does not
legally exist yet. Good news underneath: every dependency that matters is MIT, so nothing external
blocks a commercial path. The blocker is entirely your own choice.

*One file owns the money.* `b1-model-and-positioning/06-unit-economics-model.md` is the canonical
assumptions table — margin, fixed overhead, break-even. Every other phase inherits from it. Edit it
there and nowhere else, or the phases quietly start describing different businesses.

**What it wants decided:** the licence (Apache-2.0 recommended, for the patent grant), the trademark
posture (the name is borrowed from a media franchise — harmless as a hobby, real once money moves),
the revenue model, your jurisdiction, and merchant-of-record versus a direct gateway.

Every competitor price carries `UNVERIFIED:` and every figure is labelled `ASSUMPTION` in an
editable table, because nothing in a business document fails loudly when it is wrong.

---

## Where this tree came from

Reconciled from four sources that disagreed with each other: the 12-month plan in `.kaioken_v1/
ROADMAP.md` (written against the archived Go binary — sequencing valid, artifacts stale), the public
feature board in `website/src/data/roadmap.ts` (describes Go internals), `kaioken_v2/README.md`
(which says plainly that nothing is scheduled), and the Studio scope and build notes in
`kaioken_v2/docs/`.

The leaves were generated by delegated agents and then audited: 164 cited engine paths were checked
against disk — 94 verified, 68 correctly proposed as new modules, and 4 fabricated citations found
and corrected.
