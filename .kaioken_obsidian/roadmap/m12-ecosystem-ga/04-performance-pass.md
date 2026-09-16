# M12-04 · Performance pass against TS baseline

> Establish the first empirical benchmark baseline for the TypeScript engine on large repositories, measure wall-clock times and token expenditures, and commit the verified figures.

| Field | Value |
|---|---|
| **Status** | `ready` |
| **Size** | M |
| **Depends on** | None. Establishing a fresh baseline on the TypeScript engine and committing the number requires no decision — the Go v1.3.1 numbers do not transfer, so baseline benchmarking can begin immediately. |
| **Blocks** | `05-v2-release-checklist.md` |
| **Touches** | `kaioken_v2/benchmarks/`, `roadmap/benchmarks/`, `kaioken_v2/packages/` |
| **Risk** | Medium. Measuring performance on toy codebases produces misleading metrics. Baselines must be run on realistic multi-thousand-file repositories. |
| **Gate-critical** | Yes |

## Why this exists

In the original v1 roadmap, M12 specified a "performance pass vs baseline." In v1, that baseline was measured against the compiled Go binary (v1.3.1).

**None of the v1.3.1 performance numbers transfer to the TypeScript engine.** The runtime characteristics of Node 22 V8 execution, tree-sitter C++ native bindings, in-memory BM25 index stores, and asynchronous model pool loops are fundamentally different from compiled Go channels.

Therefore, **the FIRST job of this leaf is establishing a new baseline on the TypeScript engine and committing the actual numbers.**

Without a recorded baseline, claims of "optimization" or "regression" are mere conjecture. This leaf defines a reproducible benchmark suite, executes it against a standard benchmark repository (e.g. a 5,000+ file polyglot repository), records wall-clock runtimes and token consumption, and identifies performance bottlenecks in `scan`, `index`, `search`, and `wiki` generation.

## Current state

Verified against the working tree.

| Fact | Evidence |
|---|---|
| Engine requires Node 22 | `kaioken_v2/package.json` specifies `"engines": { "node": ">=22" }` |
| Scan executes one canonical traversal | `kaioken_v2/packages/scan/src/index.ts` |
| Index uses tree-sitter parsers | `kaioken_v2/packages/index/src/grammars.ts` and `queries/*.scm` |
| Search is in-memory BM25 | `kaioken_v2/packages/search/src/bm25.ts` |
| Token accounting variance noted (gap G-4) | `roadmap/README.md:324` ("Token and cost figures can be wrong when a model's accounting is unavailable") |
| Dogfood operating rule | `roadmap/README.md:387` (Operating rule 5: "Run /wiki and /skills on Kaioken itself monthly and commit the output") |

`UNVERIFIED:` Memory overhead of tree-sitter AST nodes when indexing repositories exceeding 50,000 files in a single Node process.

## What done looks like

- [ ] A reproducible benchmark runner is implemented in `kaioken_v2/benchmarks/` (e.g. `npm run bench`).
- [ ] A standard multi-file benchmark repository is selected and documented (e.g. Kaioken itself plus a public polyglot target).
- [ ] Baseline metrics are captured and committed in `roadmap/benchmarks/v2-baseline.json`:
  - `scan`: Files per second, memory peak (RSS), traversal wall-clock time.
  - `index`: Symbol extraction throughput, tree-sitter query execution time.
  - `search`: BM25 index build time, lexical query latency (p50, p95, p99).
  - `status --check`: Freshness verification latency (must complete in <2 seconds for CI viability).
  - `wiki x1`: End-to-end wall-clock duration and token usage per chapter.
- [ ] Any hot-path performance bottlenecks consuming >40% of runtime are profiled using Node's `--prof` or clinic.js and documented.
- [ ] Regression thresholds are established so CI can alert if future PRs degrade scan or index speeds by >20%.

## Steps

1. **Design Benchmark Harness.**
   - Create `kaioken_v2/benchmarks/harness.ts` utilizing `node:perf_hooks` (`performance.now()`) and `process.memoryUsage()`.
   - Ensure the harness runs offline for deterministic phases (`scan`, `index`, `search`, `status`) without requiring API keys.
2. **Execute First Empirical Baseline Run.**
   - Run the harness across:
     1. Kaioken codebase itself (~150 files).
     2. Large open-source benchmark repo (e.g., ~5,000 files containing TS, Python, Rust, Go).
   - Record exact millisecond counts and memory allocations.
3. **Measure Generative Wiki Costs.**
   - Run `kaioken wiki x1` against a known 5-module project with fixed seed prompts.
   - Record total prompt tokens, completion tokens, wall-clock time, and total API spend (accounting for gap G-4 warnings).
4. **Commit Baseline Data.**
   - Save the raw run results to `roadmap/benchmarks/v2-baseline.json` and generate a human-readable summary in `roadmap/benchmarks/README.md`.
5. **Implement Critical Hot-Path Optimizations.**
   - If profiling indicates excessive GC pressure or file read bottlenecks (e.g. repeated `readFile` calls in `packages/index`), apply surgical optimizations within the affected package (Operating rule 3: one package per session).

## In scope

- Benchmark harness script in `kaioken_v2/benchmarks/`.
- Baseline measurement data committed to `roadmap/benchmarks/`.
- Hot-path profiling and optimization of `scan` and `index`.
- Documenting performance characteristics for release notes.

## Out of scope

- Semantic search vector embedding benchmarks — search is strictly BM25 lexical in this release.
- Modifying tree-sitter C++ upstream grammars.
- Benchmarking distributed multi-node workers (refused non-goal).

## Gates

Run benchmark suite from `kaioken_v2/`:

```bash
node benchmarks/harness.mjs --target .
```

Verify that `status --check` completes in under 2 seconds:

```bash
time node apps/cli/dist/bin.js status --check
```

Engine tests must remain 100% green:

```bash
npm run typecheck && npm test
```

## Traps

| Trap | Guard |
|---|---|
| Quoting old v1.3.1 Go figures | The Go numbers are completely irrelevant to Node 22. Measure and commit fresh TypeScript numbers before doing any tuning. |
| Benchmarking with remote LLM variance | Separate deterministic offline gates (`scan`, `index`, `search`) from generative passes. Do not let model API network jitter skew engine performance baselines. |
| Memory leaks on 10,000+ files | Monitor `process.memoryUsage().heapUsed` during large scans. Ensure AST references are garbage collected and not held in global arrays. |
| Optimizing before measuring | Follow operating rule: measure first, record the number, optimize the verified bottleneck, then re-measure against the golden baseline. |
| Commercial licensing collision | Large repository benchmarks simulate enterprise scale; enterprise adoption depends on resolving License Zero Noncommercial 2.0.1. |

## Open questions

None. This leaf is fully specified.

## Session brief

```xml
<task>
In kaioken_v2/, establish the first empirical benchmark baseline for the TypeScript engine and commit the recorded numbers.

The v1.3.1 Go benchmarks do not transfer to Node 22. Your primary job is to measure and commit the baseline performance of the canonical TypeScript engine:

1. In kaioken_v2/benchmarks/, create harness.ts (or bench.ts):
   - Measure scan traversal rate (files/sec, wall-clock ms, heap used).
   - Measure index construction throughput across tree-sitter grammars (packages/index).
   - Measure search BM25 corpus indexing and query latency (packages/search).
   - Measure status --check execution duration (must be <2000ms).
2. Execute the benchmark on the Kaioken repository itself and on a large polyglot fixture.
3. Record the exact figures in roadmap/benchmarks/v2-baseline.json:
   - System specs (Node version, OS, CPU architecture).
   - Millisecond timings (p50, p95).
   - Memory RSS and heap allocation peaks.
4. Profile the results: Identify if any single operation accounts for >40% of runtime. If an obvious bottleneck exists (e.g. redundant file reads in index/build.ts), document the optimization target.
5. Create a concise markdown summary in roadmap/benchmarks/README.md.
</task>

<verification_loop>
Run from kaioken_v2/:
  npm run typecheck
  npm test
  node benchmarks/harness.mjs
Confirm that the benchmark runs cleanly without network calls or API keys, and that output metrics are written to roadmap/benchmarks/.
</verification_loop>

<action_safety>
Do not perform sweeping refactors across multiple packages in this session. If an optimization is identified, record it in the benchmark report for a targeted one-package session (Rule 3).
Do NOT run git add or git commit — leave all changes uncommitted in the working tree.
</action_safety>

<structured_output_contract>
End with: (1) summary of the benchmark harness and methodology, (2) recorded baseline numbers for scan, index, and status, (3) identified hotspots, (4) location of committed baseline JSON artifacts.
</structured_output_contract>
```
