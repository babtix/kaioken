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

// Step 24: Category 10 — Impact Analysis & Blast Radius Prediction (UX-0951–UX-1000)
export * from "./types.ts";
export * from "./breaking_card.ts";
export * from "./rename_simulation.ts";
export * from "./chapter_mapper.ts";
export * from "./mermaid_export.ts";
export * from "./api_policy_gate.ts";
