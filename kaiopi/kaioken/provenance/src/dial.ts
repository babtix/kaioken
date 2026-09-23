import type {
	CategoryFreshness,
	DocCategory,
	FreshnessDial,
	FreshnessTier,
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

/**
 * Classify a document identifier or relative path into one of the 10 standard categories.
 */
export function classifyDocCategory(document: string): DocCategory {
	const lower = document.toLowerCase();

	if (lower.startsWith("card:") || lower.includes("cards/")) return "cards";
	if (lower.includes("subsystem") || lower.includes("graph") || lower.includes("edges")) return "subsystems";
	if (lower.includes("arch") || lower.includes("overview") || lower.includes("design") || lower.includes("system")) {
		return "architecture";
	}
	if (lower.includes("skill") || lower.includes("procedure") || lower.includes("recipe") || lower.includes("task")) {
		return "procedures";
	}
	if (lower.includes("api") || lower.includes("route") || lower.includes("endpoint") || lower.includes("contract")) {
		return "api";
	}
	if (lower.includes("model") || lower.includes("schema") || lower.includes("entity") || lower.includes("data")) {
		return "data_models";
	}
	if (lower.includes("security") || lower.includes("auth") || lower.includes("shield") || lower.includes("token")) {
		return "security";
	}
	if (lower.includes("runbook") || lower.includes("deploy") || lower.includes("build") || lower.includes("release")) {
		return "runbooks";
	}
	if (lower.includes("benchmark") || lower.includes("perf") || lower.includes("tuning") || lower.includes("metric")) {
		return "benchmarks";
	}
	if (lower.includes("tutorial") || lower.includes("guide") || lower.includes("onboarding") || lower.includes("quickstart")) {
		return "tutorials";
	}

	return "other";
}

/**
 * Calculate multi-category freshness dial metrics from a StalenessReport.
 */
export function calculateFreshnessDial(report: StalenessReport): FreshnessDial {
	const overallPercentage = Math.round(report.freshness * 100);

	let tier: FreshnessTier = "critical";
	if (overallPercentage >= 95) tier = "pristine";
	else if (overallPercentage >= 80) tier = "healthy";
	else if (overallPercentage >= 50) tier = "warning";

	const catStats = new Map<DocCategory, { total: number; fresh: number; stale: number; orphaned: number }>();
	for (const cat of ALL_CATEGORIES) {
		catStats.set(cat, { total: 0, fresh: 0, stale: 0, orphaned: 0 });
	}

	for (const doc of report.documents) {
		const cat = classifyDocCategory(doc.document);
		const stats = catStats.get(cat)!;
		stats.total++;
		if (doc.freshness === "current") stats.fresh++;
		else if (doc.freshness === "stale") stats.stale++;
		else if (doc.freshness === "orphaned") stats.orphaned++;
	}

	const categories = {} as Record<DocCategory, CategoryFreshness>;
	for (const cat of ALL_CATEGORIES) {
		const stats = catStats.get(cat)!;
		const pct = stats.total === 0 ? 100 : Math.round((stats.fresh / stats.total) * 100);
		categories[cat] = {
			category: cat,
			total: stats.total,
			fresh: stats.fresh,
			stale: stats.stale,
			orphaned: stats.orphaned,
			percentage: pct,
		};
	}

	return {
		overallPercentage,
		tier,
		categories,
		totalDocuments: report.documents.length,
		freshDocuments: report.current.length,
		staleDocuments: report.stale.length,
		orphanedDocuments: report.orphaned.length,
	};
}

export interface DialRenderOptions {
	format?: "unicode" | "ascii" | "bar" | "compact";
	color?: boolean;
}

/**
 * Render visual freshness dial gauge or badge for terminal UI.
 */
export function renderFreshnessDial(dial: FreshnessDial, options?: DialRenderOptions): string {
	const format = options?.format ?? "unicode";
	const useColor = options?.color ?? false;

	const colorCode =
		dial.tier === "pristine" || dial.tier === "healthy"
			? "\x1b[32m" // green
			: dial.tier === "warning"
				? "\x1b[33m" // yellow
				: "\x1b[31m"; // red
	const reset = "\x1b[0m";

	const wrapColor = (text: string) => (useColor ? `${colorCode}${text}${reset}` : text);

	if (format === "compact") {
		return wrapColor(
			`[Freshness: ${dial.overallPercentage}% | ${dial.tier.toUpperCase()} | ${dial.freshDocuments} fresh, ${dial.staleDocuments} stale, ${dial.orphanedDocuments} orphaned]`,
		);
	}

	if (format === "ascii") {
		const totalBars = 10;
		const filled = Math.round((dial.overallPercentage / 100) * totalBars);
		const bar = `[${"=".repeat(filled)}${".".repeat(totalBars - filled)}]`;
		return wrapColor(`${bar} ${dial.overallPercentage}% (${dial.tier})`);
	}

	if (format === "bar") {
		const totalBars = 10;
		const filled = Math.round((dial.overallPercentage / 100) * totalBars);
		const bar = `◖${"█".repeat(filled)}${"░".repeat(totalBars - filled)}◗`;
		return wrapColor(`${bar} ${dial.overallPercentage}% (${dial.tier})`);
	}

	// Full Unicode Card Dial
	const totalBars = 12;
	const filled = Math.round((dial.overallPercentage / 100) * totalBars);
	const bar = `◖${"█".repeat(filled)}${"░".repeat(totalBars - filled)}◗`;

	const header = wrapColor(`╭──────────────── Freshness Dial: ${dial.overallPercentage}% [${dial.tier.toUpperCase()}] ────────────────╮`);
	const line1 = `│  Gauge: ${wrapColor(bar)}  Overall: ${wrapColor(`${dial.overallPercentage}%`)}                                │`;
	const line2 = `│  Stats: ${dial.freshDocuments} fresh · ${dial.staleDocuments} stale · ${dial.orphanedDocuments} orphaned (${dial.totalDocuments} total)         │`;
	const footer = wrapColor(`╰──────────────────────────────────────────────────────────────────╯`);

	return [header, line1, line2, footer].join("\n");
}

/**
 * Format a text summary with breakdown per category.
 */
export function formatFreshnessSummary(dial: FreshnessDial): string {
	const lines: string[] = [
		`Repository Freshness: ${dial.overallPercentage}% [${dial.tier.toUpperCase()}]`,
		`Total Documents: ${dial.totalDocuments} (${dial.freshDocuments} fresh, ${dial.staleDocuments} stale, ${dial.orphanedDocuments} orphaned)`,
		"",
		"Category Breakdown:",
	];

	for (const cat of ALL_CATEGORIES) {
		const c = dial.categories[cat];
		if (c.total > 0) {
			lines.push(`  - ${cat.padEnd(14)}: ${c.percentage}% (${c.fresh}/${c.total} fresh, ${c.stale} stale)`);
		}
	}

	return lines.join("\n");
}
