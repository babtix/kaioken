import {
	ARCHITECTURAL_DOMAINS,
	detectArchitecturalDomain,
	type ArchitecturalDomain,
	type DomainMeta,
} from "./cluster.ts";
import type { Module, ModulePlan } from "./types.ts";
import { findModule, flatten } from "./validate.ts";

// ============================================================================
// Theme 1: Unassigned File Coverage Indicator (UX-1251 - UX-1260)
// ============================================================================

export interface DomainCoverageReport {
	domain: ArchitecturalDomain;
	domainTitle: string;
	totalDomainFiles: number;
	assignedDomainFiles: number;
	unassignedDomainFiles: string[];
	coveragePercentage: number;
	visualGauge: string;
	status: "OPTIMAL" | "NEEDS_ATTENTION" | "UNCOVERED";
}

/**
 * Calculates file coverage indicator tracking source files omitted from a specific architectural domain
 * (UX-1251 to UX-1260).
 */
export function computeDomainCoverageIndicator(
	plan: ModulePlan,
	allRepositoryFiles: string[],
	targetDomain: ArchitecturalDomain,
): DomainCoverageReport {
	const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === targetDomain)!;
	const allPlanFiles = new Set(
		flatten(plan.modules).flatMap((m) => m.files.map((f) => f.split("\\").join("/"))),
	);

	const domainFiles: string[] = [];
	const assignedFiles: string[] = [];
	const unassignedFiles: string[] = [];

	for (const rawPath of allRepositoryFiles) {
		const normalized = rawPath.split("\\").join("/");
		const detected = detectArchitecturalDomain(normalized);
		if (detected === targetDomain) {
			domainFiles.push(normalized);
			if (allPlanFiles.has(normalized)) {
				assignedFiles.push(normalized);
			} else {
				unassignedFiles.push(normalized);
			}
		}
	}

	const total = domainFiles.length;
	const assigned = assignedFiles.length;
	const percentage = total > 0 ? Number(((assigned / total) * 100).toFixed(1)) : 100;

	// Visual gauge: [████████░░] 80.0%
	const barWidth = 10;
	const filled = Math.round((percentage / 100) * barWidth);
	const bar = "█".repeat(filled) + "░".repeat(barWidth - filled);
	const visualGauge = `[${bar}] ${percentage.toFixed(1)}% (${assigned}/${total} files)`;

	let status: "OPTIMAL" | "NEEDS_ATTENTION" | "UNCOVERED" = "OPTIMAL";
	if (percentage === 0 && total > 0) {
		status = "UNCOVERED";
	} else if (percentage < 90) {
		status = "NEEDS_ATTENTION";
	}

	return {
		domain: targetDomain,
		domainTitle: meta.title,
		totalDomainFiles: total,
		assignedDomainFiles: assigned,
		unassignedDomainFiles: unassignedFiles.sort(),
		coveragePercentage: percentage,
		visualGauge,
		status,
	};
}

/**
 * Renders a terminal-ready coverage summary across all or specific architectural domains.
 */
export function renderDomainCoverageCard(report: DomainCoverageReport): string {
	return [
		`┌── Architecture Coverage: ${report.domainTitle.padEnd(41)} ┐`,
		`│ Status:      ${report.status.padEnd(52)} │`,
		`│ Gauge:       ${report.visualGauge.padEnd(52)} │`,
		`│ Unassigned:  ${(report.unassignedDomainFiles.length.toString() + " omitted source files").padEnd(52)} │`,
		`└───────────────────────────────────────────────────────────────────┘`,
	].join("\n");
}

// ============================================================================
// Theme 2: Granular Module Splitter (UX-1261 - UX-1270)
// ============================================================================

export interface DomainSplitOptions {
	maxFilesPerSubmodule?: number;
	namingPrefix?: string;
	customSubmodules?: Array<{
		id: string;
		name: string;
		purpose: string;
		files: string[];
	}>;
}

/**
 * Granular module splitter breaking down oversized monolithic modules within an architectural domain
 * (UX-1261 to UX-1270).
 */
export function splitDomainModule(
	plan: ModulePlan,
	moduleId: string,
	domain: ArchitecturalDomain,
	options: DomainSplitOptions = {},
): ModulePlan {
	const target = findModule(plan, moduleId);
	if (!target) {
		throw new Error(`Cannot split domain module: module "${moduleId}" not found.`);
	}

	const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === domain)!;

	if (options.customSubmodules && options.customSubmodules.length > 0) {
		const newChildren: Module[] = options.customSubmodules.map((sub) => ({
			id: sub.id,
			name: sub.name,
			purpose: sub.purpose,
			files: sub.files.sort(),
		}));

		const claimed = new Set(newChildren.flatMap((c) => c.files));
		const remainingFiles = target.files.filter((f) => !claimed.has(f));

		const updateModule = (m: Module): Module => {
			if (m.id === moduleId) {
				return {
					...m,
					files: remainingFiles,
					children: [...(m.children ?? []), ...newChildren],
				};
			}
			return {
				...m,
				...(m.children ? { children: m.children.map(updateModule) } : {}),
			};
		};

		return {
			...plan,
			modules: plan.modules.map(updateModule),
		};
	}

	// Automatic decomposition by sub-directory or sub-feature within the domain
	const maxFiles = options.maxFilesPerSubmodule ?? 10;
	if (target.files.length <= maxFiles) {
		return plan; // Not oversized
	}

	const groups = new Map<string, string[]>();
	for (const file of target.files) {
		const parts = file.split("/");
		// Cluster by immediate parent directory or prefix
		const key = parts.length > 2 ? parts[parts.length - 2]! : "core";
		let list = groups.get(key);
		if (!list) {
			list = [];
			groups.set(key, list);
		}
		list.push(file);
	}

	const submodules: Module[] = [];
	for (const [key, files] of groups.entries()) {
		const subId = `${target.id}-${key.toLowerCase().replace(/[^a-z0-9_-]+/g, "-")}`;
		const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
		submodules.push({
			id: subId,
			name: `${target.name} — ${capitalizedKey} (${meta.title})`,
			purpose: `Sub-component module for ${capitalizedKey} in ${meta.title}`,
			files: files.sort(),
		});
	}

	if (submodules.length <= 1) {
		return plan;
	}

	const updateModule = (m: Module): Module => {
		if (m.id === moduleId) {
			return {
				...m,
				files: [],
				children: submodules,
			};
		}
		return {
			...m,
			...(m.children ? { children: m.children.map(updateModule) } : {}),
		};
	};

	return {
		...plan,
		modules: plan.modules.map(updateModule),
	};
}

// ============================================================================
// Theme 3: Module Merger for Tightly Coupled Siblings (UX-1271 - UX-1280)
// ============================================================================

export interface DomainMergeOptions {
	mergedName?: string;
	mergedPurpose?: string;
}

/**
 * Module merger combining tightly coupled sibling directories/modules in an architectural domain
 * (UX-1271 to UX-1280).
 */
export function mergeDomainSiblings(
	plan: ModulePlan,
	domain: ArchitecturalDomain,
	sourceModuleId: string,
	targetModuleId: string,
	options: DomainMergeOptions = {},
): ModulePlan {
	if (sourceModuleId === targetModuleId) {
		return plan;
	}

	const source = findModule(plan, sourceModuleId);
	const target = findModule(plan, targetModuleId);

	if (!source) {
		throw new Error(`Source module "${sourceModuleId}" not found for domain merge.`);
	}
	if (!target) {
		throw new Error(`Target module "${targetModuleId}" not found for domain merge.`);
	}

	const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === domain)!;
	const combinedFiles = [...new Set([...target.files, ...source.files])].sort();
	const combinedChildren = [...(target.children ?? []), ...(source.children ?? [])];

	const defaultName = `${target.name} & ${source.name}`;
	const defaultPurpose = `Consolidated ${meta.title}: ${target.purpose}`;

	const removeAndMerge = (list: Module[]): Module[] => {
		const out: Module[] = [];
		for (const m of list) {
			if (m.id === sourceModuleId) {
				continue;
			}
			if (m.id === targetModuleId) {
				out.push({
					...m,
					name: options.mergedName ?? defaultName,
					purpose: options.mergedPurpose ?? defaultPurpose,
					files: combinedFiles,
					...(combinedChildren.length > 0 ? { children: combinedChildren } : {}),
				});
			} else {
				out.push({
					...m,
					...(m.children ? { children: removeAndMerge(m.children) } : {}),
				});
			}
		}
		return out;
	};

	return {
		...plan,
		modules: removeAndMerge(plan.modules),
	};
}

// ============================================================================
// Theme 4: Visual Module Tree Hierarchy Explorer (UX-1281 - UX-1290)
// ============================================================================

export interface DomainTreeRenderOptions {
	showFiles?: boolean;
	maxFilesPerModule?: number;
	filterDomain?: ArchitecturalDomain;
}

/**
 * Renders a visual module tree hierarchy explorer displaying depth levels and domain badges
 * (UX-1281 to UX-1290).
 */
export function renderDomainModuleTree(
	plan: ModulePlan,
	options: DomainTreeRenderOptions = {},
): string {
	const lines: string[] = [];
	const allModules = flatten(plan.modules);
	const filterDomain = options.filterDomain;

	const filterLabel = filterDomain
		? ` [Filtered by Domain: ${ARCHITECTURAL_DOMAINS.find((d) => d.domain === filterDomain)?.title ?? filterDomain}]`
		: "";

	lines.push(`📦 ARCHITECTURAL MODULE TREE EXPLORER${filterLabel}`);
	lines.push(`   Total Modules: ${allModules.length} | Plan Multiplier: ×${plan.multiplier}`);
	lines.push(`───────────────────────────────────────────────────────────────────`);

	const walk = (modules: Module[], depth = 0, prefix = "") => {
		for (let i = 0; i < modules.length; i++) {
			const m = modules[i]!;
			const isLast = i === modules.length - 1;
			const branch = isLast ? "└── " : "├── ";
			const nextPrefix = prefix + (isLast ? "    " : "│   ");

			// Determine dominant domain in this module's files
			let domBadge = "core";
			if (m.files.length > 0) {
				const domCounts = new Map<string, number>();
				for (const f of m.files) {
					const d = detectArchitecturalDomain(f);
					if (d) domCounts.set(d, (domCounts.get(d) ?? 0) + 1);
				}
				let maxCount = 0;
				for (const [dom, cnt] of domCounts.entries()) {
					if (cnt > maxCount) {
						maxCount = cnt;
						domBadge = dom;
					}
				}
			}

			if (!filterDomain || domBadge === filterDomain || (m.children && m.children.length > 0)) {
				const depthTag = `[L${depth}]`.padEnd(5);
				const badgeDisplay = `🏷️ [${domBadge}]`;
				lines.push(
					`${prefix}${branch}${depthTag} [${m.id}] ${m.name} (${m.files.length} file${m.files.length === 1 ? "" : "s"}) ${badgeDisplay}`,
				);

				if (options.showFiles && m.files.length > 0) {
					const maxFiles = options.maxFilesPerModule ?? 5;
					for (let fi = 0; fi < Math.min(m.files.length, maxFiles); fi++) {
						const isLastFile = fi === m.files.length - 1 && (!m.children || m.children.length === 0);
						const fileBranch = isLastFile ? "└── " : "├── ";
						lines.push(`${nextPrefix}${fileBranch}📄 ${m.files[fi]}`);
					}
					if (m.files.length > maxFiles) {
						lines.push(`${nextPrefix}└── ... and ${m.files.length - maxFiles} more file(s)`);
					}
				}
			}

			if (m.children && m.children.length > 0) {
				walk(m.children, depth + 1, nextPrefix);
			}
		}
	};

	walk(plan.modules, 0, "");
	return lines.join("\n");
}

// ============================================================================
// Theme 5: Automated Architecture Consistency Check (UX-1291 - UX-1300)
// ============================================================================

export type ConsistencyIssueType =
	| "FORBIDDEN_LAYER_INVERSION"
	| "TEST_LEAK_IN_PRODUCTION"
	| "MISSING_DOMAIN_LAYER"
	| "OVERSIZED_MONOLITH"
	| "ORPHANED_MODULE";

export interface ArchitectureConsistencyIssue {
	domain: ArchitecturalDomain;
	issueType: ConsistencyIssueType;
	moduleId: string;
	message: string;
	recommendation: string;
	severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
}

export interface ArchitectureConsistencyReport {
	scannedModulesCount: number;
	issues: ArchitectureConsistencyIssue[];
	hasCriticalViolations: boolean;
	issuesByDomain: Record<ArchitecturalDomain, ArchitectureConsistencyIssue[]>;
}

/**
 * Automated architecture consistency check comparing modules against layer rules (UX-1291 to UX-1300).
 */
export function checkArchitectureConsistency(
	plan: ModulePlan,
	allRepoFiles: string[] = [],
): ArchitectureConsistencyReport {
	const allModules = flatten(plan.modules);
	const issues: ArchitectureConsistencyIssue[] = [];

	const issuesByDomain: Record<ArchitecturalDomain, ArchitectureConsistencyIssue[]> = {
		"frontend-ui": [],
		"backend-api": [],
		"database-orm": [],
		"auth-session": [],
		"job-worker": [],
		"cloud-infra": [],
		"cli-interface": [],
		"third-party-client": [],
		"testing-fixture": [],
		"shared-util": [],
	};

	for (const mod of allModules) {
		// Detect dominant domain
		const domainCounts = new Map<ArchitecturalDomain, number>();
		for (const file of mod.files) {
			const d = detectArchitecturalDomain(file);
			if (d) domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1);
		}

		let primaryDomain: ArchitecturalDomain = "shared-util";
		let maxCount = 0;
		for (const [d, count] of domainCounts.entries()) {
			if (count > maxCount) {
				maxCount = count;
				primaryDomain = d;
			}
		}

		// 1. Check for test files leaked into non-test modules
		if (primaryDomain !== "testing-fixture") {
			const testFiles = mod.files.filter((f) => detectArchitecturalDomain(f) === "testing-fixture");
			if (testFiles.length > 0 && testFiles.length < mod.files.length) {
				const issue: ArchitectureConsistencyIssue = {
					domain: primaryDomain,
					issueType: "TEST_LEAK_IN_PRODUCTION",
					moduleId: mod.id,
					message: `Module "${mod.id}" (${primaryDomain}) contains ${testFiles.length} test fixture file(s) mixed into production code.`,
					recommendation: `Extract test fixtures into a dedicated testing-fixture module.`,
					severity: "MEDIUM",
				};
				issues.push(issue);
				issuesByDomain[primaryDomain].push(issue);
			}
		}

		// 2. Check for UI modules directly owning database models or migrations (layer inversion)
		if (domainCounts.has("frontend-ui") && domainCounts.has("database-orm")) {
			const dbFiles = mod.files.filter((f) => detectArchitecturalDomain(f) === "database-orm");
			const issue: ArchitectureConsistencyIssue = {
				domain: "frontend-ui",
				issueType: "FORBIDDEN_LAYER_INVERSION",
				moduleId: mod.id,
				message: `Forbidden Layer Inversion: Frontend UI module "${mod.id}" directly contains ${dbFiles.length} database ORM file(s).`,
				recommendation: `Decouple database ORM models from frontend UI view components into a database-orm module.`,
				severity: "CRITICAL",
			};
			issues.push(issue);
			issuesByDomain["frontend-ui"].push(issue);
		}

		// 3. Check for oversized monolithic modules (> 50 files)
		if (mod.files.length > 50) {
			const issue: ArchitectureConsistencyIssue = {
				domain: primaryDomain,
				issueType: "OVERSIZED_MONOLITH",
				moduleId: mod.id,
				message: `Oversized Monolith: Module "${mod.id}" contains ${mod.files.length} files, exceeding the recommended 50-file ceiling.`,
				recommendation: `Use splitDomainModule to decompose into granular sub-components.`,
				severity: "HIGH",
			};
			issues.push(issue);
			issuesByDomain[primaryDomain].push(issue);
		}

		// 4. Check for orphaned empty modules
		if (mod.files.length === 0 && (!mod.children || mod.children.length === 0)) {
			const issue: ArchitectureConsistencyIssue = {
				domain: primaryDomain,
				issueType: "ORPHANED_MODULE",
				moduleId: mod.id,
				message: `Orphaned Module: Module "${mod.id}" has no assigned files or child submodules.`,
				recommendation: `Remove empty module or assign files using moveFile.`,
				severity: "LOW",
			};
			issues.push(issue);
			issuesByDomain[primaryDomain].push(issue);
		}
	}

	// 5. Check missing expected layers if repository has files in those domains
	if (allRepoFiles.length > 0) {
		for (const meta of ARCHITECTURAL_DOMAINS) {
			const repoFilesForDomain = allRepoFiles.filter((f) => detectArchitecturalDomain(f) === meta.domain);
			if (repoFilesForDomain.length > 0) {
				const covered = allModules.some((m) =>
					m.files.some((f) => detectArchitecturalDomain(f) === meta.domain),
				);
				if (!covered) {
					const issue: ArchitectureConsistencyIssue = {
						domain: meta.domain,
						issueType: "MISSING_DOMAIN_LAYER",
						moduleId: "root",
						message: `Missing Domain Layer: Repository contains ${repoFilesForDomain.length} file(s) in ${meta.title}, but no module covers this domain.`,
						recommendation: `Create a dedicated ${meta.domain} module to represent this architectural layer.`,
						severity: "HIGH",
					};
					issues.push(issue);
					issuesByDomain[meta.domain].push(issue);
				}
			}
		}
	}

	return {
		scannedModulesCount: allModules.length,
		issues,
		hasCriticalViolations: issues.some((i) => i.severity === "CRITICAL"),
		issuesByDomain,
	};
}

/**
 * Formats a terminal-friendly summary report of architecture consistency audit.
 */
export function formatArchitectureConsistencyReport(
	report: ArchitectureConsistencyReport,
): string {
	if (report.issues.length === 0) {
		return `✓ Architecture Consistency Check: All ${report.scannedModulesCount} modules comply with layer separation and boundary guidelines.`;
	}

	const header = [
		`╔═══════════════════════════════════════════════════════════════════╗`,
		`║          ARCHITECTURE CONSISTENCY AUDIT REPORT                    ║`,
		`╠═══════════════════════════════════════════════════════════════════╣`,
		`║ Modules Checked: ${report.scannedModulesCount.toString().padEnd(6)} | Issues: ${report.issues.length.toString().padEnd(6)} | Critical Violations: ${report.hasCriticalViolations ? "YES" : "NO "} ║`,
		`╚═══════════════════════════════════════════════════════════════════╝`,
	].join("\n");

	const lines = report.issues.map((i) => {
		const meta = ARCHITECTURAL_DOMAINS.find((d) => d.domain === i.domain);
		return `[${i.severity}] [${meta?.title ?? i.domain}] [${i.issueType}]\n  Module: ${i.moduleId}\n  Issue:  ${i.message}\n  Fix:    ${i.recommendation}`;
	});

	return `${header}\n\n${lines.join("\n\n")}`;
}
