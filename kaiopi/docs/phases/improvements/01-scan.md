# Task 01: Improve `@kaioken/scan`

## Target Package
`kaioken/scan`

## Files to Inspect & Modify
- [kaioken/scan/src/scan.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/scan/src/scan.ts)
- [kaioken/scan/src/risk.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/scan/src/risk.ts)
- [kaioken/scan/src/ignore.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/scan/src/ignore.ts)
- [kaioken/scan/test/scan.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/scan/test/scan.test.ts)
- [kaioken/scan/test/risk.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/scan/test/risk.test.ts)

---

## Problem Description

1. **Large File Risk Truncation Bug**:
   In `scan.ts` (lines 112–154), when a file exceeds `maxReadBytes` (4 MB), `scan` only reads the first 64 KB (`DETECTION_WINDOW`) into `head` via `readHead()`. It then runs `classifyRisk()` on that 64 KB head. Any secret, private key, token, or high-entropy credential located beyond the first 64 KB in a large file is completely missed by the risk classifier.
   - *Fix needed*: Stream-scan or chunk-scan large text files for secrets rather than stopping at the first 64 KB, or inspect up to a reasonable secret scan limit without buffering the entire file into RAM.

2. **Incomplete Modern Secret Patterns**:
   In `risk.ts` (lines 49–68), `CREDENTIAL_CONTENT` only covers legacy patterns:
   - AWS access keys, GitHub classic personal access tokens (`gh[pousr]_`), Slack tokens, Google API keys, Stripe, Anthropic (`sk-ant-`), GitLab, and JWTs.
   - *Missing*: OpenAI modern keys (`sk-proj-...`, `sk-admin-...`, `sk-...`), GitHub fine-grained PATs (`github_pat_...`), Azure connection strings / SAS tokens, HuggingFace tokens (`hf_...`), PyPI API tokens (`pypi-...`), and Bearer auth headers.
   - *Fix needed*: Expand `CREDENTIAL_CONTENT` with high-precision modern patterns for these providers, keeping precision high without false positives on ordinary source code.

3. **Gitignore Negation Layering Semantics**:
   In `ignore.ts` (lines 80–92), `IgnoreStack.ignores(relPath)` iterates from the root layer downwards and immediately returns `true` if `layer.matcher.ignores(relPath)` is true. If the root `.gitignore` ignores `*.log`, and a child directory `src/.gitignore` contains `!important.log`, standard Git semantics dictate that the child's un-ignore rule takes precedence. `IgnoreStack` terminates early at the root layer and never consults the child layer.
   - *Fix needed*: Evaluate layers from deepest to shallowest, or adhere to Git precedence order where child negative rules can override parent positive ignores.

4. **Linux Case-Sensitivity & Directory De-duplication**:
   In `scan.ts` line 53, `seenDirs.add(absDir.toLowerCase())` is used to guard against symlink cycles. On case-sensitive Unix/Linux filesystems, two valid sibling directories like `Component/` and `component/` have identical `.toLowerCase()` values, causing the second directory to be skipped during traversal.
   - *Fix needed*: Use case-preserving keys on non-Windows platforms, or check `stat.ino` / realpath for cycle detection.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/scan` and verify all tests pass.
- Add unit tests in `risk.test.ts` proving OpenAI (`sk-proj-...`), GitHub fine-grained (`github_pat_...`), and HuggingFace tokens are detected.
- Add test verifying that secrets past the 64 KB mark in large files are correctly flagged.
- Add test verifying that child `.gitignore` negation patterns (`!file.txt`) work as expected.
