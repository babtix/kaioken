export { RESEARCH_DIR, asProvenance, documentPath, parseArtifact, readResearchDocuments, renderMarkdown, researchDir, writeResearchDocument } from "./artifact.js";
export { dedupeHits, isFetchableUrl, numberSources } from "./ports.js";
export type { WebFetchPort, WebFetchResult, WebHit, WebSearchPort } from "./ports.js";
export { excerptOf, fenceSource, htmlToText, injectionPatterns } from "./sanitize.js";
export type { GatherInput, GatherResult, GenerateInput, GenerateResult } from "./run.js";
export { buildPrompt, gatherSources, generateResearch, pathFor } from "./run.js";
export { uncitedSentences, verifyCitations } from "./verify.js";
export {
	BREADTH_THRESHOLD,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	depthFor,
	parseMultiplier,
} from "./types.js";
export type {
	Citation,
	CitationDefect,
	CitationDefectKind,
	ResearchDepth,
	ResearchDocument,
	ResearchSource,
	ResearchVerification,
	SourceExcerpt,
} from "./types.js";
