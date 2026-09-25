export type DomainCategory =
	| "file_path"
	| "symbol_signature"
	| "api_param"
	| "arch_boundary"
	| "command_example"
	| "perf_metric"
	| "config_key"
	| "dependency_claim"
	| "commit_quote"
	| "db_citation";

export type ClaimKind =
	| "file"
	| "symbol"
	| "anchor"
	| "excerpt"
	| "api_param"
	| "command_example"
	| "arch_boundary"
	| "perf_metric"
	| "config_key"
	| "dependency_claim"
	| "commit_quote"
	| "db_citation"
	| "link";

export interface Claim {
	kind: ClaimKind;
	text: string;
	line: number;
	file?: string;
	startLine?: number;
	endLine?: number;
	category?: string;
	domain?: DomainCategory;
	target?: string;
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
	| "fuzzy_out_of_scope"
	| "ungrounded_perf_metric"
	| "ungrounded_config_key"
	| "ungrounded_dependency"
	| "ungrounded_commit"
	| "ungrounded_db_citation"
	| "unknown_parameter";

export interface Defect {
	kind: DefectKind;
	claim: string;
	line?: number;
	detail: string;
	severity?: "critical" | "warning" | "info";
	suggestions?: string[];
	suggestedReplacement?: string;
	domain?: DomainCategory;
}

export interface CategoryScoreDetail {
	claims: number;
	grounded: number;
	defects: number;
	confidence: number;
	status: "grounded" | "suspect" | "hallucinated";
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
	categoryBreakdown?: Record<string, CategoryScoreDetail>;
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
	auditView?: string;
}

