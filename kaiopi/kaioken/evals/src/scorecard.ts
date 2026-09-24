/**
 * Eval regression scorecards and confidence ratings.
 *
 * A single `EvalReport` says whether one run passed. A scorecard says whether
 * the suite is *drifting*: it persists the report to
 * `.kaioken/evals/scorecard.json`, rates decision confidence on a 0-100 scale,
 * and diffs the current run against the stored baseline so CI can name the
 * regressed probe instead of printing a bare FAIL.
 *
 * Fully offline (Invariant 10): file IO only, no network, no model.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type { EvalReport, ProbeOutcome } from "./types.ts";

export const SCORECARD_FILE = "scorecard.json";

export function scorecardPath(root: string): string {
	return join(root, KAIOKEN_DIR, "evals", SCORECARD_FILE);
}

/**
 * A persisted evaluation run, with a confidence rating attached.
 *
 * Confidence tiers mirror the grounding tiers used elsewhere: >= 90 grounded,
 * 70-89 partial, < 70 hallucinated. Any threshold violation caps confidence
 * below 70, because a run that invents symbols is not "mostly confident".
 */
export interface EvalScorecard {
	name: string;
	generatedAt: string;
	passed: boolean;
	/** 0-100 decision confidence rating. */
	confidence: number;
	metrics: EvalReport["metrics"];
	probes: ProbeOutcome[];
	failures: Record<string, string>;
}

/** Which probes/metrics got worse (or better) since the baseline run. */
export interface ScorecardDiff {
	regressed: string[];
	improved: string[];
	/** True when nothing that passed in the baseline now fails. */
	clean: boolean;
}

/**
 * Rate decision confidence for a report.
 *
 * The score is the probe pass rate scaled to 0-100, capped below 70 when any
 * grounding threshold was violated. An empty probe list rates 0: a run that
 * measured nothing is not confident about anything.
 */
export function confidenceFor(report: EvalReport): number {
	if (report.probes.length === 0) return 0;
	const passed = report.probes.filter((p) => p.passed).length;
	const rate = Math.round((passed / report.probes.length) * 100);
	const violated =
		Object.keys(report.failures).some((k) => !k.startsWith("probe:")) || !report.passed;
	if (violated) return Math.min(rate, 69);
	return rate;
}

export function toScorecard(report: EvalReport, generatedAt?: string): EvalScorecard {
	return {
		name: report.name,
		generatedAt: generatedAt ?? new Date().toISOString(),
		passed: report.passed,
		confidence: confidenceFor(report),
		metrics: report.metrics,
		probes: report.probes,
		failures: report.failures,
	};
}

/** Failure keys of a scorecard that count as regressions when newly present. */
function failureKeys(card: EvalScorecard): Set<string> {
	return new Set(Object.keys(card.failures));
}

/**
 * Diff the current run against a stored baseline.
 *
 * A regression is a failure key present now but absent in the baseline;
 * an improvement is the reverse. Metric-only drift with no new failure key
 * is not flagged, because the thresholds in `types.ts` already decide it.
 */
export function diffScorecards(current: EvalScorecard, baseline: EvalScorecard): ScorecardDiff {
	const now = failureKeys(current);
	const before = failureKeys(baseline);
	const regressed = [...now].filter((k) => !before.has(k)).sort();
	const improved = [...before].filter((k) => !now.has(k)).sort();
	return { regressed, improved, clean: regressed.length === 0 };
}

/** A one-screen rendering for a terminal or a CI log. */
export function formatScorecard(card: EvalScorecard, diff?: ScorecardDiff): string {
	const tier = card.confidence >= 90 ? "GROUNDED" : card.confidence >= 70 ? "PARTIAL" : "LOW";
	const lines = [
		`scorecard: ${card.name} — ${card.passed ? "PASS" : "FAIL"} (confidence ${card.confidence}/100 ${tier})`,
		`  hallucinated symbols:      ${card.metrics.hallucinatedSymbols}`,
		`  verify-before-done:        ${card.metrics.verifyComplianceViolations} violation(s)`,
		`  quote mismatches:          ${card.metrics.quoteMismatches}`,
		`  stale documents:           ${card.metrics.staleDocuments}`,
		`  estimated tokens:          ${card.metrics.estimatedTokens.toLocaleString()}`,
		`  estimated cost:            ${card.metrics.estimatedUsd === null ? "unknown" : `$${card.metrics.estimatedUsd.toFixed(4)}`}`,
		"",
		...card.probes.map((p) => `  [${p.passed ? "ok" : "XX"}] ${p.id}: ${p.description}`),
	];
	if (diff && (diff.regressed.length > 0 || diff.improved.length > 0)) {
		lines.push("", "regression vs baseline:");
		for (const key of diff.regressed) lines.push(`  - REGRESSED ${key}: ${card.failures[key] ?? ""}`);
		for (const key of diff.improved) lines.push(`  + recovered ${key}`);
	} else if (!card.passed) {
		lines.push("", "failures:");
		for (const [key, detail] of Object.entries(card.failures)) lines.push(`  - ${key}: ${detail}`);
	}
	return lines.join("\n");
}

/**
 * Streaming NDJSON for CI pipelines: one JSON object per line, a `summary`
 * line last. Line-delimited (not pretty-printed) so a runner can consume the
 * stream incrementally with `--json`.
 */
export function formatNdjson(card: EvalScorecard): string {
	const lines = card.probes.map((p) =>
		JSON.stringify({ type: "probe", run: card.name, id: p.id, passed: p.passed, ...(p.detail ? { detail: p.detail } : {}) }),
	);
	lines.push(
		JSON.stringify({
			type: "summary",
			run: card.name,
			passed: card.passed,
			confidence: card.confidence,
			metrics: card.metrics,
			failures: card.failures,
		}),
	);
	return `${lines.join("\n")}\n`;
}

export async function writeScorecard(root: string, card: EvalScorecard): Promise<string> {
	const path = scorecardPath(root);
	await mkdir(join(root, KAIOKEN_DIR, "evals"), { recursive: true });
	await writeFile(path, `${JSON.stringify(card, null, 2)}\n`, "utf8");
	return path;
}

export async function readScorecard(root: string): Promise<EvalScorecard | null> {
	try {
		return JSON.parse(await readFile(scorecardPath(root), "utf8")) as EvalScorecard;
	} catch {
		return null;
	}
}
