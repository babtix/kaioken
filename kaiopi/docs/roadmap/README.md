# Kaioken & Pi: 2,000 UX & Quality Improvements Roadmap

> **Master Architecture Directory**: This directory contains the complete architectural roadmap of **2,000 concrete, actionable UX and quality improvements** across all layers of the Kaioken truth layer and Pi agentic ecosystem.

Each category is available as a dedicated document with its own **Global Implementation Plan**, 3-phase execution milestones, architectural invariants, testing checklists, and 100 concrete features.

A unified master document containing all 2,000 features is also available:
- **[Unified Master Catalog (2,000 Features)](features-2000-ux-quality-roadmap.md)** (12,199 lines, 1.81 MB)

---

## The 20 Architectural Category Plans

| # | Domain & Plan Document | Feature Range | Primary Subsystems | Core Focus |
| :-: | :--- | :-: | :--- | :--- |
| **01** | **[Terminal UI (TUI) & Visual Aesthetics](categories/01-terminal-ui-tui-visual-aesthetics.md)** | `#UX-0001` – `#UX-0100` | `.pi/extensions/kaioken/ui`, `packages/tui` | 24-bit TrueColor styling, anti-flicker double buffering, CRT/WCAG themes |
| **02** | **[Chat Transcript & Output Stream](categories/02-chat-transcript-interactive-output-stream.md)** | `#UX-0101` – `#UX-0200` | `.pi/extensions/kaioken/commands`, `packages/coding-agent` | Live progress cards, collapsible accordions, unified diff blocks |
| **03** | **[HUD, Status Bar & Dynamic Widgets](categories/03-hud-status-bar-dynamic-widgets.md)** | `#UX-0201` – `#UX-0300` | `.pi/extensions/kaioken/ui/header.ts`, `commands` | Real-time telemetry sparklines, token spend velocity, dirty worktrees |
| **04** | **[Keyboard Navigation & Shortcuts](categories/04-keyboard-navigation-shortcuts-command-palette.md)** | `#UX-0301` – `#UX-0400` | `packages/tui`, `packages/coding-agent` | Vim hotkeys (j/k), fuzzy command palette, custom JSON keymaps |
| **05** | **[Spend Transparency & Token Budgeting](categories/05-spend-transparency-token-budgeting-cost-control.md)** | `#UX-0401` – `#UX-0500` | `kaioken/modelport`, `commands` | Multiplier dials (×1 to ×10), pre-flight token estimates, budget hard ceilings |
| **06** | **[Repo Scan, Discovery & Risk Shield](categories/06-repo-scan-file-discovery-risk-shield.md)** | `#UX-0501` – `#UX-0600` | `kaioken/scan` | Sub-second file traversal, Shannon entropy secret detection, ignore rules |
| **07** | **[AST Symbol Indexing & Code Oracle](categories/07-ast-symbol-indexing-code-oracle.md)** | `#UX-0601` – `#UX-0700` | `kaioken/index` | Tree-sitter WASM grammars, multi-hop re-export resolution, delta indexer |
| **08** | **[Search, Lexical Indexing & BM25](categories/08-search-lexical-indexing-bm25-retrieval.md)** | `#UX-0701` – `#UX-0800` | `kaioken/search` | Search-as-you-type, BM25 scoring, Reciprocal Rank Fusion, boolean filters |
| **09** | **[Provenance, Staleness & Truth Drift](categories/09-provenance-staleness-truth-drift-detection.md)** | `#UX-0801` – `#UX-0900` | `kaioken/provenance` | SHA256 source hashing, symbol provenance bindings, freshness dials |
| **10** | **[Impact Analysis & Blast Radius](categories/10-impact-analysis-blast-radius-prediction.md)** | `#UX-0901` – `#UX-1000` | `kaioken/impact` | Transitive dependent sweeping, risk score gauges (0-100), safe-rename checks |
| **11** | **[Verification Gates & Test Runners](categories/11-verification-gates-native-test-runners-diagnostics.md)** | `#UX-1001` – `#UX-1100` | `kaioken/verify` | Multi-runtime test runners (Node, Python, Go, Rust), repair loops, stack demanglers |
| **12** | **[VerifyCore & Anti-Hallucination Shield](categories/12-verifycore-grounding-anti-hallucination-shield.md)** | `#UX-1101` – `#UX-1200` | `kaioken/verifycore` | O(1) basename verification, quote anchor matching, boilerplate rejection |
| **13** | **[Module Planning & Decomposition](categories/13-module-planning-architecture-decomposition.md)** | `#UX-1201` – `#UX-1300` | `kaioken/plan` | Directory clustering, self-repair JSON parsers, YAML checkpoints |
| **14** | **[Knowledge Cards & Atomic Fact Base](categories/14-knowledge-cards-atomic-fact-base.md)** | `#UX-1301` – `#UX-1400` | `kaioken/plan/src/cards.ts` | 3D terminal card viewers, incremental updates, Markdown/Obsidian export |
| **15** | **[Wiki Cascade & Documentation Web](categories/15-wiki-cascade-chapter-generation-documentation-web.md)** | `#UX-1401` – `#UX-1500` | `kaioken/wiki` | Streaming typewriter chapter generation, interactive TOC trees, link auditing |
| **16** | **[Serve Preview & Interactive Graph](categories/16-serve-preview-web-ui-interactive-knowledge-graph.md)** | `#UX-1501` – `#UX-1600` | `kaioken/serve` | Offline localhost server, SSE live-reload, 2D/3D force-directed Cytoscape graphs |
| **17** | **[Grounded Web Research & Intelligence](categories/17-grounded-web-research-intelligence-gatherer.md)** | `#UX-1601` – `#UX-1700` | `kaioken/research` | Bounded parallel fetching, SSRF/DNS-rebinding protection, source credibility |
| **18** | **[Agent Skills & SkillGen Procedures](categories/18-agent-skills-autonomous-procedures-skillgen.md)** | `#UX-1701` – `#UX-1800` | `kaioken/skills`, `skillgen` | Procedure synthesis from Makefiles/package.json, step-through debugger |
| **19** | **[GitOps, Worktrees & Safe Merges](categories/19-gitops-worktree-delegation-safe-merges.md)** | `#UX-1801` – `#UX-1900` | `kaioken/gitops` | Isolated scratch worktrees, fast-forward verification gates, merge conflict HUDs |
| **20** | **[Root CLI Parity & Evals Suite](categories/20-root-cli-parity-ci-automation-evals-suite.md)** | `#UX-1901` – `#UX-2000` | `kaioken/bin.ts`, `kaioken/evals` | 16-subcommand CLI parity, shell completions, multi-language fixture probe suites |
