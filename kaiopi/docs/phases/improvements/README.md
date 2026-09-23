# Kaioken Remediation & Improvement Prompts

This directory contains 18 individual, self-contained prompt files designed for an Antigravity (AGY) agent to address and fix each identified issue in the `kaioken` truth layer.

You can feed these prompt files to an agent one by one to fix and verify each package independently.

## Index of Improvement Prompts

| # | File | Target Component | Core Problem Addressed |
|---|---|---|---|
| 01 | [01-scan.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/01-scan.md) | `@kaioken/scan` | 64KB detection window truncation, missing modern secret patterns, gitignore negation bug, Linux case-sensitivity |
| 02 | [02-index.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/02-index.md) | `@kaioken/index` | Parser allocation/free overhead on every file, limited 7-language support, cross-file export resolution |
| 03 | [03-search.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/03-search.md) | `@kaioken/search` | Dynamic TF recalculation (missing inverted index), redundant disk walk on every open, basic tokenization |
| 04 | [04-provenance.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/04-provenance.md) | `@kaioken/provenance` | Hardcoded `".kaioken"` paths, noisy undocumentedFiles metric penalizing configs/tests, coarse file-level staleness |
| 05 | [05-impact.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/05-impact.md) | `@kaioken/impact` | Sequential disk reads of 8,000 files, regex false positives on common symbol names, lack of AST graph integration |
| 06 | [06-graph.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/06-graph.md) | `@kaioken/graph` | Dangling edges pointing to source paths not in nodes list, lack of code dependency graph, Mermaid scaling |
| 07 | [07-gitops.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/07-gitops.md) | `@kaioken/gitops` | Untracked files invisible in diffs, detached background hook execution issues on Windows |
| 08 | [08-verify.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/08-verify.md) | `@kaioken/verify` | `runVerify` hardcodes `npm test` ignoring `detectPackageManager` and `.kaioken/verify.json`, monorepo failures |
| 09 | [09-verifycore.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/09-verifycore.md) | `@kaioken/verifycore` | Massive code duplication with `wiki/verify`, loose substring match false grounding, O(N) linear lookups |
| 10 | [10-skills.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/10-skills.md) | `@kaioken/skills` | Duplicate skill shadowing, restricted to single directory `.kaioken/skills`, lack of frontmatter schema validation |
| 11 | [11-serve.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/11-serve.md) | `@kaioken/serve` | No live-reload or file watching, monolithic 64KB `pages.ts` template file, synchronous full-page search |
| 12 | [12-modelport.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/12-modelport.md) | `@kaioken/modelport` | No retry/exponential backoff on rate limits, no streaming support, inaccurate static spend estimation |
| 13 | [13-plan.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/13-plan.md) | `@kaioken/plan` | Initial JSON parse errors fail fatal without repair loop, no deterministic clustering fallback, no incremental updates |
| 14 | [14-wiki.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/14-wiki.md) | `@kaioken/wiki` | Duplicates `verifycore` instead of importing it, prompt context bloat on large modules, no cross-link validation |
| 15 | [15-research.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/15-research.md) | `@kaioken/research` | Serial web fetching, SSRF DNS rebinding vulnerability, regex HTML parsing vulnerabilities |
| 16 | [16-skillgen.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/16-skillgen.md) | `@kaioken/skillgen` | Missing adversarial repair loop, heuristic task discovery, unverified verification commands |
| 17 | [17-evals.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/17-evals.md) | `@kaioken/evals` | Small 2-file synthetic TypeScript fixture, zero probes for Python/Go/Rust ASTs, missing edge case probes |
| 18 | [18-cli-bin.md](file:///d:/project/ai_now_know/kaioken_kaiopi/docs/phases/improvements/18-cli-bin.md) | `kaioken/bin.ts` & Bridge | Only 6 of 17 modules exposed on CLI, fragile argument parsing, ESM `require` crash in bridge |
