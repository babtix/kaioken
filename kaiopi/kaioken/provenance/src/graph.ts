import { calculateFreshnessDial } from "./dial.ts";
import { fastCheckStaleness } from "./staleness.ts";
import type {
	CategoryDecayMetric,
	DocCategory,
	HistoricalStalenessGraph,
	StalenessDataPoint,
	StalenessSnapshot,
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

const SPARK_CHARS = [" ", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

function sparklineForValues(values: readonly number[]): string {
	if (values.length === 0) return "";
	const min = 0;
	const max = 100;
	return values
		.map((v) => {
			const clamped = Math.max(min, Math.min(max, v));
			const idx = Math.min(
				SPARK_CHARS.length - 1,
				Math.floor((clamped / 100) * SPARK_CHARS.length),
			);
			return SPARK_CHARS[idx];
		})
		.join("");
}

/**
 * Build historical staleness graph tracking decay across snapshots over time.
 * Supports all 10 artifact types (UX-0861 - UX-0870).
 */
export function buildHistoricalStalenessGraph(
	snapshots: readonly (StalenessSnapshot | StalenessDataPoint)[],
): HistoricalStalenessGraph {
	const points: StalenessDataPoint[] = [];

	for (const snap of snapshots) {
		if ("documents" in snap && "currentHashes" in snap) {
			const report = fastCheckStaleness(snap.documents, snap.currentHashes);
			const dial = calculateFreshnessDial(report);

			const catFreshness = {} as Record<DocCategory, number>;
			for (const cat of ALL_CATEGORIES) {
				catFreshness[cat] = dial.categories[cat]?.percentage ?? 100;
			}

			points.push({
				timestamp: snap.timestamp,
				label: snap.label,
				overallFreshness: dial.overallPercentage,
				categoryFreshness: catFreshness,
				totalDocuments: report.documents.length,
				staleDocuments: report.stale.length,
				orphanedDocuments: report.orphaned.length,
			});
		} else {
			points.push(snap as StalenessDataPoint);
		}
	}

	const categoryDecay = {} as Record<DocCategory, CategoryDecayMetric>;
	let totalNetDecay = 0;
	const snapshotCount = points.length;
	const steps = Math.max(1, snapshotCount - 1);

	for (const cat of ALL_CATEGORIES) {
		if (points.length === 0) {
			categoryDecay[cat] = {
				category: cat,
				initialFreshness: 100,
				latestFreshness: 100,
				netDecay: 0,
				decayVelocity: 0,
				trend: "stable",
			};
			continue;
		}

		const initial = points[0].categoryFreshness[cat] ?? 100;
		const latest = points[snapshotCount - 1].categoryFreshness[cat] ?? 100;
		const net = initial - latest;
		const vel = Number((net / steps).toFixed(2));
		totalNetDecay += net;

		const trend: "improving" | "stable" | "decaying" =
			net > 2 ? "decaying" : net < -2 ? "improving" : "stable";

		categoryDecay[cat] = {
			category: cat,
			initialFreshness: initial,
			latestFreshness: latest,
			netDecay: net,
			decayVelocity: vel,
			trend,
		};
	}

	const overallDecayVelocity =
		points.length <= 1
			? 0
			: Number(
					(
						(points[0].overallFreshness - points[snapshotCount - 1].overallFreshness) /
						steps
					).toFixed(2),
				);

	return {
		points,
		categoryDecay,
		overallDecayVelocity,

		renderAsciiSparkline(category?: DocCategory): string {
			if (points.length === 0) return "[No snapshots]";
			if (category) {
				const vals = points.map((p) => p.categoryFreshness[category] ?? 100);
				const spark = sparklineForValues(vals);
				const first = vals[0];
				const last = vals[vals.length - 1];
				return `${category}: [${first}% -> ${last}%] ${spark} (vel: ${categoryDecay[category].decayVelocity}/step)`;
			}

			const overallVals = points.map((p) => p.overallFreshness);
			const spark = sparklineForValues(overallVals);
			const first = overallVals[0];
			const last = overallVals[overallVals.length - 1];
			return `Overall: [${first}% -> ${last}%] ${spark} (vel: ${overallDecayVelocity}/step)`;
		},

		renderMermaid(): string {
			const lines: string[] = ["```mermaid", "xychart-beta", '    title "Historical Documentation Staleness Decay"'];
			const xLabels = points.map((p, idx) => `"${p.label ?? p.timestamp ?? `S${idx + 1}`}"`).join(", ");
			lines.push(`    x-axis [${xLabels}]`);
			lines.push('    y-axis "Freshness %" 0 --> 100');

			const overallVals = points.map((p) => p.overallFreshness).join(", ");
			lines.push(`    line [${overallVals}]`);
			lines.push("```");
			return lines.join("\n");
		},

		renderMarkdownSummary(): string {
			const lines: string[] = [
				"## Historical Documentation Staleness Decay Analysis",
				"",
				`**Snapshots Tracked**: ${points.length} | **Overall Velocity**: ${overallDecayVelocity > 0 ? `-${overallDecayVelocity}%/step` : `+${Math.abs(overallDecayVelocity)}%/step`}`,
				"",
				"| Category | Initial | Current | Net Decay | Velocity | Trend | Sparkline |",
				"| :--- | :---: | :---: | :---: | :---: | :---: | :--- |",
			];

			for (const cat of ALL_CATEGORIES) {
				const m = categoryDecay[cat];
				const vals = points.map((p) => p.categoryFreshness[cat] ?? 100);
				const spark = sparklineForValues(vals);
				const trendBadge =
					m.trend === "decaying"
						? "⚠️ DECAYING"
						: m.trend === "improving"
							? "✅ IMPROVING"
							: "➡️ STABLE";

				lines.push(
					`| **${cat}** | ${m.initialFreshness}% | ${m.latestFreshness}% | ${m.netDecay > 0 ? `-${m.netDecay}%` : `+${Math.abs(m.netDecay)}%`} | ${m.decayVelocity}/step | ${trendBadge} | \`${spark}\` |`,
				);
			}

			return lines.join("\n");
		},
	};
}
