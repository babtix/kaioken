## Summary

<!-- What problem does this solve, and what did you change? Which packages/surfaces are touched? -->

## Linked issue

<!-- Closes #NNN, or "No issue — small fix" with justification. -->

## Type

<!-- Mark one: feat / fix / docs / refactor / test / chore -->

## License consent

- [ ] I agree my contribution is licensed under the repo's current [LICENSE](../LICENSE) (License Zero Noncommercial 2.0.1), I hold the rights to grant that license, and I understand a future relicense will need my consent for my portion.

## Test evidence (required)

<!-- Paste commands + results. Offline tests are mandatory for behavior changes. -->

```text
cd .kaioken_v2
npm run build
npm test
# and/or: npx vitest run packages/<pkg>/test/<file>.test.ts
```

- [ ] Build passes
- [ ] Offline tests pass (new/updated tests included where behavior changed)

## Grounding check (code/docs PRs)

- [ ] No unverified symbols, file paths, or paraphrased excerpts (checked against `SymbolOracle` / `resolveExcerpt`), or N/A

## AI disclosure (required)

<!-- Example: "Assisted by opencode / muse-spark for drafting; all lines human-reviewed and verified." Unassisted PRs: write "No AI assistance." Fully autonomous PRs without human verification will be closed. -->

- Assistance:
- Human verification (what you personally checked):

## Hygiene

- [ ] No secrets, tokens, `.env*`, `node_modules/`, `dist/`, or local `.kaioken/` state committed
- [ ] Docs updated if behavior changed (`README.md` / wiki / cards / `AGENTS.md` as applicable)
