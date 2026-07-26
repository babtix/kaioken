Section IDs use snake_case (e.g., "data_models") while titles are human-readable (e.g., "Data Models") as seen in Section struct and OutlinePath/wiki_plan.yaml usage
Global outline (.kaioken/wiki_plan.yaml) and architecture brief (.kaioken/architecture.md) are user-editable; corrections propagate to all chapters via loadOrBuildBrief preferring disk copies
Error handling returns errors up the call stack; parallel execution in runSections continues despite individual document failures (logs via pg.failed but returns nil)
Quality passes triggered by multiplier: >=4 adds critique/revise (passes.go critiqueSystem/correctSystem), >=10 adds grounding verification correction; passesPerDoc defines call counts
Generated documents must include provenance footer via stampProvenance; update.go's docHits uses this as primary signal for determining affected documents
Mermaid diagrams validated via polish.go's validMermaid; invalid blocks demoted to text blocks with warning rather than deleted
Cross-linking via polish.go's linkChapters rewrites first prose mention of sibling chapters into relative markdown links, respecting word boundaries and avoiding markup
Fact extraction in facts.go uses language-specific regex (JS/TS, Python, Java/Kotlin, Go, Ruby) and codemap for CLI commands; results deduplicated and sorted for stable prompts
