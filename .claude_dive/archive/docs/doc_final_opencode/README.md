# doc_final — Kaioken v2 Final Architecture

Synthesized 2026-08-22 from every research stream in this workspace, then
**reconciled with the parallel operator-planned proposal** in
[`../hermes_res/`](../hermes_res/) (same task, same corpus; its eight
operator-locked scoping decisions and three-track roadmap structure are
adopted; one factual claim of theirs corrected — see decisions log §D).
This is the **target architecture** for Kaioken v2 (`cli/`): what the agent,
knowledge engine, learning loop, platform surfaces, and execution
environments converge to once all verified research findings and locked
decisions are absorbed.

## Reading order

| File | Contents |
|---|---|
| [01-architecture.md](01-architecture.md) | Identity, operator locks L1–L8, design tenets T1–T12, component map (daemon-as-hub), per-subsystem target design (agent core, tools + execution environments, composed context doctrine, providers, unified knowledge layer, gated learning loop, platform layer, surfaces), cross-cutting invariants |
| [02-roadmap.md](02-roadmap.md) | Three-track wave plan (Correctness W0/W1/WP/W4 · Platform P1–P3 · Learning W2/W3) reconciling the logic-audit phases, inspire backlog, and locked platform scope; per-wave gates and success criteria |
| [03-decisions-log.md](03-decisions-log.md) | Source-conflict resolutions with citations (A–C), NEW synthesis decisions, reconciliation record vs `hermes_res/` incl. corrections (D), traceability (E) |

## Source inventory (what fed this synthesis)

| Source | Role |
|---|---|
| `docs/logic-audit-and-phases.md` + `phase-branches.md` + `phase-plans/*` | Kaioken's own correctness audit. Phases 1–2 **merged to master**; phase 3 (knowledge engine) and phase 4 (cross-cutting) open. Authoritative on current defects and landed fixes. |
| `docs/inspire-backlog.md` (28 items, adversarially verified) + `docs/inspire-phases.md` | The porting plan from hermes/pi/opencode. Authoritative on item scope, effort, file targets, and ordering constraints ("safety precedes autonomy"). |
| `docs/hermes-map.md`, `docs/opencode-map.md`, `docs/pi-opencode-deep-dive.md` | Source maps of the three vendored references. |
| `doc_agy/*` (6 files) | Deep dives per agent vs Kaioken: five-pillar robustness survey, per-agent gap analyses, and a byte-level **source-verification report** (all 28 backlog items CONFIRMED; PTC-Windows docstring proven stale). |
| `doc_her/hermes-deep-dive-and-kaioken-comparison.md` | Hermes internals incl. self-improvement loop; explicit §5.4 "into Kaioken" recommendations. |
| `doc_open/HERMES_VS_KAIOKEN_ANALYSIS.md` | Independent Hermes-vs-Kaioken comparison; borrowable-ideas ranking (leases, mid-turn persistence, curator lifecycle, background delegation, cron-in-dedicated-sessions, frozen-snapshot-as-code). |
| `C:\Users\ROG\Documents\reserch\*.md` (4 files) | Hermes self-improvement research: curator thresholds, GEPA-style outer-loop gating, anti-poisoning taxonomy, eval-gated promotion, failure-mode mitigations. |
| `hermes_res/` (parallel proposal: master + 10 ADRs + roadmap) | Same task run by a second architect **with operator Q&A**: eight locked scoping decisions (daemon-as-hub, unified knowledge layer, gated autonomy switch, cron-in-daemon, execution environments, gateway boundary), three-track wave structure. Adopted as locks L1–L8; its sessions-format claim corrected in decisions log §D. |

## Status legend used throughout

- **LANDED** — merged to `master`, cited from `logic-audit-and-phases.md`.
- **OPEN** — has an open branch or a numbered backlog item.
- **NEW** — introduced by this synthesis (not in any prior plan).
