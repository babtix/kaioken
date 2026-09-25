export { analyze, isStopword, splitIdentifier, stem } from "./analyze.ts";
export {
	B,
	CompactPostingsList,
	cosine,
	K1,
	Lexicon,
	OptimizedLexicon,
	phraseBonus,
	RRF_K,
	rrf,
	SearchSessionCache,
	topN,
} from "./bm25.ts";
export type {
	BM25Parameters,
	Posting,
	PostingEntry,
	PostingsStats,
	Ranked,
} from "./bm25.ts";
export {
	applyDomainPathBoost,
	applyPathBoost,
	calculatePhraseQuoteBonus,
	DOMAIN_BOOST_PROFILES,
	getArchetypeBoostDescription,
	parseQueryQuotes,
} from "./boost.ts";
export type {
	DomainArchetype,
	DomainBoostProfile,
	ParsedSearchQuery,
	PathBoostConfig,
	PathBoostResult,
	PhraseBonusResult,
} from "./boost.ts";
export { collect, firstHeading, splitMarkdown } from "./corpus.ts";
export type { Chunk, Corpus, Doc, Kind } from "./corpus.ts";
export {
	ARCHETYPE_RRF_TITLES,
	buildScoreExplanation,
	formatRankExplanation,
	getArchetypeRrfExplanationTitle,
	renderArchetypeRrfVisualizer,
	renderBar,
	visualizeRrfScores,
} from "./explain.ts";
export type {
	RrfRankContribution,
	ScoreExplanation,
	TermScoreContribution,
} from "./explain.ts";
export {
	DOMAIN_ACCENT_COLORS,
	DOMAIN_BADGES,
	extractDenseMatchWindow,
	highlightSnippet,
	renderSnippetHighlightCard,
} from "./highlight.ts";
export type {
	HighlightedSnippetResult,
	HighlightFormat,
	HighlightMatch,
	HighlightOptions,
} from "./highlight.ts";
export {
	evaluateQueryAst,
	formatQueryAst,
	parseQuerySyntax,
} from "./query_parser.ts";
export type {
	AndNode,
	FilterNode,
	NotNode,
	OrNode,
	ParsedBooleanQuery,
	PhraseNode,
	QueryCandidate,
	QueryNode,
	QueryNodeType,
	TermNode,
} from "./query_parser.ts";
export {
	renderSearchHistoryDropdown,
	SearchHistoryStore,
} from "./history.ts";
export type {
	HistoryDropdownOptions,
	RecordSearchOptions,
	SearchHistoryEntry,
} from "./history.ts";
export {
	ZeroDiskSearchSession,
} from "./session.ts";
export type {
	CachedQueryResult,
	SessionMetrics,
	SessionSearchOptions,
} from "./session.ts";
export { SEARCH_DIR, SearchIndex, searchIndexPath } from "./index-store.ts";
export type {
	EmbeddingProvider,
	PersistedIndex,
	SearchHit,
	SearchQuery,
} from "./index-store.ts";
export {
	classifyChunkCategory,
	createLiveSearchPreview,
	extractMatchedTerms,
	formatLivePreviewCard,
	LivePreviewSession,
	PREVIEW_CATEGORIES,
} from "./preview.ts";
export type {
	CategoryMetadata,
	LivePreviewItem,
	LivePreviewOptions,
	LivePreviewSummary,
	PreviewCategory,
} from "./preview.ts";
export { bm25Search } from "./search.ts";
export type { Bm25SearchOptions } from "./search.ts";
