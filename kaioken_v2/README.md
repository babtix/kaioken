# Kaioken

A repository knowledge engine. See `KAIOKEN-THESIS.md` for what the system is and
why; this file covers what is built so far and how to run it.

**Status: all 8 phases complete.** `scan`, `symbols`, `search`, `serve`,
`status`, `verify` and `graph` work offline with no credentials. `plan`, `cards`,
`wiki`, `update`, `chat`, `research` and `export` add the rest — `export`
bundles knowledge for machines that have no kaioken at all, and `research`
grounds answers in web pages it actually fetched.

## Run it

```bash
npm install
npm run build
node apps/cli/dist/bin.js scan --root /path/to/repo
```

`scan` walks the tree once, flags risky files, and builds the declaration
inventory. Both artifacts land in `.kaioken/` before anything reads them.

```bash
node apps/cli/dist/bin.js symbols src/thing.ts --root /path/to/repo
node apps/cli/dist/bin.js symbols myFunction --root /path/to/repo
```

`symbols` takes a file path (lists what it declares) or a symbol name (says
where it is declared). It exits `2` when the repository declares no such symbol —
the answer is definitive, so a script can rely on it.

```bash
node apps/cli/dist/bin.js search "wiki search" --root /path/to/repo
node apps/cli/dist/bin.js serve --root /path/to/repo
```

`search` ranks everything indexed. Lexical ranking (BM25) always runs; semantic
ranking joins it only when an embedding provider is supplied, and the output
says which ran rather than letting you assume. `serve` renders the same
knowledge as a local site on 127.0.0.1 — no external assets, no CDN, nothing
leaves the machine.

```bash
node apps/cli/dist/bin.js plan x3 --root /path/to/repo   # proposes a module tree
node apps/cli/dist/bin.js plan --check --root /path/to/repo
node apps/cli/dist/bin.js cards x3 --root /path/to/repo
```

`plan` writes `.kaioken/module-plan.yaml` and stops. That file is a checkpoint,
not an output: you edit it, and every later stage reads it back rather than
re-deriving its own view. `plan --check` validates your edits against the scan
and makes no model call at all. An existing plan is never overwritten without
`--force`.

`cards` writes one knowledge card per module, then checks every claim it makes
against the structural index and reports what it could not ground.

```bash
node apps/cli/dist/bin.js wiki x2 --plan --root /path/to/repo   # outline only
node apps/cli/dist/bin.js wiki --check --root /path/to/repo     # no model call
node apps/cli/dist/bin.js wiki x2 --root /path/to/repo
```

`wiki` runs the cascade: outline, then each chapter, then its subsections, each
pass seeing the output of the one above it. Every document is checked against
the structural index and ships with its own defect report. `--plan` stops after
the outline, which is the cheap checkpoint in front of the expensive stage.

```bash
node apps/cli/dist/bin.js status --check --root /path/to/repo
node apps/cli/dist/bin.js update --dry-run --root /path/to/repo
node apps/cli/dist/bin.js update x1 --root /path/to/repo
```

`status` says how far the repository has moved past its documentation. It calls
no model and needs no credentials; `--check` is the CI drift gate, exiting
non-zero when anything is stale. `update` then regenerates exactly the
documents a change invalidated — `--dry-run` reports that set without spending
a token, because the decision is entirely deterministic.

```bash
node apps/cli/dist/bin.js chat "where is retry handled?" --root /path/to/repo
node apps/cli/dist/bin.js chat --root /path/to/repo          # a conversation
node apps/cli/dist/bin.js chat "fix the failing test" --write --root /path/to/repo
node apps/cli/dist/bin.js verify --root /path/to/repo
```

`chat` gives an agent the engine as tools rather than a context dump. `verify`
is the gate on its own: it runs the repository's own build and test commands and
reports the verdict, with no model and no credentials.

```bash
node apps/cli/dist/bin.js graph --root /path/to/repo
node apps/cli/dist/bin.js export handoff --root /path/to/repo
```

`graph` derives the relationships between generated documents — which share
ground, which reference another document's sources — from provenance and the
documents themselves, and writes `.kaioken/graph.json`. No model, no
credentials. `export` bundles everything a consumer outside this machine needs:
cards as JSON, wiki documents as Markdown, skills, the graph, and a rendered
summary, all plain files with a manifest. The bundle is the handoff contract:
no kaioken installation is needed to read it.

```bash
node apps/cli/dist/bin.js research "what changed in Node.js 26?" --root /path/to/repo
```

`research` extends grounding beyond the repository: pages are searched, fetched
and sanitised before the model writes anything, and each is pinned by content
hash. The document cites pages only as `[N]`, and the verifier resolves every
citation against the page as it was actually fetched — a number that was never
fetched, or a quote the page does not contain, is a reported defect and fails
the run. Failed fetches stay listed in the artifact but cannot be cited.

Read-side commands build the phase-1 artifacts on demand, so none of them
require running `scan` first.

Flags: `--json`, `--force`, `--exported`, `--kind`, `--limit`, `--port`,
`--write`, `--yes`, `--verify`, `--no-verify`, `--root <dir>`.

## Layout

| Path | Responsibility | Network? |
|---|---|---|
| `packages/scan` | One traversal, ignore rules, canonical file set, risk flags | No |
| `packages/index` | tree-sitter symbol extraction, grounding oracle, anchor resolution | No |
| `packages/search` | BM25 always; vector fusion when configured | Lexical: no |
| `packages/serve` | Local site + search endpoint, self-contained | No |
| `packages/model` | The `ModelClient` port. No transport, no credentials | — |
| `packages/plan` | Module plan, card generation, verification | Model, via a port |
| `packages/wiki` | Cascade, claim extraction, verification, provenance | Model, via a port |
| `packages/provenance` | Source records, invalidation, staleness | No |
| `packages/agent` | Tool definitions, skills, system prompt, verification gate | No |
| `packages/graph` | Derived knowledge graph, handoff export bundle | No |
| `packages/research` | Web research tenant: sanitiser, citation verifier, pipeline | Via two caller-owned ports |
| `apps/cli` | Command surface, and the only file that knows Pi exists | No |

The index serves three roles from one artifact, and is deliberately not forked
into three:

- **Skeleton** for context bundling (phases 3–4)
- **Grounding oracle** — `SymbolOracle.has(name)` answers "does this symbol
  exist?" definitively, which is what phase 4's verifier needs
- **Anchor resolver** — `resolveExcerpt()` says which lines back a quotation, and
  refuses paraphrases and ambiguous matches rather than guessing

## Languages

TypeScript, TSX, JavaScript, JSX, Python, Go, Rust.

Adding one means adding a grammar to the table in `packages/index/src/grammars.ts`
and a `.scm` query file in `packages/index/src/queries/`. Nothing else — signature
extraction, doc comments, export status and nesting are derived generically from
the declaration node. A language with no grammar bound is reported in
`unparsedLanguages` rather than silently indexed as empty.

## Search

The corpus is shared by every tenant, so one query reaches all of them and
ranking is comparable across them. All four now have collectors:

- **symbol** — declarations from the structural index. This is why `search` is
  useful the day it ships, before any model has run.
- **wiki** — generated chapters, once phase 4 writes them.
- **card** — knowledge cards, read as the JSON they are stored as. The search
  layer reads the card store by path rather than through the package that writes
  it: putting a model port underneath a tenant that must work with no
  credentials would give up the property the tenant exists for.
- **skill** — the handwritten procedures under `.kaioken/skills`. The only
  tenant a person authors, and the only one that is indexed so that it can be
  found rather than so that it can be read.

Ranking is layered by dependency, and the lower layer never depends on the
higher one. Fusion is reciprocal-rank, not score-space: BM25 scores and cosine
similarities are not comparable, and normalising them against each other would
invent a relationship that does not exist.

## The model seam

`packages/plan` never constructs a client, reads a credential or imports a
transport. It depends on a two-method `ModelClient` port; `apps/cli/src/model.ts`
is the only file that knows pi-ai exists, and it is imported lazily so the
offline commands never load a provider catalog.

That inversion is what makes "if a stage needs an API key to be tested, it is
designed wrong" enforceable rather than aspirational — every generative stage is
driven in tests by a scripted double that records what it was asked.

## The agent

`kaioken chat` hands the engine to a model as five tools rather than as a pile
of pasted context. Which parts of a repository matter depends on the question,
and letting it ask beats any bundling heuristic decided in advance.

| Tool | Answers |
|---|---|
| `symbol_lookup` | Where a declaration is — or, definitively, that there is none |
| `wiki_search` | Which passage of which tenant covers a topic |
| `impact` | Which generated documents a change to these files would invalidate |
| `skill_load` | The full text of one of this repository's written procedures |
| `read_file` | A bounded slice of a file, confined to the repository root |

The one worth singling out is `symbol_lookup`'s negative. "This repository
declares no symbol by that name" is the answer a language model cannot give
itself — absence is precisely what it hallucinates over — and it is returned as
a normal result, not an error, because the model has to believe it rather than
retry.

`packages/agent` defines all of this and cannot make a network call.
`apps/cli/src/agent-host.ts` is the only file that knows Pi's agent loop exists.
That loop is used as it ships: compaction, retries, streaming and parallel tool
execution are already right there, and reimplementing them to own them would be
the most expensive way to end up with less.

Writing is off unless `--write` is passed, and then every change is confirmed
one at a time. Outside a terminal `--write` fails rather than auto-approving,
because a session with nobody to ask is exactly where silent write access does
its damage.

## The verification gate

An agent's claim that it is finished is a claim. After it says so, the
repository's *own* build and test commands run and their exit codes decide.

The commands are discovered from what the repository already declares — npm
scripts, `go.mod`, `Cargo.toml`, a `Makefile` — or stated outright in
`.kaioken/verify.json`, which wins and stops the search. Inventing a build
command would verify something nobody runs.

The third verdict is the one that matters. When nothing can be discovered the
answer is `unverifiable`, never `passed`: a gate that green-lights a repository
it could not test is worse than no gate, because it gets trusted. `kaioken
verify` exits 0, 1 and 2 for the three cases so a script can tell them apart.

The agent is told the exact commands in its system prompt. One that knows its
work will be compiled and tested runs them itself; one told nothing declares
victory on a file it never parsed. The gate runs either way — it should be a
confirmation, not a surprise.

## Verified against a live model

`plan`, `cards`, `wiki`, `status` and `update` have all run end to end against a
real provider (`z-ai/glm-5.3-flash` via OpenRouter) on this repository. Every
round of live output drove real fixes — in the generative phases the defect was
consistently the verifier's precision rather than its recall, and in phase 5 it
was update regenerating whole chapters instead of the documents that had aged.

`chat` has had that treatment too. Its first live run was blocked by the same
expired credential that produced the bug below; rerun later against
`openrouter/minimax/minimax-m3` with a working key, it answered a question about
this repository through the tool loop and exited 0.

`research` ran live against DuckDuckGo (no key needed) and the same model: seven
pages fetched, sanitised and numbered, and a document returned whose seventeen
`[N]` citations all resolved against the pages as fetched — zero defects.

`verify` has run for real. On this repository it discovers `npm run typecheck`,
`npm run build` and `npm run test`, runs all three, and exits 0.

### The bug the first live attempt found

A provider failure does not reject. It arrives as a *finished* assistant message
with empty content and `stopReason: "error"`, so the run completed, printed
nothing, and exited 0 — a silent success on work that never happened. `chat` now
watches for it and fails with the provider's own message and a diagnosis, and
there is a test that scripts an error turn and asserts the prompt rejects.

## What the verifier checks

`packages/wiki` extracts every checkable claim a generated document makes —
file references, symbol names, line anchors, and code excerpts attributed to a
file — then checks each against phase 1's index. That is why the index was built
to serve three roles: here it is the grounding oracle and the anchor resolver at
once. A misquotation is caught by comparing the excerpt to the real source; a
fence with no file attribution is an illustration and is not checked.

Grounding is two-tier, and the second tier is what keeps it honest. The index
records *declarations*, but documentation legitimately names enum values,
options fields and matched literals. A name the index declares is grounded
outright; a name appearing verbatim in the source the document was written from
is grounded too; a name in neither is invention, and only that is reported.

Padding is treated as a defect equal to error — prose that would read
identically for any codebase is worthless, however accurate.

## Staleness

Every generated artifact records the files it was written from, pinned to their
content hashes. That record is the whole invalidation mechanism: no git
required, and no scanning of prose for file paths hoping the model wrote a tidy
list.

Comparing those hashes against a fresh scan answers three questions that a
description could not: which documents a change invalidated, how far the code
has moved past what describes it, and which files nothing describes at all. A
document whose sources are all gone is reported as orphaned rather than stale —
regenerating it would produce nothing. One with no recorded sources is reported
as unknown, because calling it current would be a claim the record does not
support.

Sections are persisted back into the wiki outline after a run. Without that, a
later update re-plans them, invents different ids, and leaves the documents
already on disk describing the same ground under other names.

## The multiplier

One dial, `x1`..`x10`. Below `x5` it buys breadth: more modules, more key
points, more declarations per bundle. Above it, breadth stops improving quality
— you get longer output, not better output — so it switches to buying
adversarial passes instead, feeding the verifier's findings back for repair. A
revision is only accepted if it actually improves grounding.

## Tests

```bash
npm test
```

321 tests, all offline. `apps/cli/test/cli.test.ts` runs the whole command surface
with `fetch` replaced by a throwing stub and provider API keys removed from the
environment, because "works in a fresh clone with no credentials" is a property
worth asserting rather than assuming.

The agent loop is held to the same rule. `apps/cli/test/agent-host.test.ts`
drives it with a scripted stream function: a turn that calls a tool, a turn that
answers, a turn that fails. A tool-calling loop testable only against a live
provider is a loop nobody tests.

The risk suite carries two halves of equal weight: planted secrets are detected,
and ordinary source is left alone. A flag on real source teaches the reader to
ignore flags, so precision is tested as hard as recall.

## Known gaps

- **Bun is not installed here.** The build runs on Node (which the build
  reference permits as a fallback). `bun build --compile` for single-binary
  distribution has not been exercised.
- Symlinked directories are skipped unless `followSymlinks` is set.
- Files over 4 MiB are hashed by streaming and only their first 64 KiB is
  scanned for language and risk.
- pi-ai's bundled model catalog is a snapshot. A model it has not heard of is
  used anyway, with limits cloned from the nearest sibling of the same provider
  and a warning printed — token and cost figures may then be wrong.
- Reasoning is requested at "minimal" for any model marked as reasoning-capable,
  because some endpoints refuse to serve one with reasoning disabled.
- `impact` reports *documentation* impact — which chapters and cards a change
  invalidates — and says so. It is not a call graph; there is no reference index
  to build one from, and pretending otherwise would be the sort of confident
  wrong answer this engine exists to avoid.
- A chat session is not persisted. The transcript lives as long as the process,
  so there is no `--resume` and no session store yet.

## Next

Nothing is scheduled. Phases 1-7 give the engine a complete spine — scan,
index, search, generate, verify, update, converse, hand off. What comes next is
a decision about depth: hardening what live use exposes, or a new tenant that
the provenance layer already knows how to age.
