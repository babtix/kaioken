/**
 * rename.ts — Safe-rename simulation report listing every file requiring
 * callsite updates (UX-0931–UX-0940).
 *
 * Simulates a symbol rename by inspecting seeds and candidate dependent files,
 * identifying the exact line numbers and code snippets that will need
 * updating across the repository.
 *
 * Invariant: Fail-soft error boundaries; never throws on unreadable files.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ImpactReport } from "./predict.ts";

export interface CallsiteEntry {
	path: string;
	lines: number[];
	snippets: string[];
}

export interface RenameSimulation {
	from: string;
	to: string;
	callsites: CallsiteEntry[];
	totalFiles: number;
	totalOccurrences: number;
}

const MAX_FILE_BYTES = 512 * 1024;

function escapeRegex(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Simulates renaming `from` symbol to `to` symbol across all candidate files
 * (seeds + dependents) in the given impact report.
 */
export async function simulateRename(
	root: string,
	report: ImpactReport,
	from: string,
	to: string,
): Promise<RenameSimulation> {
	const candidatePaths = new Set<string>([
		...report.seeds,
		...report.dependents.map((d) => d.path),
	]);

	const callsites: CallsiteEntry[] = [];
	let totalOccurrences = 0;

	const escaped = escapeRegex(from);
	const wordRegex = new RegExp(`(?<![A-Za-z0-9_$])${escaped}(?![A-Za-z0-9_$])`, "g");

	for (const relPath of candidatePaths) {
		try {
			const fullPath = join(root, relPath);
			const content = await readFile(fullPath, "utf8");

			if (content.length > MAX_FILE_BYTES) continue;

			const lines = content.split("\n");
			const matchedLines: number[] = [];
			const matchedSnippets: string[] = [];

			for (let i = 0; i < lines.length; i++) {
				const line = lines[i] ?? "";
				wordRegex.lastIndex = 0;
				if (wordRegex.test(line)) {
					matchedLines.push(i + 1);
					matchedSnippets.push(line.trim());
					// Count occurrences on this line
					wordRegex.lastIndex = 0;
					const matchCount = (line.match(wordRegex) ?? []).length;
					totalOccurrences += matchCount;
				}
			}

			if (matchedLines.length > 0) {
				callsites.push({
					path: relPath,
					lines: matchedLines,
					snippets: matchedSnippets,
				});
			}
		} catch {
			// Fail-soft: skip unreadable/missing files
			continue;
		}
	}

	callsites.sort((a, b) => a.path.localeCompare(b.path));

	return {
		from,
		to,
		callsites,
		totalFiles: callsites.length,
		totalOccurrences,
	};
}

/**
 * Renders the safe-rename simulation report for terminal or markdown output.
 */
export function renderRenameSimulation(sim: RenameSimulation): string[] {
	const out: string[] = [];

	out.push(`Rename Simulation: "${sim.from}" → "${sim.to}"`);
	out.push(`Impact: ${sim.totalOccurrences} callsite(s) across ${sim.totalFiles} file(s)`);
	out.push("");

	if (sim.callsites.length === 0) {
		out.push("  No callsites found matching identifier boundaries.");
		return out;
	}

	for (const entry of sim.callsites) {
		out.push(`  📄 ${entry.path} (${entry.lines.length} occurrence(s)):`);
		for (let i = 0; i < entry.lines.length; i++) {
			const lineNo = entry.lines[i];
			const snippet = entry.snippets[i];
			out.push(`     L${lineNo}: ${snippet}`);
		}
	}

	return out;
}
