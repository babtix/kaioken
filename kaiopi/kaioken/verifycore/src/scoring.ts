import type { CategoryScoreDetail, Claim, Defect, DomainCategory, GroundingScore } from "./types.ts";

export const ALL_DOMAINS: readonly DomainCategory[] = [
	"file_path",
	"symbol_signature",
	"api_param",
	"arch_boundary",
	"command_example",
	"perf_metric",
	"config_key",
	"dependency_claim",
	"commit_quote",
	"db_citation",
];

export const DEFECT_WEIGHTS: Readonly<Record<string, number>> = {
	unknown_file: 25,
	unknown_symbol: 25,
	fabricated_parent: 25,
	ungrounded_perf_metric: 20,
	ungrounded_config_key: 20,
	ungrounded_dependency: 20,
	ungrounded_commit: 20,
	ungrounded_db_citation: 20,
	bad_anchor: 15,
	excerpt_not_found: 15,
	broken_link: 15,
	fuzzy_out_of_scope: 15,
	unknown_parameter: 15,
	excerpt_ambiguous: 8,
	padding: 8,
	uncovered_export: 3,
};

export function calculateGroundingScore(
	claims: readonly Claim[],
	defects: readonly Defect[],
	coverage: number,
	paddingCount: number,
): GroundingScore {
	const totalClaims = claims.length + paddingCount;
	let weightedDefectScore = 0;
	const categoryScores: Record<string, number> = {};

	for (const defect of defects) {
		const weight = DEFECT_WEIGHTS[defect.kind] ?? 10;
		weightedDefectScore += weight;
		categoryScores[defect.kind] = (categoryScores[defect.kind] ?? 0) + weight;
	}

	const groundedClaims = Math.max(0, totalClaims - defects.length);

	let confidenceScore = 100;
	if (totalClaims === 0) {
		if (defects.length > 0) {
			confidenceScore = Math.max(0, 100 - weightedDefectScore);
		}
	} else {
		const defectRatio = weightedDefectScore / (totalClaims * 15);
		const coveragePenalty = (1 - coverage) * 15;
		const raw = 100 - defectRatio * 85 - coveragePenalty;
		confidenceScore = Math.max(0, Math.min(100, Math.round(raw)));
	}

	let status: "grounded" | "suspect" | "hallucinated";
	if (confidenceScore >= 90) {
		status = "grounded";
	} else if (confidenceScore >= 70) {
		status = "suspect";
	} else {
		status = "hallucinated";
	}

	// UX-1161 to UX-1170: Per-category defect scoring and grounding confidence calculation
	const categoryBreakdown: Record<string, CategoryScoreDetail> = {};
	for (const domain of ALL_DOMAINS) {
		const domainClaims = claims.filter((c) => c.domain === domain || (domain === "symbol_signature" && (c.kind === "symbol" || c.kind === "anchor" || c.kind === "excerpt")) || (domain === "file_path" && (c.kind === "file" || c.kind === "link")));
		const domainDefects = defects.filter((d) => d.domain === domain || (domain === "file_path" && (d.kind === "unknown_file" || d.kind === "fabricated_parent" || d.kind === "broken_link")) || (domain === "symbol_signature" && (d.kind === "unknown_symbol" || d.kind === "bad_anchor" || d.kind === "excerpt_not_found" || d.kind === "excerpt_ambiguous" || d.kind === "fuzzy_out_of_scope")) || (domain === "perf_metric" && d.kind === "ungrounded_perf_metric") || (domain === "config_key" && d.kind === "ungrounded_config_key") || (domain === "dependency_claim" && d.kind === "ungrounded_dependency") || (domain === "commit_quote" && d.kind === "ungrounded_commit") || (domain === "db_citation" && d.kind === "ungrounded_db_citation") || (domain === "api_param" && d.kind === "unknown_parameter"));

		const domainClaimCount = domainClaims.length;
		const domainDefectCount = domainDefects.length;
		const domainGroundedCount = Math.max(0, domainClaimCount - domainDefectCount);

		let domainConfidence = 100;
		if (domainClaimCount === 0) {
			domainConfidence = domainDefectCount > 0 ? 0 : 100;
		} else {
			let domainWeightedDefects = 0;
			for (const d of domainDefects) {
				domainWeightedDefects += DEFECT_WEIGHTS[d.kind] ?? 10;
			}
			const domainPenalty = (domainWeightedDefects / (domainClaimCount * 20)) * 100;
			domainConfidence = Math.max(0, Math.min(100, Math.round(100 - domainPenalty)));
		}

		let domainStatus: "grounded" | "suspect" | "hallucinated";
		if (domainConfidence >= 90) {
			domainStatus = "grounded";
		} else if (domainConfidence >= 70) {
			domainStatus = "suspect";
		} else {
			domainStatus = "hallucinated";
		}

		categoryBreakdown[domain] = {
			claims: domainClaimCount,
			defects: domainDefectCount,
			grounded: domainGroundedCount,
			confidence: domainConfidence,
			status: domainStatus,
		};
	}

	return {
		confidenceScore,
		status,
		totalClaims,
		groundedClaims,
		defectCount: defects.length,
		weightedDefectScore,
		paddingCount,
		coverage: Math.round(coverage * 100) / 100,
		categoryScores,
		categoryBreakdown,
	};
}

export function calculateDomainConfidence(
	claims: readonly Claim[],
	defects: readonly Defect[],
	domain: DomainCategory,
): CategoryScoreDetail {
	const score = calculateGroundingScore(claims, defects, 1.0, 0);
	return score.categoryBreakdown?.[domain] ?? {
		claims: 0,
		grounded: 0,
		defects: 0,
		confidence: 100,
		status: "grounded",
	};
}
