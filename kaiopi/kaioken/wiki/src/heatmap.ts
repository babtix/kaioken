import type { IndexResult } from "@kaioken/index";
import type { ScanResult } from "@kaioken/scan";
import { documentPath } from "./generate.ts";
import type { Chapter, WikiDocument, WikiPlan } from "./types.ts";

export interface ChapterCoverage {
	chapterId: string;
	title: string;
	documentPath: string;
	totalFiles: number;
	coveredFiles: number;
	fileCoverageRatio: number;
	wordCount: number;
	readingTimeMinutes: number;
	complexity: "Low" | "Medium" | "High";
	complexityPill: string;
}

export interface DocumentationHeatmap {
	totalRepoFiles: number;
	coveredRepoFiles: number;
	repoCoveragePercentage: number;
	totalSymbols: number;
	citedSymbols: number;
	symbolCoveragePercentage: number;
	chapters: ChapterCoverage[];
	unassignedFiles: string[];
}

export interface HeatmapRenderOptions {
	unicode?: boolean;
	width?: number;
}

/**
 * Compute repository documentation coverage heatmap and reading time metrics (UX-1431 to UX-1440, UX-1481 to UX-1490).
 */
export function computeDocCoverageHeatmap(
	documents: readonly WikiDocument[],
	scan: ScanResult,
	index: IndexResult | null,
	plan: WikiPlan,
): DocumentationHeatmap {
	const nonBinaryFiles = scan.files.filter((f) => !f.binary).map((f) => f.path);
	const totalRepoFiles = nonBinaryFiles.length;

	// Gather all files mentioned in document bodies or provenance
	const coveredFilesSet = new Set<string>();
	const citedSymbolsSet = new Set<string>();

	for (const doc of documents) {
		for (const src of doc.provenance.sources) {
			coveredFilesSet.add(src.path);
		}
		// Also scan body for backticked paths and symbols
		const symbolRegex = /`([A-Za-z0-9_$.]+)`/g;
		let match: RegExpExecArray | null;
		while ((match = symbolRegex.exec(doc.body)) !== null) {
			const token = match[1]?.trim() ?? "";
			if (token.includes("/")) {
				if (nonBinaryFiles.includes(token)) coveredFilesSet.add(token);
			} else if (token.length > 1) {
				citedSymbolsSet.add(token);
			}
		}
	}

	const coveredRepoFiles = [...coveredFilesSet].filter((f) => nonBinaryFiles.includes(f)).length;
	const repoCoveragePercentage = totalRepoFiles > 0
		? Math.round((coveredRepoFiles / totalRepoFiles) * 100)
		: 100;

	const totalSymbols = index?.symbolCount ?? 0;
	const citedSymbols = citedSymbolsSet.size;
	const symbolCoveragePercentage = totalSymbols > 0
		? Math.min(100, Math.round((citedSymbols / totalSymbols) * 100))
		: 100;

	const docsByPath = new Map<string, WikiDocument>(documents.map((d) => [d.path, d]));

	const chapterCoverages: ChapterCoverage[] = plan.chapters.map((ch) => {
		const docP = documentPath(ch);
		const doc = docsByPath.get(docP);
		const body = doc ? doc.body : "";

		const totalFiles = ch.files.length;
		const coveredInChapter = ch.files.filter((f) => coveredFilesSet.has(f)).length;
		const fileCoverageRatio = totalFiles > 0 ? coveredInChapter / totalFiles : 1.0;

		const words = body.split(/\s+/).filter(Boolean);
		const wordCount = words.length;
		const readingTimeMinutes = Math.max(1, Math.ceil(wordCount / 200));

		let complexity: "Low" | "Medium" | "High" = "Low";
		if (wordCount > 1200 || ch.files.length > 8) {
			complexity = "High";
		} else if (wordCount > 400 || ch.files.length > 3) {
			complexity = "Medium";
		}

		const complexityPill = `[📖 ${readingTimeMinutes} min | ${complexity}]`;

		return {
			chapterId: ch.id,
			title: ch.title,
			documentPath: docP,
			totalFiles,
			coveredFiles: coveredInChapter,
			fileCoverageRatio,
			wordCount,
			readingTimeMinutes,
			complexity,
			complexityPill,
		};
	});

	const unassignedFiles = nonBinaryFiles.filter((f) => !coveredFilesSet.has(f));

	return {
		totalRepoFiles,
		coveredRepoFiles,
		repoCoveragePercentage,
		totalSymbols,
		citedSymbols,
		symbolCoveragePercentage,
		chapters: chapterCoverages,
		unassignedFiles,
	};
}

/**
 * Render visual terminal documentation coverage heatmap table.
 */
export function renderCoverageHeatmap(
	heatmap: DocumentationHeatmap,
	options: HeatmapRenderOptions = {},
): string {
	const u = options.unicode ?? true;
	const barWidth = 10;
	const lines: string[] = [];

	lines.push(`Documentation Coverage Heatmap — Overall Score: ${heatmap.repoCoveragePercentage}%`);
	lines.push(
		`Repository Files: ${heatmap.coveredRepoFiles}/${heatmap.totalRepoFiles} covered (${heatmap.repoCoveragePercentage}%) | Symbols: ${heatmap.citedSymbols} cited`,
	);
	lines.push("─".repeat(78));

	for (const ch of heatmap.chapters) {
		const ratio = ch.fileCoverageRatio;
		const filled = Math.round(ratio * barWidth);
		const empty = barWidth - filled;
		const fillChar = u ? "█" : "#";
		const emptyChar = u ? "░" : "-";
		const bar = fillChar.repeat(filled) + emptyChar.repeat(empty);
		const pct = `${Math.round(ratio * 100)}%`.padStart(4, " ");

		const idLabel = `[${ch.chapterId}]`.padEnd(6, " ");
		const titleTruncated = ch.title.length > 24 ? `${ch.title.slice(0, 21)}...` : ch.title.padEnd(24, " ");
		const fileStats = `${ch.coveredFiles}/${ch.totalFiles} files`.padStart(11, " ");

		lines.push(`${idLabel} ${titleTruncated} [${bar}] ${pct} ${fileStats}  ${ch.complexityPill}`);
	}

	lines.push("─".repeat(78));
	if (heatmap.unassignedFiles.length > 0) {
		lines.push(
			`Uncovered Files (${heatmap.unassignedFiles.length}): ${heatmap.unassignedFiles.slice(0, 3).join(", ")}${heatmap.unassignedFiles.length > 3 ? ` ... and ${heatmap.unassignedFiles.length - 3} more` : ""}`,
		);
	} else {
		lines.push("✔ 100% of repository non-binary source files are covered across wiki chapters.");
	}

	return lines.join("\n");
}
