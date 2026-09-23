export {
	detectCommands,
	detectMonorepo,
	detectPackageManager,
	runGate,
	tail,
	VERIFY_CONFIG,
} from "./gate.js";
export type {
	CommandRunner,
	GateCommand,
	GateReport,
	GateResult,
	GateVerdict,
	PackageManager,
	RunOutcome,
} from "./gate.js";
export { buildSystemPrompt } from "./prompt.js";
export type { EnvironmentInfo, PromptOptions } from "./prompt.js";
export { loadSkills, parseSkill, SKILLS_DIR, skillsDir } from "./skills.js";
export type { LoadedSkills, Skill, SkillProblem } from "./skills.js";
export { KNOWLEDGE_TOOLS, toolByName } from "./tools.js";
export { resolveInside, posix } from "./tools/path.js";
export type {
	CodingTool,
	CodingToolPorts,
	CompactionPort,
	ExtensionPort,
	FileSystemPort,
	GitOpsPort,
	KnowledgeContext,
	KnowledgeTool,
	ParamType,
	SearchPort,
	SessionPort,
	ShellPort,
	ToolParam,
	ToolResult,
	ToolRunOptions,
	ToolUpdateCallback,
} from "./types.js";
export {
	formatTruncatedHead,
	formatTruncatedTail,
	truncateHead,
	truncateLine,
	truncateTail,
} from "./core/truncate.js";
export type {
	TruncateHeadOptions,
	TruncateTailOptions,
	TruncationResult,
} from "./core/truncate.js";
export { paramsToJsonSchema } from "./core/schema.js";

export { createBashTool } from "./tools/coding/bash.js";
export { createEditTool } from "./tools/coding/edit.js";
export { createWriteTool } from "./tools/coding/write.js";
export { createGrepTool } from "./tools/coding/grep.js";
export { createFindTool } from "./tools/coding/find.js";
export { createLsTool } from "./tools/coding/ls.js";
export { withFileMutationQueue } from "./tools/coding/file-mutation-queue.js";
export { generateUnifiedDiff } from "./tools/coding/edit-diff.js";
export { ShellOutputAccumulator } from "./core/shell-output.js";
export type { ShellOutputOptions } from "./core/shell-output.js";
export { createCodingTools, createAllTools } from "./tools/index.js";

