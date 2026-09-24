import type { ScanResult } from "@kaioken/scan";
import type { ModulePlan } from "./types.ts";
import { flatten } from "./validate.ts";
import { detectArchitecturalDomain, type ArchitecturalDomain } from "./cluster.ts";

export type UnassignedFileRisk = "high" | "medium" | "low";

export interface UnassignedFile {
	path: string;
	risk: UnassignedFileRisk;
	category: ArchitecturalDomain | "documentation" | "config" | "other";
	suggestedModuleId: string | null;
	size: number;
}

export interface CoverageReport {
	totalEligibleFiles: number;
	assignedFilesCount: number;
	unassignedFilesCount: number;
	coveragePercentage: number;
	unassignedFiles: UnassignedFile[];
	categoryBreakdown: Record<string, number>;
	riskBreakdown: {
		high: number;
		medium: number;
		low: number;
	};
}

/**
 * Categorizes an unassigned file.
 */
function categorizeFile(path: string): {
	category: ArchitecturalDomain | "documentation" | "config" | "other";
	risk: UnassignedFileRisk;
} {
	const lower = path.toLowerCase();

	if (lower.endsWith(".md") || lower.startsWith("docs/")) {
		return { category: "documentation", risk: "low" };
	}

	if (
		lower.endsWith(".json") ||
		lower.endsWith(".yaml") ||
		lower.endsWith(".yml") ||
		lower.endsWith(".toml") ||
		lower.endsWith(".ini") ||
		lower.startsWith(".github/")
	) {
		return { category: "config", risk: "low" };
	}

	const domain = detectArchitecturalDomain(path);
	if (domain) {
		if (domain === "testing-fixture" || domain === "cloud-infra") {
			return { category: domain, risk: "low" };
		}
		if (domain === "frontend-ui" || domain === "backend-api" || domain === "database-orm" || domain === "auth-session") {
			return { category: domain, risk: "high" };
		}
		return { category: domain, risk: "medium" };
	}

	if (/\.(?:ts|js|mjs|cjs|py|go|rs|java|cpp|c|cs|rb|php)$/i.test(path)) {
		return { category: "other", risk: "medium" };
	}

	return { category: "other", risk: "low" };
}

/**
 * Suggests an existing module for an unassigned file based on directory proximity.
 */
export function suggestModuleForFile(filePath: string, plan: ModulePlan): string | null {
	const modules = flatten(plan.modules);
	if (modules.length === 0) return null;

	const normalized = filePath.split("\\").join("/");
	let bestModuleId: string | null = null;
	let longestMatchLen = -1;

	for (const mod of modules) {
		for (const modFile of mod.files) {
			const modNorm = modFile.split("\\").join("/");
			// Check common directory prefix
			let matchLen = 0;
			const p1 = normalized.split("/");
			const p2 = modNorm.split("/");
			for (let i = 0; i < Math.min(p1.length - 1, p2.length - 1); i++) {
				if (p1[i] === p2[i]) {
					matchLen += p1[i]!.length + 1;
				} else {
					break;
				}
			}
			if (matchLen > longestMatchLen && matchLen > 0) {
				longestMatchLen = matchLen;
				bestModuleId = mod.id;
			}
		}
	}

	return bestModuleId;
}

/**
 * Computes comprehensive coverage indicator for repository files (UX-1231–UX-1240).
 */
export function computeCoverageIndicator(plan: ModulePlan, scan: ScanResult): CoverageReport {
	const eligibleFiles = scan.files.filter(
		(f) => !f.binary && !f.risk.includes("generated") && !f.risk.includes("lockfile"),
	);

	const assignedSet = new Set<string>();
	for (const mod of flatten(plan.modules)) {
		for (const file of mod.files) {
			assignedSet.add(file.split("\\").join("/"));
		}
	}

	const unassignedFiles: UnassignedFile[] = [];
	const categoryBreakdown: Record<string, number> = {};
	const riskBreakdown = { high: 0, medium: 0, low: 0 };

	for (const file of eligibleFiles) {
		const normalized = file.path.split("\\").join("/");
		if (!assignedSet.has(normalized)) {
			const { category, risk } = categorizeFile(normalized);
			const suggestedModuleId = suggestModuleForFile(normalized, plan);

			categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + 1;
			riskBreakdown[risk]++;

			unassignedFiles.push({
				path: normalized,
				risk,
				category,
				suggestedModuleId,
				size: file.size,
			});
		}
	}

	const totalEligibleFiles = eligibleFiles.length;
	const assignedFilesCount = totalEligibleFiles - unassignedFiles.length;
	const coveragePercentage = totalEligibleFiles > 0 ? (assignedFilesCount / totalEligibleFiles) * 100 : 100;

	return {
		totalEligibleFiles,
		assignedFilesCount,
		unassignedFilesCount: unassignedFiles.length,
		coveragePercentage,
		unassignedFiles,
		categoryBreakdown,
		riskBreakdown,
	};
}

/**
 * Renders a visual terminal gauge for file coverage (UX-1231–UX-1240).
 */
export function formatCoverageGauge(
	report: CoverageReport,
	options: { showBreakdown?: boolean; width?: number } = {},
): string {
	const width = options.width ?? 20;
	const percent = Math.min(100, Math.max(0, report.coveragePercentage));
	const filled = Math.round((percent / 100) * width);
	const unfilled = width - filled;

	const bar = "█".repeat(filled) + "░".repeat(unfilled);
	const lines: string[] = [];

	lines.push(`┌─────────────────────────────────────────────────────────────┐`);
	lines.push(`│ 📊 REPOSITORY FILE COVERAGE GAUGE                           │`);
	lines.push(
		`│ Coverage: [${bar}] ${percent.toFixed(1).padStart(5)}% (${report.assignedFilesCount}/${report.totalEligibleFiles} files)${" ".repeat(Math.max(0, 20 - width))}│`,
	);
	lines.push(
		`│ Assigned: ${report.assignedFilesCount.toString().padEnd(4)} | Unassigned: ${report.unassignedFilesCount.toString().padEnd(4)} (High: ${report.riskBreakdown.high}, Med: ${report.riskBreakdown.medium}, Low: ${report.riskBreakdown.low}) │`,
	);
	lines.push(`└─────────────────────────────────────────────────────────────┘`);

	if (options.showBreakdown && report.unassignedFilesCount > 0) {
		lines.push("\nUnassigned Categories:");
		for (const [cat, count] of Object.entries(report.categoryBreakdown).sort((a, b) => b[1] - a[1])) {
			lines.push(`  • ${cat.padEnd(20)}: ${count} file(s)`);
		}

		if (report.riskBreakdown.high > 0) {
			lines.push("\nHigh-Risk Unassigned Files (recommended for assignment):");
			for (const f of report.unassignedFiles.filter((f) => f.risk === "high").slice(0, 10)) {
				const sug = f.suggestedModuleId ? ` → suggest "${f.suggestedModuleId}"` : "";
				lines.push(`  ⚠️ ${f.path}${sug}`);
			}
		}
	}

	return lines.join("\n");
}
