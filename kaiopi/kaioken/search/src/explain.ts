/**
 * Reciprocal Rank Fusion (RRF) score visualizer and ranking explainability engine.
 * Features: #UX-0731 to #UX-0740, #UX-0781 to #UX-0790
 */

import { RRF_K } from "./bm25.ts";
import type { SearchHit } from "./index-store.ts";

export interface TermScoreContribution {
	readonly term: string;
	readonly tf: number;
	readonly idf: number;
	readonly norm: number;
	readonly contribution: number;
}

export interface RrfRankContribution {
	readonly channel: "lexical" | "semantic";
	readonly rank: number;
	readonly score: number;
	readonly formula: string;
}

export interface ScoreExplanation {
	readonly docPath: string;
	readonly heading: string;
	readonly line: number;
	readonly finalScore: number;
	readonly lexicalRank?: number;
	readonly semanticRank?: number;
	readonly bm25: {
		readonly rawScore: number;
		readonly terms: TermScoreContribution[];
	};
	readonly phraseQuoteBonus: {
		readonly bonus: number;
		readonly matchedQuotes: string[];
	};
	readonly pathBoost: {
		readonly multiplier: number;
		readonly boostedScore: number;
		readonly reason: string;
	};
	readonly semantic?: {
		readonly cosineSimilarity: number;
		readonly rank: number;
	};
	readonly rrf: {
		readonly isFused: boolean;
		readonly contributions: RrfRankContribution[];
		readonly fusedScore: number;
	};
	readonly featureWeights: {
		readonly bm25Percent: number;
		readonly quotePercent: number;
		readonly boostPercent: number;
		readonly semanticPercent: number;
	};
}

/**
 * Render an ASCII progress/weight bar: [████████░░░░] 67%
 */
export function renderBar(percentage: number, width = 12): string {
	const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
	const filledChars = Math.round((clamped / 100) * width);
	const emptyChars = width - filledChars;
	const bar = "█".repeat(filledChars) + "░".repeat(emptyChars);
	return `[${bar}] ${clamped.toString().padStart(3, " ")}%`;
}

/**
 * Explains how a specific search hit calculated its score and achieved its ranking.
 */
export function buildScoreExplanation(params: {
	hit: SearchHit;
	rawBm25: number;
	terms: TermScoreContribution[];
	quoteBonus: number;
	matchedQuotes: string[];
	pathMultiplier: number;
	pathReason: string;
	lexicalRank?: number;
	semanticRank?: number;
	cosineSimilarity?: number;
}): ScoreExplanation {
	const {
		hit,
		rawBm25,
		terms,
		quoteBonus,
		matchedQuotes,
		pathMultiplier,
		pathReason,
		lexicalRank,
		semanticRank,
		cosineSimilarity,
	} = params;

	const boostedScore = (rawBm25 + quoteBonus) * pathMultiplier;

	// Calculate RRF contributions if rankings exist
	const rrfContributions: RrfRankContribution[] = [];
	let fusedScore = 0;

	if (lexicalRank !== undefined && lexicalRank >= 0) {
		const lexContrib = 1 / (RRF_K + lexicalRank + 1);
		fusedScore += lexContrib;
		rrfContributions.push({
			channel: "lexical",
			rank: lexicalRank + 1,
			score: lexContrib,
			formula: `1 / (${RRF_K} + ${lexicalRank + 1}) = ${lexContrib.toFixed(5)}`,
		});
	}

	if (semanticRank !== undefined && semanticRank >= 0) {
		const semContrib = 1 / (RRF_K + semanticRank + 1);
		fusedScore += semContrib;
		rrfContributions.push({
			channel: "semantic",
			rank: semanticRank + 1,
			score: semContrib,
			formula: `1 / (${RRF_K} + ${semanticRank + 1}) = ${semContrib.toFixed(5)}`,
		});
	}

	const isFused = rrfContributions.length > 1;

	// Estimate feature weights
	const totalLexicalComponents = rawBm25 + quoteBonus;
	const bm25Ratio = totalLexicalComponents > 0 ? (rawBm25 / totalLexicalComponents) * 100 : 0;
	const quoteRatio = totalLexicalComponents > 0 ? (quoteBonus / totalLexicalComponents) * 100 : 0;
	const boostRatio = pathMultiplier > 1.0 ? ((pathMultiplier - 1.0) / pathMultiplier) * 100 : 0;
	const semanticRatio = isFused ? 50 : cosineSimilarity ? 100 : 0;

	return {
		docPath: hit.path,
		heading: hit.heading,
		line: hit.line,
		finalScore: isFused ? fusedScore : hit.score,
		lexicalRank,
		semanticRank,
		bm25: {
			rawScore: rawBm25,
			terms,
		},
		phraseQuoteBonus: {
			bonus: quoteBonus,
			matchedQuotes,
		},
		pathBoost: {
			multiplier: pathMultiplier,
			boostedScore,
			reason: pathReason,
		},
		semantic:
			cosineSimilarity !== undefined && semanticRank !== undefined
				? {
						cosineSimilarity,
						rank: semanticRank + 1,
				  }
				: undefined,
		rrf: {
			isFused,
			contributions: rrfContributions,
			fusedScore,
		},
		featureWeights: {
			bm25Percent: bm25Ratio,
			quotePercent: quoteRatio,
			boostPercent: boostRatio,
			semanticPercent: semanticRatio,
		},
	};
}

/**
 * Format a rich visual breakdown card for a single scored item.
 */
export function formatRankExplanation(exp: ScoreExplanation): string {
	const lines: string[] = [];

	lines.push(`┌── Ranking Explanation: ${exp.heading} (${exp.docPath}:${exp.line}) ──┐`);
	lines.push(`│ Final Score: ${exp.finalScore.toFixed(4)} | Channels: ${exp.rrf.isFused ? "RRF Hybrid (Lexical + Semantic)" : "Lexical BM25"}`);
	lines.push("├─────────────────────────────────────────────────────────────────────────────┤");

	// Feature Weight Distribution Bars
	lines.push("│ Score Factor Weights:");
	lines.push(`│   BM25 Lexical:    ${renderBar(exp.featureWeights.bm25Percent)} (raw: ${exp.bm25.rawScore.toFixed(3)})`);
	if (exp.phraseQuoteBonus.bonus > 0) {
		lines.push(`│   Exact Phrase:    ${renderBar(exp.featureWeights.quotePercent)} (+${exp.phraseQuoteBonus.bonus.toFixed(2)} quotes: ${exp.phraseQuoteBonus.matchedQuotes.join(", ")})`);
	}
	if (exp.pathBoost.multiplier !== 1.0) {
		lines.push(`│   Path Multiplier: ${renderBar(exp.featureWeights.boostPercent)} (${exp.pathBoost.reason})`);
	}
	if (exp.semantic) {
		lines.push(`│   Semantic Vector: ${renderBar(exp.featureWeights.semanticPercent)} (cosine: ${exp.semantic.cosineSimilarity.toFixed(3)}, rank: #${exp.semantic.rank})`);
	}

	lines.push("├─────────────────────────────────────────────────────────────────────────────┤");
	lines.push("│ BM25 Query Term Contributions:");
	if (exp.bm25.terms.length === 0) {
		lines.push("│   (No lexical query terms scored)");
	} else {
		for (const t of exp.bm25.terms) {
			lines.push(`│   • "${t.term}": tf=${t.tf}, idf=${t.idf.toFixed(3)}, norm=${t.norm.toFixed(3)} -> score=${t.contribution.toFixed(4)}`);
		}
	}

	if (exp.rrf.isFused) {
		lines.push("├─────────────────────────────────────────────────────────────────────────────┤");
		lines.push(`│ Reciprocal Rank Fusion (k = ${RRF_K}):`);
		for (const c of exp.rrf.contributions) {
			lines.push(`│   • [${c.channel.toUpperCase()}] Rank #${c.rank}: ${c.formula}`);
		}
		lines.push(`│   => Total Fused RRF Score: ${exp.rrf.fusedScore.toFixed(5)}`);
	}

	lines.push("└─────────────────────────────────────────────────────────────────────────────┘");
	return lines.join("\n");
}

/**
 * Format a comparative ranking visualizer table for top search results.
 */
export function visualizeRrfScores(explanations: readonly ScoreExplanation[]): string {
	if (explanations.length === 0) {
		return "No search results to explain.";
	}

	const lines: string[] = [];
	lines.push("┌────┬─────────────────────────────┬───────────┬──────────┬──────────┬──────────┐");
	lines.push("│Rank│ Passage                     │ Final RRF │ BM25 Raw │ Quotes   │ Path Mul │");
	lines.push("├────┼─────────────────────────────┼───────────┼──────────┼──────────┼──────────┤");

	for (let i = 0; i < explanations.length; i++) {
		const exp = explanations[i];
		if (!exp) continue;

		const rankStr = `#${i + 1}`.padEnd(4, " ");
		const titleTrunc = exp.heading.slice(0, 27).padEnd(27, " ");
		const finalStr = exp.finalScore.toFixed(4).padStart(9, " ");
		const bm25Str = exp.bm25.rawScore.toFixed(3).padStart(8, " ");
		const quoteStr = `+${exp.phraseQuoteBonus.bonus.toFixed(1)}`.padStart(8, " ");
		const pathStr = `×${exp.pathBoost.multiplier.toFixed(2)}`.padStart(8, " ");

		lines.push(`│${rankStr}│ ${titleTrunc} │ ${finalStr} │ ${bm25Str} │ ${quoteStr} │ ${pathStr} │`);
	}

	lines.push("└────┴─────────────────────────────┴───────────┴──────────┴──────────┴──────────┘");
	return lines.join("\n");
}
