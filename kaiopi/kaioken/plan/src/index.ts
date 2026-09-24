export {
	CARDS_DIR,
	MODULE_PLAN_ARTIFACT,
	cardsDir,
	modulePlanPath,
	normalisePlan,
	readCards,
	readModulePlan,
	readModulePlanRaw,
	safeFileName,
	writeCard,
	writeModulePlan,
} from "./artifact.ts";
export {
	buildCardPrompt,
	formatCardBadge,
	formatCitationDensityGauge,
	generateCard,
	generateCards,
	isCardSymbolStale,
	renderCard3D,
	renderCardPair,
	updateCardsIncrementally,
	verifyCard,
} from "./cards.ts";
export type { CardResult } from "./cards.ts";
export {
	calculateCardSimilarity,
	deduplicateCards,
	detectDuplicateCards,
	mergeCardCluster,
	mergeDuplicateCards,
} from "./dedupe.ts";
export {
	cardToFrontmatter,
	cardToMarkdown,
	exportCardsToObsidianVault,
	generateVaultMapOfContent,
} from "./export.ts";
export {
	CardSortingSession,
	createModule,
	mergeModules,
	moveFile,
	removeModule,
	renderCardSortingGrid,
	renderModuleTree,
	splitModule,
} from "./cardsort.ts";
export type { CardSortRenderOptions, MergeOptions, SplitOptions } from "./cardsort.ts";
export {
	formatCheckpointReport,
	lintModulePurposes,
	repairYamlCheckpoint,
	validateYamlCheckpoint,
} from "./checkpoint.ts";
export type { CheckpointDiagnostic, CheckpointReport, PurposeLintFinding } from "./checkpoint.ts";
export {
	ARCHITECTURAL_DOMAINS,
	clusterDirectories,
	detectArchitecturalDomain,
} from "./cluster.ts";
export type { ArchitecturalDomain, ClusteringOptions, DomainMeta } from "./cluster.ts";
export {
	computeCoverageIndicator,
	formatCoverageGauge,
	suggestModuleForFile,
} from "./coverage.ts";
export type { CoverageReport, UnassignedFile, UnassignedFileRisk } from "./coverage.ts";
export { gatherEvidence, gatherModuleEvidence } from "./evidence.ts";
export type {
	DirectoryEvidence,
	ModuleEvidence,
	ModuleFileEvidence,
	RepositoryEvidence,
} from "./evidence.ts";
export { buildPrompt, proposeHeuristicModules, proposeModulePlan } from "./propose.ts";
export type { ProposeResult } from "./propose.ts";
export {
	extractRepairJson,
	parseSelfRepairJson,
	repairJson,
} from "./repair.ts";
export type { RepairResult, SelfRepairParseResult } from "./repair.ts";
export type {
	Card,
	Card3DRenderOptions,
	CardDuplicateCluster,
	CardEntryPoint,
	CardSimilarity,
	CardVerification,
	DeduplicationResult,
	Module,
	ModulePlan,
	ObsidianExportOptions,
	PlanDefect,
	PlanValidation,
} from "./types.ts";
export { expandDirectories, findModule, flatten, moduleScope, validatePlan } from "./validate.ts";

