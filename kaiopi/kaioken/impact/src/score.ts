/**
 * score.ts — Blast radius risk score gauge (0–100) (UX-0911–UX-0920).
 *
 * Weighs exported symbols, dependent file count, public-API surface, and
 * detected dependency cycles into a single integer score with a categorical
 * label.  The gauge renders as an ASCII bar.
 *
 * Invariant: pure computation — no I/O, no network.
 */

import type { ImpactReport } from "./predict.ts";
import type { CycleEntry } from "./cycle.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLabel = "low" | "medium" | "high" | "critical";

export interface BlastRadiusBreakdown {
	/** Contribution from exported symbols (0–30). */
	exported: number;
	/** Contribution from the number of dependent files (0–40). */
	dependents: number;
	/** Contribution from having public-API (publicly exported) symbols (0–20). */
	publicApi: number;
	/** Contribution from detected cycles (0–10). */
	cycles: number;
}

export interface BlastRadiusScore {
	/** Integer 0–100. */
	score: number;
	label: RiskLabel;
	breakdown: BlastRadiusBreakdown;
}

// ---------------------------------------------------------------------------
// Weights
// ---------------------------------------------------------------------------

const EXPORTED_SYMBOL_WEIGHT = 2; // per exported symbol
const EXPORTED_MAX = 30;
const DEPENDENT_WEIGHT = 1.5; // per dependent file
const DEPENDENT_MAX = 40;
const PUBLIC_API_SCORE = 20; // flat bonus for any public-API symbol
const CYCLE_WEIGHT = 5; // per unique cycle
const CYCLE_MAX = 10;

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

function clamp(min: number, max: number, value: number): number {
	return Math.min(max, Math.max(min, value));
}

function labelOf(score: number): RiskLabel {
	if (score < 20) return "low";
	if (score < 50) return "medium";
	if (score < 75) return "high";
	return "critical";
}

/**
 * Compute the blast radius risk score for a given impact report and optional
 * cycle data.
 *
 * @param report   The `ImpactReport` produced by `predictImpact`.
 * @param cycles   Detected dependency cycles (from `findTransitiveDependents`).
 */
export function computeBlastRadius(report: ImpactReport, cycles: readonly CycleEntry[] = []): BlastRadiusScore {
	const exportedCount = report.symbols.filter((s) => s.exported).length;
	const dependentCount = report.dependents.length;
	const hasPublicApi = report.symbols.some((s) => s.exported);
	const cycleCount = cycles.length;

	const exportedScore = clamp(0, EXPORTED_MAX, exportedCount * EXPORTED_SYMBOL_WEIGHT);
	const dependentScore = clamp(0, DEPENDENT_MAX, dependentCount * DEPENDENT_WEIGHT);
	const publicApiScore = hasPublicApi ? PUBLIC_API_SCORE : 0;
	const cycleScore = clamp(0, CYCLE_MAX, cycleCount * CYCLE_WEIGHT);

	const total = clamp(0, 100, Math.round(exportedScore + dependentScore + publicApiScore + cycleScore));

	return {
		score: total,
		label: labelOf(total),
		breakdown: {
			exported: Math.round(exportedScore),
			dependents: Math.round(dependentScore),
			publicApi: publicApiScore,
			cycles: Math.round(cycleScore),
		},
	};
}

// ---------------------------------------------------------------------------
// Gauge renderer
// ---------------------------------------------------------------------------

const GAUGE_WIDTH = 20;
const LABEL_COLORS: Record<RiskLabel, string> = {
	low: "✅",
	medium: "⚠️ ",
	high: "🔴",
	critical: "💀",
};

/**
 * Render a single-line ASCII gauge:
 * `💀 [████████████████░░░░] 82/100 critical`
 */
export function renderBlastGauge(score: BlastRadiusScore): string {
	const filled = Math.round((score.score / 100) * GAUGE_WIDTH);
	const empty = GAUGE_WIDTH - filled;
	const bar = "█".repeat(filled) + "░".repeat(empty);
	const emoji = LABEL_COLORS[score.label];
	return `${emoji} [${bar}] ${score.score}/100 ${score.label}`;
}
