# PHASE 9 — EVALS & RELEASE (Hero)
> Estimate: 3d · Depends on: Phase 8 · Exit: tag + published package + evals report + news post

## 9.1 Eval harness (`kaioken/evals`)
3 fixture repos (TS/Go/Py) × scripted doubles + live flash-high runs.

| Metric | Target | Baseline (raw Pi) |
|---|---|---|
| Hallucinated symbols/session | 0 | >0 |
| Verify-before-done compliance | 100% | n/a |
| Quote byte-accuracy | 100% | unmeasured |
| Drift detection after 10 commits | 0-token, instant | none |
| Tokens/task | ≤60% of raw Pi | 100% |
| Cost/task (flash-high) | logged per × | — |

## 9.2 Benchmark comparisons
raw Pi · Pi+bridge · kaioken_v2 TUI — same 10 tasks, same fixtures, publish table.

## 9.3 Release checklist
- [ ] version bump + CHANGELOG
- [ ] license headers (License Zero Noncommercial 2.0.1; MIT subcomponents)
- [ ] tag `kaioken-pi@1.0.0`, publish npm
- [ ] news post via web-news
- [ ] registry-web submission
- [ ] README quickstart validated on clean machine

## 9.4 Post-hero roadmap
SDK sub-agents in worktrees · Studio/IDE surfaces · prism RAG over cards · community skills registry · language packs beyond TS/JS/Py/Go/Rust.

## Definition of HERO
A stranger clones the repo, runs Phase 0 commands, and within 2h has a grounded Flash-high agent that cannot hallucinate symbols, cannot claim done without tests, and cannot spend a token without asking.
