import { calculateFreshnessDial, classifyDocCategory } from "./dial.ts";
import type {
	CategoryCompliance,
	DocCategory,
	DriftComplianceOptions,
	DriftComplianceReport,
	RemediationPriorityItem,
	StalenessReport,
} from "./types.ts";

const ALL_CATEGORIES: readonly DocCategory[] = [
	"architecture",
	"cards",
	"subsystems",
	"procedures",
	"api",
	"data_models",
	"security",
	"runbooks",
	"benchmarks",
	"tutorials",
	"other",
];

const DEFAULT_CATEGORY_TARGETS: Record<DocCategory, number> = {
	security: 95,
	architecture: 90,
	api: 90,
	data_models: 85,
	subsystems: 80,
	procedures: 80,
	cards: 80,
	runbooks: 75,
	benchmarks: 70,
	tutorials: 70,
	other: 70,
};

function determinePriority(category: DocCategory, isOrphaned: boolean): "P0" | "P1" | "P2" | "P3" {
	if (category === "security" || category === "architecture") {
		return "P0";
	}
	if (category === "api" || category === "data_models") {
		return isOrphaned ? "P0" : "P1";
	}
	if (category === "procedures" || category === "subsystems" || category === "cards") {
		return "P2";
	}
	return "P3";
}

/**
 * Generate and export markdown drift compliance audit report for all 10 artifact types (UX-0881 - UX-0890).
 */
export function exportDriftComplianceReport(
	report: StalenessReport,
	options?: DriftComplianceOptions,
): DriftComplianceReport {
	const timestamp = new Date().toISOString();
	const dial = calculateFreshnessDial(report);
	const defaultTarget = options?.targetFreshness ?? 80;

	const categories = {} as Record<DocCategory, CategoryCompliance>;
	let allCompliant = true;

	for (const cat of ALL_CATEGORIES) {
		const catStats = dial.categories[cat];
		const targetPct =
			options?.categoryTargets?.[cat] ??
			DEFAULT_CATEGORY_TARGETS[cat] ??
			defaultTarget;

		const compliant = catStats.percentage >= targetPct;
		if (!compliant) allCompliant = false;

		const status: "PASS" | "WARN" | "FAIL" =
			catStats.percentage >= targetPct
				? "PASS"
				: catStats.percentage >= targetPct - 15
					? "WARN"
					: "FAIL";

		categories[cat] = {
			category: cat,
			totalDocuments: catStats.total,
			freshDocuments: catStats.fresh,
			staleDocuments: catStats.stale,
			orphanedDocuments: catStats.orphaned,
			freshnessPercentage: catStats.percentage,
			targetPercentage: targetPct,
			compliant,
			status,
		};
	}

	const remediationPriorities: RemediationPriorityItem[] = [];

	// Process stale documents
	for (const doc of report.stale) {
		const cat = classifyDocCategory(doc.document);
		const priority = determinePriority(cat, false);
		remediationPriorities.push({
			document: doc.document,
			category: cat,
			priority,
			action: `Regenerate from changed source(s): ${doc.changed.join(", ")}`,
			staleSources: doc.changed,
		});
	}

	// Process orphaned documents
	for (const doc of report.orphaned) {
		const cat = classifyDocCategory(doc.document);
		const priority = determinePriority(cat, true);
		remediationPriorities.push({
			document: doc.document,
			category: cat,
			priority,
			action: `Resolve orphaned document; sources permanently deleted: ${doc.deleted.join(", ")}`,
			staleSources: doc.deleted,
		});
	}

	// Sort priorities: P0 > P1 > P2 > P3
	const prioRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
	remediationPriorities.sort(
		(a, b) => prioRank[a.priority] - prioRank[b.priority],
	);

	const markdown = formatComplianceMarkdown({
		timestamp,
		overallFreshness: dial.overallPercentage,
		targetFreshness: defaultTarget,
		compliant: allCompliant && dial.overallPercentage >= defaultTarget,
		categories,
		remediationPriorities,
		title: options?.title ?? "Documentation Drift & Provenance Compliance Audit",
		generatedBy: options?.generatedBy ?? "kaioken/provenance audit engine",
	});

	return {
		timestamp,
		overallFreshness: dial.overallPercentage,
		targetFreshness: defaultTarget,
		compliant: allCompliant && dial.overallPercentage >= defaultTarget,
		categories,
		remediationPriorities,
		markdown,
	};
}

function formatComplianceMarkdown(data: {
	timestamp: string;
	overallFreshness: number;
	targetFreshness: number;
	compliant: boolean;
	categories: Record<DocCategory, CategoryCompliance>;
	remediationPriorities: RemediationPriorityItem[];
	title: string;
	generatedBy: string;
}): string {
	const statusBadge = data.compliant ? "✅ COMPLIANT" : "❌ NON-COMPLIANT";

	const lines: string[] = [
		`# ${data.title}`,
		"",
		`> **Status**: ${statusBadge} | **Freshness SLA**: ${data.overallFreshness}% (Target: ${data.targetFreshness}%)  `,
		`> **Audit Timestamp**: \`${data.timestamp}\` | **Auditor**: ${data.generatedBy}`,
		"",
		"## 1. Documentation Category SLA Compliance Matrix",
		"",
		"| Category | Total Docs | Fresh | Stale | Orphaned | Actual Freshness | SLA Target | Status |",
		"| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |",
	];

	for (const cat of ALL_CATEGORIES) {
		const c = data.categories[cat];
		if (c.totalDocuments === 0) continue;
		const badge =
			c.status === "PASS"
				? "`PASS`"
				: c.status === "WARN"
					? "`WARN`"
					: "`FAIL`";

		lines.push(
			`| **${c.category}** | ${c.totalDocuments} | ${c.freshDocuments} | ${c.staleDocuments} | ${c.orphanedDocuments} | ${c.freshnessPercentage}% | ${c.targetPercentage}% | ${badge} |`,
		);
	}

	lines.push("");
	lines.push("## 2. Remediation Priority Queue");
	lines.push("");

	if (data.remediationPriorities.length === 0) {
		lines.push("All documentation artifacts satisfy target SLA thresholds. Zero remediation actions required.");
	} else {
		lines.push("| Priority | Category | Document | Action Required |");
		lines.push("| :---: | :--- | :--- | :--- |");
		for (const item of data.remediationPriorities) {
			const pBadge =
				item.priority === "P0"
					? "**`P0 (CRITICAL)`**"
					: item.priority === "P1"
						? "`P1 (HIGH)`"
						: item.priority === "P2"
							? "`P2 (MEDIUM)`"
							: "`P3 (LOW)`";
			lines.push(`| ${pBadge} | ${item.category} | \`${item.document}\` | ${item.action} |`);
		}
	}

	lines.push("");
	lines.push("---");
	lines.push("*Automated compliance report produced in accordance with Monorepo Invariant 10 (100% offline verification).*");

	return lines.join("\n");
}
