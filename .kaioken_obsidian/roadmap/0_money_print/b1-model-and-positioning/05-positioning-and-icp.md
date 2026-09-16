# B1-05 · Positioning and Ideal Customer Profile

> Position Kaioken around its genuine competitive differentiator — durable, verified, provenance-tracked
> repository knowledge that survives the session — defining who it serves and explicitly who it rejects.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | S |
| **Depends on** | [`B1-01`](01-study-the-comparables.md) |
| **Blocks** | [`B1-03`](03-open-core-boundary.md), [`B1-04`](04-pricing-and-packaging.md) |
| **Touches** | Product positioning narrative, ICP definitions, marketing copy |
| **Risk** | Low — strategic clarity prevents wasted acquisition spend on wrong-fit users |
| **Gate-critical** | **No — foundational clarity for product and marketing** |

---

## Why this exists

The generative AI developer landscape is flooded with chat wrappers and autocomplete plugins. Attempting
to position Kaioken as "another AI coding assistant" or "Cursor for the terminal" is a losing strategy:
- Larger, heavily funded competitors will always offer faster consumer chat and cheaper subsidized inference.
- Competing on generic code generation treats AI as an ephemeral autocomplete utility rather than a
  deep repository knowledge system.

Kaioken's genuine technical differentiation is fundamentally different:
> **Durable, verified, provenance-tracked repository knowledge that survives the session.**
> While chat windows forget everything the second a process exits, Kaioken parses the complete AST,
> builds cross-module symbol dependency graphs, detects documentation impact across commits, and compiles
> an incremental, living architectural wiki grounded in real source code.

Positioning clearly around this moat determines who will eagerly pay for the tool and allows the solo
maintainer to aggressively ignore developer segments who do not need repository-scale intelligence.

---

## Current state

Verified repository technical capabilities that anchor positioning:

| Package | Technical Capability | Why Chat Assistants Cannot Do This |
|---|---|---|
| `packages/scan` & `packages/index` | Tree-sitter AST extraction across 19 packages | Builds persistent symbol tables and structural hierarchies |
| `packages/graph` | Cross-module dependency graph compilation | Computes topological references rather than probabilistic guesses |
| `packages/provenance` | Exact git commit, file path, and line hashing | Tracks the exact source truth for every synthesized claim |
| `packages/impact` | Documentation impact analysis | Detects which architectural docs are invalidated by a diff |
| `packages/wiki` | Incremental, verifiable markdown wiki generator | Produces persistent, human-readable documentation of the entire repo |
| `packages/model` | Multiplier ×1 to ×10 verification passes | Trades compute for rigorous multi-pass grounding and critique |

---

## The Ideal Customer Profile (ICP)

Kaioken is designed for engineers and organizations dealing with **codebase complexity and knowledge loss**:

### ICP 1: The Inheriting Senior / Staff Engineer
- **Persona:** Staff engineer, technical lead, or engineering manager taking over a large (50k+ lines),
  poorly documented, or legacy repository.
- **Pain Point:** Onboarding takes 3 to 6 months; tribal knowledge is locked in the heads of engineers who
  have departed; making changes in core modules causes unexpected regressions in distant packages.
- **Why They Pay:** Kaioken compiles a complete architectural wiki and dependency map in 10 minutes,
  giving them an immediate ground-truth understanding of the system that survives across the entire team.

### ICP 2: Complex Multi-Package / Monorepo Systems Engineers
- **Persona:** Developers building distributed systems, multi-package TypeScript/Rust/Go monorepos, or
  deep infrastructure where inter-module contracts matter more than single-line syntax completions.
- **Pain Point:** Ephemeral AI chat hallucinates non-existent exports or misses cross-package type contracts.
- **Why They Pay:** Kaioken's `impact` and `provenance` engines track exactly how an interface change in
  one package ripples through the workspace.

### ICP 3: Regulated and High-Consequence Engineering Teams
- **Persona:** Engineering teams in fintech, enterprise SaaS, or defense where undocumented code or
  unverified AI hallucinations carry high operational risk.
- **Pain Point:** Developers cannot trust chat suggestions without verified proof of where the logic originated.
- **Why They Pay:** Provenance-backed cards link every claim to a specific commit and file line hash.

---

## Anti-ICP: who this is NOT for

Being explicit about who the product **rejects** is the best defense against scope creep and support exhaustion:

| Persona | Why They Are NOT For Kaioken | Recommended Tool |
|---|---|---|
| **The Single-File / Toy Script Developer** | Building a 100-line Python script or landing page does not require AST graphs, wiki compilers, or multi-pass provenance | Copilot, ChatGPT, Claude.ai |
| **The Pure Autocomplete Consumer** | Wants fast, low-latency tab-autocomplete while typing; does not care about architectural documentation or repository understanding | Supermaven, Copilot |
| **The Zero-Spend Open-Source Hacker** | Demands free unlimited premier model inference; unwilling to supply their own API keys or pay for cloud convenience | Local Ollama CLI tools |

---

## Positioning statement

```markdown
For senior engineers and software teams struggling with complex, poorly documented codebases,
**Kaioken** is an open-source repository knowledge engine that transforms raw code into durable,
verified, living architecture wikis and provenance-tracked intelligence.

Unlike ephemeral AI chat tools that forget context the moment you close the tab,
**Kaioken builds permanent, verifiable codebase knowledge that survives the session.**
```

---

## What done looks like

- [ ] Clear positioning statement published in marketing materials and website briefs.
- [ ] Product feature roadmap filtered through the ICP lens (features that do not serve repository
      knowledge or durable provenance are rejected).
- [ ] Website messaging and CLI onboarding copy aligned with the "durable knowledge" narrative.

---

## Steps

1. **Incorporate positioning into CLI onboarding:** Ensure `kaioken init` or `kaioken scan` introduces
   the engine as a repository intelligence and wiki tool, not a generic chatbot.
2. **Align website copy:** Update `website/` landing page copy to highlight AST scanning, wiki compilation,
   and provenance verification over simple conversational coding.
3. **Validate feature requests against ICP:** When community feature requests arrive (e.g. asking for
   Discord bots or lightweight chat windows), use the Anti-ICP guidelines to politely decline out-of-scope work.

---

## In scope

- Defining ICP personas and pain points.
- Articulating competitive differentiation against ephemeral chat tools.
- Establishing the positioning statement and messaging guidelines.

---

## Out of scope

- Designing marketing graphics, logos, or brand collateral.
- Paid advertising campaigns or sponsorship acquisition.
- Direct sales outreach to enterprise prospects.

---

## Gates

1. Completed ICP and positioning document committed to the repository.
2. Consensus that feature gating and roadmap planning adhere strictly to the "durable repository knowledge" moat.

---

## Traps

| Trap | Guard |
|---|---|
| Positioning as "another AI assistant" | Instant commodity trap. You will be compared directly to Cursor and Copilot on features you do not have |
| Trying to serve everyone | Reject single-file script developers. Focus relentlessly on engineers dealing with large, complex repositories |
| Neglecting the provenance story | Provenance (knowing *why* an architectural claim is true) is Kaioken's superpower. Feature it prominently in all messaging |

---

## Open questions

1. None. The positioning is firmly grounded in the technical capabilities of `kaioken_v2/`.

---

## Session brief

```xml
<task>
In roadmap/money_print/b1-model-and-positioning/, document the positioning strategy and Ideal Customer
Profile (ICP) for Kaioken:

1. Review technical capabilities in kaioken_v2/packages/ (scan, index, graph, impact, provenance, wiki).
2. Articulate the primary differentiator: durable, verified, provenance-tracked repository knowledge
   that survives the session vs ephemeral AI chat.
3. Define the three primary ICP segments (Inheriting Senior Engineer, Complex Monorepo Architect,
   Regulated Engineering Teams).
4. Explicitly define the Anti-ICP (single-file scripters, tab-autocomplete consumers).
5. Formulate a crisp positioning statement for developer-facing documentation.
</task>

<research_mode>
Separate:
- OBSERVED FACTS: kaioken_v2 has tree-sitter AST parsing, documentation impact, and living wiki compilation.
- INFERENCES: Senior engineers in large codebases experience the highest pain around architectural documentation loss.
- OPEN QUESTIONS: Whether systems programming teams (C++/Rust) or web monorepos (TypeScript) represent the fastest-adopting cohort.
</research_mode>

<verification_loop>
Verify that all referenced package capabilities exist in kaioken_v2/packages/.
Confirm no engine code is altered.
</verification_loop>

<action_safety>
Do NOT modify codebase code or documentation outside the money_print/ tree.
Leave work uncommitted.
</action_safety>

<structured_output_contract>
End with: (1) finalized positioning statement, (2) ICP profile summaries, (3) Anti-ICP boundaries,
(4) review of alignment with master roadmap goals.
</structured_output_contract>
```
