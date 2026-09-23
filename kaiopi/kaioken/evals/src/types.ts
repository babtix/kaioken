/**
 * What an evaluation run measures.
 *
 * These are the claims the architecture makes, expressed as numbers that can be
 * wrong. An eval suite that cannot fail is a marketing document; every metric
 * here has a threshold it can miss.
 */

export interface ProbeOutcome {
	/** Stable id, so a regression names the same probe across runs. */
	id: string;
	description: string;
	passed: boolean;
	/** Why it failed, when it did. */
	detail?: string;
}

export interface EvalMetrics {
	/**
	 * Symbols a session asserted that the repository does not declare.
	 *
	 * The headline number: raw Flash-class models invent these; the grounding
	 * tools exist to make it zero.
	 */
	hallucinatedSymbols: number;
	/** Sessions that edited code and then claimed completion without verifying. */
	verifyComplianceViolations: number;
	/** Quoted excerpts that did not match the source byte-for-byte. */
	quoteMismatches: number;
	/** Documents whose provenance no longer matches the current source. */
	staleDocuments: number;
	/** Estimated tokens spent, summed across stages. */
	estimatedTokens: number;
	/** Estimated USD, or null when no pricing was available. */
	estimatedUsd: number | null;
}

export interface EvalReport {
	name: string;
	/** True when every metric met its threshold. */
	passed: boolean;
	metrics: EvalMetrics;
	probes: ProbeOutcome[];
	/** Metric name -> why it failed. Empty when the run passed. */
	failures: Record<string, string>;
}

/**
 * Thresholds a run must meet.
 *
 * Grounding is absolute — a single invented symbol fails the run. Efficiency is
 * comparative, because a token budget depends on the repository.
 */
export const THRESHOLDS = {
	hallucinatedSymbols: 0,
	verifyComplianceViolations: 0,
	quoteMismatches: 0,
	/** Drift detection must work, but a run may legitimately leave docs current. */
	staleDocuments: Number.POSITIVE_INFINITY,
} as const;

export function evaluate(name: string, metrics: EvalMetrics, probes: ProbeOutcome[]): EvalReport {
	const failures: Record<string, string> = {};

	if (metrics.hallucinatedSymbols > THRESHOLDS.hallucinatedSymbols) {
		failures.hallucinatedSymbols = `expected ${THRESHOLDS.hallucinatedSymbols}, got ${metrics.hallucinatedSymbols}`;
	}
	if (metrics.verifyComplianceViolations > THRESHOLDS.verifyComplianceViolations) {
		failures.verifyComplianceViolations = `expected ${THRESHOLDS.verifyComplianceViolations}, got ${metrics.verifyComplianceViolations}`;
	}
	if (metrics.quoteMismatches > THRESHOLDS.quoteMismatches) {
		failures.quoteMismatches = `expected ${THRESHOLDS.quoteMismatches}, got ${metrics.quoteMismatches}`;
	}

	for (const probe of probes) {
		if (!probe.passed) failures[`probe:${probe.id}`] = probe.detail ?? "failed";
	}

	return {
		name,
		passed: Object.keys(failures).length === 0,
		metrics,
		probes,
		failures,
	};
}

/** A one-line-per-metric rendering, for a terminal or a CI log. */
export function formatReport(report: EvalReport): string {
	const lines = [
		`eval: ${report.name} — ${report.passed ? "PASS" : "FAIL"}`,
		`  hallucinated symbols:      ${report.metrics.hallucinatedSymbols}`,
		`  verify-before-done:        ${report.metrics.verifyComplianceViolations} violation(s)`,
		`  quote mismatches:          ${report.metrics.quoteMismatches}`,
		`  stale documents:           ${report.metrics.staleDocuments}`,
		`  estimated tokens:          ${report.metrics.estimatedTokens.toLocaleString()}`,
		`  estimated cost:            ${report.metrics.estimatedUsd === null ? "unknown" : `$${report.metrics.estimatedUsd.toFixed(4)}`}`,
		"",
		...report.probes.map((p) => `  [${p.passed ? "ok" : "XX"}] ${p.id}: ${p.description}`),
	];

	if (!report.passed) {
		lines.push("", "failures:");
		for (const [key, detail] of Object.entries(report.failures)) lines.push(`  - ${key}: ${detail}`);
	}

	return lines.join("\n");
}
