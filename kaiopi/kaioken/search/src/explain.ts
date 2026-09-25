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

export const ARCHETYPE_RRF_TITLES: Record<string, string> = {
	api: "Exported API Endpoint Declarations (UX-0781)",
	config: "Configuration Options & Environment Variables (UX-0782)",
	error: "Error Codes & Exception Class Definitions (UX-0783)",
	db: "Database Schema Tables & Migration Scripts (UX-0784)",
	util: "Utility Functions & Helper Algorithms (UX-0785)",
	test: "Test Suite Descriptions & Assertion Blocks (UX-0786)",
	wiki: "Documentation Wiki Chapters & Headings (UX-0787)",
	card: "Knowledge Card Summaries & Cited Sources (UX-0788)",
	skill: "Agent Procedure Instructions & Parameters (UX-0789)",
	commit: "Git Commit Messages & Author Metadata (UX-0790)",
};

/**
 * Returns human-readable feature title for archetype RRF visualizer.
 */
export function getArchetypeRrfExplanationTitle(domain: string): string {
	return ARCHETYPE_RRF_TITLES[domain.toLowerCase()] || `General Document Entity (${domain})`;
}

/**
 * Renders an archetype-tailored visual card explaining RRF rankings (UX-0781 to UX-0790).
 */
export function renderArchetypeRrfVisualizer(exp: ScoreExplanation, domain: string): string {
	const title = getArchetypeRrfExplanationTitle(domain);
	const border = "─".repeat(68);
	const lines: string[] = [
		`┌${border}┐`,
		`│ 📊  RRF RANK VISUALIZER: ${title.padEnd(43)} │`,
		`├${border}┤`,
		`│ Target Path  : ${exp.docPath.slice(-50).padEnd(52)} │`,
		`│ Heading / Loc: ${(exp.heading || `Line ${exp.line}`).slice(0, 50).padEnd(52)} │`,
		`│ Final Score  : ${exp.finalScore.toFixed(5).padEnd(52)} │`,
		`├${border}┤`,
		`│ Channel Contributions & Fusion Formula:                             │`,
		`│   BM25 Lexical Rank  : ${exp.lexicalRank !== undefined ? `#${exp.lexicalRank + 1}`.padEnd(44) : "unranked".padEnd(44)} │`,
		`│   Semantic Vector Rank: ${exp.semanticRank !== undefined ? `#${exp.semanticRank + 1}`.padEnd(43) : "unranked".padEnd(43)} │`,
		`│   Path Multiplier    : ${`×${exp.pathBoost.multiplier.toFixed(2)} (${exp.pathBoost.reason})`.slice(0, 44).padEnd(44)} │`,
	];

	if (exp.rrf.isFused) {
		lines.push(`├${border}┤`, `│ RRF Reciprocal Calculations (k = ${RRF_K}):                             │`);
		for (const c of exp.rrf.contributions) {
			lines.push(`│   • [${c.channel.toUpperCase()}] Rank #${c.rank}: ${c.formula.padEnd(42)} │`);
		}
		lines.push(`│   => Total Fused Score: ${exp.rrf.fusedScore.toFixed(5).padEnd(43)} │`);
	}

	lines.push(`├${border}┤`, `│ Feature Weight Proportions:                                         │`);
	lines.push(`│   BM25 Lexical: ${renderBar(exp.featureWeights.bm25Percent).padEnd(51)} │`);
	if (exp.phraseQuoteBonus.bonus > 0) {
		lines.push(`│   Phrase Bonus: ${renderBar(exp.featureWeights.quotePercent).padEnd(51)} │`);
	}
	lines.push(`│   Path Weight : ${renderBar(exp.featureWeights.boostPercent).padEnd(51)} │`);
	if (exp.semantic) {
		lines.push(`│   Vector Cosine: ${renderBar(exp.featureWeights.semanticPercent).padEnd(50)} │`);
	}

	lines.push(`└${border}┘`);
	return lines.join("\n");
}

