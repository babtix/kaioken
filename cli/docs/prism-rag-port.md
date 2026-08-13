# PRISM RAG → Go: Port Plan

**Source:** `github.com/babtix/PRISM_RAG` (Python reference, kept read-only at
`cli/PRISM_RAG/python-current/`)
**Target:** `cli/internal/prism/` inside `module kaioken`
**Status:** implemented, phases 0–9 complete

---

## 1. What PRISM is, and why it is not Kaioken's existing search

Kaioken already has a hybrid retriever at `cli/internal/search/`. It is not the
same thing and does not replace it.

| | `internal/search` (today) | `internal/prism` (this port) |
|---|---|---|
| Corpus | what Kaioken *generates* — wiki chapters, knowledge cards, skills | what the user *imports* — PDFs, docs, notes, grouped into modules |
| Lifecycle | rebuilt from a corpus fingerprint on demand | ingested once per document, tracked with a status |
| Chunking | heading-boundary, one level | parent/child, two levels |
| Ranking | BM25 ⊕ vectors, RRF | same, plus N query variants and a relevance gate |
| Output | ranked snippets, for a human or a tool call | graded parent context + honesty flags, for generation |
| Failure | degrades to lexical, silently and fine | reports `graded` / `degraded` / `source_found` separately |

The overlap is the *primitives* — an OpenAI-compatible embedder, BM25 with
identifier splitting, RRF. Those get factored out and shared (§3). Everything
above them is new.

## 2. The three layers worth keeping

From the Python, in priority order of what makes PRISM worth porting at all:

1. **Parent-child chunking.** Small children (~150 tok) are embedded and
   searched; their parents (~600 tok) are what reach the model. Retrieval stays
   precise, generation context stays coherent.
2. **Corrective gate.** Every fused *child* is graded relevant/irrelevant by a
   cheap model before parent expansion. Nothing passes ungraded without saying so.
3. **Three honesty flags, never collapsed.** `source_found` (a graded source
   backs this), `graded` (the gate actually ran), `degraded` (the pipeline was
   impaired). One boolean cannot distinguish "the corpus has no answer" from
   "retrieval is broken", and that distinction is the whole point.

Then two opt-in layers: **RAG-Fusion** (N query phrasings, all legs fused
through the same RRF) and the **agentic loop** (adaptive routing, decomposition
into ≤3 sub-questions, one reformulated retry, hard caps in the orchestrator).

## 3. What already exists in-repo, and its state

`cli/PRISM_RAG/go/` holds a stdlib-only Go port from an **earlier generation** of
the Python. Its *shape* is good and worth adopting — `Store`/`Embedder`/
`Grader`/`Cache` interfaces, concurrent legs, batched parent fetch. Its
*semantics* have since been corrected upstream, and it must not be adopted
as-is. Confirmed regressions against `python-current/`:

| Existing Go | Current Python | Why it matters |
|---|---|---|
| `Result{Chunks, SourceFound}` | 4 fields incl. `graded`, `degraded` | drops the central claim |
| grades the expanded **parent** | grades the **child**, pre-expansion | parent tails fall outside the grader budget; grading first avoids needless parent fetches |
| zero vector on embed failure | `EmbeddingError`, fail the document | a zero vector stores a chunk that is permanently unretrievable inside a doc marked "ready" |
| model ids in `DefaultConfig` | no model id anywhere in the package | swapping model becomes a code change |
| `[]float64` | — | doubles index memory; `internal/search` is `[]float32` |
| `MemStore` only, token-overlap | Atlas + local fallbacks | no persistence, no BM25 |
| own `go.mod` (`prismrag`) | — | must fold into `module kaioken` |

So: **take the interfaces from `PRISM_RAG/go/`, take the behaviour from
`python-current/`.**

## 4. Target architecture

### 4.1 Shared primitives (extracted, so there is exactly one of each)

```
cli/internal/embed/      ← from internal/search/embed.go
    Embedder interface, OpenAI-compatible HTTP embedder, normalize/dot,
    and the local-first resolution described in §4.4
cli/internal/textrank/   ← from internal/search/lexical.go
    analyze + splitIdentifier, BM25 Lexicon over token lists, RRF, topN
```

`internal/search` is refactored onto both and keeps its behaviour and tests.
`internal/prism` imports both. No second BM25, no second embedding client.

### 4.2 The engine

```
cli/internal/prism/
    prism.go     package doc; Module, Document, Chunk, Result (4 flags)
    store.go     on-disk corpus (§4.3)
    chunk.go     parent-child splitting          ← pdf_pipeline._chunk_parent_child
    extract.go   text extraction: md, txt, code (PDF deferred — §6)
    ingest.go    extract → chunk → embed children → store; fail-loud
    lexical.go   BM25 leg over child chunks      ← via internal/textrank
    vector.go    cosine leg over child vectors
    variants.go  RAG-Fusion query expansion      ← rag_service._generate_query_variants
    grader.go    corrective gate, parallel, fail-open, reports `graded`  ← rag_grader.py
    expand.go    child → parent, rank-preserving, deduped  ← _expand_to_parents
    retrieve.go  the orchestrator                ← rag_service.retrieve_context
    agent.go     router, decompose, reformulate, interleave ← rag_agent.py
    cache.go     TTL cache keyed by query+module+k+variants (no Redis)
    eval.go      golden-set harness              ← rag_eval.py
```

### 4.3 Storage — no MongoDB, no Redis

```
.kaioken/prism/
    modules.json                 module records
    <slug>/docs.json             per-document ingestion status
    <slug>/chunks.jsonl          one chunk per line (child and parent)
    <slug>/vectors.f32           packed little-endian float32, row i ↔ child i
    <slug>/vectors.json          {embed_model, dims, count}
```

Vectors go in a binary sidecar, not JSON. 768 float64s as JSON text is ~12 KB
per chunk; a 300-page PDF is ~3 000 children, so JSON would cost ~45 MB and a
slow parse where packed float32 costs ~9 MB and an `mmap`-shaped read.
`internal/search` gets away with JSON only because the wiki corpus is small.

The embedding model id is stored beside the vectors. Changing it invalidates
them — ingest-time and query-time vectors must share a space, and a mismatch
degrades retrieval silently instead of raising.

### 4.4 Embeddings: local first, OpenRouter second

Resolution at call time, first match wins:

1. **Explicit config** (`prism.embed_model` + provider/base URL) — always wins.
2. **A running local provider.** `internal/llm/local.go` already probes Ollama,
   LM Studio, llama.cpp, vLLM and Jan; pick the first that is up and lists a
   model whose name contains `embed` (`nomic-embed-text`, `mxbai-embed-large`, …).
3. **OpenRouter**, if a key is present. Its `/embeddings` endpoint is
   OpenAI-compatible, so the same client works unchanged.
4. **Nothing** → BM25-only retrieval, reported as `degraded`, never guessed.

Whichever tier wins is shown in settings ("local: nomic-embed-text via Ollama"),
so it is never a mystery which vector space the corpus is in.

### 4.5 Config — one schema, three surfaces

```yaml
prism:
  enabled: true
  embed_model: ""          # blank = auto (§4.4)
  embed_provider: ""
  embed_base_url: ""
  embed_fallback_model: "" # OpenRouter model when no local one is found
  utility_model: ""        # grader, variants, router, decomposer
  mode: static             # static | agent
  top_k: 5
  n_variants: 1            # RAG-Fusion breadth, 1..4
  grade: true
  parent_tokens: 600
  child_tokens: 150
  child_overlap: 20
  cache_ttl: 5m
```

Workspace `.kaioken/config.yaml` over global `~/.kaioken/config.yaml`, matching
every other Kaioken setting. No model id is hardcoded in the package — an
unconfigured install is degraded and honest about it, never silently defaulted.

### 4.6 Surfaces

**CLI** (`cli/cmd/kaioken/prism.go`)
`prism modules|new|rm`, `prism import <file…> --module`, `prism docs`,
`prism ask "<q>" [--agent] [--variants N]`, `prism eval --golden`.

**Daemon** (`cli/internal/daemon/handlers_prism.go` + `mux.go`)
`/v1/prism/modules[/{slug}]`, `…/documents[/{id}]` (upload + background ingest
with progress events), `POST /v1/prism/query`, `GET|PUT /v1/settings/prism`.

**TUI** — `/prism` panel: modules, import, ask. Every knob in §4.5 editable.
Each answer carries its diagnostics inline — latency, chunk count, `sourced` /
`ungraded` / `degraded`, and in agent mode the route, each sub-question's hit or
miss, and anything unresolved. Shown by default, not behind a verbose flag: an
answer built on ungraded context looks identical to a good one.

**Desktop** — a PRISM route (module cards, drag-drop import, per-document
ingestion status) plus a PRISM section in `Settings.tsx` on `/v1/settings/prism`,
reusing the existing `LocalModels` embedding-picker pattern.

## 5. Phases

| # | Phase | Ships | Needs a model? |
|---|---|---|---|
| 0 | Shared primitives: `internal/embed`, `internal/textrank`; `internal/search` refactored onto them | existing tests still green | no |
| 1 | Store, parent-child chunking, text extraction, ingestion | `prism import` works | embedder only |
| 2 | Retrieval: BM25 ⊕ vector → RRF → parent expansion | `prism ask` returns context | embedder only |
| 3 | Corrective grader, query variants, the three honesty flags | PRISM's actual claim | yes |
| 4 | Agentic loop: route, decompose, reformulate, interleave | multi-step questions | yes |
| 5 | Config plumbing + CLI commands | configurable end to end | — |
| 6 | Daemon endpoints | desktop can reach it | — |
| 7 | TUI panel + settings | configurable from the TUI | — |
| 8 | Desktop route + settings | configurable from the app | — |
| 9 | Eval harness: hit-rate@k, MRR, abstention accuracy | measured, not asserted | optional |

Phases 1–2 are useful on their own and need no utility model. Phase 3 is where
PRISM stops being "hybrid search" and starts being PRISM.

All ten phases are implemented. What the eval harness reports on this
repository's own docs, with no utility model configured, is the argument for
the whole architecture in one line:

```
baseline   hit@k 1.00   mrr 0.75   recall 1.00   abstention 0.00   FABRICATED 2   ungraded 5/5
```

Perfect retrieval, and two confident answers to questions the corpus cannot
answer. Hit rate alone calls that a flawless configuration.

## 6. Resolved decisions

- **PDF text extraction is deferred.** `internal/pdf` is a *writer* (fpdf) and
  there is no reader; rather than take a dependency for it now, ingestion ships
  markdown, text and source files only. `extract.go` dispatches on extension
  behind an interface, so adding a PDF reader later is one new case and no
  change to the pipeline above it. Until then an unsupported extension is
  refused at import with a clear message, never ingested as garbage bytes.
- **Primitives are shared, not duplicated.** §4.1 stands: `internal/embed` and
  `internal/textrank` are extracted and `internal/search` is refactored onto
  them. One BM25, one embedding client, and the local-first resolution of §4.4
  applies to wiki search as well as to PRISM.

## 6a. Deviations from the reference

Faithfulness to `python-current/` is the default, not a rule. Where the
reference is wrong, the port is right and says so here.

- **Child windows stop at the end of their parent.** The reference advances the
  child cursor with `max(child_start + 1, child_end - overlap)`. On the final
  window `child_end - overlap` lands *before* the cursor, so the guard advances
  a single character and the loop emits one near-duplicate child per remaining
  character — about eighty extra chunks per parent, each costing an embedding
  call and each crowding the real passages out of fusion with copies of one
  sentence. Measured on this repository's own docs: 1 290 chunks before the
  fix, 90 after, for the same three files. Covered by
  `TestChunkParentChildDoesNotCrawlTheTail`.
- **Offsets are runes, not bytes.** The reference operates on Python `str`
  indices, which are code points. Byte arithmetic in Go would cut multi-byte
  scripts into invalid fragments and size their chunks two to four times too
  small.
- **Cache invalidation is derived, not performed.** The reference calls
  `invalidate_module_cache` from every write path. Here the cache key carries
  the corpus fingerprint and the embedding model, so an import or a model swap
  orphans prior entries by construction — there is no invalidation call to
  forget, and forgetting one looks exactly like "my upload didn't work".
- **Degraded results are never cached.** Caching an outage keeps serving it for
  the whole TTL after it is fixed, which is the moment a user is most likely to
  retry.

## 7. Rules for this port

1. Behaviour comes from `python-current/`, structure from `PRISM_RAG/go/`.
2. Never substitute a zero vector. Fail the document instead.
3. Grade children, before parent expansion.
4. Never collapse the three flags into one boolean.
5. No model id hardcoded in the package. Absent config degrades and says so.
6. Caps (iterations, retrievals, sub-questions, variants) are enforced in the
   orchestrator, never requested of a model in a prompt.
7. Every control-plane LLM call runs at temperature 0.
