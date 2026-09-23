export type ClaimKind =
	| "file"
	| "symbol"
	| "anchor"
	| "excerpt"
	| "api_param"
	| "command_example"
	| "arch_boundary";

export interface Claim {
	kind: ClaimKind;
	text: string;
	line: number;
	file?: string;
	startLine?: number;
	endLine?: number;
	category?: string;
}

export type DefectKind =
	| "unknown_file"
	| "unknown_symbol"
	| "bad_anchor"
	| "excerpt_not_found"
	| "excerpt_ambiguous"
	| "uncovered_export"
	| "padding"
	| "broken_link"
	| "fabricated_parent"
	| "fuzzy_out_of_scope";

export interface Defect {
	kind: DefectKind;
	claim: string;
	line?: number;
	detail: string;
	severity?: "critical" | "warning" | "info";
	suggestions?: string[];
	suggestedReplacement?: string;
}

export interface GroundingScore {
	confidenceScore: number;
	status: "grounded" | "suspect" | "hallucinated";
	totalClaims: number;
	groundedClaims: number;
	defectCount: number;
	weightedDefectScore: number;
	paddingCount: number;
	coverage: number;
	categoryScores: Record<string, number>;
}

export interface VerificationReport {
	grounded: number;
	defects: Defect[];
	uncovered: string[];
	coverage: number;
	groundingConfidence: number;
	score: GroundingScore;
	repairPrompt?: string;
	annotatedBody?: string;
}
