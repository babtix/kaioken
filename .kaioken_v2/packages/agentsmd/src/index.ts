export {
	AGENTS_FILE,
	agentsExists,
	agentsPath,
	authoredBody,
	knowledgeSection,
	loadAgents,
	mergeKnowledge,
} from "./document.js";
export { generateAgents, refreshKnowledgeBlock } from "./generate.js";
export type { AgentsResult, GenerateAgentsInput } from "./generate.js";
export { collectSources, renderSources } from "./sources.js";
export type { Source } from "./sources.js";

// Sprint 5: Context files discovery and prompt formatting
export {
	discoverContextFiles,
	formatContextFilesPrompt,
} from "./context-files.js";
export type { ContextFile, DiscoverContextFilesOptions } from "./context-files.js";
