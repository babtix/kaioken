# Kaioken — the offline truth layer

Kaioken is a deterministic, offline knowledge engine that runs inside the Pi
harness. It exists to make a fast, cheap model behave like a grounded senior
engineer: Pi supplies the hands, the model supplies the reasoning, and Kaioken
supplies the truth.

## The trade

| Hallucination cause | Kaioken neutralizer |
|---|---|
| Invented symbols | `@kaioken/index` SymbolOracle: definitive existence, and a negative guarantee |
| Paraphrased code quotes | `resolveExcerpt` / `resolveRange` exact line anchors |
| Missed conventions | knowledge cards and skills injected on demand |
| Context bloat | skeletons-first rationing: structure before text |
| False "done" claims | native test gate (`@kaioken/verify`) |
| Stale knowledge | SHA-256 provenance and a 0-token `status` check |

## Layout

```
kaioken/
  scan/        deterministic repository inventory + risk classification
  index/       Tree-sitter AST index, SymbolOracle, anchor resolution
  search/      BM25 + RRF over wiki, cards and skills
  provenance/  content-hash staleness: which documents a change invalidates
  impact/      blast radius from indexed dependents
  graph/       dependency graph build + render + export bundle
  gitops/      worktrees, diffs, post-commit hook
  verify/      the hard native test gate (npm/go/cargo/make)
  verifycore/  mechanical verifier: symbol, anchor, padding, coverage
  skills/      skill store: parse frontmatter, load a procedure
  serve/       offline preview server (binds 127.0.0.1 only)
  modelport/   the model seam: pure port, pi-ai adapter, spend estimation
  plan/        module plan -> cards, with an adversarial repair loop
  wiki/        chapter cascade: outline -> sections -> write -> verify -> repair
  research/    web-grounded answers with citation verification
  skillgen/    task procedures with every cited path checked
  evals/       offline grounding probe suite and metrics
```

The bridge lives at `.pi/extensions/kaioken/` and is the only place that talks
to Pi: tools, commands, hooks, and the grounding prompt.

## Invariants

1. Pi core is never forked. Everything enters through the extensions API.
2. The core stays offline: `scan`, `symbols`, `search`, `serve`, `status`,
   `verify`, `graph` use zero network and zero keys.
3. No assertion without an oracle lookup.
4. Negative guarantees are first-class answers.
5. No "done" without the native test gate, or an explicit `unverifiable`.
6. Human checkpoints: `modules.yaml`, `wiki-plan.yaml`, and upfront spend
   confirmation.
7. Provenance governs refresh: only invalidated documents regenerate.
8. Skeletons always fit the budget; detail is fetched on demand.
9. Cost transparency is mechanical: prices come from the model's own registry,
   and an unpriceable run reports `unknown` rather than a guess.
10. Offline test discipline: a stage that needs a key to be tested is designed
    wrong.

## Testing

Every package is testable without a network, a credential or a model:

```bash
npm test -w kaioken/modelport -w kaioken/plan -w kaioken/wiki \
         -w kaioken/research -w kaioken/skillgen -w kaioken/evals
```

The eval suite is also runnable as a gate. It drives the real pipeline with
scripted doubles against a temporary fixture repository and exits non-zero when
a metric misses its threshold:

```bash
node kaioken/evals/bin.mjs        # x3
node kaioken/evals/bin.mjs --x10  # exhaustive
```

## Design notes

**The model seam is injected, not imported.** `@kaioken/modelport` defines a
pure `ModelClient`; `PiAiClient` implements it over a `Models` instance the
bridge supplies. The core never reads a key, which is what keeps the whole
generative pipeline offline-testable.

**Verification is two-tier, and the second tier is what keeps it honest.** The
index records declarations, but documentation legitimately names enum values,
options fields and literal filenames too. A name the index declares is grounded
outright; a name appearing verbatim in the source is grounded; a name in neither
is invention, and that is what gets reported.

**Repair only accepts improvement.** Every generative stage runs a
write/verify/repair loop, and a revision is accepted only when its score
strictly improves. A model asked to fix something can make it worse, and keeping
the worse version would defeat the point of measuring at all.

**Checkpoints are mechanical, not polite.** `plan` writes an editable YAML
outline and returns. `wiki --plan` does the same. Correcting a decomposition
before generation costs nothing; correcting it after costs every document.
