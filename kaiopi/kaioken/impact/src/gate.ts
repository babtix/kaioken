/**
 * gate.ts — Pre-commit impact check gate blocking unannounced public API
 * breaking changes (UX-0921–UX-0930).
 *
 * Evaluates whether proposed changes to symbols exceed risk thresholds,
 * blocking commits that risk breaking external/downstream callers without
 * prior deprecation or coordination.
 *
 * Invariant: 100% offline-testable with defensive error boundaries.
 */

import type { ImpactReport } from "./predict.ts";
import type { BlastRadiusScore } from "./score.ts";

export interface BlockerEntry {
	symbol: string;
	kind: string;
	path: string;
	reason: string;
}

export interface PreCommitGateResult {
	passed: boolean;
	blockers: BlockerEntry[];
	warnings: string[];
}

/**
 * Evaluates the impact report against safety thresholds.
 *
 * Blocks if:
 *  - Score is high/critical (>= 60) AND at least one exported symbol has dependents.
 *  - Or any exported symbol has >= 10 dependents regardless of score.
 *
 * Warns if:
 *  - Score is medium (>= 30) or dependent count > 0 for exported symbols.
 */
export function runPreCommitGate(report: ImpactReport, score: BlastRadiusScore): PreCommitGateResult {
	const blockers: BlockerEntry[] = [];
	const warnings: string[] = [];

	const exportedSymbols = report.symbols.filter((s) => s.exported);
	const hasDependents = report.dependents.length > 0;

	for (const symbol of exportedSymbols) {
		if (hasDependents && score.score >= 60) {
			blockers.push({
				symbol: symbol.name,
				kind: symbol.kind,
				path: symbol.path,
				reason: `Blast radius score ${score.score}/100 exceeds critical gate threshold (60) with ${report.dependents.length} dependent file(s).`,
			});
		} else if (report.dependents.length >= 10) {
			blockers.push({
				symbol: symbol.name,
				kind: symbol.kind,
				path: symbol.path,
				reason: `Exported symbol has ${report.dependents.length} dependent files (threshold: 10). Public API change requires explicit migration path.`,
			});
		} else if (hasDependents || score.score >= 30) {
			warnings.push(
				`Symbol "${symbol.name}" in ${symbol.path} has ${report.dependents.length} dependent file(s) (risk score: ${score.score}/100 [${score.label}]).`,
			);
		}
	}

	if (score.score >= 50 && exportedSymbols.length === 0 && hasDependents) {
		warnings.push(
			`High blast radius (${score.score}/100) affecting ${report.dependents.length} file(s), though no exported declarations were directly matched.`,
		);
	}

	return {
		passed: blockers.length === 0,
		blockers,
		warnings,
	};
}

/**
 * Format gate execution output for terminal display.
 */
export function renderGate(result: PreCommitGateResult): string[] {
	const lines: string[] = [];

	if (result.passed) {
		lines.push("✓ Impact gate: PASSED (safe to proceed with commit)");
		for (const warn of result.warnings) {
			lines.push(`  ⚠ Warning: ${warn}`);
		}
	} else {
		lines.push("✗ Impact gate: BLOCKED (unsafe public API modification)");
		for (const blocker of result.blockers) {
			lines.push(`  ⛔ [${blocker.kind}] ${blocker.symbol} (${blocker.path}): ${blocker.reason}`);
		}
		for (const warn of result.warnings) {
			lines.push(`  ⚠ Warning: ${warn}`);
		}
		lines.push("  Run with --force or update downstream call sites before committing.");
	}

	return lines;
}
