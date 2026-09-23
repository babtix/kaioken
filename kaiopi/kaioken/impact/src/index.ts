export { predictImpact, predictImpactForSymbol } from "./predict.ts";
export type { ImpactReport, PredictInput, ModelClient } from "./predict.ts";
export { renderImpact } from "./render.ts";

export {
	buildDependencyGraph,
	findTransitiveDependents,
	extractImportSpecifiers,
	resolveImportSpec,
} from "./cycle.ts";
export type { CycleEntry, TransitiveDependentTree, FileEntry } from "./cycle.ts";

export { computeBlastRadius, renderBlastGauge } from "./score.ts";
export type { BlastRadiusScore, RiskLabel, BlastRadiusBreakdown } from "./score.ts";

export { runPreCommitGate, renderGate } from "./gate.ts";
export type { PreCommitGateResult, BlockerEntry } from "./gate.ts";

export { simulateRename, renderRenameSimulation } from "./rename.ts";
export type { RenameSimulation, CallsiteEntry } from "./rename.ts";

export { exportMermaid } from "./mermaid.ts";
export type { MermaidOptions } from "./mermaid.ts";

