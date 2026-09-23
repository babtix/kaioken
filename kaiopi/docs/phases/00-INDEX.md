# KAIOKEN-ON-PI — MASTER INDEX (Zero → Hero)

> Target harness: **Pi** (core never forked) · Target model: **Gemini 3.8 Flash (high)** via Antigravity proxy · Truth layer: **Kaioken offline core**

## The trade in one line
Pi = hands (loop, edits, bash, sessions, TUI) · Flash-high = engine (fast, cheap, high reasoning) · Kaioken core = conscience (offline deterministic truth).

## The ten invariants
1. Pi core never forked — extensions API only.
2. Core stays offline: scan/symbols/search/serve/status/verify/graph = zero network, zero keys.
3. No assertion without oracle lookup.
4. Negative guarantees preserved ("does not exist" is a first-class answer).
5. No "done" without the native test gate, or explicit `unverifiable`.
6. Human checkpoints: `modules.yaml`, `wiki_plan.yaml`, upfront spend confirm.
7. Provenance governs refresh; `status --check` = 0 tokens.
8. Flash-first rationing: skeletons always in budget, detail on demand.
9. Radical cost transparency: multiplier ×1–×10 with upfront estimate.
10. Offline test discipline: "needs a key to test = designed wrong".

## Phase map
| # | File | Goal | Est | Exit criterion |
|---|---|---|---|---|
| 0 | PHASE-0-foundation.md | Pi builds + flash-high answers | 2h | Interactive session on `antigravity/gemini-3.8-flash-high` |
| 1 | PHASE-1-bridge-skeleton.md | Extension surface proven | 2h | 1 tool registered + badge |
| 2 | PHASE-2-offline-core-port.md | Truth engine inside monorepo | 3d | 400+ offline tests green |
| 3 | PHASE-3-grounding-tools.md | 7 anti-hallucination tools | 2d | Hallucination probe suite passes |
| 4 | PHASE-4-grounded-prompt-hooks.md | Rules + drift injection + HUD | 1d | Prompt contains rules; badge flips; rm -rf blocked |
| 5 | PHASE-5-gates-repair-delegate.md | Verify gate, repair loop, worktrees | 2d | FAIL→repair→PASS round trip; delegate merge clean |
| 6 | PHASE-6-commands-hud.md | 15 commands + widgets | 2d | Offline cmds work with network disabled |
| 7 | PHASE-7-generative-pipeline.md | plan/cards/wiki/update on Flash | 4d | Full cycle w/ checkpoints + spend confirms |
| 8 | PHASE-8-surfaces-packaging-ci.md | Package, skills mirror, CI | 3d | CI green offline; npm pack grounds stock Pi |
| 9 | PHASE-9-evals-release.md | Evals, release, roadmap | 3d | Tag + publish + evals report |

## Repo map (inside `kaioken_kaiopi/`)
- `packages/` — Pi's own packages, NEVER modified
- `kaioken/` — ported offline core (from `kaioken_v2/packages`)
- `.pi/extensions/kaioken/` — the bridge (tools, commands, hooks, prompts)
- `.kaioken/` — per-target-repo truth store (never in this repo)

## Working rule
**Never start Phase N+1 before Phase N exit criterion is green.**
