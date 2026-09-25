import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { KAIOKEN_DIR } from "@kaioken/scan";
import type {
	BenchmarkRecord,
	BenchmarkRegressionReport,
	SuiteBenchmarkHistory,
	VerifyDurationBenchmarkStore,
	VerifySuiteType,
} from "./types.ts";

export const BENCHMARK_STORE_PATH = join(
	KAIOKEN_DIR,
	"benchmarks",
	"verify-duration.json",
);

export const DEFAULT_THRESHOLD_PERCENT = 25; // 25% slowdown
export const DEFAULT_THRESHOLD_MIN_MS = 500; // at least 500ms slowdown

const ALL_SUITES: VerifySuiteType[] = [
	"nodejs",
	"python",
	"go",
	"rust",
	"deno",
	"make",
	"snapshots",
	"typescript",
	"lint",
	"e2e",
];

// ---------------------------------------------------------------------------
// Store Creation & Loading
// ---------------------------------------------------------------------------

export function createDefaultBenchmarkStore(): VerifyDurationBenchmarkStore {
	const suites: Record<VerifySuiteType, SuiteBenchmarkHistory> = {} as Record<
		VerifySuiteType,
		SuiteBenchmarkHistory
	>;

	for (const suite of ALL_SUITES) {
		suites[suite] = {
			suite,
			baselineDurationMs: 0,
			records: [],
			thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
			thresholdMinMs: DEFAULT_THRESHOLD_MIN_MS,
		};
	}

	return {
		version: 1,
		suites,
	};
}

export async function loadBenchmarkStore(
	root: string,
): Promise<VerifyDurationBenchmarkStore> {
	const filePath = join(root, BENCHMARK_STORE_PATH);
	if (!existsSync(filePath)) {
		return createDefaultBenchmarkStore();
	}

	try {
		const text = await readFile(filePath, "utf8");
		const parsed = JSON.parse(text) as VerifyDurationBenchmarkStore;
		if (parsed && typeof parsed === "object" && parsed.suites) {
			const defaults = createDefaultBenchmarkStore();
			for (const s of ALL_SUITES) {
				if (!parsed.suites[s]) {
					parsed.suites[s] = defaults.suites[s];
				}
			}
			return parsed;
		}
		return createDefaultBenchmarkStore();
	} catch {
		return createDefaultBenchmarkStore();
	}
}

export async function saveBenchmarkStore(
	root: string,
	store: VerifyDurationBenchmarkStore,
): Promise<string> {
	const filePath = join(root, BENCHMARK_STORE_PATH);
	await mkdir(dirname(filePath), { recursive: true });
	await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
	return filePath;
}

// ---------------------------------------------------------------------------
// Regression Evaluation
// ---------------------------------------------------------------------------

export function evaluateRegression(
	history: SuiteBenchmarkHistory,
	currentDurationMs: number,
): BenchmarkRegressionReport {
	const suite = history.suite;
	const baseline = history.baselineDurationMs || currentDurationMs;

	// Calculate statistics
	const durations = history.records.map((r) => r.durationMs);
	durations.push(currentDurationMs);
	durations.sort((a, b) => a - b);

	const averageDurationMs = Math.round(
		durations.reduce((a, b) => a + b, 0) / durations.length,
	);
	const p95Index = Math.min(
		durations.length - 1,
		Math.floor(durations.length * 0.95),
	);
	const p95DurationMs = durations[p95Index] || currentDurationMs;

	const deltaMs = currentDurationMs - baseline;
	const deltaPercent = baseline > 0 ? Math.round((deltaMs / baseline) * 100) : 0;

	const thresholdPercent = history.thresholdPercent ?? DEFAULT_THRESHOLD_PERCENT;
	const thresholdMinMs = history.thresholdMinMs ?? DEFAULT_THRESHOLD_MIN_MS;

	const isSlowdown = deltaPercent >= thresholdPercent && deltaMs >= thresholdMinMs;
	const isSpeedup = deltaPercent <= -10 && deltaMs <= -200;

	let status: "improved" | "stable" | "regressed";
	let message = "";

	if (isSlowdown) {
		status = "regressed";
		message = `Performance regression: ${suite} took ${currentDurationMs}ms (+${deltaMs}ms / +${deltaPercent}% vs baseline ${baseline}ms)`;
	} else if (isSpeedup) {
		status = "improved";
		message = `Performance improvement: ${suite} took ${currentDurationMs}ms (${deltaMs}ms / ${deltaPercent}% vs baseline ${baseline}ms)`;
	} else {
		status = "stable";
		message = `Duration within stable bounds: ${suite} took ${currentDurationMs}ms (baseline ${baseline}ms, avg ${averageDurationMs}ms)`;
	}

	return {
		suite,
		hasRegression: isSlowdown,
		currentDurationMs,
		baselineDurationMs: baseline,
		averageDurationMs,
		p95DurationMs,
		deltaMs,
		deltaPercent,
		status,
		message,
	};
}

// ---------------------------------------------------------------------------
// Record Benchmark
// ---------------------------------------------------------------------------

export function recordBenchmark(
	store: VerifyDurationBenchmarkStore,
	suite: VerifySuiteType,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	if (!store.suites[suite]) {
		store.suites[suite] = {
			suite,
			baselineDurationMs: durationMs,
			records: [],
			thresholdPercent: DEFAULT_THRESHOLD_PERCENT,
			thresholdMinMs: DEFAULT_THRESHOLD_MIN_MS,
		};
	}

	const history = store.suites[suite]!;
	if (history.baselineDurationMs === 0 && passed) {
		history.baselineDurationMs = durationMs;
	}

	const report = evaluateRegression(history, durationMs);

	history.records.push({
		timestamp: Date.now(),
		durationMs,
		passed,
		commitHash: meta?.commitHash,
		testCount: meta?.testCount,
	});

	// Keep last 100 benchmark records per suite to manage file size
	if (history.records.length > 100) {
		history.records.shift();
	}

	return report;
}

// ---------------------------------------------------------------------------
// Suite-Specific Benchmark Trackers (UX-1081 to UX-1090)
// ---------------------------------------------------------------------------

export function benchmarkNodeJsSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "nodejs", durationMs, passed, meta);
}

export function benchmarkPythonSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "python", durationMs, passed, meta);
}

export function benchmarkGoSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "go", durationMs, passed, meta);
}

export function benchmarkRustSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "rust", durationMs, passed, meta);
}

export function benchmarkDenoSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "deno", durationMs, passed, meta);
}

export function benchmarkMakeSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "make", durationMs, passed, meta);
}

export function benchmarkSnapshotSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "snapshots", durationMs, passed, meta);
}

export function benchmarkTypeScriptSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "typescript", durationMs, passed, meta);
}

export function benchmarkLintSuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "lint", durationMs, passed, meta);
}

export function benchmarkE2ESuite(
	store: VerifyDurationBenchmarkStore,
	durationMs: number,
	passed: boolean,
	meta?: { commitHash?: string; testCount?: number },
): BenchmarkRegressionReport {
	return recordBenchmark(store, "e2e", durationMs, passed, meta);
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

export function formatBenchmarkReportTerminal(
	report: BenchmarkRegressionReport,
): string {
	const icon =
		report.status === "regressed"
			? "⚠ REGRESSION"
			: report.status === "improved"
				? "⚡ IMPROVED"
				: "✓ STABLE";

	return `[${report.suite}] ${icon}: ${report.message} (p95: ${report.p95DurationMs}ms)`;
}

export function formatAllBenchmarksMarkdown(
	reports: BenchmarkRegressionReport[],
): string {
	const lines: string[] = [
		"# Verification Gates Duration Benchmark Report",
		"",
		"| Suite | Status | Current | Baseline | Avg | p95 | Delta |",
		"| :--- | :---: | :---: | :---: | :---: | :---: | :---: |",
	];

	for (const r of reports) {
		const statusBadge =
			r.status === "regressed"
				? "🔴 Regressed"
				: r.status === "improved"
					? "🟢 Improved"
					: "⚪ Stable";
		const deltaStr =
			r.deltaMs >= 0 ? `+${r.deltaMs}ms (+${r.deltaPercent}%)` : `${r.deltaMs}ms (${r.deltaPercent}%)`;

		lines.push(
			`| **${r.suite}** | ${statusBadge} | ${r.currentDurationMs}ms | ${r.baselineDurationMs}ms | ${r.averageDurationMs}ms | ${r.p95DurationMs}ms | ${deltaStr} |`,
		);
	}

	lines.push("");
	const regressions = reports.filter((r) => r.hasRegression);
	if (regressions.length > 0) {
		lines.push(`> ⚠ **${regressions.length} Performance Regression(s) Detected:**`);
		for (const reg of regressions) {
			lines.push(`> - **${reg.suite}**: ${reg.message}`);
		}
	} else {
		lines.push("> ✓ All verification suites within acceptable duration thresholds.");
	}

	return lines.join("\n");
}
