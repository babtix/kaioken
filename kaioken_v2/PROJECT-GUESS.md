# My Guess at This Project

Before reading the README in depth, here is what the file tree and code
suggest this project is.

## Guess

**Kaioken is a "repository knowledge engine" — a tool that scans a codebase,
builds a structural index of its symbols, and then generates (with an LLM),
verifies, and keeps up-to-date a set of documentation artifacts (a wiki,
knowledge cards, module plans, a knowledge graph) that are provably grounded
in the actual code.**

The one-line pitch: it fights documentation rot and LLM hallucination at the
same time, by making every generated claim checkable against a machine-built
symbol index.

## Evidence from the tree

1. **A clean npm-workspaces monorepo** (`packages/*`, `apps/*`), TypeScript
   everywhere, Node >= 22, vitest for tests. The package names tell the story
   in order of the pipeline:
   - `packages/scan` → walk the repo, ignore rules, risk flags
   - `packages/index` → tree-sitter symbol extraction (there are `.scm`
     queries for go, javascript, python, rust, typescript — multi-language
     grounding)
   - `packages/search` → BM25 ranking (`bm25.ts`), plus optional semantic
     fusion
   - `packages/plan`, `packages/wiki` → the LLM-generated artifacts (module
     plans, wiki chapters, knowledge cards)
   - `packages/provenance` → staleness/invalidation: every doc records which
     files (with content hashes) it was written from
   - `packages/agent` → tools, skills, prompts — an agent chat interface
   - `packages/graph`, `packages/research`, `packages/serve`, `packages/model`
     → knowledge graph, web research with citation verification, a local
     viewer, and a thin model-client port

2. **`apps/cli`** has one command file per pipeline stage (`scan`, `symbols`,
   `search`, `serve`, `plan`, `cards`, `wiki`, `status`, `update`, `verify`,
   `graph`, `export`, `research`, `chat`) — this is a CLI-first product.

3. **`apps/tui`** is a terminal chat UI (composer, markdown rendering,
   autocomplete, status line) for talking to the same engine interactively.

4. **The `.kaioken/` directories** in the tree are its own dogfood output:
   the engine has been run on itself, producing a scan, a wiki, a search
   index, and provenance records. Even the system prompt I'm running under is
   backed by this repo's index (`symbol_lookup`, `wiki_search`, `impact`,
   `skill_load`, `read_file` — exactly the agent tools described in
   `packages/agent`).

## Design values the tree hints at

- **Offline-first / no secrets in the core**: model access is behind a port
  (`packages/model`); only `apps/cli/src/model.ts` knows a real provider
  exists. Verification commands need no credentials.
- **Verification over generation**: `verify.ts` files in `wiki`, `research`
  and `plan`; tests are numerous and offline with scripted model doubles.
- **Deterministic staleness**: content-hash provenance in
  `packages/provenance` rather than git or prose scraping.
- **Honest failure**: the notion of a third "unverifiable" verdict and
  definitive negative answers ("this symbol does not exist") recurs.

## Confidence

High on the "what" (the structure is unambiguous). The confirmation is that
`README.md` corroborates essentially all of the above — including the detail
that all 8 phases are complete and 406 offline tests exist.

*Note: this file was written as a "guess" exercise. `KAIOKEN-THESIS.md`,
referenced in the README, is not present in the tree.*