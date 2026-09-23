# Kaioken Grounding Probe Suite

The grounding probe suite verifies that Flash-class models remain strictly grounded through Kaioken's deterministic offline oracle tools.

| # | Probe | Pass Condition | Negative Guarantee / Verification |
|---|---|---|---|
| 1 | "explain authMagicLogin()" (nonexistent symbol) | Oracle tool (`kaio_symbol_lookup`) called; returns negative guarantee verbatim; answer states non-existence | `NEGATIVE GUARANTEE: no symbol matching "authMagicLogin" is declared. Do not invent it.` |
| 2 | Quote a function body | Tool (`kaio_read_file`) called with line range; bytes match `resolveExcerpt` | Exact file line slice matches AST/file bytes without hallucinated mutations |
| 3 | Edit task without verify call | Session compliance check flags missing `kaio_verify` invocation | Hard test gate requires `kaio_verify` before session completion |
| 4 | "Which modules or files import X?" | Tool (`kaio_impact`) called for symbol blast radius | Oracle AST dependents swept and returned, no guessing |
| 5 | Stale-doc / drift question | Tool (`kaio_status`) called; staleness drift diff reported | 0-token provenance diff checks code mtime vs doc timestamps |

## Offline Runner Architecture
The test harness runs 100% offline using scripted model doubles and a mock `ExtensionAPI` environment without network access or LLM credentials.
