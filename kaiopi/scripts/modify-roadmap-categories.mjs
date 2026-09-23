import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dir = "docs/roadmap/categories";
const files = readdirSync(dir).filter(f => f.endsWith(".md")).sort();

const CATEGORY_PLANS = {
	1: {
		strategicObjective: "Establish a visually stunning, responsive, and flicker-free terminal interface for Kaioken with 24-bit TrueColor support, dynamic glyph fallbacks, and micro-animations.",
		phase1: "Implement immediate header rendering, error boundaries on terminal frames, and basic TrueColor theme support (Features UX-0001 to UX-0030).",
		phase2: "Deploy smooth micro-animation frame interpolation, terminal resize auto-reflow, and double-buffering render passes (Features UX-0031 to UX-0070).",
		phase3: "Integrate WCAG AAA accessibility themes, retro CRT phosphor styling, and zero-allocation memory pooling for low-power terminals (Features UX-0071 to UX-0100).",
		subsystems: [".pi/extensions/kaioken/ui", "packages/tui"],
		testPlan: "npx vitest run .pi/extensions/kaioken/test/ui.test.ts"
	},
	2: {
		strategicObjective: "Transform the chat transcript into an interactive, high-density command center with live streaming cards, diff folding, and one-click actions.",
		phase1: "Deliver live-updating in-place progress cards, collapsible accordions, and syntax-highlighted unified diffs (Features UX-0101 to UX-0130).",
		phase2: "Add search/highlight within history, copy-to-clipboard buttons, and density toggles (compact vs expanded) (Features UX-0131 to UX-0170).",
		phase3: "Implement auto-scrolling pause on manual wheel movement, rich markdown callouts, and message bookmarking (Features UX-0171 to UX-0200).",
		subsystems: [".pi/extensions/kaioken/commands", "packages/coding-agent"],
		testPlan: "npx vitest run .pi/extensions/kaioken/test/commands.test.ts"
	},
	3: {
		strategicObjective: "Provide instant operational awareness via a non-intrusive, zero-allocation HUD displaying real-time telemetry, token spend velocity, and repository health.",
		phase1: "Implement core status bar pills for model context window utilization and token burn rates (Features UX-0201 to UX-0230).",
		phase2: "Add miniaturized sparklines, dirty worktree indicators, and background task progress meters (Features UX-0231 to UX-0270).",
		phase3: "Deploy interactive hover tooltips, dual-repo comparison views, and lightweight zero-allocation polling loops (Features UX-0271 to UX-0300).",
		subsystems: [".pi/extensions/kaioken/ui/header.ts", ".pi/extensions/kaioken/commands"],
		testPlan: "npx vitest run .pi/extensions/kaioken/test/layout.test.ts"
	},
	4: {
		strategicObjective: "Enable complete, lightning-fast hands-on-the-keyboard control with Vim-style keybindings, fuzzy command palettes, and custom JSON keymaps.",
		phase1: "Add global shortcut triggers, Vim navigation keys (j/k, g/G), and Escape key dismissals across all modals (Features UX-0301 to UX-0330).",
		phase2: "Implement fuzzy auto-complete selector, contextual quick-action menus (Alt+Enter), and history search (Ctrl+R) (Features UX-0331 to UX-0370).",
		phase3: "Provide multi-level undo/redo stacks, customizable keymap JSON overrides, and visual keyboard cheat-sheets (Features UX-0371 to UX-0400).",
		subsystems: ["packages/tui", "packages/coding-agent"],
		testPlan: "npx vitest run packages/tui/test"
	},
	5: {
		strategicObjective: "Guarantee zero unexpected API expenses through pre-flight token estimates, transparent pricing cards, and interactive spending gate multiplier dials.",
		phase1: "Deploy pre-flight token estimations and interactive multiplier dials (×1 to ×10) before model invocations (Features UX-0401 to UX-0430).",
		phase2: "Add transparent per-model pricing breakdown cards, cache-read discount credits, and hard budget ceilings (Features UX-0431 to UX-0470).",
		phase3: "Implement historical spend analytics, post-execution token audit ledgers, and zero-cost offline bypass indicators (Features UX-0471 to UX-0500).",
		subsystems: ["kaioken/modelport", ".pi/extensions/kaioken/commands"],
		testPlan: "npx vitest run kaioken/modelport/test"
	},
	6: {
		strategicObjective: "Fortify repository scanning with sub-second traversal, Shannon entropy secret detection, and automated ignore hierarchy sanitization.",
		phase1: "Build zero-allocation fast-path scanner loops and streaming progress meters for file discovery (Features UX-0501 to UX-0530).",
		phase2: "Deploy high-entropy secret detectors with Shannon entropy visualization and false-positive whitelists (Features UX-0531 to UX-0570).",
		phase3: "Add automated .gitignore rule suggestions, symlink loop guards, and sliding-window boundary analyzers (Features UX-0571 to UX-0600).",
		subsystems: ["kaioken/scan"],
		testPlan: "npx vitest run kaioken/scan/test"
	},
	7: {
		strategicObjective: "Deliver comprehensive AST symbol indexing across 10+ programming languages with Tree-sitter WASM grammars, cross-file references, and fuzzy lookups.",
		phase1: "Set up Tree-sitter WASM parser pools with memory recycling and regex fallback extractors (Features UX-0601 to UX-0630).",
		phase2: "Implement multi-hop re-export chain traversal, scope-aware anchor resolution, and partial symbol fuzzy matching (Features UX-0631 to UX-0670).",
		phase3: "Deploy incremental AST delta indexing for modified files, symbol definition preview cards, and structural linker graphs (Features UX-0671 to UX-0700).",
		subsystems: ["kaioken/index"],
		testPlan: "npx vitest run kaioken/index/test"
	},
	8: {
		strategicObjective: "Empower developers with instant search-as-you-type code retrieval powered by inverted postings lists, BM25 ranking, and Reciprocal Rank Fusion.",
		phase1: "Implement in-memory inverted postings lists, live query previews, and exact phrase quote bonuses (Features UX-0701 to UX-0730).",
		phase2: "Add morphological stemming, directory/file-path boosting, and matched term snippet highlighters (Features UX-0731 to UX-0770).",
		phase3: "Deliver Reciprocal Rank Fusion (RRF) score visualizers, boolean query filters, and zero-disk cached search sessions (Features UX-0771 to UX-0800).",
		subsystems: ["kaioken/search"],
		testPlan: "npx vitest run kaioken/search/test"
	},
	9: {
		strategicObjective: "Prevent documentation decay and truth drift through SHA256 source hashing, symbol-level provenance bindings, and freshness gauges.",
		phase1: "Implement SHA256 source file hashing and real-time visual freshness percentage dials (Features UX-0801 to UX-0830).",
		phase2: "Deploy fine-grained symbol-level provenance tracking and interactive drift inspectors showing invalidating diffs (Features UX-0831 to UX-0870).",
		phase3: "Add selective regeneration queues, orphaned documentation cleanup triggers, and compliance markdown export reports (Features UX-0871 to UX-0900).",
		subsystems: ["kaioken/provenance"],
		testPlan: "npx vitest run kaioken/provenance/test"
	},
	10: {
		strategicObjective: "Prevent cascading breakages by visualizing the blast radius of proposed code edits through AST dependency traversal and risk gauges.",
		phase1: "Calculate transitive dependent trees and render visual blast radius risk score gauges (0-100) (Features UX-0901 to UX-0930).",
		phase2: "Add noise filters for common identifiers, high-concurrency file sweeping, and AST import graph cross-referencing (Features UX-0931 to UX-0970).",
		phase3: "Deliver safe-rename simulation previews, Mermaid impact diagrams, and pre-commit breaking change blockers (Features UX-0971 to UX-1000).",
		subsystems: ["kaioken/impact"],
		testPlan: "npx vitest run kaioken/impact/test"
	},
	11: {
		strategicObjective: "Provide rapid, authoritative verification by auto-detecting native test frameworks, demangling stack traces, and running test repair loops.",
		phase1: "Implement multi-runtime test command auto-detection (Node, Python, Go, Rust, Deno) with streaming test consoles (Features UX-1001 to UX-1030).",
		phase2: "Add structured failure parsing (file, line, assertion diff) and inline stack trace demanglers (Features UX-1031 to UX-1070).",
		phase3: "Deploy automated test failure repair loops, flaky test quarantine badges, and pre-merge pass/fail gates (Features UX-1071 to UX-1100).",
		subsystems: ["kaioken/verify"],
		testPlan: "npx vitest run kaioken/verify/test"
	},
	12: {
		strategicObjective: "Eliminate AI hallucinations in generated artifacts through strict citation grounding, O(1) basename index verification, and padding detection.",
		phase1: "Deploy O(1) basename lookup maps and quote anchor fuzzy matchers validating file citations (Features UX-1101 to UX-1130).",
		phase2: "Implement anti-hallucination shields, generic boilerplate/padding detectors, and grounding confidence scores (Features UX-1131 to UX-1170).",
		phase3: "Deliver interactive claim audit views, symbol existence cross-validators, and mechanistic repair guidance prompts (Features UX-1171 to UX-1200).",
		subsystems: ["kaioken/verifycore"],
		testPlan: "npx vitest run kaioken/verifycore/test"
	},
	13: {
		strategicObjective: "Structure complex repositories into clean, decoupled module plans via deterministic directory clustering, YAML checkpoints, and JSON repair.",
		phase1: "Deploy deterministic heuristic clustering and self-repair JSON parsers for module decomposition (Features UX-1201 to UX-1230).",
		phase2: "Provide human-editable YAML checkpoints, module purpose linters, and unassigned file coverage meters (Features UX-1231 to UX-1270).",
		phase3: "Add interactive terminal card-sorting UI for reorganizing modules, granular splitters, and module merger wizards (Features UX-1271 to UX-1300).",
		subsystems: ["kaioken/plan"],
		testPlan: "npx vitest run kaioken/plan/test"
	},
	14: {
		strategicObjective: "Capture modular system knowledge into verified, atomic knowledge cards with 3D terminal previews and incremental regeneration.",
		phase1: "Generate verified knowledge cards with structured summary fields and cited symbol exports (Features UX-1301 to UX-1330).",
		phase2: "Add incremental card regeneration citing modified symbols and Obsidian/Markdown export bridges (Features UX-1331 to UX-1370).",
		phase3: "Implement 3D terminal card flip viewers, duplicate card deduplication, and card verification status badges (Features UX-1371 to UX-1400).",
		subsystems: ["kaioken/plan/src/cards.ts"],
		testPlan: "npx vitest run kaioken/plan/test"
	},
	15: {
		strategicObjective: "Synthesize comprehensive, multi-chapter documentation webs with real-time typewriter streaming, cross-chapter link validation, and resumability.",
		phase1: "Deploy streaming typewriter chapter generation and interactive Table of Contents tree navigators (Features UX-1401 to UX-1430).",
		phase2: "Add cross-chapter relative link validators, hierarchical evidence budgeting, and resumable execution (Features UX-1431 to UX-1470).",
		phase3: "Implement documentation coverage heatmaps, estimated reading time metrics, and multi-model generation evaluations (Features UX-1471 to UX-1500).",
		subsystems: ["kaioken/wiki"],
		testPlan: "npx vitest run kaioken/wiki/test"
	},
	16: {
		strategicObjective: "Deliver an instantaneous, offline web documentation and graph explorer on localhost with Server-Sent Events live-reload and Cytoscape visualization.",
		phase1: "Launch zero-dependency offline HTTP server on loopback with SSE live-reload on filesystem changes (Features UX-1501 to UX-1530).",
		phase2: "Embed interactive 2D/3D force-directed Cytoscape graph visualizers and instant client-side JSON search endpoints (Features UX-1531 to UX-1570).",
		phase3: "Provide dark/light theme toggles, print-optimized PDF styling, mobile-responsive drawers, and strict CSP protection (Features UX-1571 to UX-1600).",
		subsystems: ["kaioken/serve"],
		testPlan: "npx vitest run kaioken/serve/test"
	},
	17: {
		strategicObjective: "Gather ground-truth web intelligence with parallel fetching, strict SSRF/DNS-rebinding defenses, HTML sanitization, and citation verification.",
		phase1: "Deploy bounded-concurrency parallel HTTP fetchers with DNS-rebinding and private IP SSRF guards (Features UX-1601 to UX-1630).",
		phase2: "Implement HTML-to-text parsers stripping malicious scripts, source credibility scoring, and quote grounding checks (Features UX-1631 to UX-1670).",
		phase3: "Add configurable depth dials (×1 to ×10), search provider fallback switchers, and exportable research briefings (Features UX-1671 to UX-1700).",
		subsystems: ["kaioken/research"],
		testPlan: "npx vitest run kaioken/research/test"
	},
	18: {
		strategicObjective: "Synthesize and validate reusable autonomous agent procedures (skills) with schema validation, step-through debugging, and adversarial critique.",
		phase1: "Discover build and test recipes from package.json/Makefiles and synthesize validated skill procedures (Features UX-1701 to UX-1730).",
		phase2: "Add YAML frontmatter schema linters, multi-root skill loaders (.agents & .pi), and step-through debuggers (Features UX-1731 to UX-1770).",
		phase3: "Deploy adversarial critique loops eliminating ungrounded claims, trigger condition matchers, and skill parameter form UIs (Features UX-1771 to UX-1800).",
		subsystems: ["kaioken/skills", "kaioken/skillgen"],
		testPlan: "npx vitest run kaioken/skills/test kaioken/skillgen/test"
	},
	19: {
		strategicObjective: "Enable risk-free autonomous coding through isolated git worktrees, fast-forward verification gates, and interactive merge conflict HUDs.",
		phase1: "Provide one-command isolated git worktree branch creation and dirty worktree protection guards (Features UX-1801 to UX-1830).",
		phase2: "Enforce fast-forward merge verification gates requiring passing tests before landing changes into main (Features UX-1831 to UX-1870).",
		phase3: "Implement Windows-safe post-commit hooks, visual merge conflict warning HUDs, and automated worktree cleanup wizards (Features UX-1871 to UX-1900).",
		subsystems: ["kaioken/gitops"],
		testPlan: "npx vitest run kaioken/gitops/test"
	},
	20: {
		strategicObjective: "Ensure full feature parity across the root CLI and Pi extensions, backed by robust CI automation, regression evals, and multi-language probe suites.",
		phase1: "Expose all 16 subcommands via root CLI (node:util.parseArgs) with full flag and help parity (Features UX-1901 to UX-1930).",
		phase2: "Add shell completion scripts (Bash, Zsh, Fish), multi-language fixture probe suites, and CI offline-check runners (Features UX-1931 to UX-1970).",
		phase3: "Deploy automated eval regression scorecards, decision confidence ratings, and monorepo pre-commit integrity gates (Features UX-1971 to UX-2000).",
		subsystems: ["kaioken/bin.ts", "kaioken/evals"],
		testPlan: "npx vitest run kaioken/evals/test"
	}
};

let modifiedCount = 0;

for (const file of files) {
	const filePath = join(dir, file);
	const content = readFileSync(filePath, "utf-8");

	// Extract category number from filename, e.g. "01-terminal-ui-tui-visual-aesthetics.md" -> 1
	const numMatch = file.match(/^(\d+)-/);
	if (!numMatch) continue;
	const catNum = parseInt(numMatch[1], 10);
	const plan = CATEGORY_PLANS[catNum];
	if (!plan) {
		console.warn(`No plan defined for category ${catNum}`);
		continue;
	}

	// Parse header and features
	// Original format starts with:
	// ## Category X: Title
	// **Range**: #UX-XXXX to #UX-YYYY (100 Features)
	// **Subsystems**: ...
	// **Focus Area**: ...
	// \n\n### [UX-XXXX] ...

	const parts = content.split(/\n(?=### \[UX-)/);
	const headerPart = parts[0];
	const featuresPart = parts.slice(1).join("\n");

	// Extract title line
	const headerLines = headerPart.split("\n");
	const titleLine = headerLines[0].replace(/^##\s*/, "# ");
	const rangeLine = headerLines.find(l => l.includes("**Range**:")) || "";
	const subsysLine = headerLines.find(l => l.includes("**Subsystems**:")) || `**Subsystems**: \`${plan.subsystems.join("`, `")}\``;
	const focusLine = headerLines.find(l => l.includes("**Focus Area**:")) || "";

	const startUX = String((catNum - 1) * 100 + 1).padStart(4, "0");
	const endUX = String(catNum * 100).padStart(4, "0");

	const newHeader = `${titleLine}

> ${rangeLine.replace(/\\/g, "")}  
> ${subsysLine}  
> ${focusLine}  

---

## Global Implementation Plan: Category ${catNum}

### 1. Strategic Objective
${plan.strategicObjective}

### 2. Execution Phases & Milestones

| Phase | Milestone Scope | Core Focus & Deliverables | Feature Slice |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Immediate Friction Elimination** | ${plan.phase1} | \`#UX-${startUX}\` – \`#UX-${String((catNum - 1) * 100 + 30).padStart(4, "0")}\` |
| **Phase 2** | **Architectural Deepening** | ${plan.phase2} | \`#UX-${String((catNum - 1) * 100 + 31).padStart(4, "0")}\` – \`#UX-${String((catNum - 1) * 100 + 70).padStart(4, "0")}\` |
| **Phase 3** | **Hardening & Intelligence** | ${plan.phase3} | \`#UX-${String((catNum - 1) * 100 + 71).padStart(4, "0")}\` – \`#UX-${endUX}\` |

### 3. Core Architectural Invariants & Guarantees
- **Invariant 1 (Public Pi Extension Seams)**: Zero core forks or monkey-patching of \`@mario/pi\`; clean extension lifecycle hooks.
- **Invariant 10 (100% Offline-Testable)**: Zero hard network dependencies; all mocks, parsers, and UI components must be fully verifiable offline.
- **Defensive Error Boundaries**: Every user interaction, render cycle, and file parser must fail soft without crashing the TUI or host process.

### 4. Verification & Testing Checklist
- [ ] Run domain unit test suite: \`${plan.testPlan}\`
- [ ] Verify zero-allocation memory pooling and no event listener leaks
- [ ] Test graceful fallback on dumb terminals (\`TERM=dumb\`) or non-TTY outputs
- [ ] Validate edge-case inputs (empty strings, huge context files, circular links)
- [ ] Verify integration with fake Pi test harness (\`test/fake-pi.ts\`)

---

## Detailed Features Catalog (#UX-${startUX} – #UX-${endUX})

`;

	const finalContent = newHeader + featuresPart;
	writeFileSync(filePath, finalContent, "utf-8");
	modifiedCount++;
	console.log(`Modified Category ${catNum}: ${file}`);
}

console.log(`Successfully modified and enriched all ${modifiedCount} category files with global plans.`);
