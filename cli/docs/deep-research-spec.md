# Kaioken Deep Research Engine — Architecture Spec

**Target:** Go, in the Kaioken CLI. BYOK-first. Gateway optional.
**Scope:** one engine, two retrieval backends (web + codebase).

---

## 0. Design constraints

| Constraint | Consequence |
|---|---|
| Runs in a terminal that can be closed | Every run is resumable from disk. No in-memory-only state. |
| BYOK must work | No gateway dependency in the core loop. Gateway supplies keys + metering only. |
| Same engine for web and code | Retrieval is an interface, not a concrete dependency. |
| Cost is dominated by reasoning tokens | Budgets are enforced per-run and per-worker, not per-request. |
| Fetched web content is attacker-controlled | Retrieved text is data, never instruction. |

---

## 1. Component map

```
kaioken research "<query>"
        │
        ▼
   ┌─────────┐
   │  Scope  │  brief.md          (cheap model)
   └────┬────┘
        ▼
   ┌─────────┐
   │  Plan   │  []Subtopic        (cheap model, user-editable)
   └────┬────┘
        ▼
   ┌──────────────┐
   │  Supervisor  │◄──────────────┐   (mid model)
   └──────┬───────┘               │
          │ spawn 3–5             │ compressed findings
          ▼                       │
   ┌──────────────┐               │
   │   Worker × N │───────────────┘   (mid model, isolated context)
   │  ReAct loop  │
   └──────┬───────┘
          │ Search() / Fetch()
          ▼
   ┌──────────────────────────────┐
   │  Retriever (interface)       │
   │   ├── WebRetriever           │  Tavily|Exa search → tiered fetch (§10)
   │   └── CodeRetriever          │  symbol/ripgrep search → file read
   └──────────────────────────────┘
          │
          ▼
   ┌──────────────┐
   │  SourceStore │  content-hash dedup, shared across workers
   └──────┬───────┘
          ▼
   ┌─────────┐     ┌─────────┐
   │  Write  │────►│  Cite   │  separate pass over raw docs + draft
   └─────────┘     └────┬────┘
                        ▼
                    report.md
```

---

## 2. Core interfaces

```go
type Hit struct {
    ID      string  // URL, or repo-relative path#Lstart-Lend
    Title   string
    Snippet string
    Score   float64
}

type Document struct {
    ID       string
    Title    string
    Content  string    // markdown
    Hash     string    // sha256 of Content, for dedup
    Origin   Origin    // OriginWeb | OriginCode
    Fetched  time.Time
}

type Retriever interface {
    Name() string
    Search(ctx context.Context, q string, k int) ([]Hit, error)
    Fetch(ctx context.Context, id string) (Document, error)
}
```

Two implementations:

**WebRetriever** — `Search` calls Tavily or Exa (cheap, returns ranked URLs + snippets).
`Fetch` goes through the tiered fetcher described in §10. Do *not* use the search API's
full-content mode; you want to control what gets fetched so budgets stay meaningful.

**CodeRetriever** — `Search` runs ripgrep plus a symbol index over the repo.
`Fetch` returns a file span with surrounding context. Reuse whatever backs the
existing knowledge-card generation.

A `MultiRetriever` fans out to both and merges by score when a subtopic is tagged `hybrid`.

---

## 3. Run state (resumability)

Everything lives in `~/.kaioken/runs/<run_id>/`:

```
run.json          Run metadata + current phase + budget consumed
brief.md          Research brief (the north star)
plan.json         []Subtopic with status
sources/<hash>.md Fetched documents, content-addressed
findings/<id>.md  Compressed worker output
events.jsonl      Append-only event log
report.md         Final output
```

Checkpoint after every phase transition and every worker completion.
`kaioken research --resume <run_id>` replays `events.jsonl` and continues.

This is the local equivalent of Gemini's asynchronous task manager: shared state
between planner and workers, so a crash or a closed terminal loses one worker's
work, not the run.

```go
type Run struct {
    ID        string
    Query     string
    Brief     string
    Plan      []Subtopic
    Phase     Phase        // Scope|Plan|Research|Write|Cite|Done|Failed
    Budget    BudgetState
    StartedAt time.Time
}

type Subtopic struct {
    ID        string
    Objective string     // what this worker must answer
    Format    string     // required shape of the return
    Sources   []string   // "web" | "code" | both
    Bounds    string     // explicit out-of-scope note
    Status    Status     // Pending|Running|Done|Failed
    FindingID string
}
```

The four fields `Objective / Format / Sources / Bounds` are the delegation contract.
Anthropic found that omitting any of them is what causes workers to wander, duplicate
each other's searches, or over-spawn. Do not let the supervisor emit a subtopic
without all four.

---

## 4. The supervisor

Three tools only. Resist adding more.

| Tool | Purpose |
|---|---|
| `think` | Scratchpad. Reflect on coverage, no side effects. |
| `conduct_research` | Spawn a worker for one subtopic. Returns compressed finding. |
| `research_complete` | Exit the loop. |

Loop:

1. Read brief + plan + all findings so far.
2. Call `think` to assess coverage gaps.
3. Either dispatch 3–5 `conduct_research` calls in parallel (goroutines + errgroup),
   or call `research_complete`.
4. Repeat, up to `MaxSupervisorIterations`.

The supervisor never sees raw documents. Only compressed findings. This is the
single most important rule in the design — it's what keeps the supervisor's context
from rotting halfway through a long run.

---

## 5. The worker

Isolated context. Gets the brief, its own subtopic, and the retriever. Runs a
bounded ReAct loop:

```
for i := 0; i < MaxToolCallsPerWorker; i++ {
    decide → Search or Fetch or done
}
compress → Finding
```

Compression is a **separate LLM call with a cheap model**, run before returning.
It converts raw fetched documents into a short prose finding plus a list of source
hashes. Raw documents stay in `sources/`; only the finding travels back.

```go
type Finding struct {
    SubtopicID string
    Summary    string     // prose, ~300-600 words
    Claims     []Claim    // atomic statements
    SourceHash []string   // what was actually read
}

type Claim struct {
    Text    string
    Support []string   // source hashes
}
```

Extracting atomic claims here — not at write time — is what makes the citation
pass cheap and accurate later.

---

## 6. Source store and dedup

A single process-wide store with a mutex, shared by all parallel workers:

- Canonicalise URLs before fetching (strip UTM, fragments, trailing slash).
- Keep a `seen map[string]string` of canonical URL → content hash.
- Hash content on fetch; if the hash already exists, return the cached doc and
  **don't bill a fetch against the budget**.

Without this, five parallel workers researching adjacent subtopics will each fetch
the same three top-ranked pages.

---

## 7. Budgets

Two layers, both required.

**Hard stops** (deterministic, enforced in Go):

```go
type Budget struct {
    WallClock            time.Duration // 15m default
    MaxSearches          int           // 40
    MaxFetches           int           // 60
    MaxWorkers           int           // 5 concurrent
    MaxSupervisorIters   int           // 3
    MaxToolCallsPerWorker int          // 5
    MaxCostUSD           float64       // 1.00
}
```

Defaults deliberately mirror LangChain's Open Deep Research, which are tuned low
on purpose. Ship `--depth quick|standard|deep` as presets rather than exposing
seven flags.

**Soft stops** (model-judged): the supervisor calls `research_complete` when every
subtopic has ≥2 independent sources, or 1 authoritative source, and no new
subtopic has emerged in the last iteration.

Cost tracking must be line-itemised, not a single token count. Perplexity's public
metering is the right schema to copy:

```go
type Cost struct {
    InputTokens     int
    OutputTokens    int
    ReasoningTokens int   // dominant term — expect 10-20× the output tokens
    Searches        int
    Fetches         int
    USD             float64
}
```

Real reference point: one Perplexity deep research run consumed ~194k reasoning
tokens to produce ~11k of report, across 21 searches, for ~$0.82. Budget for that
shape, not for chat-shaped usage. Multi-agent research runs roughly 15× the tokens
of a normal chat turn.

---

## 8. Model cascade

Five roles, four of which should be cheap:

| Role | Tier | Why |
|---|---|---|
| Scope / brief | cheap | Short, structured |
| Plan | cheap | Short, structured |
| Supervisor | mid | Judgement, but small context |
| Worker research | mid | Volume — this is where cost lives |
| Compression | cheap | Summarisation only |
| Report writing | best | One call, quality matters most |
| Citation | mid, long context | Needs raw docs + full draft |

Configure per-role in `~/.kaioken/config`. Never hardcode model names in the loop.
Given the existing OpenRouter setup, DeepSeek-class models for worker/compress and
a frontier model for the write step is the obvious starting split.

---

## 9. Citation pass

Separate agent, runs after the draft exists. It receives the raw `sources/`
documents and the draft, and attaches each claim to a specific source hash and
character span.

The reason it's separate: by the time the report is drafted, source URLs have been
condensed through several worker returns, so a writer that also cites is citing
from memory rather than from ground truth. A separate pass reads the actual
documents and checks the draft against them.

Emit a `citation_confidence` per claim. Claims that can't be grounded get flagged
in the report rather than silently dropped — an uncited claim the user can see is
better than a fabricated citation they can't.

---

## 10. Reading pages: the fetcher tiers

Three tiers, chosen by `research.fetcher_mode` in the global config or `-fetcher`
on the CLI. The mode is resolved once, in `newEngine`, so every surface — CLI, TUI,
daemon, MCP — gets the same answer and reports it through the run's progress detail.

| Mode | Behaviour |
|---|---|
| `auto` (default) | HTTP first; re-read anything that comes back client-rendered in a local headless browser. Falls back silently to HTTP-only when no browser is installed. |
| `http` | Never starts a browser. |
| `headless` | Same as `auto`, but a missing browser is an error rather than a downgrade. |
| `firecrawl` | Read through the scrape API. Requires a Firecrawl key. |

### Why HTTP first

Rendering costs a renderer process and seconds of wall clock. Most pages are static
markup that `extract` reads perfectly well, so a round of ordinary article pages never
starts a browser at all. Escalation is triggered by a two-sided test in `escalate.go`:
**a lot of markup and almost no prose**. A genuinely short page — a one-paragraph note,
a 404 stub — is small in both dimensions and is left alone; a single-page app is
kilobytes of preload links and inline JSON wrapped around an empty root div.

A 403 or 503 also invites one render, since those are how a challenge page presents.
429 deliberately does not: that is rate limiting, and repeating it in a browser from the
same address is both futile and rude to the host.

### Why the browser is behind a proxy

This is the part that matters. Chrome resolves its own hostnames and opens its own
sockets, so pointing it at a URL would leave behind every protection in `webfetch`:
no dial-time IP check, no rebinding window closed, no metadata endpoint refused.

So the browser never talks to the network directly. `guardProxy` binds an ephemeral
**loopback** port, Chrome is launched with `--proxy-server` pointing at it, and every
outbound connection the proxy makes goes through the same `guardedDialer` the plain
fetcher uses. A page rendered in the browser therefore cannot reach an address a plain
`Fetch` could not.

Three details are load-bearing and should not be "simplified" later:

- **`--disable-quic`.** Without it Chrome may reach some origins over HTTP/3 directly
  and skip an HTTP proxy entirely. This is the one flag whose absence silently reopens
  everything the proxy exists to close.
- **`--proxy-bypass-list=<-loopback>`.** Chrome bypasses the proxy for localhost by
  default, which would let a page reach a service on the user's own machine.
- **Refusals drop the connection, they do not return a body.** A proxy 403 with an
  explanation in it is rendered *as the document*, so a blocked address would be
  extracted and quoted as though the site had said it. A refusal is a network error,
  not a page.

`allowLoopback` is not relaxed for any of this. Chrome's hop to 127.0.0.1 is made by
Chrome and never reaches our dialer, so it needs no exemption.

### What the browser does not buy you

Dropping the automation flags removes `navigator.webdriver` and defeats the crudest
bot checks. It does **not** defeat Cloudflare, DataDome, PerimeterX or Akamai, which
fingerprint canvas, WebGL, audio and timing. This tier fixes client-rendered pages.
It does not clear a determined anti-bot vendor — which is why the Firecrawl tier stays.

### Operational notes

- A fresh throwaway profile per batch, never the user's real one: pages here were
  chosen by a search engine and a model, and a logged-in profile would hand every one
  of them the user's session cookies.
- **`--no-sandbox` is never set.** chromedp adds it by itself when running as root, so
  the code turns it off explicitly. In a container, run as a non-root user or grant the
  namespace capability — do not reach for the flag. A failed render is a much better
  outcome than a compromised one; the HTTP result survives either way.
- One browser per batch, torn down on return, with the temp profile removed. A wedged
  renderer on Windows can briefly hold the profile lock, so removal retries and a stale
  sweep runs once per process.

---

## 11. Prompt injection (not optional)

Fetched web pages are attacker-controlled input being fed to a tool-calling agent.
None of the vendor writeups address this; you have to.

Rules:

1. Wrap every fetched document in a delimiter and a standing instruction that
   content inside is **data to be analysed, never instructions to follow**.
2. Workers cannot mutate the plan, spawn other workers, or write to disk outside
   their own finding. Enforce this in the tool schema, not the prompt.
3. Findings returned to the supervisor are strings placed in a data field, never
   concatenated into the supervisor's instruction block.
4. Strip HTML comments, hidden elements, and zero-width characters at the Firecrawl
   boundary before the content ever reaches a model.
5. Log every fetched URL to `events.jsonl` so a bad run is auditable after the fact.

Rule 2 is the load-bearing one. If a worker can't take privileged actions, a
successful injection gets you a bad paragraph, not a compromised repo.

---

## 12. Build order

1. `Retriever` interface + `WebRetriever` (Tavily/Exa + Firecrawl). Test standalone.
2. Single-worker linear pipeline: query → search → fetch → summarise → report.
   No supervisor. Verify the plumbing and the cost accounting.
3. `SourceStore` with dedup + content hashing.
4. Supervisor + parallel workers + compression.
5. Run state, checkpointing, `--resume`.
6. Citation pass.
7. `CodeRetriever`, then `MultiRetriever` for hybrid subtopics.
8. Gateway metering hooks (report `Cost` per run to the billing service, async,
   non-blocking, and never a hard dependency).

Steps 1–3 give a working tool. Everything after is quality.

---

## 13. Evaluation

Don't optimise for a leaderboard. Build a fixed set of ~20 research questions with
known-good answers — half web, half about your own repos — and track four numbers
per run:

- **Grounding rate**: share of claims the citation pass could ground.
- **Source diversity**: unique domains / total sources.
- **Cost per run**: line-itemised.
- **Duplicate fetch rate**: should approach zero once the store is working.

Agent traces are higher signal than any single score. Make `events.jsonl`
human-readable and read it when a run goes wrong.

---

## Sources

- Anthropic, *How we built our multi-agent research system* — orchestrator-worker,
  CitationAgent, memory-persisted plan, delegation contract, 15× token cost
- OpenAI, *Deep research* API guide — clarify → rewrite → research; API expects
  fully-formed prompts
- Google, *Gemini Deep Research* + Gemini API docs — async task manager with shared
  planner/worker state, editable plan, background execution
- Perplexity, *sonar-deep-research* docs — line-itemised cost metering
- LangChain, *Open Deep Research* — scope/research/write, three supervisor tools,
  conservative iteration defaults
