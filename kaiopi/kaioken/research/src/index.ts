export {
	RESEARCH_DIR,
	asProvenance,
	documentPath,
	parseArtifact,
	readResearchDocuments,
	renderMarkdown,
	researchDir,
	writeResearchDocument,
} from "./artifact.ts";
export {
	dedupeHits,
	isFetchableUrl,
	isFetchableUrlResolved,
	isPrivateIp,
	numberSources,
} from "./ports.ts";
export type { DnsLookupFn, WebFetchPort, WebFetchResult, WebHit, WebSearchPort } from "./ports.ts";
export { excerptOf, fenceSource, htmlToText, injectionPatterns } from "./sanitize.ts";
export { buildPrompt, gatherSources, generateResearch, pathFor } from "./run.ts";
export type { GatherInput, GatherResult, GenerateInput, GenerateResult } from "./run.ts";
export { uncitedSentences, verifyCitations } from "./verify.ts";
export {
	BREADTH_THRESHOLD,
	MAX_MULTIPLIER,
	MIN_MULTIPLIER,
	depthFor,
	parseMultiplier,
} from "./types.ts";
export {
	calculateDomainAuthority,
	scoreCredibility,
} from "./credibility.ts";
export type {
	CredibilityInput,
	CredibilityTier,
	SourceCredibility,
} from "./credibility.ts";
export type {
	Citation,
	CitationDefect,
	CitationDefectKind,
	ResearchDepth,
	ResearchDocument,
	ResearchSource,
	ResearchVerification,
	SourceExcerpt,
} from "./types.ts";
