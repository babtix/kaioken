Language-specific parsers must be named parse<Language>.go (e.g., parseGo.go) and register via langByExt map in codemap.go
Parsers must populate FileMap.Symbols with 1-indexed Line and EndLine, set Exported using exportedName() helper, and leave EndLine=0 for signature-only symbols
Index.Build() must skip files exceeding maxParseBytes or with unsupported extensions but still record them as unanalyzed FileMaps
Bundle() must split budget using defaultSkeletonShare (0.3) for structure, prioritize files by goal relevance via rank(), and emit selected declarations via excerptSymbols() when full source doesn't fit
Symbol verification via HasSymbol() relies on the index.symbols map built during Index.Build()
All parsers must handle unsupported languages gracefully by returning FileMap with Analyzed=false rather than erroring
Skeleton() output must include file path, language/package info, imports (truncated after 20), and symbol lines with L<start>-<end> anchors
