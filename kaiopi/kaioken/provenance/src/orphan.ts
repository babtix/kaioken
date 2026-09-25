import { classifyDocCategory } from "./dial.ts";
import type {
	DocCategory,
	OrphanDetectionOptions,
	OrphanItem,
	OrphanRecommendation,
	OrphanReport,
	Provenance,
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

const CRITICAL_CATEGORIES = new Set<DocCategory>([
	"architecture",
	"security",
	"api",
	"data_models",
]);

/**
 * Determine remediation recommendation for an orphaned document.
 */
export function getOrphanRecommendation(
	missingSources: readonly string[],
	knownRenames?: ReadonlyMap<string, string>,
): { recommendation: OrphanRecommendation; explanation: string } {
	if (missingSources.length === 0) {
		return {
			recommendation: "delete",
			explanation: "No sources are registered for this document.",
		};
	}

	if (knownRenames && knownRenames.size > 0) {
		const renamedHits = missingSources.filter((s) => knownRenames.has(s));
		if (renamedHits.length > 0) {
			const repoints = renamedHits
				.map((s) => `${s} -> ${knownRenames.get(s)}`)
				.join(", ");
			return {
				recommendation: "repoint",
				explanation: `Sources moved or renamed in repository: ${repoints}`,
			};
		}
	}

	// If source looks like archived or deprecated code
	const isHistorical = missingSources.some(
		(s) =>
			s.includes("legacy") ||
			s.includes("v1") ||
			s.includes("deprecated") ||
			s.includes("archived") ||
			s.includes("old"),
	);

	if (isHistorical) {
		return {
			recommendation: "archive",
			explanation:
				"Source was deprecated or replaced with newer implementation; preserve in archive.",
		};
	}

	return {
		recommendation: "delete",
		explanation:
			"All underlying source files have been permanently removed from the codebase.",
	};
}

/**
 * Detect orphaned documentation where underlying code files or symbol definitions have been deleted.
 * Covers all 10 documentation artifact types (UX-0851 - UX-0860).
 */
export function detectOrphanedDocumentation(
	documents: readonly Provenance[],
	currentFiles: ReadonlyMap<string, string> | readonly string[],
	options?: OrphanDetectionOptions,
): OrphanReport {
	const fileSet =
		currentFiles instanceof Map || (typeof (currentFiles as any).has === "function" && !(currentFiles instanceof Array))
			? (currentFiles as ReadonlyMap<string, string>)
			: new Set<string>(currentFiles as readonly string[]);

	const hasFile = (p: string) => {
		if (fileSet instanceof Map) return fileSet.has(p);
		return (fileSet as Set<string>).has(p);
	};

	const orphans: OrphanItem[] = [];
	const byCategory: Record<DocCategory, OrphanItem[]> = {
		architecture: [],
		cards: [],
		subsystems: [],
		procedures: [],
		api: [],
		data_models: [],
		security: [],
		runbooks: [],
		benchmarks: [],
		tutorials: [],
		other: [],
	};

	for (const doc of documents) {
		if (doc.sources.length === 0) continue;

		const missingSources: string[] = [];
		for (const source of doc.sources) {
			if (!hasFile(source.path)) {
				missingSources.push(source.path);
			}
		}

		// A document is considered orphaned if ALL its sources have been deleted
		if (missingSources.length === doc.sources.length) {
			const category = options?.customClassifier
				? options.customClassifier(doc.document)
				: classifyDocCategory(doc.document);

			const { recommendation, explanation } = getOrphanRecommendation(
				missingSources,
				options?.knownRenames,
			);

			const item: OrphanItem = {
				document: doc.document,
				category,
				missingSources,
				recommendation,
				explanation,
			};

			orphans.push(item);
			byCategory[category].push(item);
		}
	}

	let criticalCount = 0;
	for (const item of orphans) {
		if (CRITICAL_CATEGORIES.has(item.category)) {
			criticalCount++;
		}
	}

	const summary =
		orphans.length === 0
			? "No orphaned documentation detected across any category."
			: `Detected ${orphans.length} orphaned document(s) (${criticalCount} in critical categories: architecture/api/security/data_models).`;

	return {
		orphans,
		byCategory,
		totalOrphans: orphans.length,
		criticalCount,
		summary,
	};
}

/**
 * Format an OrphanReport into readable Markdown.
 */
export function formatOrphanReportMarkdown(report: OrphanReport): string {
	const lines: string[] = [
		"# Orphaned Documentation Audit Report",
		"",
		`**Summary**: ${report.summary}`,
		`**Total Orphans**: ${report.totalOrphans} | **Critical**: ${report.criticalCount}`,
		"",
		"| Category | Document | Missing Sources | Action | Rationale |",
		"| :--- | :--- | :--- | :--- | :--- |",
	];

	if (report.orphans.length === 0) {
		lines.push("| - | None | None | PASS | All documents bind to active code sources |");
		return lines.join("\n");
	}

	for (const orphan of report.orphans) {
		const actionBadge =
			orphan.recommendation === "delete"
				? "`DELETE`"
				: orphan.recommendation === "repoint"
					? "`REPOINT`"
					: "`ARCHIVE`";
		const sources = orphan.missingSources.map((s) => `\`${s}\``).join(", ");
		lines.push(
			`| **${orphan.category}** | \`${orphan.document}\` | ${sources} | ${actionBadge} | ${orphan.explanation} |`,
		);
	}

	lines.push("");
	lines.push("### Breakdown by Category");
	for (const cat of ALL_CATEGORIES) {
		const count = report.byCategory[cat]?.length ?? 0;
		if (count > 0) {
			lines.push(`- **${cat}**: ${count} orphaned document(s)`);
		}
	}

	return lines.join("\n");
}
