
---

# Kaioken — A Repository Knowledge Engine

## 1. The thesis

Most AI coding tools centre the **conversation**. The session is the unit of work: you talk, it acts, the context dies when the window closes, and everything it learned about your codebase dies with it. The next session starts from zero and re-derives the same understanding, at the same cost, with the same error rate.

Kaioken centres the **repository**. The unit of work is a durable, verified, provenance-tracked body of knowledge _about a codebase_ that persists across sessions, survives the agent that produced it, outlives any single model, and can be inspected, corrected, browsed, searched, exported, and carried to another machine by a human who has no credentials at all.

The agent is a consumer of that knowledge, not its container. This inversion is the single decision from which everything else follows.

---

## 2. The pipeline

Knowledge is produced by a chain where each stage is cheap, inspectable, and independently useful. Nothing is a black box between "point at repo" and "get documentation."

### Scan — the substrate

Every stage sits on one traversal of the working tree that respects ignore rules and produces a canonical file set with content, size, and language. Because that pass already reads every byte, it does a second job for free: **risk flagging**. Anything that looks like a private key, a committed credentials file, a generated artifact, or a large binary is marked at the substrate level — so every downstream consumer, including the approval prompt shown before a file is modified, inherits the warning without asking for it.

### Structural map — the skeleton

A naive bundler feeding files to a model truncates them, and the conventional truncation — keep the head and the tail — discards the middle, which is exactly where the logic lives. The structural map fixes this by extracting _what each file declares and where_: every function, method, type, interface, constant, and variable, with its signature, its line range, whether it's exported, and its leading documentation.

This produces a complete declaration inventory for an entire repository at a fraction of the cost of the source, which means **the skeleton is always fully visible** and the remaining budget can be spent on the specific bodies that matter for the task at hand.

The same index then does two more jobs it was not built for, and these turn out to be structural to the whole system:

- **It is a grounding oracle.** When a generated document claims a symbol exists, the index answers definitively.
- **It is an anchor resolver.** When a document quotes code, the index says which lines actually back it.

One artifact, three uses. That density is characteristic of the design.

### Module plan — the human checkpoint

Before anything expensive runs, the repository is decomposed into a hierarchical module tree with explicit file scopes, persisted as an editable artifact. This is deliberately a **stopping point**. A machine's decomposition of an unfamiliar codebase is a hypothesis, and the cheapest possible moment to correct it is before generation, not after. The user edits the plan; generation obeys it.

The same principle recurs: every expensive stage is preceded by a cheap, editable plan.

---

## 3. The wiki — deep documentation as a multi-pass process

The wiki is the flagship output, and its shape is a claim about how documentation should be produced: **not one big generation call, but a plan-then-elaborate cascade**, where each pass sees the output of the pass above it.

- **Global plan** — survey the whole repository, produce an outline of chapters, each with a stated goal and the files that serve it. Persisted and user-editable.
- **Section plan** — for each chapter, plan it in detail against the global plan: subsections, focus files, a summary of intent.
- **Generation** — write a long-form chapter, then one document per planned subsection, each built from its own file bundle.

Then, crucially, the passes that make it trustworthy:

- **Verification** — the generation prompt _asks_ the model not to invent files, symbols, or excerpts. A request is not a guarantee. So a separate pass extracts every claim the document actually makes — file references, symbol names, line anchors, quoted excerpts — and checks each against the structural index. A confidently wrong document is worse than a missing one, so unverifiable claims are reported as defects rather than shipped.
- **Critique and revise** — score the draft against an explicit rubric (coverage of every public declaration, accuracy against sources, absence of padding, concreteness of claims, structural validity), then repair the specific gaps it names. Padding is treated as a defect on equal footing with error: prose that would read identically for any codebase is worthless.
- **Correction** — feed the verifier's findings back and fix the grounding failures specifically.

### Provenance as machinery, not metadata

Every generated document ends with a machine-readable record of the exact source files it was written from.

This is not decoration. It is the mechanism that makes three other features possible:

1. **Incremental update.** The wiki records the repository state it corresponds to. When the code moves, the difference is computed and matched against provenance records to determine precisely _which documents a change invalidates_ — rather than scanning prose for file paths and hoping the model wrote a tidy "referenced files" section. Only affected documents are regenerated, and only the relevant diff is shown to the model.
2. **Staleness.** The system can always answer "how far has this repository moved past the state this documentation describes?" — and say so, honestly, in every surface that displays it, rather than presenting decayed documentation as current.
3. **Blast radius** (below), which reads provenance to determine which documents a proposed change would obsolete.

A record that only described would be metadata. A record that drives invalidation, freshness, and impact analysis is infrastructure.

### The multiplier

A single dial — **×N** — scales the depth of every generative subsystem, and its semantics are the interesting part.

At low settings it controls _breadth_: how many documents, how many subsections, how many sources. But past a certain point, more breadth stops improving quality — you get longer documents, not better ones. So above that threshold the dial stops buying **length** and starts buying **passes**: self-critique and revision, then grounding correction against the verifier's findings.

Each level roughly doubles the work per document. That is what a power multiplier ought to mean: not a bigger output, but a more thoroughly interrogated one. The same dial governs research depth, evidence volume, and reasoning budget — one concept the user learns once and applies everywhere.

---

## 4. The graph — derived, never stored

A generated wiki is already a graph. It simply has no picture of itself.

Three relationships are recoverable from what the pipeline has already written to disk, with **no additional model calls and no new state**:

- **contains** — a section's lead document to its siblings, which is what produces visual clusters
- **links** — document to document, read out of the cross-references in prose
- **source** — document to repository file, read back out of the provenance record

Nodes are documents, source files, and (only where a section has no lead document) sections themselves. Files that a document cites but which no longer exist in the working tree are marked as missing, so the interface can show them as dimmed history rather than offering to open something that isn't there.

The graph is built by one shared routine that every presentation surface calls, so the shape of the knowledge is defined once and rendered many times, rather than being reinvented per transport.

The principle generalises: **derive what can be derived; store only what cannot be recovered.** Derived structures cannot drift out of sync with their source, because they have no independent existence.

---

## 5. Retrieval — hybrid by design, degraded gracefully

Everything the system generates about a repository — chapters, knowledge cards, skills, and eventually sessions — is indexed into one searchable corpus with a fingerprint that detects when it needs rebuilding.

Ranking is deliberately **layered by dependency**:

- **Lexical ranking always runs.** It needs no model, no network, and no credentials. Search works in a fresh clone, offline, on a plane, and in an environment with no API access whatsoever.
- **Semantic ranking runs when available.** Where an embedding capability is configured, the query also runs against stored vectors and the two rankings are fused — which is what lets a query phrased in the user's vocabulary find a chapter written in the codebase's vocabulary.

The design rule is that **the lower layer is never dependent on the higher one**. Degradation is silent and total: remove every credential and the system still indexes, still searches, still serves, still exports. It simply stops generating new knowledge.

Above the index sit retrieval _modes_ — including agentic strategies that plan queries, judge relevance, and iterate. These are pluggable strategies over the shared corpus, not the corpus itself. The engine is the asset; the retrieval strategy is a swappable extension, and any one of them can be replaced without touching the knowledge layer.

---

## 6. Serving — knowledge that is legible without the agent

A two-thousand-line generated chapter is a poor reading experience in a code editor. So the knowledge is also served as a browsable local site: a collapsible chapter tree, an in-page table of contents, resolved cross-links, reading-time estimates, and search — rendered locally, with nothing leaving the machine.

This exists because of a specific conviction: **generated knowledge that only an agent can consume is a liability.** If a human cannot read it, they cannot audit it; if they cannot audit it, they cannot trust it; and untrusted documentation is worse than none. The serving layer is what makes the verification passes meaningful — it gives a person somewhere to go and check.

---

## 7. The other knowledge tenants

The wiki is one shape of knowledge. Several others share the same substrate, the same provenance discipline, and the same index.

**Knowledge cards** — per-module structured summaries, generated within a bounded budget against the module plan. Where a chapter is narrative, a card is a compact, uniform, queryable unit.

**Skills** — the sharpest distinction in the system. _A wiki explains what a codebase contains. A skill explains how to perform a recurring task inside it_ — which files to touch, in what order, following which local conventions. That is the shape of knowledge an agent actually needs at the moment it begins working, and precisely the thing a general-purpose model cannot know about your project. Skills are written in an interoperable open format so they are consumable by other agent runtimes and by humans, not locked to this system.

**Memory** — two deliberately separate channels. A project channel that lives inside the repository, is committed, and is shared with the team; and a user channel that is private to the operator and never travels with the code. The split is a privacy boundary and an ownership boundary at once, and it is enforced by location rather than by policy.

---

## 8. Impact — predicting blast radius before touching anything

Given a proposed change, the system predicts what it would disturb: which symbols, files, modules, documents, skills, and tests.

The pipeline is **evidence-first**, and the sequencing is the whole point:

1. **The deterministic half runs first.** Everything the knowledge engine already knows is gathered by lookup and search: the symbol index, the module plan's scopes, each skill's declared source files, each document's provenance record. This half is fast, testable, and _structurally incapable of hallucinating_.
2. **Only then does the model reason** — over a bundle of facts that have already been proven, rather than over an open question.
3. **The answer is grounded back.** Any item naming a symbol or path the repository does not actually contain is demoted to an "unverified" list rather than presented as fact.

Results are ordered code-first, then knowledge artifacts, then tests — the same ordering everywhere a report appears, because a consistent presentation order is itself a form of legibility.

Note what this makes possible: because documents carry provenance and skills declare their sources, **a code change can predict its own documentation debt**. That is a capability that only exists because provenance was built as machinery rather than metadata.

---

## 9. Research — the same discipline turned outward

The knowledge engine also answers questions from the open web, and from the repository when the question warrants both.

A triage router chooses between a fast single-pass path and a deep multi-agent path over one shared control plane, and a run that turns out to be harder than expected is **promoted** between them rather than restarted.

Two properties matter more than the pipeline shape:

- **Every fetched page is untrusted input.** It is sanitised at the fetch boundary and fenced before it reaches any prompt, and the surrounding instructions state plainly that the content is data and never instructions. This is treated as an architectural boundary, not a prompt-hygiene tip — external content is a hostile input channel by default.
- **Every claim is traceable.** Pages are numbered as they enter the corpus, and that number is the only permitted citation form — so a citation always resolves to a page that was genuinely read. A separate grounding pass checks the finished draft against the raw source text before it ships.

The same two-stage pattern as the wiki and as impact analysis: generate, then adversarially check the generation against ground truth.

---

## 10. The agent, and the trust layer beneath it

The agent core is deliberately small: a compact loop of budget check → context management → model call → tool batch, with named boundaries for applying structural changes, and a defined finish that persists state and evaluates what was learned. Read-only operations fan out concurrently; mutating operations stay ordered.

Around it:

- **A bounded tool set,** governed by an explicit escalation ladder. New capability is expected to arrive as an extension of an existing tool, or a command, or a sandboxed plugin — and only as a new core tool as a last resort. The reason is mechanical: every core tool's definition is transmitted on every single model call, so the loop's cost grows with the tool count forever. The default answer to "add a tool" is no.
- **Permission modes** that shift what the agent may do without asking, from read-only exploration through to full write access.
- **Reversibility.** File state is captured before every modification, so any change can be undone.
- **A verification gate.** This is the trust layer under the agent's claim of success: the repository's own build and test commands are detected and re-run independently after the agent declares it is finished. _The model's word is never taken at face value — the gate's exit status is what counts._ An agent that says it fixed something and an agent that fixed something are different agents, and only one of them passes.

---

## 11. Circulation — knowledge that travels

A distinct cluster of capabilities exists for one reason: knowledge that cannot leave the machine that made it is worth a fraction of knowledge that can.

- **Export** flattens generated knowledge into the context-file conventions that _other_ AI tools read. It is pure assembly — no model calls, no cost, deterministic output. The system deliberately feeds its competitors, because being the best knowledge producer is a stronger position than being the only consumer.
- **Packing** bundles a repository's entire understanding — chapters, cards, skills, index — into one portable archive. Copy it to a machine with no credentials, no network, and no installation, extract it, and the browsable site works immediately.
- **Handoff** turns a saved session into a continuation briefing: what was being attempted, what was decided, what remains open, and the transcript behind it — so a teammate or a fresh agent resumes without replaying the conversation.
- **Commit drafting** turns the working tree's changes into a proposed message, grounded twice: the change comes from version control, and the house style comes from the repository's own history — so the draft reads like this project wrote it rather than like a template.
- **A cross-repository registry** lets one installation track many codebases and answer freshness across all of them at once.
- **Watching** polls for accumulated change and reports when enough has landed to be worth acting on.

---

## 12. The runtime shape

A background service is the intended owner of sessions, runs, scheduled jobs, and delegated work. Terminal, desktop, and programmatic interfaces are all **clients** of that one service, reaching it over a local, authenticated, ephemeral channel that starts on demand so the zero-setup experience survives.

Scheduling lives inside that service. Scheduled work is delivered into dedicated sessions rather than injected into a user's conversation, so the structure of a human dialogue is never corrupted by machine traffic. An emergency stop gates _new_ dispatches only — work already in flight is allowed to finish rather than being killed, because a half-completed mutation is worse than a completed one.

Sessions are **trees, not lines**: any point can be forked, alternatives explored, and lineage preserved. Conversation is a search process, and a search process that can only move forward is crippled.

---

## 13. The laws

Ten principles recur across every subsystem. They are the actual design.

1. **Evidence first, model second.** Gather deterministically, then let the model interpret only what has already been proven. The half that cannot hallucinate always runs first, and is always separately testable.
2. **Generation is a claim; verification is the product.** Every generative pass is followed by an adversarial pass that checks its output against ground truth. Confidently wrong is the worst failure mode, and it is designed against explicitly rather than prompted against.
3. **Provenance is machinery.** Every derived artifact records what it came from, in a form a program can act on — which is what makes invalidation, freshness, and impact analysis possible at all.
4. **Derive, don't store.** Structures recoverable from existing artifacts are computed on demand. What has no independent existence cannot drift.
5. **Every expensive stage has a cheap, editable plan in front of it.** The correction is always cheaper before generation than after.
6. **Degrade to zero dependencies.** The lower layer never depends on the higher one. Strip every credential and the system still indexes, searches, serves, and exports.
7. **Never hard-delete.** Knowledge ages through explicit states rather than vanishing, with exemptions for anything a human pinned or authored.
8. **One dial for depth.** A single multiplier governs cost and thoroughness across every subsystem — and past a threshold it buys scrutiny rather than volume.
9. **Untrusted input is an architectural boundary.** External content is fenced at the point of entry and labelled as data everywhere downstream, not defended against by prompt wording.
10. **Legible to humans, or it isn't trustworthy.** Every artifact is browsable, auditable, and correctable by a person. Auditability is what makes verification meaningful.

---

## 14. What it is not

It is not a conversation runtime. It is not a chat interface with retrieval attached. It is not a platform integration layer. It is not an autonomous system — every path that writes to the knowledge layer is designed to run through proposal and approval, and unattended write loops are treated as a defect class rather than a feature.

**It is a system that reads a repository, forms a verified understanding of it, keeps that understanding honest as the code moves, makes it legible to both humans and machines, and lends it to an agent when there is work to do.**

The agent is the smallest part. That is the design.

---

## 15. Companion Notes

- [[Kaioken — Build Reference]] — Implementation architecture, packages, and phased roadmap.
- [[Kaioken V2 — Command Test Checklist]] — Comprehensive interactive test checklist for all CLI commands, flags, and failure contracts.
- [[Kaioken V2 — 57 Terminal Commands]] — Complete reference and test checklist for all 57 terminal slash commands.

---