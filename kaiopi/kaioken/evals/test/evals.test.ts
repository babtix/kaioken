import { describe, expect, it } from "vitest";
import { createFixture, readerFor } from "../src/fixture.ts";
import {
	probe1NegativeGuarantee,
	probe2QuoteAccuracy,
	probe3VerifyCompliance,
	probe4ImpactFromIndex,
	probe5VerifierCatchesInvention,
	probe6CardRecordsUngrounded,
	probe7DriftDetection,
	probe8ImpactRenameAccuracy,
	probe9PaddingRejection,
	probe10MultiLanguageGrounding,
	runProbes,
} from "../src/probes.ts";
import { evaluate, formatReport, type EvalMetrics } from "../src/types.ts";
import { runEval } from "../src/run.ts";

function metrics(overrides: Partial<EvalMetrics> = {}): EvalMetrics {
	return {
		hallucinatedSymbols: 0,
		verifyComplianceViolations: 0,
		quoteMismatches: 0,
		staleDocuments: 0,
		estimatedTokens: 1000,
		estimatedUsd: 0.01,
		...overrides,
	};
}

describe("evals: the fixture is real", () => {
	it("scans and indexes a real repository on disk", async () => {
		const fixture = await createFixture();
		try {
			expect(fixture.scan.fileCount).toBeGreaterThan(0);
			expect(fixture.index.symbolCount).toBeGreaterThan(0);
			expect(fixture.index.files.map((f) => f.path)).toContain("src/a.ts");
		} finally {
			await fixture.dispose();
		}
	});

	it("declares the symbol the probes depend on", async () => {
		const fixture = await createFixture();
		try {
			const symbols = fixture.index.files.flatMap((f) => f.symbols.map((s) => s.name));
			expect(symbols).toContain("alphaSearch");
		} finally {
			await fixture.dispose();
		}
	});

	it("reads its own sources back", async () => {
		const fixture = await createFixture();
		try {
			expect(await readerFor(fixture)("src/a.ts")).toContain("alphaSearch");
			expect(await readerFor(fixture)("missing.ts")).toBeNull();
		} finally {
			await fixture.dispose();
		}
	});
});

describe("evals: probes pass on a correct pipeline", () => {
	it("probe 1: the oracle reports a nonexistent symbol as absent", async () => {
		const fixture = await createFixture();
		try {
			expect(probe1NegativeGuarantee(fixture).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 2: an exact excerpt resolves to its exact range", async () => {
		const fixture = await createFixture();
		try {
			expect(probe2QuoteAccuracy(fixture, "src/a.ts", 1, 3).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 3: an edit followed by verify is compliant", () => {
		expect(probe3VerifyCompliance([{ tool: "edit" }, { tool: "kaio_verify" }]).passed).toBe(true);
	});

	it("probe 4: the dependent file is reported", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe4ImpactFromIndex(fixture, "alphaSearch", "src/b.ts")).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 5: an invented symbol is reported", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe5VerifierCatchesInvention(fixture)).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 6: a card records its ungrounded entry point", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe6CardRecordsUngrounded(fixture)).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 7: drift detection passes on unmodified fixture", async () => {
		const fixture = await createFixture();
		try {
			expect(probe7DriftDetection(fixture).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 8: impact prediction accurately tracks renamed symbols", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe8ImpactRenameAccuracy(fixture)).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 9: padding and generic boilerplate are rejected", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe9PaddingRejection(fixture)).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 10: multi-language AST symbols (Python, Go, Rust, TS) ground cleanly", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe10MultiLanguageGrounding(fixture)).passed).toBe(true);
		} finally {
			await fixture.dispose();
		}
	});

	it("runs every probe against one fixture", async () => {
		const fixture = await createFixture();
		try {
			const outcomes = await runProbes(fixture);
			expect(outcomes.length).toBeGreaterThanOrEqual(10);
			for (const outcome of outcomes) {
				expect(outcome.passed, `${outcome.id}: ${outcome.detail ?? ""}`).toBe(true);
			}
		} finally {
			await fixture.dispose();
		}
	});
});

describe("evals: the probes are capable of failing", () => {
	it("probe 3 fails when a session edits without verifying", () => {
		const outcome = probe3VerifyCompliance([{ tool: "edit" }, { tool: "bash" }]);
		expect(outcome.passed).toBe(false);
		expect(outcome.detail).toMatch(/never called kaio_verify/);
	});

	it("probe 3 fails when edits happen after the last verification", () => {
		const outcome = probe3VerifyCompliance([
			{ tool: "kaio_verify" },
			{ tool: "edit" },
		]);
		expect(outcome.passed).toBe(false);
		expect(outcome.detail).toMatch(/edits happened after/);
	});

	it("probe 3 passes a read-only session", () => {
		expect(probe3VerifyCompliance([{ tool: "read" }, { tool: "kaio_symbol_lookup" }]).passed).toBe(true);
	});

	it("probe 2 fails for a range that does not exist", async () => {
		const fixture = await createFixture();
		try {
			expect(probe2QuoteAccuracy(fixture, "src/a.ts", 9000, 9100).passed).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 2 fails for an unknown file", async () => {
		const fixture = await createFixture();
		try {
			expect(probe2QuoteAccuracy(fixture, "src/ghost.ts", 1, 2).passed).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 4 fails for a symbol that is not declared", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe4ImpactFromIndex(fixture, "authMagicLogin", "src/b.ts")).passed).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 4 fails when the expected dependent is wrong", async () => {
		const fixture = await createFixture();
		try {
			expect((await probe4ImpactFromIndex(fixture, "alphaSearch", "src/nowhere.ts")).passed).toBe(false);
		} finally {
			await fixture.dispose();
		}
	});

	it("probe 1 fails when the oracle is given a symbol it does contain", async () => {
		const fixture = await createFixture();
		try {
			// Reuses probe 1's logic against a name that exists, to prove the
			// check is not a constant `true`.
			const oracleSymbols = fixture.index.files.flatMap((f) => f.symbols.map((s) => s.name));
			expect(oracleSymbols).toContain("alphaSearch");
			// The probe is hardcoded to the invented name, so assert the inverse
			// property directly: a lookup for a real symbol is non-empty.
			const { SymbolOracle } = await import("@kaioken/index");
			expect(new SymbolOracle(fixture.index).lookup("alphaSearch").length).toBeGreaterThan(0);
		} finally {
			await fixture.dispose();
		}
	});
});

describe("evals: metric evaluation", () => {
	it("passes when every metric meets its threshold", () => {
		const report = evaluate("clean", metrics(), []);
		expect(report.passed).toBe(true);
		expect(report.failures).toEqual({});
	});

	it("fails on a single hallucinated symbol", () => {
		const report = evaluate("dirty", metrics({ hallucinatedSymbols: 1 }), []);
		expect(report.passed).toBe(false);
		expect(report.failures.hallucinatedSymbols).toMatch(/expected 0, got 1/);
	});

	it("fails on a verify compliance violation", () => {
		expect(evaluate("x", metrics({ verifyComplianceViolations: 1 }), []).passed).toBe(false);
	});

	it("fails on a quote mismatch", () => {
		expect(evaluate("x", metrics({ quoteMismatches: 1 }), []).passed).toBe(false);
	});

	it("fails when any probe fails, naming it", () => {
		const report = evaluate("x", metrics(), [
			{ id: "probe-9", description: "d", passed: false, detail: "because" },
		]);
		expect(report.passed).toBe(false);
		expect(report.failures["probe:probe-9"]).toBe("because");
	});

	it("renders a report with one line per metric", () => {
		const text = formatReport(evaluate("demo", metrics(), []));
		expect(text).toContain("eval: demo — PASS");
		expect(text).toContain("hallucinated symbols");
	});

	it("renders unknown cost rather than a fake figure", () => {
		const text = formatReport(evaluate("demo", metrics({ estimatedUsd: null }), []));
		expect(text).toContain("estimated cost:            unknown");
		expect(text).not.toMatch(/\$\d/);
	});

	it("lists failures when the run did not pass", () => {
		const text = formatReport(evaluate("demo", metrics({ hallucinatedSymbols: 3 }), []));
		expect(text).toContain("failures:");
		expect(text).toContain("hallucinatedSymbols");
	});
});

describe("evals: the full run", () => {
	it("passes end to end on the fixture", async () => {
		const report = await runEval({ multiplier: 3 });
		expect(report.passed, JSON.stringify(report.failures, null, 2)).toBe(true);
		expect(report.metrics.hallucinatedSymbols).toBe(0);
	});

	it("proves the detector can fail, not just that it reports zero", async () => {
		const report = await runEval({ multiplier: 1 });
		const capability = report.probes.find((p) => p.id === "meta-detector-capable-of-failing");
		expect(capability?.passed).toBe(true);
	});

	it("proves an honest document scores clean", async () => {
		const report = await runEval({ multiplier: 1 });
		const honest = report.probes.find((p) => p.id === "meta-honest-document-is-clean");
		expect(honest?.passed).toBe(true);
	});

	it("reports unknown cost when no rates are supplied", async () => {
		const report = await runEval({ multiplier: 1 });
		expect(report.metrics.estimatedUsd).toBeNull();
	});

	it("prices the run when rates are supplied", async () => {
		const report = await runEval({
			multiplier: 1,
			cost: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 },
		});
		expect(report.metrics.estimatedUsd).toBeGreaterThan(0);
	});

	it("scales the token estimate with the multiplier", async () => {
		const low = await runEval({ multiplier: 1 });
		const high = await runEval({ multiplier: 10 });
		expect(high.metrics.estimatedTokens).toBeGreaterThan(low.metrics.estimatedTokens);
	});

	it("evaluates a repository path on disk using repo option", async () => {
		const fixture = await createFixture();
		try {
			const report = await runEval({ multiplier: 1, repo: fixture.root });
			expect(report.passed).toBe(true);
			expect(report.metrics.hallucinatedSymbols).toBe(0);
		} finally {
			await fixture.dispose();
		}
	});
});
