# Task 16: Improve `@kaioken/skillgen`

## Target Package
`kaioken/skillgen`

## Files to Inspect & Modify
- [kaioken/skillgen/src/write.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skillgen/src/write.ts)
- [kaioken/skillgen/src/propose.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skillgen/src/propose.ts)
- [kaioken/skillgen/test/skillgen.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/skillgen/test/skillgen.test.ts)

---

## Problem Description

1. **Missing Adversarial Repair Loop**:
   Unlike `@kaioken/plan` (cards) and `@kaioken/wiki` (chapters), which both implement multi-pass write → verify → repair loops, `@kaioken/skillgen`'s `writeSkill()` has **NO repair loop**!
   - In `write.ts` (lines 80–100), `writeSkill()` generates the markdown, checks for ungrounded citations, records `ungrounded: string[]`, but **never calls the model to repair them**.
   - If the model invents a nonexistent file path, the skill is written to disk with flawed instructions for downstream agents.
   - *Fix needed*: Implement an adversarial correction loop in `writeSkill()` matching Invariant 9 & 10: feed ungrounded file paths back to the model with a critique prompt and accept revisions only when ungrounded paths are resolved.

2. **Generic Task Proposal Prompting**:
   In `propose.ts`, `proposeSkills()` relies on a single generic LLM prompt to guess tasks. It does not inspect:
   - `package.json` scripts (`build`, `test`, `lint`, `pack`, `codegen`)
   - `Makefile` targets
   - GitHub Actions workflow step commands
   - Command-line entry points
   - *Fix needed*: Seed the proposal prompt with concrete commands discovered from package scripts, Makefiles, and CI configurations to produce actionable, project-specific skills.

3. **Unchecked Verification Commands**:
   A generated skill contains a `## Verification` section prescribing commands for agents to run. The generator never validates whether those commands actually execute or fail in the repository.
   - *Fix needed*: Validate verification commands against `@kaioken/verify`'s command detector to ensure prescribed commands are real.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/skillgen` and verify all tests pass.
- Add test proving that ungrounded file paths trigger a repair pass in `writeSkill()`.
- Add test verifying task proposal grounding with `package.json` scripts.
