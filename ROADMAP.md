# Kaioken — 12-Month Roadmap (Aug 2026 → Jul 2027)

**Starting point:** v1.3.1. Single Go binary (~40 internal packages), Tauri desktop shell over a Go daemon sidecar, marketing site, extension registry + registry-web, MCP server mode.
**Ending point:** v2.0 — a tool other people install, trust, and extend.
**Method:** solo vibe coding. Every milestone below is sized for that, and the guardrails are part of the plan, not an afterthought.

---

## The honest read on where this project is

Breadth is not the problem. Kaioken already has more surface area than most funded tools: wiki engine, skills, research, impact analysis, hub, watch, verify, pack, publish, extensions, MCP, desktop, terminal, browser, graph.

The problem is **depth and trust**. A lot of routes exist but aren't fully wired ([project_status.md](project_status.md) says as much). There's no proof the whole thing builds clean on three OSes. Distribution is a folder of exe files. Nobody but you has run it end to end.

So the year is sequenced: **harden → deepen → automate → reach**. Features that add breadth are deliberately pushed late. Adding a twelfth half-wired subsystem in month two is the single most likely way this project dies.

---

## Operating rules for the year (read these before the milestones)

These matter more than the feature list. Vibe coding at this scale fails in specific, predictable ways.

**1. The bottleneck is review, not generation.**
An agent can write 2,000 lines an hour. You cannot review 2,000 lines an hour. Plan around your review capacity: roughly **one substantial feature per week**, three per month, and the fourth week is integration and cleanup. Every milestone below is scoped to that, and it is why they look small relative to what an agent could theoretically produce.

**2. Green build is a precondition, not a milestone.**
From M1 onward, `go test ./...` + `tsc -b` + `cargo clippy -- -D warnings` pass before any session ends. An agent that starts a task on a red build will "fix" things that were never broken. If the build is red, the only allowed task is making it green.

**3. One package per session.**
Give an agent `internal/wiki` or `desktop/src/routes/Chat.tsx` — not "the wiki system." Cross-package changes get a written plan first, then one session per package, with tests green between them. This is the difference between a refactor and a rewrite you didn't ask for.

**4. Characterization tests before every refactor.**
Especially the tree-sitter swap (M5) and the daemon work (M7). Capture current output as golden files first. Then the agent has a definition of "didn't break anything" that doesn't depend on your memory.

**5. Dogfood aggressively.**
Run `/wiki` and `/skills` on Kaioken itself, every month, and commit the output. Your skills files are what make vibe coding on a 367-file Go repo tractable — they're the context an agent needs and can't derive. This is also your best quality signal: when Kaioken's docs of Kaioken get worse, the engine regressed.

**6. Release train every two weeks.**
Tag something every other Friday, even if it's small. Scope discipline comes from the calendar, not from willpower. Versions below are targets, not requirements.

**7. Build-then-swap, always.**
`kaioken.exe` is locked while running. Build to a temp name and swap. Keep the last known-good binary tagged so you always have a working Kaioken to build the next Kaioken with.

---

## Q1 · Aug–Oct 2026 — Harden & Ship
*Theme: make what already exists trustworthy. Zero new subsystems.*

### M1 · August — Green everywhere → **v1.4**

The foundation for everything after it. Nothing here is glamorous and all of it is load-bearing.

| Ship | Notes |
|---|---|
| CI matrix on Windows/macOS/Linux | `.github/workflows/ci.yml` exists — make it actually gate: Go tests, `golangci-lint`, `tsc -b`, `cargo clippy -- -D warnings`, desktop build |
| Fix the two known flaky tests | They flake locally and mask real regressions — either fix or quarantine with a written reason |
| Zero `any` in `desktop/src` | Type errors are where half the desktop's "scaffolded not wired" bugs are hiding |
| Contract-version guard | Desktop blocks with a clear message when sidecar `ContractVersion` mismatches (currently v4, partially wired in `main.tsx`) |
| Land the in-flight work | Finish and merge the aside channel (`internal/agent/aside.go`) and the selfupdate verification (`internal/selfupdate/verify.go`) rather than carrying them |

**Done when:** a fresh clone on a machine that isn't yours builds and passes on all three OSes, from CI, with no manual steps.

**Vibe-coding note:** this month is mostly agent-friendly — lint and type errors are unambiguous, self-verifying tasks. Run them in batches, one package at a time, and let the compiler be the reviewer.

---

### M2 · September — Trusted distribution → **v1.5**

Right now installing Kaioken means trusting a binary from a folder. That's fine for you and disqualifying for everyone else.

| Ship | Notes |
|---|---|
| goreleaser + cosign keyless signing | The `verify.go` work already assumes this pipeline — finish it: `checksums.txt` + `.sig` + `.pem`, Fulcio identity pinned to the repo |
| `kaioken selfupdate` end to end | Verify → download → swap → rollback on failure. This is the highest-trust code in the project; give it real tests including a tampered-checksum case |
| Installers | NSIS (Windows), `.dmg` (macOS), `.deb` + AppImage (Linux) |
| Tauri auto-updater | App + sidecar update together, or refuse to update |
| Package managers | Scoop + winget manifests first (your platform), Homebrew tap second |
| Rekor inclusion proof | Currently skipped, and `verify.go` says so honestly. Close it or document permanently why not |

**Done when:** you can send someone a URL, they install it, and the binary verifies its own provenance.

---

### M3 · October — Desktop depth pass → **v1.6**

No new screens. Every screen that exists becomes fully functional.

| Ship | Notes |
|---|---|
| Structured per-hunk diff approval | The single reason the desktop exists over the TUI. Side-by-side, syntax highlighted, accept/reject per hunk |
| Always-visible cost meter | Status bar shows cumulative session spend — replaces `/cost`, and it's a real differentiator |
| Quit-with-active-runs guard | Losing a wiki run on window close destroys trust permanently |
| Workspace dashboard | Landing view after opening a workspace: git status, stale wiki, recent sessions, active runs — instead of "No files open" |
| Empty states + error copy for every `ApiError.code` | Every failure maps to a human sentence and a next action |
| Wiki plan/brief editors, skills viewer, multiplier dial + estimate card | The spec'd editors from PLAN.md that never got wired |
| Stale-wiki banner with one-click update | |

**Done when:** you can walk every route in the app and nothing is a dead end.

**Vibe-coding note:** do this as an audit, route by route, one session each. Open the screen, list what's broken, fix that list, screenshot the result. Ten focused sessions beat one "improve the desktop app" session every time.

---

## Q2 · Nov 2026–Jan 2027 — Depth where it differentiates
*Theme: the knowledge engine is the moat. Make its output measurably better.*

### M4 · November — Retrieval that earns its keep → **v1.7**

| Ship | Notes |
|---|---|
| Unified `search` tool with modes | `substring | regex (RE2) | symbol | semantic` behind one tool, so the agent picks the right one instead of you having six tools |
| Symbol lookup off the codemap index | O(1) declaration lookup instead of full-text scan |
| RAG over the wiki | Auto-retrieve relevant chapters into chat context with citation links back to the source doc |
| Fuzzy file finder | Saves multi-round-trip `list_files` chains |
| Retrieval eval harness | ~30 hand-written questions about Kaioken's own codebase with known-correct answers. **Build this first.** Without it you cannot tell whether RAG helped or hurt |

**Done when:** the eval harness shows a measurable improvement, and you have the number written down.

---

### M5 · December — Tree-sitter codemap → **v1.8**

The highest-leverage quality work in the year. Every downstream output — wiki, cards, skills, impact, verification — is only as good as the code index underneath it. Today that's `go/ast` for Go and signature regexes for everything else.

| Ship | Notes |
|---|---|
| Tree-sitter grammars replacing regex parsers | Start with TS/JS/TSX and Python — your own repo uses both, so you can eval immediately |
| Accurate symbol extraction | Interfaces, type aliases, React components, decorators, type hints, export maps |
| Framework detection expansion | Next.js, Django, Rails, Spring on top of the existing extractors |
| Golden-file characterization tests | **Non-negotiable.** Snapshot current codemap output for a fixture repo before touching anything |

**Done when:** codemap output for a polyglot fixture repo is strictly better than the regex version, proven by diff against goldens.

**Vibe-coding note:** this is the riskiest refactor of the year — a swap of the layer everything else stands on. Goldens first, one language at a time, and keep the regex parsers as a fallback path behind a config flag until the new ones have run for a month.

---

### M6 · January — Incrementality everywhere → **v1.9**

| Ship | Notes |
|---|---|
| Diff-driven card updates | README lists this as not built — `update` covers the wiki but cards still rebuild wholesale |
| Versioned wiki snapshots | Git-trackable generations so doc evolution is diffable |
| Export targets | `--export claude-md`, `--export agents-md`, `--export cursor`, `--export qoder` — meets people where their agent already is, and it's cheap |
| Custom card schemas | User-defined templates beyond the fixed five files |

**Done when:** a one-file change triggers a run measured in seconds and single-digit API calls, for cards as well as wiki.

---

## Q3 · Feb–Apr 2027 — Autonomy, safely
*Theme: the Hermes concept from [IDEA.md](IDEA.md), built in the order that doesn't produce a runaway agent.*

> **Sequencing matters here.** Sandboxing ships *before* unattended execution, not after. An autonomous background agent with unrestricted tool access on your repo is a bad afternoon waiting to happen.

### M7 · February — Permissions & sandboxing → **v1.10**

| Ship | Notes |
|---|---|
| Git worktree isolation for autonomous runs | Agent works in a throwaway worktree; you merge deliberately |
| Tool permission policy | Per-tool, per-mode allow/deny/ask, declared in config rather than hardcoded in the approval gate |
| Command allowlist/denylist for `run_command` | Pattern-based, with the deny list winning |
| Resource ceilings | Max turns, max spend, max wall-clock per autonomous run — hard stops, not prompts asking nicely |
| Audit log | Every tool call an unattended run made, replayable after the fact |

**Done when:** you can hand an autonomous run a task, walk away, and the worst case is a wasted worktree.

---

### M8 · March — Background workers → **v1.11**

Now the Hermes idea becomes safe to build.

| Ship | Notes |
|---|---|
| Daemon-hosted long-running tasks | Refactors, security audits, test-fix loops running async against the daemon |
| Per-turn reflection gate | Evaluate tool signals after each turn (error recovery, user corrections, repeated edits) instead of only at session end |
| Skill patching, not clobbering | Update existing `.kaioken/skills/` entries surgically; new skills marked `origin: learned` |
| Desktop subagent monitor | Live subagent state, intermediate reasoning, streaming logs |
| OS notifications on completion | |

**Done when:** you can queue a refactor before bed and review a worktree diff in the morning.

---

### M9 · April — Local-model path → **v1.12**

The biggest adoption lever in the roadmap. "Free to run" removes the largest barrier to anyone trying this, and it directly serves the open-weights direction in IDEA.md.

| Ship | Notes |
|---|---|
| Tool-call formatters for open models | Hermes-style templates for vLLM / Ollama / llama.cpp |
| Structured-output fallback | JSON/XML tool-call recovery when small models produce malformed calls — this is what actually breaks on local models |
| Per-operation model routing, extended | Cheap local model for plan/scan/compact, strong remote model for generation. The routing infra already exists — extend it to a local/remote split |
| A "runs fully offline" documented profile | Named config: which models, which multiplier, what to expect |

**Done when:** `kaioken wiki x2` completes on a mid-size repo, entirely local, and the output is usable.

---

## Q4 · May–Jul 2027 — Reach
*Theme: people who are not you.*

### M10 · May — IDE extension → **v1.13**

| Ship | Notes |
|---|---|
| VS Code extension over the daemon | Chat panel, inline diff approval, knowledge lookup. The daemon + contract version already make this a thin client |
| Knowledge on hover | Hover a symbol, get the wiki section that documents it — the demo that sells the whole project |
| JetBrains | Only if VS Code lands early. Do not split focus |

---

### M11 · June — Team & CI surface → **v1.14**

| Ship | Notes |
|---|---|
| GitHub Action, published to the marketplace | Run `kaioken wiki` on merge, publish docs, comment freshness on PRs |
| PR-triggered incremental update | Webhook → `wiki.Update` scoped to the PR diff |
| PR review bot | `internal/review` already exists — wire it to a webhook and post inline comments |
| Team steering notes | Version-controlled `/notes` in the repo so a team shares one set of instructions |

---

### M12 · July — Ecosystem GA & v2.0 → **v2.0**

| Ship | Notes |
|---|---|
| Registry launch | `registry-web` live, submission flow open, moderation policy published |
| Extension SDK v1 | Frozen `extension.yaml` schema, versioned, with a compatibility promise |
| Docs consolidation | One docs home. Right now README, website docs, registry-web content, and `docs/` all overlap |
| Performance pass | Wiki run wall-clock and token cost on a large repo, measured against the v1.3.1 baseline |
| **License decision** | See below |

---

## The decision you have to make before v2.0

Kaioken is under **License Zero Noncommercial Public License 2.0.1**. That is a real constraint on the Q4 milestones, and it needs a deliberate answer well before July:

- Companies cannot use it, which caps adoption exactly where a codebase-knowledge tool is most valuable.
- A paid tier is not possible under the current license without relicensing — and relicensing gets harder with every outside contributor who lands a PR.
- The GitHub Action and IDE extension in Q4 mostly land in commercial contexts, so they'll hit this wall directly.

Three coherent paths: stay noncommercial and treat this as a portfolio/research project; dual-license (noncommercial free, commercial paid); or move to a permissive license and monetize hosting/registry instead. All three are defensible. Drifting into Q4 without choosing is not — decide by **March 2027**, while the contributor list is still short.

---

## What is deliberately *not* on this roadmap

Named so you can recognize the temptation when it arrives:

- **Shared sessions / pair programming / role-based permissions** — real multi-user is a distributed-systems project, not a feature. Not until there are users.
- **Slack/Discord bots** — cheap to build, near-zero payoff before adoption exists.
- **Complexity metrics, dead-code detection, tech-debt heatmaps** — nice analysis surface, but they compete with the knowledge engine for your attention and lose.
- **Web IDE companion** — the desktop app already is this. Two clients is one too many for a solo maintainer.
- **Wiki WYSIWYG editor** — the wiki is generated. Hand-editing it fights incrementality.
- **40-language tree-sitter support** — M5 does the languages you actually use. The rest is a long tail with a long-tail payoff.

---

## Quarterly checkpoints

At the end of each quarter, answer these in writing and adjust the next quarter:

1. Does a fresh clone build green on all three OSes, today?
2. How many people other than you ran Kaioken this quarter?
3. Did the knowledge engine's output on Kaioken itself get better or worse? (You have the dogfooded docs — compare them.)
4. What shipped that nobody needed?
5. What is still half-wired from a previous quarter? **Fix it before starting new work.**

Question 5 is the one that decides whether this is a v2.0 or another abandoned 40-package repo.
