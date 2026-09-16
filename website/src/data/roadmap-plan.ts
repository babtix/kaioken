/**
 * The engineering roadmap — sourced from the canonical roadmap tree
 * (.kaioken_obsidian/roadmap/README.md and its milestone folders).
 *
 * The business path (money_print / 0_money_print) is deliberately NOT published here.
 */

export type LeafStatus = "ready" | "blocked" | "in-progress" | "done" | "superseded"

export interface RoadmapLeaf {
  num: string
  title: string
  /** review-effort size: S | M | L */
  size?: string
  status?: LeafStatus
}

export type MilestoneStatus = "urgent" | "open" | "in-progress" | "partial" | "done" | "superseded"

export interface Milestone {
  id: string
  num: string
  title: string
  tagline: string
  /** original target from the 12-month plan */
  target: string
  /** the v2 reconciliation verdict */
  verdict: string
  status: MilestoneStatus
  tone: "orange" | "amber" | "blue" | "green" | "red"
  priority?: "P0" | "P1" | "P2" | "P3" | "P4"
  ships: string[]
  leaves: RoadmapLeaf[]
}

export const MILESTONES: Milestone[] = [
  {
    id: "m01",
    num: "M1",
    title: "Green everywhere",
    tagline:
      "CI is dead, not stale — all four jobs point at an archived Go directory. This rebuilds the verification gate around the TypeScript engine, so “the build is green” becomes a statement that can be true or false again.",
    target: "v1.4 · Aug 2026",
    verdict: "RE-SPEC — and urgent",
    status: "urgent",
    tone: "red",
    priority: "P0",
    ships: [
      "CI workflow retargeted at kaioken_v2",
      "Three-OS matrix with required jobs",
      "Flaky tests quarantined with written reasons",
      "Strict typecheck across engine + Studio",
      "In-flight daemon & serve work landed",
    ],
    leaves: [
      { num: "01", title: "Retarget the CI workflow at kaioken_v2", size: "S", status: "ready" },
      { num: "02", title: "Add the three-OS matrix and make jobs required", size: "M", status: "ready" },
      { num: "03", title: "Identify and quarantine flaky tests", size: "M", status: "ready" },
      { num: "04", title: "Drive `any` out of the engine and Studio workspace", size: "M", status: "ready" },
      { num: "05", title: "Decide the contract-version guard: build or retire", size: "S", status: "blocked" },
      { num: "06", title: "Land the in-flight daemon and serve work", size: "M", status: "ready" },
    ],
  },
  {
    id: "m07",
    num: "M7",
    title: "Permissions & sandboxing",
    tagline:
      "Autonomy already ships unguarded: `chat --write --yes` exposes edit, write and unconstrained bash with no approval. The plan's own rule — sandboxing before unattended execution — is currently violated. Promoted out of Q3 to P1.",
    target: "v1.10 · Feb 2027",
    verdict: "OPEN — promoted to P1",
    status: "urgent",
    tone: "red",
    priority: "P1",
    ships: [
      "Git worktree isolation for every unattended run",
      "Per-tool allow / deny / ask policy",
      "run_command allow/denylist — deny wins",
      "Resource ceilings: turns, spend, wall-clock",
      "Replayable append-only audit log",
    ],
    leaves: [
      { num: "01", title: "Audit the current autonomy surface", size: "S", status: "ready" },
      { num: "02", title: "Git worktree isolation", size: "M", status: "ready" },
      { num: "03", title: "Tool permission policy", size: "M", status: "ready" },
      { num: "04", title: "Run-command allow/deny list", size: "M", status: "ready" },
      { num: "05", title: "Resource ceilings", size: "M", status: "ready" },
      { num: "06", title: "Audit log", size: "M", status: "ready" },
    ],
  },
  {
    id: "m04",
    num: "M4",
    title: "Retrieval that earns its keep",
    tagline:
      "The highest-value open milestone. `search` is BM25-only and the mandated eval harness does not exist — build it first, so every retrieval change can be shown to have helped.",
    target: "v1.7 · Nov 2026",
    verdict: "PARTIAL, MOSTLY OPEN",
    status: "open",
    tone: "orange",
    priority: "P2",
    ships: [
      "Offline retrieval eval harness (~30 questions, baseline recorded)",
      "Unified search: substring / regex / symbol / semantic",
      "O(1) symbol lookup wired off the index oracle",
      "RAG over the wiki with citations",
      "Global fuzzy file finder",
    ],
    leaves: [
      { num: "01", title: "Build the retrieval eval harness", size: "M", status: "ready" },
      { num: "02", title: "Unify search tool modes", size: "M", status: "ready" },
      { num: "03", title: "Wire O(1) symbol lookup off the index", size: "S", status: "ready" },
      { num: "04", title: "Implement RAG over wiki with citations", size: "M", status: "ready" },
      { num: "05", title: "Add global fuzzy file finder", size: "S", status: "ready" },
    ],
  },
  {
    id: "m02",
    num: "M2",
    title: "Trusted distribution",
    tagline:
      "Re-specced entirely — there is no Go binary to sign any more. The new trust story is npm provenance, Sigstore attestations, package-manager shims and a selfupdate path that obeys build-then-swap.",
    target: "v1.5 · Sep 2026",
    verdict: "RE-SPEC ENTIRELY",
    status: "open",
    tone: "orange",
    ships: [
      "Distribution model decided: npm, binary, or Studio",
      "npm provenance + Sigstore signing",
      "Release workflow retargeted at kaioken_v2",
      "Scoop / Winget / Homebrew packaging",
      "Documented provenance verification",
    ],
    leaves: [
      { num: "01", title: "Decide the distribution model", size: "M", status: "blocked" },
      { num: "02", title: "Configure npm provenance and Sigstore signing", size: "M", status: "ready" },
      { num: "03", title: "Retarget the release workflow", size: "S", status: "ready" },
      { num: "04", title: "Package for Scoop, Winget, and Homebrew", size: "M", status: "ready" },
      { num: "05", title: "Implement the selfupdate path", size: "M", status: "ready" },
      { num: "06", title: "Document provenance verification", size: "S", status: "ready" },
    ],
  },
  {
    id: "studio",
    num: "S",
    title: "Studio v0.1",
    tagline:
      "The active build — the smallest thing that proves the thesis: a branded Theia app where Kaioken's TypeScript packages run in-process and an agent run is drivable end to end from a GUI. Spike complete; supersedes M3 and M10.",
    target: "Active · started Sep 2026",
    verdict: "ACTIVE BUILD",
    status: "in-progress",
    tone: "blue",
    priority: "P4",
    ships: [
      "Fork Theia Blueprint, rebrand, theme, boot",
      "One @kaioken/* package consumed in-process",
      "Chat pane with streaming and the approval dialog",
      "Wiki browser on TreeWidget",
      "Multiplier control with cost preview",
    ],
    leaves: [
      { num: "01", title: "Spike, and stop", status: "done" },
      { num: "02", title: "Agent strategy decision: replace or expose as MCP", status: "blocked" },
      { num: "03", title: "Dark theme + status bar contributions", size: "S", status: "ready" },
      { num: "04", title: "Chat pane and approval dialog", size: "M", status: "ready" },
      { num: "05", title: "Wiki pane on TreeWidget", size: "M", status: "ready" },
      { num: "06", title: "Package once, unsigned", size: "M", status: "ready" },
    ],
  },
  {
    id: "m05",
    num: "M5",
    title: "Tree-sitter codemap",
    tagline:
      "Already shipped — the riskiest refactor of the year was absorbed by the TypeScript rewrite. Remaining work is verification, golden-file regression protection, and framework detection.",
    target: "v1.8 · Dec 2026",
    verdict: "ALREADY DONE",
    status: "done",
    tone: "green",
    ships: [
      "tree-sitter grammars for go, js, ts, python, rust",
      "Accurate symbol extraction with exact line ranges",
      "Golden-file characterization tests",
      "Framework detection (Next.js, Django, Rails, Spring)",
    ],
    leaves: [
      { num: "01", title: "Verify what shipped against the promise", size: "S", status: "ready" },
      { num: "02", title: "Golden-file characterization tests", size: "M", status: "ready" },
      { num: "03", title: "Implement framework detection", size: "M", status: "ready" },
      { num: "04", title: "Decide additional grammar support", size: "S", status: "blocked" },
    ],
  },
  {
    id: "m06",
    num: "M6",
    title: "Incrementality everywhere",
    tagline:
      "Largely shipped — `update`, `provenance`, `status --check`, `export` and `agentsmd` all landed with the rewrite. The remainder: versioned wiki snapshots and custom card schemas.",
    target: "v1.9 · Jan 2027",
    verdict: "LARGELY DONE",
    status: "partial",
    tone: "green",
    ships: [
      "Diff-driven card and wiki updates",
      "Versioned wiki snapshots — git-trackable generations",
      "Custom card schemas beyond the fixed five",
      "Export target coverage audit",
    ],
    leaves: [
      { num: "01", title: "Audit and benchmark incremental updates", size: "M", status: "ready" },
      { num: "02", title: "Implement versioned wiki snapshots", size: "M", status: "ready" },
      { num: "03", title: "Support custom card schemas", size: "M", status: "ready" },
      { num: "04", title: "Audit and expand export target coverage", size: "S", status: "ready" },
    ],
  },
  {
    id: "m08",
    num: "M8",
    title: "Background workers",
    tagline:
      "Queue a refactor before bed, review a worktree diff by morning. Daemon-hosted long tasks, per-turn reflection, surgical skill patching. Strictly gated behind M7 — no unattended execution without guardrails.",
    target: "v1.11 · Mar 2027",
    verdict: "STARTED — gated behind M7",
    status: "open",
    tone: "amber",
    ships: [
      "Daemon-hosted long-running tasks",
      "Per-turn reflection gate",
      "Surgical skill patching (origin: learned)",
      "Live subagent monitor over SSE",
      "OS completion notifications",
    ],
    leaves: [
      { num: "01", title: "Daemon-hosted long-running tasks", size: "M", status: "ready" },
      { num: "02", title: "Per-turn reflection gate", size: "M", status: "ready" },
      { num: "03", title: "Surgical skill patching", size: "M", status: "ready" },
      { num: "04", title: "Subagent monitor", size: "M", status: "ready" },
      { num: "05", title: "Completion notifications", size: "S", status: "ready" },
    ],
  },
  {
    id: "m09",
    num: "M9",
    title: "Local-model path",
    tagline:
      "The biggest adoption lever in the plan: run Kaioken entirely free and offline against open weights — Ollama, vLLM, llama.cpp — with robust tool-call formatting and structured recovery.",
    target: "v1.12 · Apr 2027",
    verdict: "OPEN",
    status: "open",
    tone: "amber",
    ships: [
      "Tool-call formatters for open models",
      "Structured-output fallback for malformed calls",
      "Per-operation local/remote routing",
      "A documented offline profile",
    ],
    leaves: [
      { num: "01", title: "Tool-call formatters for open models", size: "M", status: "ready" },
      { num: "02", title: "Structured-output fallback", size: "M", status: "ready" },
      { num: "03", title: "Per-operation model routing", size: "M", status: "ready" },
      { num: "04", title: "Documented offline profile", size: "S", status: "ready" },
    ],
  },
  {
    id: "m11",
    num: "M11",
    title: "Team & CI surface",
    tagline:
      "GitHub Action on the marketplace, PR-triggered incremental updates, a PR review bot built from scratch, and version-controlled team steering notes. The review bot is a build, not a port — nothing survives from v1.",
    target: "v1.14 · Jun 2027",
    verdict: "OPEN",
    status: "open",
    tone: "amber",
    ships: [
      "Official GitHub Action",
      "PR-triggered incremental wiki update",
      "PR review bot on webhook",
      "Team steering notes in version control",
    ],
    leaves: [
      { num: "01", title: "Publish GitHub Action to Marketplace", size: "M", status: "ready" },
      { num: "02", title: "PR-triggered incremental update", size: "M", status: "ready" },
      { num: "03", title: "PR review bot on webhook", size: "M", status: "ready" },
      { num: "04", title: "Team steering notes in version control", size: "S", status: "ready" },
    ],
  },
  {
    id: "m12",
    num: "M12",
    title: "Ecosystem GA — v2.0",
    tagline:
      "Registry launch, a frozen Extension SDK v1 schema, docs consolidated across five surfaces, a fresh TypeScript performance baseline, and the final release gate.",
    target: "v2.0 · Jul 2027",
    verdict: "OPEN",
    status: "open",
    tone: "amber",
    ships: [
      "Extension registry launch with moderation policy",
      "Extension SDK v1 — schema freeze",
      "Documentation consolidation",
      "Performance pass against a TS baseline",
      "The v2.0 release checklist",
    ],
    leaves: [
      { num: "01", title: "Registry launch and moderation policy", size: "M", status: "blocked" },
      { num: "02", title: "Extension SDK v1 and schema freeze", size: "M", status: "blocked" },
      { num: "03", title: "Documentation consolidation and audit", size: "M", status: "ready" },
      { num: "04", title: "Performance pass against TS baseline", size: "M", status: "ready" },
      { num: "05", title: "v2.0 release checklist and final gates", size: "M", status: "blocked" },
    ],
  },
]

export interface NextBlockItem {
  priority: string
  work: string
  rationale: string
  tone: "red" | "orange" | "amber" | "blue"
}

export const NEXT_BLOCK: NextBlockItem[] = [
  {
    priority: "P0",
    work: "Retarget the CI workflow at kaioken_v2",
    rationale:
      "Operating rule 2 makes every other milestone conditional on a green gate — and CI is currently dead, not stale.",
    tone: "red",
  },
  {
    priority: "P1",
    work: "M7 — permissions & sandboxing",
    rationale:
      "The plan's own sequencing rule is already violated: autonomy ships unguarded. Sandboxing before unattended execution.",
    tone: "orange",
  },
  {
    priority: "P2",
    work: "M4's retrieval eval harness",
    rationale:
      "~30 questions about Kaioken's own codebase with known-correct answers. The plan says build it first; it does not exist.",
    tone: "amber",
  },
  {
    priority: "P3",
    work: "Resolve Q1 (one Studio fork) and Q2 (version base)",
    rationale: "Both are decisions, not builds — and both block M10/M12 sequencing.",
    tone: "blue",
  },
  {
    priority: "P4",
    work: "Studio v0.1 steps 1–2",
    rationale:
      "Step 1 is explicitly the assumption test. Do not build panes before it passes.",
    tone: "blue",
  },
]

export interface Gap {
  id: string
  title: string
  body: string
}

export const GAPS: Gap[] = [
  {
    id: "G-1",
    title: "Research is not aged",
    body: "A research document records its page hashes but is kept out of the shared provenance index — wiring it in would report every research document as orphaned.",
  },
  {
    id: "G-2",
    title: "Impact is documentation impact only",
    body: "`impact` reports which chapters and cards a change invalidates — there is no reference index to build a call graph from, and pretending otherwise would be a confident wrong answer.",
  },
  {
    id: "G-3",
    title: "A chat session is not persisted",
    body: "The transcript lives as long as the process. No `--resume`. `packages/session` is the insertion point.",
  },
  {
    id: "G-4",
    title: "Token and cost figures can be wrong",
    body: "When a model's accounting is unavailable a warning is printed. Directly affects the Studio cost meter and multiplier preview.",
  },
  {
    id: "G-5",
    title: "Reasoning is requested at minimal",
    body: "Some endpoints refuse to serve a reasoning-capable model with reasoning disabled. Needs provider-specific handling.",
  },
  {
    id: "G-6",
    title: "CI is dead",
    body: "All four jobs set `working-directory` to `kaioken v1/…`, a path that no longer exists. Small and urgent — the M1 gate cannot exist until this is fixed.",
  },
]

export interface Decision {
  id: string
  title: string
  body: string
}

export const DECISIONS: Decision[] = [
  {
    id: "D1",
    title: "The license",
    body: "The canonical TypeScript engine is currently unlicensed. The license decision gets harder with every outside contributor, and blocks the back half of the roadmap.",
  },
  {
    id: "D2",
    title: "The version base",
    body: "The plan runs v1.4 → v2.0 against a Go binary that is now archived. Does the TS engine inherit the v1.x line, or re-base? Every milestone tag depends on it.",
  },
  {
    id: "D3",
    title: "One Studio fork",
    body: "Theia and Code-OSS forks are both live. The plan's own rule — two clients is one too many for a solo maintainer — applies at the shell layer too.",
  },
  {
    id: "D4",
    title: "Monorepo vs published packages",
    body: "Affects the shared workspace between the engine and Studio, and with it the build, test and release story.",
  },
]

export const MILESTONE_STATS = (() => {
  const readyLeaves = MILESTONES.reduce(
    (n, m) => n + m.leaves.filter((l) => l.status === "ready" || l.status === "done").length,
    0
  )
  const blockedLeaves = MILESTONES.reduce(
    (n, m) => n + m.leaves.filter((l) => l.status === "blocked").length,
    0
  )
  return {
    milestones: MILESTONES.length,
    leaves: MILESTONES.reduce((n, m) => n + m.leaves.length, 0),
    ready: readyLeaves,
    blocked: blockedLeaves,
    gaps: GAPS.length,
    decisions: DECISIONS.length,
  }
})()
