
---
Companion to [[Kaioken]] (the design document). That file says **what** the system is
and **why**. This file says **how it is built**, **in what order**, and **what is out of scope**.
For the interactive test checklist covering all commands and exit codes, see [[Kaioken V2 — Command Test Checklist]].
For the full interactive reference and test checklist for all 57 terminal TUI commands, see [[Kaioken V2 — 57 Terminal Commands]].

Read the thesis first. Where the two disagree, the thesis wins on intent, this file wins on
implementation.

---

## 0. Ground rules for this build

| Rule | Meaning |
|---|---|
| Do not write an agent loop | The coding-agent side is Pi. We consume it, we do not reimplement it. |
| Knowledge layer first, agent last | Phases 1–5 contain no agent. They must be independently useful. |
| Every deterministic stage is unit-testable without a network | If a stage needs an API key to be tested, it is designed wrong. |
| No stage is a black box | Every stage writes an inspectable artifact to disk before the next stage reads it. |
| Ship a working slice per phase | Each phase ends with a real command a user can run. |

---

## 1. Language and runtime decision

The system is **TypeScript on Bun**. Not Go.

| Reason | Detail |
|---|---|
| Pi is TypeScript | `pi-agent-core`, `pi-ai`, `pi-tui`, `pi-coding-agent` are npm packages. Any other host language means IPC glue for no gain. |
| Language-agnostic parsing | `web-tree-sitter` beats `go/ast` — one parser strategy for every language, not just Go. |
| Single binary is still possible | `bun build --compile` produces one executable per platform. The zero-setup promise survives. |
| TUI is solved | `pi-tui` gives differential rendering. Do not build a renderer. |

Node is acceptable as a fallback runtime, but target Bun for the compile step.

---

## 2. What is borrowed vs what is built

| Layer | Source | Notes |
|---|---|---|
| Agent loop, tool calling, state | `@earendil-works/pi-agent-core` | Borrowed |
| Multi-provider LLM API | `@earendil-works/pi-ai` | Borrowed — Anthropic, OpenAI, Google, OpenRouter, Ollama |
| Terminal UI | `@earendil-works/pi-tui` | Borrowed |
| read / write / edit / bash, approval, sessions | `@earendil-works/pi-coding-agent` | Borrowed |
| Scan, risk flagging | **Built** | Phase 1 |
| Structural map / symbol index | **Built** | Phase 1 |
| Lexical + hybrid retrieval | **Built** | Phase 2 |
| Serving layer (browsable site) | **Built** | Phase 2 |
| Module plan, knowledge cards | **Built** | Phase 3 |
| Wiki cascade, verify / critique / correct | **Built** | Phase 4 |
| Provenance, invalidation, staleness | **Built** | Phase 5 |
| Pi extension exposing knowledge as tools | **Built** | Phase 6 |
| Impact, export, pack, handoff, hub | **Built** | Phase 7 |
| Research engine | **Built** | Phase 8 |

**The seam:** the knowledge engine is exposed to the agent as a Pi extension registering tools
(`symbol_lookup`, `wiki_search`, `impact`, `skill_load`). We never modify Pi's core.

---

## 3. Package layout

| Path | Responsibility | Depends on network? |
|---|---|---|
| `packages/scan` | One traversal, ignore rules, canonical file set, risk flags | No |
| `packages/index` | tree-sitter symbol extraction, declaration inventory, anchor resolution | No |
| `packages/plan` | Module plan, global plan, section plan — all editable artifacts | Yes (LLM) |
| `packages/wiki` | Generation cascade + verifier + critic + corrector | Yes (LLM) |
| `packages/provenance` | Source records, diff matching, invalidation, staleness | No |
| `packages/search` | BM25 lexical always; vector fusion when configured | Lexical: no |
| `packages/graph` | Derived graph builder — one routine, many renderers | No |
| `packages/serve` | Local static site + search endpoint | No |
| `packages/impact` | Deterministic gather → model reason → ground back | Yes (LLM) |
| `packages/research` | Triage router, fetch sanitisation, numbered citations | Yes |
| `packages/pi-ext` | Pi extension registering knowledge tools | — |
| `apps/cli` | Command surface, TUI shell | — |

---

## 4. On-disk contract

Everything lives in `.kaioken/` at the repo root. Human-readable, git-friendly, editable.

| Path | Content | Editable by user? |
|---|---|---|
| `.kaioken/scan.json` | File set, hashes, sizes, languages, risk flags | No (derived) |
| `.kaioken/index.json` | Declaration inventory per file | No (derived) |
| `.kaioken/module-plan.yaml` | Module tree with file scopes | **Yes — checkpoint** |
| `.kaioken/wiki-plan.yaml` | Chapter outline, goals, file assignments | **Yes — checkpoint** |
| `.kaioken/wiki/**/*.md` | Generated chapters and subsections | Yes |
| `.kaioken/cards/*.json` | Per-module knowledge cards | Yes |
| `.kaioken/skills/**` | Task procedures, interoperable open format | Yes |
| `.kaioken/provenance.json` | Document → source files, + repo state fingerprint | No (derived) |
| `.kaioken/search-index/` | Lexical index + optional vectors | No (derived) |
| `.kaioken/memory/project.md` | Committed, team-shared | Yes |
| `~/.kaioken/memory/user.md` | Private to operator, never in repo | Yes |

Rule: anything derived can be deleted and rebuilt. Anything a human edits is never overwritten
without approval.

---

## 5. Phase plan

Each phase is a shippable slice. Do not start phase N+1 until phase N's command works end to end.

| Phase | Deliverable command | Definition of done |
|---|---|---|
| **1** | `kaioken scan`, `kaioken symbols <file\|symbol>` | Full repo indexed offline; risk flags present; symbol lookup answers definitively |
| **2** | `kaioken search <q>`, `kaioken serve` | Search works with zero credentials; site browsable locally |
| **3** | `kaioken plan`, `kaioken cards` | Module plan is editable and generation obeys the edits |
| **4** | `kaioken wiki` | Chapters generated, then verified against the index; unverifiable claims reported as defects |
| **5** | `kaioken status`, `kaioken update` | Staleness answered honestly; only affected documents regenerate |
| **6** | `kaioken chat` (Pi-hosted) | Agent can call knowledge tools; verification gate re-runs repo's own tests |
| **7** | `kaioken impact`, `export`, `pack`, `handoff`, `hub` | Packed archive works on a machine with no keys and no install |
| **8** | `kaioken research <q>` | Every claim traces to a numbered page actually fetched |

**Phases 1, 2 and 5 contain no LLM calls at all.** That is intentional — it is the moat and it is
the part that must never break.

---

## 6. Phase 1 in detail (start here)

### 6.1 Scan

| Output field | Notes |
|---|---|
| `path` | Repo-relative, POSIX separators |
| `hash` | Content hash — drives incremental reindex |
| `size`, `language` | Language from extension + shebang fallback |
| `risk[]` | `private_key`, `credentials`, `generated`, `large_binary`, `lockfile` |

One traversal. Respects `.gitignore`, `.kaikenignore`, and a built-in default set. Risk flagging
happens in the same pass because the bytes are already in hand — every downstream consumer,
including the agent's write-approval prompt, inherits it for free.

### 6.2 Structural map

Per declaration, extract:

| Field | Purpose |
|---|---|
| `name`, `kind` | function / method / type / interface / const / var |
| `signature` | Shown in bundles instead of the body |
| `startLine`, `endLine` | Anchor resolution |
| `exported` | Coverage rubric in phase 4 |
| `doc` | Leading comment block |

Implementation: `web-tree-sitter` + one `.scm` query file per language. Start with TypeScript,
JavaScript, Python, Go, Rust. Adding a language must mean adding a grammar and a query file —
nothing else.

The index serves three roles. Do not fork it into three artifacts:

| Role | Consumer |
|---|---|
| Skeleton for context bundling | Phases 3–4 |
| Grounding oracle ("does this symbol exist?") | Phase 4 verifier |
| Anchor resolver ("which lines back this quote?") | Phase 4 verifier |

### 6.3 Tests for phase 1

| Test | Asserts |
|---|---|
| Fixture repo per language | Declaration counts and line ranges exact |
| Ignore rules | Generated dirs excluded, dotfiles handled |
| Risk flags | Planted fake key detected, real source not flagged |
| Incremental | Unchanged file is not reparsed |
| Offline | Whole suite passes with no network and no API key |

---

## 7. Cross-cutting invariants

These apply to every phase. Violating one is a bug, not a tradeoff.

| Invariant | Enforcement |
|---|---|
| Evidence first, model second | Deterministic gather is a separate, separately-tested function from the prompt call |
| Generation is a claim, verification is the product | No generative pass ships output without an adversarial pass behind it |
| Provenance is machinery | Records are structured data a program acts on — never a prose "referenced files" section |
| Derive, don't store | Graph and staleness are computed on demand, never persisted |
| Cheap editable plan before expensive stage | If a stage costs tokens, a plan artifact precedes it |
| Degrade to zero dependencies | Lexical search, serve, export, pack must never import an LLM client |
| Never hard-delete | Aged knowledge changes state; human-authored or pinned content is exempt |
| One dial for depth | A single `×N` multiplier; below threshold buys breadth, above it buys passes |
| Untrusted input is a boundary | Fetched content sanitised at the fetch boundary, fenced, labelled as data |
| Legible to humans | Every artifact readable in the serve layer or as plain text on disk |

---

## 8. Explicitly out of scope

| Not building | Why |
|---|---|
| Custom agent loop | Pi has one |
| Custom terminal renderer | `pi-tui` has one |
| Custom LLM provider abstraction | `pi-ai` has one |
| Hosted service / auth / billing | Later, separate repo, closed source |
| Autonomous unattended write loops | Treated as a defect class, per the thesis |
| Editor plugins, platform integrations | Export exists so other tools consume our output instead |

---

## 9. Distribution

| Concern | Approach |
|---|---|
| Binary | `bun build --compile` per platform, attached to GitHub releases |
| Grammars | Ship WASM grammars as embedded assets; lazy-fetch extras to `~/.kaioken/grammars` |
| First run with no keys | `scan`, `symbols`, `search`, `serve`, `export`, `pack` all work |
| First run with keys | `plan`, `cards`, `wiki`, `impact`, `research`, `chat` unlock |

---

## 10. Immediate next action

Build `packages/scan` and `packages/index`, plus the `kaioken scan` and `kaioken symbols`
commands, with the phase-1 test suite passing offline. Nothing else.

---