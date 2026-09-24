import type { Chapter } from "./types.ts";

export interface FileEvidenceItem {
	path: string;
	language: string;
	lineCount: number;
	declarations: string[];
}

export interface ChapterEvidenceBudgetInput {
	chapter: Chapter;
	files: readonly FileEvidenceItem[];
	maxTokens?: number;
	brief?: string;
	multiplier?: number;
}

export interface BudgetedChapterEvidence {
	formattedEvidence: string;
	tokenEstimate: number;
	initialTokenEstimate: number;
	maxTokens: number;
	prunedDeclarationsCount: number;
	compressionRatio: number;
	tierCounts: {
		tier1Header: number;
		tier2Public: number;
		tier3Secondary: number;
		tier4Internal: number;
	};
}

/**
 * Fast deterministic token count estimation (~4 characters per token).
 */
export function estimateTokens(text: string): number {
	if (!text) return 0;
	return Math.ceil(text.length / 4);
}

/**
 * Categorize a declaration into hierarchical priority tiers.
 * Tier 2: Public exported classes/functions/interfaces.
 * Tier 3: Types/constants/enums.
 * Tier 4: Internal/private declarations and helpers.
 */
function categorizeDeclaration(declaration: string): 2 | 3 | 4 {
	const lower = declaration.toLowerCase();
	if (lower.startsWith("+") || lower.includes("export") || lower.includes("class ") || lower.includes("interface ")) {
		return 2;
	}
	if (lower.includes("type ") || lower.includes("enum ") || lower.includes("const ")) {
		return 3;
	}
	return 4;
}

/**
 * Hierarchical evidence budgeting engine preventing model context window overflow (UX-1441 to UX-1450, UX-1431 to UX-1440).
 * Allocates token capacity across architecture brief, public surface, types, and internal declarations,
 * gracefully pruning lower-priority declarations when budgets are constrained.
 */
export function budgetChapterEvidence(input: ChapterEvidenceBudgetInput): BudgetedChapterEvidence {
	const maxTokens = input.maxTokens ?? 4000;

	// Tier 1: Chapter metadata & architecture brief
	const tier1Parts: string[] = [
		`Chapter: ${input.chapter.title} (id: ${input.chapter.id})`,
		input.chapter.goal ? `Goal: ${input.chapter.goal}` : "",
		input.brief ? `Architecture Brief:\n${input.brief.trim()}` : "",
	].filter(Boolean);

	const tier1Text = tier1Parts.join("\n\n");
	const tier1Tokens = estimateTokens(tier1Text);

	// Collect declarations across all files categorized by tier
	let tier2Count = 0;
	let tier3Count = 0;
	let tier4Count = 0;
	let totalInitialDeclarations = 0;

	interface ClassifiedFile {
		path: string;
		language: string;
		lineCount: number;
		tier2: string[];
		tier3: string[];
		tier4: string[];
	}

	const classifiedFiles: ClassifiedFile[] = input.files.map((file) => {
		const t2: string[] = [];
		const t3: string[] = [];
		const t4: string[] = [];

		for (const decl of file.declarations) {
			totalInitialDeclarations++;
			const tier = categorizeDeclaration(decl);
			if (tier === 2) {
				t2.push(decl);
				tier2Count++;
			} else if (tier === 3) {
				t3.push(decl);
				tier3Count++;
			} else {
				t4.push(decl);
				tier4Count++;
			}
		}

		return {
			path: file.path,
			language: file.language,
			lineCount: file.lineCount,
			tier2: t2,
			tier3: t3,
			tier4: t4,
		};
	});

	// Calculate initial uncompacted size
	let initialRawText = tier1Text;
	for (const f of classifiedFiles) {
		initialRawText += `\n--- ${f.path}\n${[...f.tier2, ...f.tier3, ...f.tier4].join("\n")}`;
	}
	const initialTokenEstimate = estimateTokens(initialRawText);

	// If initial estimate fits comfortably in maxTokens, keep all
	if (initialTokenEstimate <= maxTokens) {
		const outLines: string[] = [tier1Text, "", `Files in scope (${classifiedFiles.length}):`, ""];
		for (const f of classifiedFiles) {
			outLines.push(`--- ${f.path} (${f.language}, ${f.lineCount} lines)`);
			const allDecls = [...f.tier2, ...f.tier3, ...f.tier4];
			if (allDecls.length === 0) outLines.push("  (no declarations indexed)");
			for (const d of allDecls) outLines.push(`  ${d}`);
			outLines.push("");
		}

		const formattedEvidence = outLines.join("\n");
		const tokenEstimate = estimateTokens(formattedEvidence);

		return {
			formattedEvidence,
			tokenEstimate,
			initialTokenEstimate,
			maxTokens,
			prunedDeclarationsCount: 0,
			compressionRatio: 1.0,
			tierCounts: {
				tier1Header: tier1Tokens,
				tier2Public: tier2Count,
				tier3Secondary: tier3Count,
				tier4Internal: tier4Count,
			},
		};
	}

	// Budget exceeded! Perform hierarchical evidence pruning
	const availableForFiles = Math.max(200, maxTokens - tier1Tokens - 50);

	// Step 1: Drop Tier 4 internal declarations completely if over budget
	let includeTier4 = false;
	let includeTier3 = true;
	let maxTier3PerFile = 8;
	let maxTier2PerFile = 25;

	// Check if Tier 2 + Tier 3 fits
	let estimateWithT2T3 = 0;
	for (const f of classifiedFiles) {
		estimateWithT2T3 += estimateTokens(`--- ${f.path}\n${[...f.tier2, ...f.tier3.slice(0, maxTier3PerFile)].join("\n")}`);
	}

	if (estimateWithT2T3 > availableForFiles) {
		// Cut Tier 3 further
		maxTier3PerFile = 3;
		let estimateWithReducedT3 = 0;
		for (const f of classifiedFiles) {
			estimateWithReducedT3 += estimateTokens(`--- ${f.path}\n${[...f.tier2, ...f.tier3.slice(0, maxTier3PerFile)].join("\n")}`);
		}
		if (estimateWithReducedT3 > availableForFiles) {
			includeTier3 = false;
			maxTier2PerFile = 15;
		}
	}

	const outLines: string[] = [tier1Text, "", `Files in scope (${classifiedFiles.length}) [Compacted to fit token budget]:`, ""];
	let keptDeclarations = 0;

	for (const f of classifiedFiles) {
		outLines.push(`--- ${f.path} (${f.language}, ${f.lineCount} lines)`);
		const selected: string[] = [];

		for (const d of f.tier2.slice(0, maxTier2PerFile)) {
			selected.push(d);
			keptDeclarations++;
		}

		if (includeTier3) {
			for (const d of f.tier3.slice(0, maxTier3PerFile)) {
				selected.push(d);
				keptDeclarations++;
			}
		}

		if (includeTier4) {
			for (const d of f.tier4.slice(0, 3)) {
				selected.push(d);
				keptDeclarations++;
			}
		}

		if (selected.length === 0) {
			outLines.push("  (declarations omitted for context budget)");
		} else {
			for (const d of selected) outLines.push(`  ${d}`);
		}
		outLines.push("");
	}

	const formattedEvidence = outLines.join("\n");
	const tokenEstimate = estimateTokens(formattedEvidence);
	const prunedDeclarationsCount = Math.max(0, totalInitialDeclarations - keptDeclarations);
	const compressionRatio = initialTokenEstimate > 0 ? Number((tokenEstimate / initialTokenEstimate).toFixed(2)) : 1.0;

	return {
		formattedEvidence,
		tokenEstimate,
		initialTokenEstimate,
		maxTokens,
		prunedDeclarationsCount,
		compressionRatio,
		tierCounts: {
			tier1Header: tier1Tokens,
			tier2Public: tier2Count,
			tier3Secondary: tier3Count,
			tier4Internal: tier4Count,
		},
	};
}
