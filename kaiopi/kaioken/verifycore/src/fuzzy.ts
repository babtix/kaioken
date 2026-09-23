import type { FileMap } from "@kaioken/index";
import { enclosingSymbol, resolveExcerpt } from "@kaioken/index";

export interface FuzzyAnchorResolution {
	resolved: boolean;
	exact: boolean;
	anchor?: {
		path: string;
		startLine: number;
		endLine: number;
		symbol?: string;
	};
	confidence: number;
	reason?: "file_not_indexed" | "excerpt_not_found" | "excerpt_ambiguous" | "empty_excerpt" | "fuzzy_out_of_scope";
	matchCount?: number;
}

export interface FuzzyMatchOptions {
	contextSymbol?: string;
	expectedLine?: number;
	similarityThreshold?: number;
}

export function matchQuoteAnchorFuzzy(
	file: FileMap | null,
	source: string,
	excerpt: string,
	options?: FuzzyMatchOptions,
): FuzzyAnchorResolution {
	if (!file) {
		return { resolved: false, exact: false, confidence: 0, reason: "file_not_indexed" };
	}

	const exact = resolveExcerpt(file, source, excerpt, {
		contextSymbol: options?.contextSymbol,
		expectedLine: options?.expectedLine,
	});

	if (exact.resolved && exact.anchor) {
		return {
			resolved: true,
			exact: true,
			anchor: exact.anchor,
			confidence: 1.0,
		};
	}

	const threshold = options?.similarityThreshold ?? 0.82;
	const needleLines = tokenizeLines(excerpt);
	if (needleLines.length === 0) {
		return { resolved: false, exact: false, confidence: 0, reason: "empty_excerpt" };
	}

	const hayLines = source.split(/\r?\n/);
	const hayTokens = hayLines.map(tokenizeLine);

	let bestScore = 0;
	let bestWindow: { start: number; end: number } | null = null;
	const candidateWindows: Array<{ start: number; end: number; score: number }> = [];

	const n = needleLines.length;
	for (let start = 0; start + n <= hayTokens.length; start++) {
		let totalScore = 0;
		for (let offset = 0; offset < n; offset++) {
			const nLine = needleLines[offset] as string;
			const hLine = hayTokens[start + offset] as string;
			totalScore += lineSimilarity(nLine, hLine);
		}
		const avgScore = totalScore / n;
		if (avgScore >= threshold) {
			candidateWindows.push({ start: start + 1, end: start + n, score: avgScore });
			if (avgScore > bestScore) {
				bestScore = avgScore;
				bestWindow = { start: start + 1, end: start + n };
			}
		}
	}

	if (!bestWindow || candidateWindows.length === 0) {
		return {
			resolved: false,
			exact: false,
			confidence: bestScore,
			reason: "excerpt_not_found",
		};
	}

	if (candidateWindows.length > 1 && options?.contextSymbol) {
		const scoped = candidateWindows.filter((w) => {
			const sym = enclosingSymbol(file, w.start, w.end);
			return sym?.name === options.contextSymbol;
		});
		if (scoped.length === 1) {
			bestWindow = { start: scoped[0]!.start, end: scoped[0]!.end };
			bestScore = scoped[0]!.score;
		}
	}

	if (candidateWindows.length > 1 && options?.expectedLine !== undefined) {
		const target = options.expectedLine;
		candidateWindows.sort((a, b) => Math.abs(a.start - target) - Math.abs(b.start - target));
		bestWindow = { start: candidateWindows[0]!.start, end: candidateWindows[0]!.end };
		bestScore = candidateWindows[0]!.score;
	}

	const sym = enclosingSymbol(file, bestWindow.start, bestWindow.end);

	if (options?.contextSymbol && sym?.name !== options.contextSymbol) {
		return {
			resolved: false,
			exact: false,
			confidence: bestScore,
			reason: "fuzzy_out_of_scope",
		};
	}

	if (!sym) {
		return {
			resolved: false,
			exact: false,
			confidence: bestScore,
			reason: "fuzzy_out_of_scope",
		};
	}

	return {
		resolved: true,
		exact: false,
		anchor: {
			path: file.path,
			startLine: bestWindow.start,
			endLine: bestWindow.end,
			symbol: sym.name,
		},
		confidence: Math.round(bestScore * 100) / 100,
	};
}

function tokenizeLine(line: string): string {
	return line
		.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "")
		.replace(/[;#]/g, "")
		.trim()
		.toLowerCase()
		.replace(/\s+/g, " ");
}

function tokenizeLines(text: string): string[] {
	return text
		.split(/\r?\n/)
		.map(tokenizeLine)
		.filter((line) => line.length > 0);
}

function lineSimilarity(a: string, b: string): number {
	if (a === b) return 1.0;
	if (a.length === 0 || b.length === 0) return 0.0;

	const aTokens = new Set(a.split(" "));
	const bTokens = new Set(b.split(" "));

	let intersection = 0;
	for (const t of aTokens) {
		if (bTokens.has(t)) intersection++;
	}

	const union = new Set([...aTokens, ...bTokens]).size;
	return union === 0 ? 0 : intersection / union;
}
