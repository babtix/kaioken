export { buildIndex } from "./build.ts";
export type { BuildOptions, BuildOutcome, BuildStats } from "./build.ts";
export {
	extractFile,
	docOf,
	isExported,
	signatureOf,
	collectReExports,
	extractFallbackDeclarations,
} from "./extract.ts";
export type { ExtractInput } from "./extract.ts";
export {
	initParser,
	isSupportedLanguage,
	loadGrammar,
	supportedLanguages,
	registerGrammar,
	LanguageParserPool,
	getParserPool,
	withParser,
	clearParserPools,
	getAllPoolStats,
	pruneAllIdleParsers,
} from "./grammars.ts";
export type { ParserPoolOptions, PoolStats } from "./pool.ts";
export { SymbolOracle } from "./oracle.ts";
export type { SymbolLocation } from "./oracle.ts";
export {
	enclosingSymbol,
	readExcerpt,
	resolveExcerpt,
	resolveRange,
} from "./anchors.ts";
export type { Anchor, AnchorResolution, ResolveExcerptOptions } from "./anchors.ts";
export {
	INDEX_ARTIFACT,
	indexArtifactPath,
	readIndexArtifact,
	writeIndexArtifact,
} from "./artifact.ts";
export type {
	FileMap,
	IndexResult,
	ReExportRecord,
	SymbolKind,
	SymbolRecord,
} from "./types.ts";
export {
	applyIndexDelta,
	computeIndexDelta,
	diffFileMaps,
	diffSymbolRecords,
} from "./delta.ts";
export type {
	FileDelta,
	FileUpdateSpec,
	IndexDelta,
	IndexDeltaSummary,
	ModifiedSymbolDiff,
	SymbolDelta,
	SymbolDiffKind,
} from "./delta.ts";
export { ReExportEngine } from "./reexport.ts";
export type {
	FuzzyLookupOptions,
	ReExportHop,
	ReExportResolution,
} from "./reexport.ts";
export {
	buildSymbolPreviewCard,
	renderPlainPreviewCard,
	renderSymbolPreviewCard,
} from "./preview.ts";
export type {
	PreviewCardOptions,
	PreviewSnippetLine,
	RenderCardOptions,
	SymbolPreviewCard,
} from "./preview.ts";
export type { FallbackExtractResult } from "./fallback.ts";
