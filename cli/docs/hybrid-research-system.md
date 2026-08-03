# Hybrid Deep Research System — Design Report

**Subject:** A research engine for Kaioken combining orchestration patterns from Claude, Gemini, and Perplexity Sonar
**Status:** Design proposal, extends `kaioken-deep-research-spec.md`

---

## 1. Premise

The obvious version of "combine Claude, Gemini, and Perplexity" is to call all three APIs on every query and merge the outputs. This is the wrong design. The three systems are not independent measurements of the same answer — they are three different orchestration strategies wrapped around broadly similar underlying models. Running all three triples cost for marginal gain, because their failure modes overlap more than their strengths do.

The useful version extracts the one mechanism each system is actually best at, and places it at the architectural layer where it belongs, inside a single engine.

| System | What it's actually good at | Where it belongs |
|---|---|---|
| Claude | Orchestration quality — decomposition, delegation, isolated workers, separate citation grounding | Deep Path (multi-agent) |
| Gemini | Control and resilience — editable plan, crash-surviving async state, huge context | Control plane (shared) |
| Perplexity Sonar | Efficiency and cost honesty — single lean interleaved search-reason loop, granular metering | Fast Path (single-loop) |

None of these compete with each other. They answer three different questions: *how do I decompose this task*, *how do I survive running for twenty minutes*, and *how do I avoid paying multi-agent prices for a query that didn't need it*.

---

## 2. Architecture

```
                    ┌─────────────────┐
 query ────────────►│  Triage Router  │  cheap model, single call
                    └────────┬────────┘
                             │ classifies: narrow/lookup vs broad/multi-faceted
              ┌──────────────┴──────────────┐
              ▼                              ▼
      ┌───────────────┐            ┌──────────────────┐
      │  FAST PATH     │            │   DEEP PATH       │
      │ (Sonar-style)  │            │  (Claude-style)    │
      │  single loop:  │            │  supervisor +      │
      │  search↔reason │            │  3-5 isolated      │
      │  interleaved   │            │  workers +          │
      │                │            │  CitationAgent      │
      └───────┬────────┘            └─────────┬──────────┘
              │  low confidence /              │
              │  contradiction found           │
              └──────────► escalate ───────────┘
                             │
                    ┌────────▼────────┐
                    │  Shared control  │  Gemini-style:
                    │  plane           │  editable plan, async
                    │                  │  checkpointed state,
                    │                  │  unified cost meter
                    └──────────────────┘
```

Two execution paths, one control plane, one router deciding which path a query needs.

---

## 3. Component detail

### 3.1 Triage Router

A cheap, single-call classifier that runs before anything else. It decides whether the query decomposes into independent parallel strands (deep path) or is one continuous chain of reasoning (fast path).

This component exists in none of the three reference systems explicitly, but all three imply it: Perplexity's whole value proposition is not spawning agents for simple lookups; Claude's own findings show multi-agent overhead is wasted on non-parallelizable tasks. Making this decision automatically — rather than exposing it as a manual `--depth` flag — is what turns a research tool into a research *system*.

Example splits:
- "What changed in library X's API between versions" → fast path
- "Summarize this RFC" → fast path
- "How should we architect the auth layer, and what do three comparable open-source projects do differently" → deep path

### 3.2 Fast Path (Perplexity-style)

A single agent loop that interleaves search and reasoning directly, without supervisor/worker decomposition. Cheap, fast, and — critically — the only path where per-run cost is knowable in advance because there's no branching factor.

Cost accounting here is line-itemized the way Perplexity's API exposes it: search count, reasoning tokens, citation tokens, and a resulting dollar figure, tracked separately rather than as one opaque token count. This is the honesty the other two vendors don't provide publicly, and it's the piece worth copying wholesale into the metering layer regardless of which path executes.

### 3.3 Deep Path (Claude-style)

The multi-agent orchestrator-worker design already specified in the base spec: a lead/supervisor agent delegates to 3–5 isolated-context subagents, each returning a compressed finding rather than raw documents, followed by a separate citation-grounding pass over the draft and the raw sources.

Two properties of this design are load-bearing and must not be simplified away when merging with the other two paths:
- The supervisor never sees raw documents, only compressed findings — this is what prevents context rot in long runs.
- Citation grounding is a distinct pass with its own model call, run after the draft exists, checking claims against raw source text rather than against the writer's memory of the source.

### 3.4 Shared Control Plane (Gemini-style)

State shared between whichever path is executing, so that:
- The user can see and edit the plan before execution begins, regardless of which path generated it.
- A crashed process or closed terminal doesn't lose the run — state is checkpointed to disk after every phase transition, and a run resumes from where it left off.
- Escalation from fast to deep path (or vice versa, if the deep path over-decomposes a query that turns out to be narrow) reuses already-fetched sources instead of restarting.

This is the same run-state design as the base Kaioken spec (`run.json`, `plan.json`, content-addressed `sources/`), extended so it's explicitly shared infrastructure rather than something owned by the deep path alone.

### 3.5 Escalation logic

Escalation is a promotion, not a restart. Triggers:
- Fast path returns with thin source coverage (fewer than N independent sources for a claim the rubric flags as central).
- The citation-grounding check fails on a load-bearing claim.
- A subtopic surfaces mid-loop that is clearly independent of the rest — a sign the query was mis-triaged as narrow.

On escalation, the fast path's already-fetched sources are handed to a newly spawned supervisor as a head start; content-hash deduplication means nothing gets re-fetched. The user experiences this as the run taking longer and getting more thorough, not as a restart.

---

## 4. Cross-provider verification as an external signal

Self-critique — a model reviewing its own output — is an unreliable quality signal; models are often bad at recognizing their own mistakes, and can regress after self-correction. A grounded, external signal is what actually works: test execution, retrieval verification, or — the mechanism this hybrid design adds — a second independently-run path checking the same claim.

For a subtopic flagged high-stakes by the rubric (a number, date, or claim the report leans on), instead of asking the same agent to reflect on its own answer, run the fast path and a deep-path worker on the same subtopic independently and diff the resulting claims:

- **Agreement** → confidence raised, at the cost of one extra fast-path call.
- **Disagreement** → treated as a genuine contradiction signal, using the same flagging mechanism as cross-source contradiction detection, and surfaced to the user rather than silently resolved.

This is opt-in per subtopic, not a default behavior — running every subtopic twice defeats the cost discipline that having a fast path exists to provide in the first place.

---

## 5. Cost model

One unified meter regardless of which path executed, using Perplexity's disclosed schema as the template:

| Field | Description |
|---|---|
| `searches` | Count of search calls |
| `fetches` | Count of document fetches (after dedup) |
| `reasoning_tokens` | Dominant cost term — typically 10–20× the final output size |
| `input_tokens` / `output_tokens` | Standard token accounting |
| `usd` | Resulting cost, computed from the above |

The user should see one price, computed the same way, whether the router picked fast or deep. Escalation from fast to deep adds to the same running total rather than resetting it.

---

## 6. Where this extends the base spec

Changes to `kaioken-deep-research-spec.md`:

- **New §0.5 Triage Router** — inserted before Scope.
- **§4 Supervisor** renamed conceptually to **Deep Path**; new **§4.5 Fast Path** added as the single-loop alternative.
- **§7 Budgets** gains an escalation trigger definition and an opt-in dual-path verification flag for high-stakes subtopics.
- **§3 Run state** is unchanged in structure but is now explicitly shared across both paths, not deep-path-only.

Everything else in the base spec — the retriever interface, source store and dedup, model cascade, citation pass, prompt-injection handling, and quality-loop rubric — applies unmodified to whichever path is running.

---

## 7. Open question for next iteration

The router's classification boundary is the piece most worth pressure-testing before implementation: what specific signal — query length, presence of multiple named entities, explicit comparison language, prior turns in the conversation — should trip fast→deep, and how much false-escalation (fast path could have handled it) is acceptable against false-containment (deep path was needed but fast path ran alone)?

---

## Sources

- Anthropic, *How we built our multi-agent research system* — orchestrator-worker pattern, isolated subagent context, separate CitationAgent
- Google, *Gemini Deep Research* + Gemini API docs — asynchronous task manager, shared planner/worker state, editable plan
- Perplexity, *sonar-deep-research* API docs — line-itemized cost metering (searches / reasoning tokens / citation tokens)
- Prior conversation turns: base Kaioken deep research spec; quality-loop research (grounded verification, citation accuracy studies, contradiction detection literature)
