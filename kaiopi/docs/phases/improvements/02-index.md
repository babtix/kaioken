# Task 02: Improve `@kaioken/index`

## Target Package
`kaioken/index`

## Files to Inspect & Modify
- [kaioken/index/src/extract.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/src/extract.ts)
- [kaioken/index/src/grammars.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/src/grammars.ts)
- [kaioken/index/src/build.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/src/build.ts)
- [kaioken/index/src/oracle.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/src/oracle.ts)
- [kaioken/index/test/extract.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/test/extract.test.ts)
- [kaioken/index/test/oracle.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/index/test/oracle.test.ts)

---

## Problem Description

1. **Parser Allocation & Destruction Per File**:
   In `extract.ts` (lines 60–70):
   ```ts
   const parser = await newParser(grammar.language);
   try {
       const tree = parser.parse(input.source);
       ...
       tree.delete();
   } finally {
       parser.delete();
   }
   ```
   For a repository with 5,000 files, `newParser()` initializes a WebAssembly Tree-sitter parser 5,000 times, and frees it 5,000 times. This creates substantial garbage collection and WASM boundary overhead.
   - *Fix needed*: Implement a parser pool or cache per language (e.g., reusing an initialized `Parser` instance for files of the same language, calling `parser.reset()` if needed, or bounding a pool to concurrency limits).

2. **Language Coverage Limitations**:
   In `grammars.ts` (lines 21–41), `GRAMMARS` only supports 7 grammar targets: `typescript`, `tsx`, `javascript`, `jsx`, `python`, `go`, and `rust`.
   Large portions of modern enterprise stacks (C, C++, C#, Java, Kotlin, Swift, Ruby, PHP, SQL, Shell/Bash) are classified as `unparsedLanguages` and lack AST declaration indexing.
   - *Fix needed*: Provide a clean extension point or add support for additional key languages (e.g. `java`, `c`, `cpp`, `c_sharp`, `ruby`) with their corresponding `.scm` query definitions, or provide a fallback regex extractor for unparsed languages so symbols can still be indexed.

3. **Re-Export and Alias Resolution**:
   In `extract.ts`, symbols are extracted strictly as syntactic tokens within the single file. In modern JavaScript/TypeScript, re-exports (`export { bar as foo } from './bar'`) and wildcards (`export * from './module'`) are common. When `SymbolOracle` looks up `foo`, it cannot connect re-exports or alias chains across files.
   - *Fix needed*: Add re-export capture to query extraction and index metadata so `SymbolOracle` can resolve re-exported declarations to their originating files.

4. **Anchor Resolution Resilience on Multi-Occurrence Names**:
   In `anchors.ts`, `resolveExcerpt` falls back to fuzzy string matching when lines change. If a short symbol name or common statement appears multiple times in a file, the resolver can bind to the wrong line range.
   - *Fix needed*: Contextualize anchor matching using surrounding AST node boundaries and parent scope rather than flat string line scanning.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/index` and verify all tests pass.
- Benchmark or assert parser re-use across multiple files of the same language without memory leaks.
- Verify that re-exported symbols or aliased declarations resolve in `SymbolOracle`.
