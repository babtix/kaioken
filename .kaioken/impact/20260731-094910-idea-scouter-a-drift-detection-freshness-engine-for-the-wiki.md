# Impact report

**Intent:** ## �� Idea: **Scouter** — a drift-detection & freshness engine for the wiki

**Risk:** medium — Adding Scouter, a drift-detection & freshness engine for the wiki, will likely affect the wiki generation and serving components. Changes are confined to internal wiki modules but could impact how wiki content is produced and delivered.

_Generated 2026-07-31 09:49 by nemotron-3-super:cloud._

## Checklist

- [ ] Verify wiki generation still produces correct output after integrating Scouter
- [ ] Confirm wiki serve endpoints return freshness metadata without breaking existing clients
- [ ] Run unit tests for kaioken/knowledge_engine/wiki_generator and wiki_serve
- [ ] Check that no existing API contracts are altered in the wiki generator or server
- [ ] Perform integration tests to ensure end-to-end wiki workflow functions with drift detection

## Unverified claims

The model named these, but the index could not confirm them:

- **wiki_generator** `internal/wiki` (medium) — Implements wiki generation, likely to integrate drift detection
- **wiki_serve** `internal/serve` (medium) — Serves wiki content, may need to expose freshness data

## Notes

- no skills yet — run /skills for skill-level mapping
