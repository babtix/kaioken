import type { Claim, Defect, GroundingScore } from "./types.ts";

export const DEFECT_WEIGHTS: Readonly<Record<string, number>> = {
	unknown_file: 25,
	unknown_symbol: 25,
	fabricated_parent: 25,
	bad_anchor: 15,
	excerpt_not_found: 15,
	broken_link: 15,
	fuzzy_out_of_scope: 15,
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
	};
}
