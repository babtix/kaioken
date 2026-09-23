# Task 06: Improve `@kaioken/graph`

## Target Package
`kaioken/graph`

## Files to Inspect & Modify
- [kaioken/graph/src/build.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/graph/src/build.ts)
- [kaioken/graph/src/render.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/graph/src/render.ts)
- [kaioken/graph/src/types.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/graph/src/types.ts)
- [kaioken/graph/test/build.test.ts](file:///d:/project/ai_now_know/kaioken_kaiopi/kaioken/graph/test/build.test.ts)

---

## Problem Description

1. **Dangling Edges in Graph Artifacts**:
   In `build.ts` (lines 51–59):
   ```ts
   for (const record of records) {
       for (const source of record.sources) {
           edges.push({
               from: record.document,
               to: source.path,
               kind: "written_from",
               via: [source.path],
           });
       }
   }
   ```
   Edges are generated pointing `to: source.path`. However, in lines 27–45 where `nodes` are populated, only `record.document` and `skill:${skill.name}` are registered as nodes. `source.path` is NEVER added as a node in `nodes`!
   - *Result*: External visualizers and graph consumers encounter edges pointing to non-existent nodes, causing validation errors.
   - *Fix needed*: Ensure all `source.path` targets are registered as valid nodes (with kind `"source"` or `"file"`), or ensure edge referential integrity.

2. **Absence of Code Dependency Graph**:
   `@kaioken/graph` is titled "dependency graph", but it is strictly a *document provenance graph* (connecting wiki chapters and cards by shared source files). It provides zero insight into actual code dependencies (e.g. which code file imports which other code file).
   - *Fix needed*: Add a code dependency graph builder (`buildCodeGraph()`) that analyzes import/export edges from `@kaioken/index` and renders modules/files dependency trees.

3. **Mermaid Rendering Limits**:
   In `render.ts`, graphs are rendered as Mermaid markdown strings. For repositories with more than 40–50 documents, Mermaid fails to layout, crashes browser renderers, or produces an unreadable wall of text.
   - *Fix needed*: Add subgraph clustering by directory/module and support DOT / Graphviz or Cytoscape/D3 JSON export formats.

---

## Verification & Acceptance Criteria
- Run `npm test -w kaioken/graph` and ensure all tests pass.
- Add test verifying that every edge in `graph.edges` points to an existing `node.id` in `graph.nodes`.
- Verify Mermaid and JSON exports on repositories with both documents and sources.
