# Phase 3 — Knowledge engine

**Branch:** `fix/phase3-knowledge-engine` · **Source:** [logic-audit-and-phases.md](../logic-audit-and-phases.md) §3

The largest item in the audit, and the one most likely to go wrong if rushed. Nothing
here is *broken* today — it is duplicated, and the duplication is why fixes land in one
copy and never reach the other two. The audit is explicit: **extraction, not a rewrite.**

This is the only phase that should be split across multiple sessions. Treat §3.1 as three
separate landings.

## Verified state (2026-08-21)

Three independent chunk→rank→fuse stacks, sharing only `internal/textrank`:

| Stack | Size | What it has |
|---|---|---|
| [cli/internal/prism/](../../cli/internal/prism/) | 5,805 LOC, 22 files | Most advanced: parent/child chunking, RAG-Fusion variants, corrective relevance gate (`grader.go`), `lexical.go`, `variants.go` |
| [cli/internal/search/](../../cli/internal/search/) | 1,113 LOC, 3 files | Hybrid BM25+vector (`index.go` `Search`/`materialize`), but flat chunks (`corpus.go` `splitChunks`) and **no relevance gate** |
| [cli/internal/research/corpus.go](../../cli/internal/research/corpus.go) | 360 LOC | Own per-host page pool and ranking — genuinely different, do last |

`cli/internal/retrieval/` does not exist yet.

**Consequence already visible:** the tail-crawl chunking bug was fixed in
`prism/chunk.go` only. PRISM's relevance gate — the thing that stops it returning the
least-bad chunk when nothing actually matches — has no equivalent in `search`, so
`read_knowledge` and the daemon docs search happily return irrelevant chapters with no
`SourceFound: false` signal.

## Work items, in order

### 3.1 Extract `internal/retrieval` — three landings, not one

**Landing A — extract.** Pull PRISM's chunker, fusion, and relevance gate into a new
`cli/internal/retrieval` package. PRISM keeps working by calling into it. No behaviour
change; `go test ./internal/prism/...` must stay green with no test edits. If a PRISM
test needs changing, the extraction changed behaviour — back it out.

**Landing B — port `search`.** Move `search` onto the shared package. The audit notes
this is a drop-in *because the on-disk index shape stays the same* — preserve
`corpusFingerprint` and the serialized `Index` layout, or every user silently reindexes.
This is where `search` finally gains the relevance gate, which **is** a behaviour change
and a deliberate one: it should start returning "nothing relevant" instead of the
least-bad chunk. Update `search_test.go` for that case specifically.

**Landing C — `research/corpus`.** Last, and optional. Its per-host politeness logic is
genuinely different from the other two. Only fold in the parts that are actually shared;
leave the host pooling where it is.

### 3.2 PRISM memo cache TOCTOU — benign but wasteful

[retrieve.go:229](../../cli/internal/prism/retrieve.go) `candidatesFor` releases `r.mu`
before `LoadCorpus` + `newCandidates`, then re-locks to store. N concurrent first-queries
on one module each tokenise the whole corpus and the last writer wins. Correct, but N× the
work and N× the memory spike on a large module.

Fix with `golang.org/x/sync/singleflight` per module, or a `sync.Once`-per-entry. **Do not
just hold the lock across the build** — the existing comment explains that would serialise
every other module's queries behind one slow tokenise, and it is right.

### 3.3 Knowledge staleness has no signal

`wiki.Stamp` ([update.go:28](../../cli/internal/wiki/update.go)) records the commit a
generated wiki reflects, and `search.Index` carries a corpus fingerprint — but
`knowledgeSummary` ([knowledge.go:189](../../cli/internal/agent/knowledge.go)) and the
`read_knowledge` tool read the generated docs with **no staleness check at all**.

The system prompt tells the agent this documentation describes the repo, with no signal
when it describes a repo from forty commits ago. Combined with the prompt's own
instruction to ground answers in actual files, stale knowledge cards are a
confident-wrong-answer generator.

Fix: surface the stamp's commit distance in both `knowledgeSummary` and `read_knowledge`
output — e.g. `generated 43 commits ago; may be stale`. Small, self-contained, high value.
**Good first task on this branch** if you want a win before starting §3.1.

### 3.4 Memory writes are not deduplicated

[memory.go:157](../../cli/internal/memory/memory.go) `appendFact` appends a dated bullet
with no check for whether the fact is already present. `rememberAt` caps file size and
returns `ErrMemoryFull` past the cap. Over a long project the file fills with
near-duplicates and then hard-refuses all further writes — which reads to the agent as
"memory is full" rather than "memory is redundant", so it evicts good facts instead of
merging duplicates.

Fix: check for an existing near-identical fact before appending. Keep it cheap and
predictable — normalized exact-match or a simple similarity threshold, not an embedding
call; this runs on every `remember`.

---

## Paste-ready prompt

```
Work on branch fix/phase3-knowledge-engine in D:\project\ai_now_know (Go CLI in cli/).
Read docs/phase-plans/phase3-knowledge-engine.md and docs/logic-audit-and-phases.md §3
first — they define the scope and the sequencing, and I want you inside it.

This is the biggest phase in the audit and is meant to span multiple sessions. Do NOT try
to do all of it at once. Pick up where the branch left off — check `git log master..HEAD`
to see what's already landed.

Suggested order (the two small ones first, so the branch has value early):

1. §3.3 knowledge staleness signal. cli/internal/wiki/update.go has a Stamp recording
   which commit a generated wiki reflects, but cli/internal/agent/knowledge.go
   knowledgeSummary() and the read_knowledge tool never check it. The agent is told these
   docs describe the repo with no hint they may be 40 commits stale. Surface the commit
   distance in both, e.g. "generated 43 commits ago; may be stale".

2. §3.4 memory dedup. cli/internal/memory/memory.go appendFact() appends without checking
   whether the fact is already there, so the file fills with near-duplicates and then
   hard-refuses writes with ErrMemoryFull — which reads as "memory full" instead of
   "memory redundant". Add a dedup check before appending. Keep it cheap: normalized
   exact-match or a simple similarity threshold, NOT an embedding call — this runs on
   every remember().

3. §3.2 PRISM memo cache. cli/internal/prism/retrieve.go candidatesFor() drops the lock
   before LoadCorpus+newCandidates, so N concurrent first-queries on one module each
   tokenise the whole corpus. Fix with singleflight per module or sync.Once-per-entry.
   Do NOT just hold the mutex across the build — the comment there explains that would
   serialise every other module behind one slow tokenise, and it's correct.

4. §3.1 the big one — extract cli/internal/retrieval. This is EXTRACTION, NOT A REWRITE,
   and it splits into three separate landings. Do landing A only, then stop and report:

   A) Pull PRISM's chunker, fusion, and relevance gate (prism/chunk.go, variants.go,
      grader.go, lexical.go) into a new cli/internal/retrieval package, with PRISM calling
      into it. No behaviour change — `go test ./internal/prism/...` must stay green with
      ZERO test edits. If a prism test needs changing, the extraction changed behaviour;
      back it out and try again.
   B) (later session) Port cli/internal/search onto it. Critical constraint: preserve
      corpusFingerprint and the serialized Index on-disk shape, or every user silently
      reindexes. This is where search finally gains the relevance gate — a deliberate
      behaviour change, so update search_test.go for the "nothing relevant" case.
   C) (later session, optional) cli/internal/research/corpus.go last. Its per-host
      politeness logic is genuinely different — only fold in what's actually shared.

Verify with: cd cli && go vet ./... && go test ./... — TestPrismImportAndQuery in
internal/daemon fails here for an environmental reason (Ollama up but nomic-embed-text
not pulled). Known non-regression; ignore it, don't chase it.
```
