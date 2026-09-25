/**
 * The 10 governance stages tracking model inference expenditure, token budgets,
 * and prompt cache efficiency across Kaioken and Pi.
 */

export type GovernanceStage =
	| "propose-plan"
	| "card-generation"
	| "wiki-synthesis"
	| "staleness-update"
	| "web-research"
	| "skill-adversarial"
	| "impact-prediction"
	| "claim-grounding"
	| "context-packing"
	| "doc-review";

export const ALL_GOVERNANCE_STAGES: readonly GovernanceStage[] = [
	"propose-plan",
	"card-generation",
	"wiki-synthesis",
	"staleness-update",
	"web-research",
	"skill-adversarial",
	"impact-prediction",
	"claim-grounding",
	"context-packing",
	"doc-review",
] as const;

export interface GovernanceStageMeta {
	stage: GovernanceStage;
	label: string;
	description: string;
	defaultContextTokens: number;
	typicalOutputTokens: number;
	warningThresholdTokens: number;
	warningThresholdUsd: number;
}

export const STAGE_METADATA: Record<GovernanceStage, GovernanceStageMeta> = {
	"propose-plan": {
		stage: "propose-plan",
		label: "proposeModulePlan Decomposition Stage",
		description: "Initial heuristic and LLM architectural decomposition into cohesive modules",
		defaultContextTokens: 25_000,
		typicalOutputTokens: 4_000,
		warningThresholdTokens: 50_000,
		warningThresholdUsd: 0.15,
	},
	"card-generation": {
		stage: "card-generation",
		label: "Knowledge Card Batch Generation",
		description: "Batch generation of atomic knowledge cards with symbol grounding and entry points",
		defaultContextTokens: 12_000,
		typicalOutputTokens: 2_000,
		warningThresholdTokens: 40_000,
		warningThresholdUsd: 0.10,
	},
	"wiki-synthesis": {
		stage: "wiki-synthesis",
		label: "Wiki Cascade Chapter Synthesis",
		description: "Hierarchical synthesis of linked technical wiki documentation chapters",
		defaultContextTokens: 30_000,
		typicalOutputTokens: 6_000,
		warningThresholdTokens: 60_000,
		warningThresholdUsd: 0.25,
	},
	"staleness-update": {
		stage: "staleness-update",
		label: "Staleness Incremental Update Run",
		description: "Incremental truth drift re-indexing and selective card/chapter invalidation",
		defaultContextTokens: 18_000,
		typicalOutputTokens: 2_500,
		warningThresholdTokens: 35_000,
		warningThresholdUsd: 0.08,
	},
	"web-research": {
		stage: "web-research",
		label: "Deep Web Research Multi-Page Digest",
		description: "Multi-page autonomous search query aggregation, citation extraction, and synthesis",
		defaultContextTokens: 40_000,
		typicalOutputTokens: 5_000,
		warningThresholdTokens: 80_000,
		warningThresholdUsd: 0.30,
	},
	"skill-adversarial": {
		stage: "skill-adversarial",
		label: "Agent Skill Generation Adversarial Loop",
		description: "Adversarial critique and self-repair cycles generating executable agent skills",
		defaultContextTokens: 15_000,
		typicalOutputTokens: 3_500,
		warningThresholdTokens: 45_000,
		warningThresholdUsd: 0.12,
	},
	"impact-prediction": {
		stage: "impact-prediction",
		label: "Code Impact Prediction Model Inference",
		description: "Diff blast radius analysis, AST dependency cascading, and impact classification",
		defaultContextTokens: 20_000,
		typicalOutputTokens: 2_500,
		warningThresholdTokens: 40_000,
		warningThresholdUsd: 0.10,
	},
	"claim-grounding": {
		stage: "claim-grounding",
		label: "Claim Grounding Model Verification Pass",
		description: "Anti-hallucination verification checking generated claims against source lines",
		defaultContextTokens: 22_000,
		typicalOutputTokens: 3_000,
		warningThresholdTokens: 45_000,
		warningThresholdUsd: 0.12,
	},
	"context-packing": {
		stage: "context-packing",
		label: "Large File Context Window Packing",
		description: "Token packing and compression strategy for massive files approaching window limits",
		defaultContextTokens: 60_000,
		typicalOutputTokens: 4_000,
		warningThresholdTokens: 100_000,
		warningThresholdUsd: 0.40,
	},
	"doc-review": {
		stage: "doc-review",
		label: "Multi-Chapter Documentation Review",
		description: "Cross-chapter narrative consistency, orphaned link detection, and quality review",
		defaultContextTokens: 35_000,
		typicalOutputTokens: 5_000,
		warningThresholdTokens: 70_000,
		warningThresholdUsd: 0.25,
	},
};

export function isGovernanceStage(val: string): val is GovernanceStage {
	return ALL_GOVERNANCE_STAGES.includes(val as GovernanceStage);
}
