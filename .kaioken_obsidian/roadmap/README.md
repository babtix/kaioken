
# Kaioken Roadmap

Companion to [KAIOKEN-THESIS.md](../kaioken_v2/KAIOKEN-THESIS.md) (the thesis) and `Kaioken — Build Reference` (Obsidian vault) (the how).
That pair says **what** the system is and **how it was built**. This file says
**what is left, in what order, and what was deliberately refused.**

Sources reconciled here, in order of authority over the future:

| Source | Scope | Authority | Staleness |
|---|---|---|---|
| `kaioken_v2/README.md` §Next | The canonical TypeScript engine | **Highest** — describes shipped code | Current |
| `.kaioken_v1/ROADMAP.md` | 12-month Aug 26 → Jul 27 plan, v1.3.1 → v2.0 | Sequencing + strategy still valid | **Artifacts stale** — written against Go v1, now archived |
| `website/src/data/roadmap.ts` | Public `/next` feature board, 10 categories × 6 | Marketing surface | **Stale** — describes Go internals (`Tools()`, `serve.go`, `go.mod`) |
| `kaioken_v2/docs/studio-v0.1-scope.md` | Theia desktop shell | Current for Studio | Current |

> [!warning] The central discontinuity
> The 12-month roadmap was written when Kaioken was **a single Go binary at v1.3.1** with a Tauri desktop shell. Commit `e46fe1b5` archived that implementation to `.kaioken_v1/`. The canonical engine is now **TypeScript/Node in `kaioken_v2/`**, 19 packages, all 8 phases complete.
>
> The consequence: M1–M3 as literally written describe work on files that no longer exist, and several later milestones (M5, M6) turn out to be **already shipped** in the rewrite. The **sequencing logic survives the rewrite; the milestone contents do not.** §3 below is the translation layer.

---

## 1. Where the project actually stands

### 1.1 Live surfaces

| Surface | Path | Language | Status | Roadmap relevance |
|---|---|---|---|---|
| **Engine (canonical)** | `kaioken_v2/` | TypeScript / Node | All 8 phases complete, 19 packages | Everything below routes through here |
| CLI | `kaioken_v2/apps/cli` | TS | ~30 commands shipped | M4, M6, M9 land here |
| TUI | `kaioken_v2/apps/tui` | TS | Rebuilt off the stale fork | 57-command reference in `Kaioken V2 — 57 Terminal Commands` (vault) |
| **Studio (Theia fork)** | `ide_kaioken/kaioken_studio_theia/` | TS / Electron | **Spike complete.** Extension built, Kaioken dark theme registered, ESM engine bridge working, Windows CA-certs blocker resolved — see `kaioken_v2/docs/studio-v0.1-build-notes.md` | Supersedes M3 + M10 |
| **Studio (Code-OSS fork)** | `ide_kaioken/kaioken_studio/` | TS / Electron | Parallel build; starts in Agents window | Duplicate of the above — see §9 open question |
| Engine v1 (archived) | `.kaioken_v1/` | Go | Out of tracking | Historical only |
| Marketing site | `website/` | TS / React | Live, serves `/next` from stale data | M12 docs consolidation |
| Extension registry | `registry-web/` | TS | Exists, not launched | M12 |
| Pipeline export | `Orchestrator_pipeline` (public) | — | Published | Method generalised out |

### 1.2 Engine package inventory — and which milestone each one feeds

| Package | Job | Feeds |
|---|---|---|
| `scan` | One traversal, canonical file set, risk flagging | Substrate for all |
| `index` | Declaration inventory, **tree-sitter** (go/js/ts/python/rust) + anchors + oracle | **M5 already landed** |
| `search` | BM25 lexical corpus + index store | M4 (needs mode unification) |
| `prism` | Chunked retrieval / RAG substrate | M4 |
| `plan` | Module decomposition, the human checkpoint | — |
| `wiki` | Chapter generation | M6 |
| `templates` | Card / chapter schemas | M6 custom schemas |
| `provenance` | Page hashes, staleness, `status --check` | **M6 largely landed** |
| `impact` | Documentation impact of a change | Analysis (deliberately *not* a call graph) |
| `graph` | Knowledge graph, `graph.json` | M12 graph explorer (deferred) |
| `research` | Web-grounded answers from fetched pages | **Not aged** — known gap G-1 |
| `agent` | Agent loop + skills | M7, M8 |
| `session` | Session handling | **Not persisted** — known gap G-3 |
| `model` | Provider pool, retry | M9 |
| `serve` | HTTP / read surface | M8, M10 |
| `gitops` | Git operations | M7 worktree isolation |
| `skillgen` | Skill generation / patching | M8 |
| `ext` | Extension mechanism | M12 SDK |
| `agentsmd` | AGENTS.md interop | M6 export targets |

### 1.3 Command surface shipped

| Class | Commands |
|---|---|
| Deterministic / offline, no credentials | `scan` · `symbols` · `search` · `serve` · `status` · `verify` · `graph` · `impact` · `init` |
| Generative (needs a model) | `plan` · `cards` · `wiki` · `update` · `chat` · `research` · `draft` · `learn` · `skills` |
| Interop / handoff | `export` · `handoff` · `agentsmd` · `hook` · `onboard` |
| Runtime / service | `daemon` *(uncommitted)* · `agent-serve` · `fetcher` · `prism` |
| Ecosystem | `ext` · `list` |

---

## 2. The master milestone table

Original 12-month sequence, with a verdict column reconciling each milestone against the v2 rewrite.

| # | Month | Target | Theme | Headline ships | Done when | **v2 verdict** |
|---|---|---|---|---|---|---|
| **M1** | Aug 26 | v1.4 | Green everywhere | CI matrix ×3 OS · fix 2 flaky tests · zero `any` in desktop · contract-version guard · land in-flight work | Fresh clone builds green on 3 OSes from CI, no manual steps | **RE-SPEC — and urgent.** All four CI jobs point at `kaioken v1/`, which no longer exists. CI is dead, not merely stale. |
| **M2** | Sep 26 | v1.5 | Trusted distribution | goreleaser + cosign · `selfupdate` end to end · NSIS/dmg/deb/AppImage · Tauri auto-updater · Scoop/winget/Homebrew · Rekor inclusion proof | Send a URL; the binary verifies its own provenance | **RE-SPEC ENTIRELY.** No Go binary to sign. Node/npm needs a different trust story (npm provenance, or bundling to a signed executable). |
| **M3** | Oct 26 | v1.6 | Desktop depth pass | Per-hunk diff approval · cost meter · quit guard · workspace dashboard · error copy per `ApiError.code` · wiki/skills editors · multiplier dial | Walk every route; nothing is a dead end | **SUPERSEDED** by Studio v0.1 (§4). Per-hunk approval, multiplier dial and cost meter carry over verbatim; Tauri routes do not. |
| **M4** | Nov 26 | v1.7 | Retrieval that earns its keep | Unified `search` (substring/regex/symbol/semantic) · symbol lookup off the index · RAG over wiki · fuzzy finder · **eval harness first** | The harness shows a measurable gain, and the number is written down | **PARTIAL, MOSTLY OPEN.** `search` is BM25-only; `prism` and `index/oracle.ts` supply the substrate. **No eval harness exists.** Highest-value open milestone. |
| **M5** | Dec 26 | v1.8 | Tree-sitter codemap | Grammars replacing regex parsers · accurate symbol extraction · framework detection · golden-file characterization tests | Polyglot fixture output strictly better, proven against goldens | **ALREADY DONE.** `packages/index` ships tree-sitter with `.scm` queries for go, javascript, typescript, python, rust. The riskiest refactor of the year was absorbed by the rewrite. |
| **M6** | Jan 27 | v1.9 | Incrementality everywhere | Diff-driven card updates · versioned wiki snapshots · `--export claude-md/agents-md/cursor/qoder` · custom card schemas | One-file change → seconds, single-digit API calls | **LARGELY DONE.** `update` + `provenance` + `status --check` + `export` + `agentsmd` all ship. Remaining: versioned snapshots, custom card schemas. |
| **M7** | Feb 27 | v1.10 | Permissions & sandboxing | Worktree isolation · per-tool allow/deny/ask policy · `run_command` allow/denylist · resource ceilings (turns/spend/wall-clock) · audit log | Hand it a task, walk away, worst case is a wasted worktree | **OPEN AND OUT OF SEQUENCE.** The v2 reconciliation found **autonomy already ships unguarded**. The roadmap's own rule — *sandboxing ships before unattended execution* — is currently violated. **Promote this.** |
| **M8** | Mar 27 | v1.11 | Background workers | Daemon-hosted long tasks · per-turn reflection gate · surgical skill patching (`origin: learned`) · subagent monitor · OS notifications | Queue a refactor before bed, review a worktree diff by morning | **STARTED.** `daemon` command is uncommitted on disk; `agent-serve` shipped; `skillgen` + `learn` exist. Gated behind M7. |
| **M9** | Apr 27 | v1.12 | Local-model path | Tool-call formatters for open models · structured-output fallback for malformed calls · per-operation local/remote routing · documented offline profile | `kaioken wiki x2` completes fully local, output usable | **OPEN.** `packages/model` (pool + retry) is the insertion point. Called the biggest adoption lever in the plan. |
| **M10** | May 27 | v1.13 | IDE extension | VS Code extension over the daemon · knowledge on hover · JetBrains only if VS Code lands early | — | **SUPERSEDED / MERGED** into the two Studio forks. "Knowledge on hover" is named *the demo that sells the whole project* — keep it as a Studio item. |
| **M11** | Jun 27 | v1.14 | Team & CI surface | GitHub Action to marketplace · PR-triggered incremental update · PR review bot on webhook · version-controlled team `/notes` | — | **OPEN.** `hook` command is the seed. v1's `internal/review` has no v2 equivalent yet. |
| **M12** | Jul 27 | **v2.0** | Ecosystem GA | Registry launch · Extension SDK v1 with frozen `extension.yaml` · docs consolidation · performance pass vs baseline · **license decision** | — | **OPEN.** `ext` + `registry-web` exist. Version numbering itself now needs re-basing (§9 Q2). |

---

## 3. Translation layer — v1 artifact → v2 equivalent

The mechanical part of un-staling the roadmap. Every left-hand item appears in the plan as a command, path, or gate.

| Roadmap says (v1, Go) | v2 equivalent | Action |
|---|---|---|
| `go test ./...` | `npm test` (vitest, offline by design) | Replace in every gate |
| `golangci-lint` | ESLint / `tsc -b` | Replace |
| `cargo clippy -- -D warnings` | *(gone — no Rust)* | Delete; Electron replaces Tauri |
| `tsc -b` on `desktop/src` | `tsc -b` on `kaioken_v2` + Studio workspace | Retarget |
| `internal/wiki` | `packages/wiki` | Retarget |
| `internal/agent/aside.go` | `packages/agent` | Re-derive; the aside channel may not exist |
| `internal/selfupdate/verify.go` | *(none)* | M2 rewritten from scratch |
| `internal/review` | *(none)* | M11 builds new |
| `codemap` / `Index.symbols` | `packages/index` (tree-sitter + `oracle.ts`) | Already better than planned |
| `Tools()` dynamic registry | `packages/ext` | Retarget |
| `chan tea.Msg` → event bus | TUI at `apps/tui` | Re-assess need |
| Tauri sidecar + `ContractVersion` | Theia in-process RPC (`RpcConnectionHandler`) | **Contract guard is obsolete** — in-process removes the mismatch class entirely |
| `kaioken.exe` build-then-swap | Node — no lock | Rule retired for the engine; still applies to packaged Studio |
| `go.mod` / `package.json` dep watcher | `package.json` only | Simplifies |

---

## 4. Kaioken Studio v0.1 — the active build

Supersedes M3 and M10. Definition: *the smallest build that proves the thesis — a branded Theia app where Kaioken's TypeScript packages run **in-process**, and an agent run is drivable end to end from a GUI.* Explicitly **not** the twelve-pane studio in `DESIGN.md`; it is two Kaioken panes bolted onto an IDE that already supplies the editor, terminal, file tree and command palette for free.

### 4.1 In scope

| Area | Item | Detail |
|---|---|---|
| Shell | Fork `eclipse-theia/theia-ide` | Blueprint template |
| Shell | Rebrand | App name, icons ×3 platforms, welcome page, About dialog, config dir `.theia-blueprint` → `.kaioken` |
| Shell | Kaioken dark theme | ANSI-derived, through Theia's own theming system |
| Shell | Bundler swap | webpack → esbuild, **early** |
| Shell | Target | Electron only |
| Integration | One extension | `theia-extensions/kaioken/` |
| Integration | Backend services in-process | `@kaioken/index`, `scan`, `search`, `agent`, `wiki` |
| Integration | Transport | Theia standard RPC + InversifyJS |
| Integration | Workspace | `kaioken_v2` and Studio share one npm workspace |
| Pane 1 | Chat / agent runs | Transcript, collapsible tool-call cards, streaming output, inline diff approval — *the surface that has to feel good* |
| Pane 2 | Wiki browser | `TreeWidget` navigator + markdown reader — *cheapest real value; reuses a base class* |
| Chrome | Status bar | Connection state, active run count, session token accumulator |
| Chrome | Multiplier control | ×1–×10 in the composer, with cost preview |
| Chrome | Approval dialog | Full safety protocol: focus never on Approve, `Y`/`N`/`A`/`Esc`, five-minute auto-deny |

**Inherited free — build nothing:** Monaco editor + diffs, terminal (run `apps/tui` inside it), file explorer, command palette, settings UI, keybindings, themes engine, Git/SCM.

### 4.2 Out of scope for v0.1

| Category | Deferred |
|---|---|
| Panes | Research, Graph, Cards, Browser, Activity, Extensions, Cost, Workspaces picker, custom Settings |
| Chrome | 44px frameless titlebar, 68px nav rail (use stock activity bar), shell-wide glassmorphism, WebGL CRT backdrop, ambient shaders |
| Distribution | Code signing, macOS notarisation, auto-update, browser target, **public release of any kind** — v0.1 runs unpackaged via `yarn electron start` |

> The graph explorer is the single largest custom build in the whole product and belongs in its own version.

### 4.3 Order of work

> [!note] Step 1 is already done.
> `kaioken_v2/docs/studio-v0.1-build-notes.md` records the spike as complete and the central
> assumption as holding: the engine is consumed in-process, resolved by path rather than declared
> as a dependency (§3), the Kaioken dark theme registers through `MonacoThemingService.
> registerParsedTheme` (§5), and the `@vscode/windows-ca-certs` compile blocker is resolved (§4).
> esbuild turned out to be the bundler already, so that swap is moot. The live statuses are in
> [studio-v0.1/](./studio-v0.1/), which is more current than this table.

| Step | Task | Why this position |
|---|---|---|
| 1 | **Spike, and stop.** Fork Blueprint, rebrand, boot, expose one `@kaioken/*` package as a backend service, call it from a trivial widget | The only step that tests the document's central assumption. If in-process consumption fights the Theia build, everything downstream changes — find out before building panes |
| 2 | Answer the strategy question: does Kaioken **replace** Theia's Coder/Architect agents, or **expose itself as MCP tools** inside them? | Compare `packages/agent/src/skills.ts` against Theia's Agent Capabilities before deciding |
| 3 | Dark theme + status bar contributions | Small, and they make every subsequent screenshot look right |
| 4 | Chat pane, including the approval dialog | — |
| 5 | Wiki pane on `TreeWidget` | — |
| 6 | Package once, unsigned | Learn what packaging costs before it matters |

### 4.4 Done criteria

| # | Criterion |
|---|---|
| 1 | Launches branded — no "Theia" or "Blueprint" string visible to a user |
| 2 | Opening a repository indexes it, with progress shown |
| 3 | An agent run streams into chat, tool calls render as cards, a file edit is gated by the approval dialog |
| 4 | Approving an edit changes the file, visible in the Monaco editor |
| 5 | Generated wiki documents browsable in the tree, readable in the reader |
| 6 | The multiplier changes run depth, cost preview shown before execution |
| 7 | `apps/tui` still builds and its tests pass — shared packages not broken in service of the GUI |

### 4.5 Standing risks to re-check at start

| Risk | Mitigation |
|---|---|
| Theia's version has moved; Theia AI's shipped agents may now overlap Kaioken more than at research time (2026-08-30) | Verify current release before step 1 |
| Native module rebuilds when switching browser ↔ electron targets | v0.1 avoids this by building electron only |
| Merging workspaces affects Kaioken's own build, test and release story | Decide monorepo vs published packages **at step 1, not later** |
| Windows Spectre libs + `yarn electron build` | Known gotcha — see `Kaioken — Build Reference` (Obsidian vault) |

---

## 5. The public feature board

From `website/src/data/roadmap.ts`, which powers the site's `/next` page. ✅ = flagged `done` in the data. Bodies reference Go internals and need retargeting per §3.

### 01 · Specialized coding agents — *sub-agents on the existing `Run()` loop*

| Item | Detail | Status |
|---|---|---|
| Refactor agent | Multi-file refactors, tracing all references via the symbol index before editing | ☐ |
| Test writer | Reads a function via codemap, generates table-driven tests matching repo patterns | ☐ |
| Debug agent | Takes an error or stack trace, locates the fault, proposes a fix with explanation | ☐ |
| Code review agent | Annotates a git diff for style, bugs, performance as inline comments | ✅ |
| Multi-agent orchestrator | Planner decomposes, delegates to specialists, merges outputs | ✅ |
| Migration agent | Dependency upgrades, codemods, framework version migration | ☐ |

### 02 · Advanced search

| Item | Detail | Status |
|---|---|---|
| Regex search | RE2 patterns over the scanner — structural queries like signatures, error returns | ☐ |
| Symbol search | Query the symbol map directly for O(1) declaration lookup | ☐ |
| Semantic search | Embed cards + skeletons into a local vector store; retrieve by meaning | ✅ |
| Fuzzy file finder | fzf-style global matching — saves `list_files` round-trips | ☐ |
| Definition & references | `go_to_definition` / `find_references` via LSP or tree-sitter | ☐ |
| Change-aware search | Scope queries to files changed in the last N commits | ✅ |

### 03 · GUI application — *marked "working on it"*

| Item | Detail | Status |
|---|---|---|
| Web IDE companion | Split-pane chat + file viewer with WebSocket streaming | ☐ *(non-goal — §7)* |
| Desktop app | Native window, filesystem access, tray, global hotkey | ☐ → now **Theia**, not Tauri |
| Interactive diff viewer | Side-by-side, per-hunk accept/reject instead of whole-file y/n | ☐ → Studio v0.1 |
| Codemap visualization | Force-directed graph or treemap from the index | ☐ → deferred past v0.1 |
| Session timeline | Conversation/tool/file history with branching and undo | ✅ |
| Wiki editor | WYSIWYG writing back to `.kaioken/wiki/` | ☐ *(non-goal — §7)* |

### 04 · Agent tool expansion

| Item | Detail | Status |
|---|---|---|
| `apply_patch` | Unified diff applied atomically with rollback | ☐ |
| `run_tests` | Detect framework, run targeted tests, parse structured pass/fail | ✅ |
| `git_operations` | Stage/commit/branch/stash with safety rails, never force-push | ☐ |
| `web_search` | Docs and Stack Overflow beyond the local repo | ☐ *(partly: `research`)* |
| Context window manager | Proactive mid-task pruning — keep relevant results, drop stale | ✅ |
| `explain_code` | File + line range, enriched with callers, callees, type info | ☐ |

### 05 · Knowledge management

| Item | Detail | Status |
|---|---|---|
| Knowledge graph | Modules → symbols → docs as a traversable property graph | ✅ |
| Live staleness detection | File watchers flagging cards stale in real time | ✅ |
| Versioned wiki with diffs | Git-trackable generations so doc evolution is comparable | ☐ → **M6 remainder** |
| RAG over wiki | Auto-retrieve relevant sections as chat context, with citations | ☐ → **M4** |
| Custom card schemas | User templates (API endpoint, data model) beyond the fixed five | ☐ → **M6 remainder** |
| Multi-repo federation | Global index across repos via global config | ✅ |

### 06 · Integrations

| Item | Detail | Status |
|---|---|---|
| VS Code / JetBrains extension | Thin client to a Kaioken daemon over WebSocket | ☐ → **M10 / Studio** |
| MCP server mode | Expose `search`, `read_knowledge`, `codemap` as MCP tools | ✅ |
| GitHub / GitLab integration | PR descriptions from diffs, wiki summaries, review on webhooks | ☐ → **M11** |
| CI/CD plugin | GitHub Action running `kaioken wiki` on merge, publishing docs | ✅ |
| Slack / Discord bot | Team Q&A over the knowledge engine | ☐ *(non-goal — §7)* |
| Docker devcontainer | Prebuilt container with Kaioken + common runtimes | ☐ |

### 07 · Automation

| Item | Detail | Status |
|---|---|---|
| Pre-commit knowledge check | Verify cards current before allowing a commit, warn on drift | ✅ |
| PR-triggered wiki update | Webhook receiver running `wiki.Update` on PR open/update | ☐ → **M11** |
| Scheduled deep regeneration | Cron running `/wiki x3` nightly on main | ☐ |
| Test-gate on edits | After an edit, run the affected package's tests before continuing | ✅ |
| Commit message generation | Conventional message from the staged diff, on demand | ✅ |
| Dependency update watcher | Outdated deps + breaking-change summaries | ☐ |

### 08 · Collaboration — *entire category is a §7 non-goal until users exist*

| Item | Detail | Status |
|---|---|---|
| Shared session server | Multi-user WebSocket, live shared chat | ☐ |
| Knowledge review workflow | PR-like approval on wiki changes | ☐ |
| Team steering notes | Shared, version-controlled `/notes` | ☐ → **M11** *(the one kept)* |
| Role-based permissions | Identity-aware approval gate | ☐ |
| Activity feed | Persistent team-visible log of all agent actions | ☐ *(overlaps M7 audit log)* |
| Pair programming mode | One drives, one reviews approvals live | ☐ |

### 09 · Analysis tools

| Item | Detail | Status |
|---|---|---|
| Dependency graph | Interactive module graph from imports, with cycle detection | ☐ |
| Complexity metrics | Cyclomatic complexity, function length, nesting depth per symbol | ☐ *(non-goal)* |
| Architecture drift detection | Planned module structure vs actual imports, flag boundary violations | ☐ |
| Dead code detection | Exported symbols with zero references repo-wide | ☐ *(non-goal)* |
| Change impact analysis | Trace dependents, estimate blast radius | ✅ *(as **documentation** impact — see G-2)* |
| Tech debt heatmap | Git change frequency × complexity | ☐ *(non-goal)* |

### 10 · Extended language support

| Item | Detail | Status |
|---|---|---|
| Tree-sitter parsing | Replace regex/line parsers with real ASTs | ✅ **in v2** — go, js, ts, python, rust |
| TypeScript / JavaScript | Interfaces, type aliases, React components, export maps | ✅ **in v2** |
| Python | Classes, decorators, type hints, venv awareness | ✅ **in v2** |
| Framework detection | Next.js, Django, Spring, Rails from file patterns | ☐ |
| Language server integration | gopls, tsserver, pyright for precise navigation | ☐ |
| DSL & config parsing | Terraform, K8s YAML, SQL migrations as first-class code | ☐ |

### Cross-cutting architectural enablers

| Enabler | Detail | Status | v2 note |
|---|---|---|---|
| Plugin / tool registry | Dynamically extensible tools without touching core agent code | ✅ | `packages/ext` |
| Event bus | Typed bus that GUI, CLI and daemon all subscribe to | ☐ | Was to replace `chan tea.Msg`; re-assess under Theia RPC |
| Daemon mode | Long-running process holding index, wiki state, sessions | ✅ | `daemon` cmd uncommitted; `agent-serve` shipped |
| Streaming tool results | Pipe large outputs incrementally instead of buffering | ☐ | Needed by the Studio chat pane |
| Configuration profiles | Named profiles (review, wiki, chat) presetting model, tokens, tools, prompt | ✅ | — |

---

## 6. Known gaps in v2 — documented, not scheduled

`README.md` records these honestly rather than hiding them. Each is a roadmap candidate; none is currently on a milestone.

| ID | Gap | Why it exists | Cost to close |
|---|---|---|---|
| **G-1** | **Research is not aged.** A research document records its page hashes but is kept out of the shared provenance index | Its sources are URLs; staleness resolves a source by looking its path up in the scan, so wiring it in would report every research document as `orphaned` and fail `status --check` on a perfectly current repo | Needs a re-fetch capability this layer does not have. `status`, `update`, `graph` and `export` therefore do not see research |
| **G-2** | `impact` reports **documentation** impact only — which chapters and cards a change invalidates | There is no reference index to build a call graph from, *and pretending otherwise would be the sort of confident wrong answer this engine exists to avoid* | Requires a reference index — adjacent to the deferred find-references work |
| **G-3** | **A chat session is not persisted.** The transcript lives as long as the process | No session store yet | No `--resume`. `packages/session` is the insertion point |
| **G-4** | Token and cost figures can be wrong when a model's accounting is unavailable — a warning is printed | Provider variance | Directly affects the Studio cost meter and multiplier preview |
| **G-5** | Reasoning is requested at `minimal` for any reasoning-capable model | Some endpoints refuse to serve one with reasoning disabled | Provider-specific handling |
| **G-6** | **CI is dead.** All four jobs (`go-test`, `frontend`, `clippy`, `tauri-build`) set `working-directory` to `kaioken v1/…`, a path that no longer exists | Fallout from archiving v1 | **Small and urgent** — the M1 gate cannot exist until this is retargeted at `kaioken_v2` |

---

## 7. Deliberately *not* on the roadmap

Named in the plan so the temptation is recognisable when it arrives.

| Refused | Reason given |
|---|---|
| Shared sessions / pair programming / role-based permissions | Real multi-user is a distributed-systems project, not a feature. **Not until there are users.** |
| Slack / Discord bots | Cheap to build, near-zero payoff before adoption exists |
| Complexity metrics, dead-code detection, tech-debt heatmaps | Nice analysis surface, but they compete with the knowledge engine for attention **and lose** |
| Web IDE companion | The desktop app already is this. Two clients is one too many for a solo maintainer |
| Wiki WYSIWYG editor | The wiki is generated. Hand-editing it fights incrementality |
| 40-language tree-sitter support | M5 does the languages actually used. The rest is a long tail with a long-tail payoff |

---

## 8. The license decision

> [!warning] Correction, verified against the tree: there is no license at all on the current engine.
> The **License Zero Noncommercial Public License 2.0.1** file lives at `.kaioken_v1/LICENSE` — it
> covers the *archived Go implementation*. There is **no `LICENSE` at the repository root and none in
> `kaioken_v2/`**, so the canonical TypeScript engine is currently unlicensed, which by default means
> all rights reserved: nobody may legally use, fork, or contribute to it, and any "open source"
> positioning is presently untrue. That is a smaller relicensing problem than the noncommercial
> license implies — no viral terms to unwind — but a larger *present* one, and it must be fixed
> before any of Q4 or the business path. See `money_print/b0-preconditions/`.

The original constraint, as the plan framed it: Kaioken is under **License Zero Noncommercial Public
License 2.0.1**, a hard constraint on Q4, with a deadline of **March 2027** while the contributor
list is still short.

| Consequence | Detail |
|---|---|
| Adoption cap | Companies cannot use it — capping adoption exactly where a codebase-knowledge tool is most valuable |
| No paid tier | Not possible without relicensing, which gets harder with every outside contributor who lands a PR |
| Q4 collides directly | The GitHub Action (M11) and IDE extension (M10) mostly land in commercial contexts |

| Path | Shape | Trade |
|---|---|---|
| **A · Stay noncommercial** | Portfolio / research project | Keeps full control, permanently caps reach |
| **B · Dual-license** | Noncommercial free, commercial paid | Monetisable; adds sales and compliance work to a solo project |
| **C · Permissive + monetise hosting/registry** | Open core, revenue from `registry-web` / hosted runs | Maximum reach; needs infrastructure that does not exist |

Every dependency that matters is permissively licensed — the Theia fork, the Code-OSS fork, `inspire/opencode` and `inspire/pi` are all MIT — so nothing external blocks a commercial path. The blocker is entirely Kaioken's own choice.

All three are called defensible. **Drifting into Q4 without choosing is not.**

---

## 9. Open questions this note cannot answer

| # | Question | Why it blocks planning |
|---|---|---|
| **Q1** | **Two Studio forks** — Theia (`ide_kaioken/kaioken_studio_theia/`) and Code-OSS (`ide_kaioken/kaioken_studio/`) are both live. Which one ships? | The plan's own rule is *two clients is one too many for a solo maintainer*. Running both violates it at the shell layer, and review capacity is the stated bottleneck |
| **Q2** | **Version numbering** — the plan runs v1.4 → v2.0 against a Go binary that is now archived. Does the TS engine inherit the v1.x line, or re-base? | Every milestone tag in §2 depends on the answer |
| **Q3** | Does Kaioken **replace** Theia's shipped agents or **expose itself as MCP tools** inside them? | Studio step 2; changes the whole integration surface |
| **Q4** | Monorepo vs published packages for the shared workspace | Studio step 1; affects build, test and release story |
| **Q5** | Given M5 and M6 largely landed early, does the freed Q2 go to **M7 (promoted, since autonomy ships unguarded)** or to **M4's eval harness**? | The two strongest candidates for the next block of work |

---

## 10. Operating rules — the constraints under which all of the above is sized

These matter more than the feature list; the plan is explicit that vibe coding at this scale fails in specific, predictable ways.

| # | Rule | Consequence |
|---|---|---|
| 1 | **The bottleneck is review, not generation.** An agent writes 2,000 lines an hour; you cannot review 2,000 lines an hour | ~**one substantial feature per week**, three a month, fourth week is integration and cleanup. This is why milestones look small relative to what an agent could produce |
| 2 | **Green build is a precondition, not a milestone** | An agent starting on a red build will "fix" things that were never broken. If the build is red, the only allowed task is making it green — see **G-6** |
| 3 | **One package per session** | Give an agent `packages/wiki`, not "the wiki system." Cross-package work gets a written plan first, then one session per package, tests green between. This is the difference between a refactor and a rewrite you did not ask for |
| 4 | **Characterization tests before every refactor** | Capture current output as golden files first, so "didn't break anything" does not depend on memory |
| 5 | **Dogfood aggressively** | Run `/wiki` and `/skills` on Kaioken itself monthly and commit the output. Best available quality signal: when Kaioken's docs of Kaioken get worse, the engine regressed |
| 6 | **Release train every two weeks** | Tag something every other Friday, even if small. Scope discipline comes from the calendar, not willpower |
| 7 | **Build-then-swap, always** | Applied to the Go binary (locked while running); now applies to **packaged Studio** rather than the Node engine |

---

## 11. Quarterly checkpoints

Answer in writing at each quarter end, then adjust the next quarter.

| # | Question |
|---|---|
| 1 | Does a fresh clone build green on all three OSes, **today**? |
| 2 | How many people other than you ran Kaioken this quarter? |
| 3 | Did the knowledge engine's output on Kaioken itself get better or worse? *(The dogfooded docs are committed — compare them.)* |
| 4 | What shipped that nobody needed? |
| 5 | **What is still half-wired from a previous quarter? Fix it before starting new work.** |

> Question 5 is the one that decides whether this is a v2.0 or another abandoned 40-package repo.

---

## 12. The business path — `money_print/`

Everything above answers *what do I build*. [money_print/](./money_print/) answers *what happens
after I finish it, and how does this become a company that earns money* — 46 files across seven
phases, on the model the maintainer named: an open-source client as the distribution mechanism, with
revenue from a subscription plus metered inference sold at a margin, the way Kilo Code and OpenCode
do it.

| Phase | Folder | Files | For |
|---|---|---|---|
| **B0** | `money_print/b0-preconditions/` | 6 | What must be legally true before anyone can pay you |
| **B1** | `money_print/b1-model-and-positioning/` | 7 | What is sold, to whom, at what price |
| **B2** | `money_print/b2-billing-engineering/` | 8 | The code: accounts, payments, entitlements, metering, proxy, quotas |
| **B3** | `money_print/b3-hosted-surface/` | 5 | What gets hosted — and therefore what you must keep running forever |
| **B4** | `money_print/b4-company-formation/` | 7 | Entity, banking, tax, terms, contributor agreement, compliance calendar |
| **B5** | `money_print/b5-go-to-market/` | 7 | First hundred users, funnel, pricing page, metrics |
| **B6** | `money_print/b6-scale/` | 5 | When to hire, the solo ceiling, and the kill criteria |

**The entry condition is hard, and it is stated in that README rather than implied.** money_print does
not begin until this roadmap can support a paying user: **M1** (a build gate that actually runs),
**M7** (sandboxing — you cannot sell unattended execution that has no guardrails), and **M2** (a
stranger can install the thing they paid for and verify it). Selling before those exist sells a
promise.

**Precondition zero is the license vacuum in §8 above.** The open-source half of this model does not
legally exist yet.

**One number owns the others.** `b1-model-and-positioning/06-unit-economics-model.md` is the canonical
assumptions table — margin, fixed overhead, break-even. Every other file inherits from it. Change it
there, never locally, or the phases quietly start describing different businesses.

---

## 13. Suggested next block

Not from the source documents — a reading of §2 and §6 together. Treat as a proposal, not a plan of record.

| Priority | Work | Rationale | Size |
|---|---|---|---|
| **P0** | Retarget `.github/workflows/ci.yml` at `kaioken_v2` | Operating rule 2 makes every other milestone conditional on this, and G-6 means there is currently **no gate at all** | Hours |
| **P1** | **M7 permissions & sandboxing**, promoted out of Q3 | The plan's own sequencing rule — sandboxing before unattended execution — is already violated: autonomy ships unguarded | Weeks |
| **P2** | **M4's retrieval eval harness** — ~30 questions about Kaioken's own codebase with known-correct answers | The plan says build it *first*, and it does not exist. Without it, no retrieval change can be shown to have helped | ~1 week |
| **P3** | Resolve **Q1** (one Studio fork) and **Q2** (version base) | Both are decisions, not builds, and both block M10/M12 sequencing | A sitting |
| **P4** | Studio v0.1 steps 1–2 | Step 1 is explicitly the assumption test; do not build panes before it passes | Weeks |

---

*Related: [KAIOKEN-THESIS.md](../kaioken_v2/KAIOKEN-THESIS.md) · `Kaioken — Build Reference` (Obsidian vault) · `Kaioken V2 — Command Test Checklist` (vault) · `Kaioken V2 — 57 Terminal Commands` (vault) · [Theia Research](../kaioken_v2/docs/theia-studio-research.md)*
