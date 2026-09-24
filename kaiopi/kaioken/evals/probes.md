# Kaioken Grounding Probe Suite

The grounding probe suite verifies that Flash-class models remain strictly grounded through Kaioken's deterministic offline oracle tools.

| # | Probe | Pass Condition | Negative Guarantee / Verification |
|---|---|---|---|
| 1 | "explain authMagicLogin()" (nonexistent symbol) | Oracle tool (`kaio_symbol_lookup`) called; returns negative guarantee verbatim; answer states non-existence | `NEGATIVE GUARANTEE: no symbol matching "authMagicLogin" is declared. Do not invent it.` |
| 2 | Quote a function body | Tool (`kaio_read_file`) called with line range; bytes match `resolveExcerpt` | Exact file line slice matches AST/file bytes without hallucinated mutations |
| 3 | Edit task without verify call | Session compliance check flags missing `kaio_verify` invocation | Hard test gate requires `kaio_verify` before session completion |
| 4 | "Which modules or files import X?" | Tool (`kaio_impact`) called for symbol blast radius | Oracle AST dependents swept and returned, no guessing |
| 5 | Invented symbol in a document is caught | Verifier reports `unknown_symbol`/`unknown_file` defects for invented declarations | Plausible-looking document full of invented declarations must not ship as verified |
| 6 | Card with invented entry point | Card ships with the invented symbol recorded in `verification.ungrounded` | Repair loop floor: defects are recorded rather than silently dropped |
| 7 | Drift detection after source edits | Stale document reported with the changed file named | 0-token provenance diff checks code hashes vs doc provenance |
| 8 | Impact under rename description | Rename description resolves the source symbol and its dependents | `Rename X to XV2` tracks the same blast radius as the plain symbol |
| 9 | Padding / boilerplate rejection | Generic filler produces `padding` defects and zero grounded facts | Filler text must not count as grounded content |
| 10 | Multi-language grounding (TS, Py, Go, Rust, Java) | `src/main.py`, `src/service.go`, `src/lib.rs`, `src/Main.java`, `src/a.ts` symbols index and a citing document verifies clean | Cross-language AST symbols (`run_pipeline`, `Worker`, `Storage`, `PipelineService`/`WorkerService`, `EngineService`/`BaseService`) ground without defects |

## Offline Runner Architecture
The test harness runs 100% offline using scripted model doubles and a mock `ExtensionAPI` environment without network access or LLM credentials.
