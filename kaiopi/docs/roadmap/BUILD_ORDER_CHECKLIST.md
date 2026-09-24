# Kaioken & Pi: Master Step-by-Step Build Order Checklist
## Ranked by Priority: Most Critical to Least Critical

> **Strategy**: This build order executes foundational truth and trust guarantees first, moves to code intelligence, developer safety gates, and cost control next, and concludes with presentation polish and terminal ergonomics.

---

### Step 1: Category 12 — VerifyCore, Grounding & Anti-Hallucination Shield
*Rank: #1 Critical Foundation | Package: `kaioken/verifycore` | Features: `#UX-1101` – `#UX-1200`*  
📄 **Plan Reference**: [`12-verifycore-grounding-anti-hallucination-shield.md`](categories/12-verifycore-grounding-anti-hallucination-shield.md)
- [x] **1.1** Implement O(1) pre-indexed basename lookup map for sub-millisecond file path resolution (`UX-1101`–`UX-1105`)
- [x] **1.2** Build quote anchor fuzzy matcher with AST scope boundary verification (`UX-1111`–`UX-1115`)
- [x] **1.3** Implement defect scoring algorithm calculating grounding confidence percentage (`UX-1116`–`UX-1120`)
- [x] **1.4** Deploy anti-hallucination shield flagging ungrounded claims in generated cards/docs (`UX-1121`–`UX-1125`)
- [x] **1.5** Implement mechanistic repair guidance prompt suggesting real symbol replacements (`UX-1126`–`UX-1130`)

---

### Step 2: Category 09 — Provenance, Staleness & Truth Drift Detection
*Rank: #2 High-ROI Truth Tracking | Package: `kaioken/provenance` | Features: `#UX-0801` – `#UX-0900`*  
📄 **Plan Reference**: [`09-provenance-staleness-truth-drift-detection.md`](categories/09-provenance-staleness-truth-drift-detection.md)
- [x] **2.1** Implement instant zero-token staleness check under 50ms via SHA256 source hashing (`UX-0801`–`UX-0810`)
- [x] **2.2** Deploy fine-grained symbol-level provenance binding to prevent false-alarm invalidation (`UX-0811`–`UX-0820`)
- [x] **2.3** Build visual freshness percentage dial calculation (`UX-0821`–`UX-0830`)
- [x] **2.4** Implement interactive drift inspector showing exact source diffs invalidating docs (`UX-0831`–`UX-0840`)
- [x] **2.5** Build selective regeneration queue running model inference only for stale chapters (`UX-0841`–`UX-0850`)

---

### Step 3: Category 11 — Verification Gates, Native Test Runners & Diagnostics
*Rank: #3 Developer Quality Enforcer | Package: `kaioken/verify` | Features: `#UX-1001` – `#UX-1100`*  
📄 **Plan Reference**: [`11-verification-gates-native-test-runners-diagnostics.md`](categories/11-verification-gates-native-test-runners-diagnostics.md)
- [x] **3.1** Build multi-runtime auto-detection engine for test commands (Vitest, Pytest, Go, Cargo) (`UX-1001`–`UX-1010`)
- [x] **3.2** Implement streaming test execution console displaying live stdout/stderr chunks (`UX-1011`–`UX-1020`)
- [x] **3.3** Deploy structured failure extractor parsing test file, line number, and assertion diffs (`UX-1021`–`UX-1030`)
- [x] **3.4** Build flaky test detector with non-deterministic rerun analysis and quarantine hints (`UX-1031`–`UX-1040`)
- [x] **3.5** Implement automated repair protocol feeding test failures back to model for fixes (`UX-1041`–`UX-1050`)
- [x] **3.6** Add custom verification configuration loader reading `.kaioken/verify.json` (`UX-1051`–`UX-1060`)

---

### Step 4: Category 10 — Impact Analysis & Blast Radius Prediction
*Rank: #4 Cascading Breakage Prevention | Package: `kaioken/impact` | Features: `#UX-0901` – `#UX-1000`*  
📄 **Plan Reference**: [`10-impact-analysis-blast-radius-prediction.md`](categories/10-impact-analysis-blast-radius-prediction.md)
- [x] **4.1** Implement transitive dependent tree calculator with circular dependency cycle guards (`UX-0901`–`UX-0910`)
- [x] **4.2** Build visual blast radius risk score gauge (0–100) assessing edits to shared symbols (`UX-0911`–`UX-0920`)
- [x] **4.3** Deploy pre-commit impact check gate blocking unannounced public API breaking changes (`UX-0921`–`UX-0930`)
- [x] **4.4** Implement safe-rename simulation report listing every file requiring callsite updates (`UX-0931`–`UX-0940`)
- [x] **4.5** Add Mermaid impact graph diagram exporter (`UX-0941`–`UX-0950`)

---

### Step 5: Category 07 — AST Symbol Indexing & Code Oracle
*Rank: #5 Code Intelligence Core | Package: `kaioken/index` | Features: `#UX-0601` – `#UX-0700`*  
📄 **Plan Reference**: [`07-ast-symbol-indexing-code-oracle.md`](categories/07-ast-symbol-indexing-code-oracle.md)
- [x] **5.1** Implement incremental AST delta indexing updating only modified files (`UX-0601`–`UX-0610`)
- [x] **5.2** Build Tree-sitter WASM parser pool recycling to eliminate heap churn (`UX-0611`–`UX-0620`)
- [x] **5.3** Deploy multi-hop re-export chain resolution engine across TypeScript/JS/Python/Go (`UX-0621`–`UX-0630`)
- [x] **5.4** Implement scope-aware symbol anchor definition preview cards with source context (`UX-0631`–`UX-0640`)

---

### Step 6: Category 19 — GitOps, Worktree Delegation & Safe Merges
*Rank: #6 Autonomous Agent Safety | Package: `kaioken/gitops` | Features: `#UX-1801` – `#UX-1900`*  
📄 **Plan Reference**: [`19-gitops-worktree-delegation-safe-merges.md`](categories/19-gitops-worktree-delegation-safe-merges.md)
- [x] **6.1** Build one-command isolated git worktree creator for scratch/agent task branches (`UX-1801`–`UX-1810`)
- [x] **6.2** Deploy fast-forward merge verification gate enforcing passing test runs before landing (`UX-1811`–`UX-1820`)
- [x] **6.3** Implement dirty working tree auto-stash guard preventing accidental file overwrites (`UX-1821`–`UX-1830`)
- [x] **6.4** Build visual merge conflict warning card and terminal 3-way diff view (`UX-1831`–`UX-1840`)
- [x] **6.5** Add interactive worktree cleanup wizard pruning stale scratch directories (`UX-1841`–`UX-1850`)

---

### Step 7: Category 08 — Search, Lexical Indexing & BM25 Retrieval
*Rank: #7 Instant Code Discovery | Package: `kaioken/search` | Features: `#UX-0701` – `#UX-0800`*  
📄 **Plan Reference**: [`08-search-lexical-indexing-bm25-retrieval.md`](categories/08-search-lexical-indexing-bm25-retrieval.md)
- [x] **7.1** Implement instant search-as-you-type live query preview across code, docs, and cards (`UX-0701`–`UX-0710`)
- [x] **7.2** Optimize in-memory inverted postings lists with BM25 ranking algorithm (`UX-0711`–`UX-0720`)
- [x] **7.3** Add exact phrase quote matching and directory/file-path boosting (`UX-0721`–`UX-0730`)
- [x] **7.4** Build Reciprocal Rank Fusion (RRF) score visualizer explaining result ranking (`UX-0731`–`UX-0740`)

---

### Step 8: Category 06 — Repo Scan, File Discovery & Risk Shield
*Rank: #8 Security & Source Hygiene | Package: `kaioken/scan` | Features: `#UX-0501` – `#UX-0600`*  
📄 **Plan Reference**: [`06-repo-scan-file-discovery-risk-shield.md`](categories/06-repo-scan-file-discovery-risk-shield.md)
- [x] **8.1** Implement zero-allocation streaming fast-path file scanner (`UX-0501`–`UX-0510`)
- [x] **8.2** Build secret-scanning quarantine wizard (API keys, GitHub tokens, AWS certs) (`UX-0511`–`UX-0520`)
- [x] **8.3** Deploy high-entropy string detector with Shannon entropy visualization (`UX-0521`–`UX-0530`)
- [x] **8.4** Implement sliding-window chunk analyzer eliminating boundary split misses (`UX-0531`–`UX-0540`)

---

### Step 9: Category 05 — Spend Transparency, Token Budgeting & Cost Control
*Rank: #9 Financial Governance | Package: `kaioken/modelport` | Features: `#UX-0401` – `#UX-0500`*  
📄 **Plan Reference**: [`05-spend-transparency-token-budgeting-cost-control.md`](categories/05-spend-transparency-token-budgeting-cost-control.md)
- [x] **9.1** Implement pre-flight token estimation calculation before model dispatches (`UX-0401`–`UX-0410`)
- [x] **9.2** Deploy interactive spend multiplier dial (×1 to ×10) on confirmation prompt (`UX-0411`–`UX-0420`)
- [x] **9.3** Build transparent per-model pricing breakdown cards with prompt/completion rates (`UX-0421`–`UX-0430`)
- [x] **9.4** Implement session hard budget ceiling preventing runaway prompt loops (`UX-0431`–`UX-0440`)
- [x] **9.5** Add zero-cost offline mode badge when inference is entirely bypassed (`UX-0441`–`UX-0450`)

---

### Step 10: Category 13 — Module Planning & Architecture Decomposition
*Rank: #10 System Structure Planning | Package: `kaioken/plan` | Features: `#UX-1201` – `#UX-1300`*  
📄 **Plan Reference**: [`13-module-planning-architecture-decomposition.md`](categories/13-module-planning-architecture-decomposition.md)
- [x] **10.1** Deploy deterministic heuristic directory clustering fallback (`UX-1201`–`UX-1210`)
- [x] **10.2** Implement self-repair JSON parser recovering from malformed replies (`UX-1211`–`UX-1220`)
- [x] **10.3** Build human-editable YAML module checkpoint validator (`UX-1221`–`UX-1230`)
- [x] **10.4** Add unassigned file coverage indicator tracking omitted repository files (`UX-1231`–`UX-1240`)
- [x] **10.5** Build interactive terminal card-sorting UI for reorganizing module boundaries (`UX-1241`–`UX-1250`)

---

### Step 11: Category 14 — Knowledge Cards & Atomic Fact Base
*Rank: #11 Verified Fact Capture | Package: `kaioken/plan/src/cards.ts` | Features: `#UX-1301` – `#UX-1400`*  
📄 **Plan Reference**: [`14-knowledge-cards-atomic-fact-base.md`](categories/14-knowledge-cards-atomic-fact-base.md)
- [x] **11.1** Generate structured atomic knowledge cards citing verified symbols and lines (`UX-1301`–`UX-1310`)
- [x] **11.2** Build incremental card updater regenerating only cards citing modified symbols (`UX-1311`–`UX-1320`)
- [x] **11.3** Add visual card verification status badges (Grounded / Defects) (`UX-1321`–`UX-1330`)
- [x] **11.4** Deploy duplicate card deduplication engine merging overlapping fact sheets (`UX-1331`–`UX-1340`)
- [x] **11.5** Build export bridge converting cards to Markdown and Obsidian frontmatter (`UX-1341`–`UX-1350`)

---

### Step 12: Category 15 — Wiki Cascade, Chapter Generation & Documentation Web
*Rank: #12 Comprehensive Living Docs | Package: `kaioken/wiki` | Features: `#UX-1401` – `#UX-1500`*  
📄 **Plan Reference**: [`15-wiki-cascade-chapter-generation-documentation-web.md`](categories/15-wiki-cascade-chapter-generation-documentation-web.md)
- [x] **12.1** Build resumable cascade runner skipping already-verified chapters on retry (`UX-1401`–`UX-1410`)
- [x] **12.2** Implement real-time token streaming typewriter effect for chapter text (`UX-1411`–`UX-1420`)
- [x] **12.3** Deploy cross-chapter relative markdown link validator catching 404 dead links (`UX-1421`–`UX-1430`)
- [x] **12.4** Build repository documentation coverage heatmap (`UX-1431`–`UX-1440`)
- [x] **12.5** Implement hierarchical evidence budgeting preventing context window overflow (`UX-1441`–`UX-1450`)

---

### Step 13: Category 18 — Agent Skills, Autonomous Procedures & SkillGen
*Rank: #13 Agent Autonomy Procedures | Package: `kaioken/skills` / `skillgen` | Features: `#UX-1701` – `#UX-1800`*  
📄 **Plan Reference**: [`18-agent-skills-autonomous-procedures-skillgen.md`](categories/18-agent-skills-autonomous-procedures-skillgen.md)
- [x] **13.1** Build automated skill discovery from `package.json` scripts and `Makefiles` (`UX-1701`–`UX-1710`)
- [x] **13.2** Implement YAML frontmatter schema validator for skill parameters and triggers (`UX-1711`–`UX-1720`)
- [x] **13.3** Deploy adversarial critique repair loop eliminating ungrounded skill steps (`UX-1721`–`UX-1730`)
- [x] **13.4** Build step-through procedure execution debugger (`UX-1731`–`UX-1740`)
- [x] **13.5** Add multi-root skill loader scanning both `.agents` and `.pi` directories (`UX-1741`–`UX-1750`)

---

### Step 14: Category 20 — Root CLI Parity, CI Automation & Evals Suite
*Rank: #14 Headless Toolchain & CI | Package: `kaioken/bin.ts` / `evals` | Features: `#UX-1901` – `#UX-2000`*  
📄 **Plan Reference**: [`20-root-cli-parity-ci-automation-evals-suite.md`](categories/20-root-cli-parity-ci-automation-evals-suite.md)
- [ ] **14.1** Ensure full 16-subcommand CLI parity matching all Pi slash commands (`UX-1901`–`UX-1910`)
- [ ] **14.2** Add shell auto-completion scripts for Bash, Zsh, and Fish (`UX-1911`–`UX-1920`)
- [ ] **14.3** Deploy multi-language fixture probe suites (TS, Py, Go, Rust, Java) (`UX-1921`–`UX-1930`)
- [ ] **14.4** Build CI offline-integrity and barrel export verification scripts (`UX-1931`–`UX-1940`)
- [ ] **14.5** Implement automated eval regression scorecards and confidence ratings (`UX-1941`–`UX-1950`)

---

### Step 15: Category 17 — Grounded Web Research & Intelligence Gatherer
*Rank: #15 External Context & Verification | Package: `kaioken/research` | Features: `#UX-1601` – `#UX-1700`*  
📄 **Plan Reference**: [`17-grounded-web-research-intelligence-gatherer.md`](categories/17-grounded-web-research-intelligence-gatherer.md)
- [ ] **15.1** Deploy SSRF and DNS-rebinding guard blocking private IP connections (`UX-1601`–`UX-1610`)
- [ ] **15.2** Build bounded-concurrency parallel HTTP page fetcher (`UX-1611`–`UX-1620`)
- [ ] **15.3** Implement HTML-to-text sanitization parser stripping script payloads (`UX-1621`–`UX-1630`)
- [ ] **15.4** Add web source domain authority and credibility scoring (`UX-1631`–`UX-1640`)
- [ ] **15.5** Deploy configurable research depth multiplier dial (×1 to ×10) (`UX-1641`–`UX-1650`)

---

### Step 16: Category 16 — Serve Preview, Web UI & Interactive Knowledge Graph
*Rank: #16 Web Visualization | Package: `kaioken/serve` | Features: `#UX-1501` – `#UX-1600`*  
📄 **Plan Reference**: [`16-serve-preview-web-ui-interactive-knowledge-graph.md`](categories/16-serve-preview-web-ui-interactive-knowledge-graph.md)
- [ ] **16.1** Build offline localhost HTTP preview server bound to loopback only (`UX-1501`–`UX-1510`)
- [ ] **16.2** Deploy Server-Sent Events (SSE) live-reload watcher on file modifications (`UX-1511`–`UX-1520`)
- [ ] **16.3** Embed interactive 2D/3D force-directed Cytoscape dependency graph (`UX-1521`–`UX-1530`)
- [ ] **16.4** Add instant client-side JSON search endpoint (`/api/search`) (`UX-1531`–`UX-1540`)
- [ ] **16.5** Implement print-optimized PDF export stylesheet (`UX-1541`–`UX-1550`)

---

### Step 17: Category 02 — Chat Transcript & Interactive Output Stream
*Rank: #17 Transcript Ergonomics | Package: `.pi/extensions/kaioken/commands` | Features: `#UX-0101` – `#UX-0200`*  
📄 **Plan Reference**: [`02-chat-transcript-interactive-output-stream.md`](categories/02-chat-transcript-interactive-output-stream.md)
- [ ] **17.1** Implement in-place live-updating progress cards with sub-phase spinners (`UX-0101`–`UX-0110`)
- [ ] **17.2** Build syntax-highlighted unified diff blocks with collapsible folds (`UX-0111`–`UX-0120`)
- [ ] **17.3** Add one-click copy-to-clipboard code snippet action (`UX-0121`–`UX-0130`)
- [ ] **17.4** Implement auto-scrolling lock-to-bottom toggle with wheel pause (`UX-0131`–`UX-0140`)
- [ ] **17.5** Build interactive milestone breadcrumb trails (`UX-0141`–`UX-0150`)

---

### Step 18: Category 01 — Terminal UI (TUI) & Visual Aesthetics
*Rank: #18 Visual Presentation | Package: `.pi/extensions/kaioken/ui` | Features: `#UX-0001` – `#UX-0100`*  
📄 **Plan Reference**: [`01-terminal-ui-tui-visual-aesthetics.md`](categories/01-terminal-ui-tui-visual-aesthetics.md)
- [ ] **18.1** Deploy adaptive 24-bit TrueColor gradient header treatment (`UX-0001`–`UX-0010`)
- [ ] **18.2** Build dynamic Unicode glyph fallback system for basic terminals (`UX-0011`–`UX-0020`)
- [ ] **18.3** Implement anti-flicker double-buffering terminal render pass (`UX-0021`–`UX-0030`)
- [ ] **18.4** Add terminal window resize auto-reflow and buffer recycling (`UX-0031`–`UX-0040`)
- [ ] **18.5** Implement high-contrast WCAG AAA theme and retro CRT amber mode (`UX-0041`–`UX-0050`)

---

### Step 19: Category 03 — HUD, Status Bar & Dynamic Widgets
*Rank: #19 Passive Telemetry Readouts | Package: `.pi/extensions/kaioken/ui/header.ts` | Features: `#UX-0201` – `#UX-0300`*  
📄 **Plan Reference**: [`03-hud-status-bar-dynamic-widgets.md`](categories/03-hud-status-bar-dynamic-widgets.md)
- [ ] **19.1** Build real-time telemetry sparkline for token spend velocity (`UX-0201`–`UX-0210`)
- [ ] **19.2** Implement live repository freshness ratio badge (`UX-0211`–`UX-0220`)
- [ ] **19.3** Deploy active git worktree dirty status indicator pill (`UX-0221`–`UX-0230`)
- [ ] **19.4** Add floating hover tooltip explaining status metrics (`UX-0231`–`UX-0240`)
- [ ] **19.5** Implement zero-allocation polling loop with microsecond overhead (`UX-0241`–`UX-0250`)

---

### Step 20: Category 04 — Keyboard Navigation, Shortcuts & Command Palette
*Rank: #20 Keyboard Efficiency | Package: `packages/tui` | Features: `#UX-0301` – `#UX-0400`*  
📄 **Plan Reference**: [`04-keyboard-navigation-shortcuts-command-palette.md`](categories/04-keyboard-navigation-shortcuts-command-palette.md)
- [ ] **20.1** Implement Vim-style navigation hotkeys (`j`/`k`, `g`/`G`) across lists (`UX-0301`–`UX-0310`)
- [ ] **20.2** Build fuzzy search quick selector command palette (`UX-0311`–`UX-0320`)
- [ ] **20.3** Add global hotkey shortcuts to toggle HUD and drawer panes (`UX-0321`–`UX-0330`)
- [ ] **20.4** Deploy contextual quick-action menu (`Alt+Enter`) on symbols and cards (`UX-0331`–`UX-0340`)
- [ ] **20.5** Build visual keyboard cheat-sheet overlay displaying shortcuts (`UX-0341`–`UX-0350`)
