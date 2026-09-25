import { describe, expect, it } from "vitest";
import {
	ALL_CI_OUTPUT_TARGETS,
	ALL_MULTI_LANGUAGE_TARGETS,
	createFixture,
	formatStreamingNdjsonRecord,
	isCIOutputTarget,
	isMultiLanguageTarget,
	parseStreamingNdjson,
	runAdversarialRejectionBenchmark,
	validateMultiLanguageGrounding,
	type Fixture,
} from "../src/index.ts";

describe("Step 34: Category 20 — Root CLI Parity, CI Automation & Evals Suite (UX-1951 to UX-2000)", () => {
	it("verifies registration of all 10 CI output targets and 20 multi-language targets", () => {
		expect(ALL_CI_OUTPUT_TARGETS).toHaveLength(10);
		for (const target of ALL_CI_OUTPUT_TARGETS) {
			expect(isCIOutputTarget(target)).toBe(true);
		}

		expect(ALL_MULTI_LANGUAGE_TARGETS).toHaveLength(20);
		for (const target of ALL_MULTI_LANGUAGE_TARGETS) {
			expect(isMultiLanguageTarget(target)).toBe(true);
		}
	});

	// ========================================================================
	// Theme 1: Streaming NDJSON output flag (--json) enabling CI pipelines (UX-1951 to UX-1960)
	// ========================================================================
	describe("Theme 1: Streaming NDJSON output flag (--json) enabling CI pipelines (UX-1951 to UX-1960)", () => {
		it("[UX-1951] streams NDJSON output for research web intelligence digest", () => {
			const line = formatStreamingNdjsonRecord("research", { query: "vitest 4", sourcesFound: 5 });
			const parsed = parseStreamingNdjson(line);
			expect(parsed).toHaveLength(1);
			expect(parsed[0]?.target).toBe("research");
		});

		it("[UX-1952] streams NDJSON output for skills procedure catalog", () => {
			const line = formatStreamingNdjsonRecord("skills", { catalogCount: 10, loaded: ["db-migrate"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("skills");
		});

		it("[UX-1953] streams NDJSON output for skillgen task synthesizer", () => {
			const line = formatStreamingNdjsonRecord("skillgen", { synthesizedTask: "db:seed", confidence: 0.95 });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("skillgen");
		});

		it("[UX-1954] streams NDJSON output for graph dependency export", () => {
			const line = formatStreamingNdjsonRecord("graph", { nodes: 15, edges: 22, formats: ["json", "mermaid"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("graph");
		});

		it("[UX-1955] streams NDJSON output for gitops worktree manager", () => {
			const line = formatStreamingNdjsonRecord("gitops", { activeWorktrees: 2, pruned: 0 });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("gitops");
		});

		it("[UX-1956] streams NDJSON output for evals 10-probe test gate", () => {
			const line = formatStreamingNdjsonRecord("evals", { passed: true, probesRan: 10, score: 100 });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("evals");
		});

		it("[UX-1957] streams NDJSON output for Python AST grounding probes", () => {
			const line = formatStreamingNdjsonRecord("python-ast", { module: "main.py", classes: ["PipelineRunner"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("python-ast");
		});

		it("[UX-1958] streams NDJSON output for Go language syntax tree probes", () => {
			const line = formatStreamingNdjsonRecord("go-ast", { package: "service", interfaces: ["Worker"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("go-ast");
		});

		it("[UX-1959] streams NDJSON output for Rust trait and macro probes", () => {
			const line = formatStreamingNdjsonRecord("rust-ast", { crate: "storage", traits: ["Storage"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("rust-ast");
		});

		it("[UX-1960] streams NDJSON output for TypeScript interface inheritance probes", () => {
			const line = formatStreamingNdjsonRecord("typescript-ast", { interfaces: ["BaseService"], classes: ["EngineService"] });
			const parsed = parseStreamingNdjson(line);
			expect(parsed[0]?.target).toBe("typescript-ast");
		});
	});

	// ========================================================================
	// Theme 2: Multi-language test fixture validating AST grounding (UX-1961 to UX-1980)
	// ========================================================================
	describe("Theme 2: Multi-language test fixture validating AST grounding (UX-1961 to UX-1980)", () => {
		let fixture: Fixture;

		it("initializes multi-language fixture before probe validation", async () => {
			fixture = await createFixture();
			expect(fixture.index.fileCount).toBeGreaterThan(0);
		});

		it("[UX-1961] validates AST grounding across kaioken scan CLI invocation", () => {
			const res = validateMultiLanguageGrounding("scan", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1962] validates AST grounding across kaioken symbols oracle lookup", () => {
			const res = validateMultiLanguageGrounding("symbols", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1963] validates AST grounding across kaioken status staleness report", () => {
			const res = validateMultiLanguageGrounding("status", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1964] validates AST grounding across kaioken search BM25 retrieval", () => {
			const res = validateMultiLanguageGrounding("search", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1965] validates AST grounding across kaioken impact blast radius predictor", () => {
			const res = validateMultiLanguageGrounding("impact", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1966] validates AST grounding across kaioken verify native test gate", () => {
			const res = validateMultiLanguageGrounding("verify", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1967] validates AST grounding across kaioken plan module decomposition", () => {
			const res = validateMultiLanguageGrounding("plan", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1968] validates AST grounding across kaioken cards knowledge fact inspector", () => {
			const res = validateMultiLanguageGrounding("cards", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1969] validates AST grounding across kaioken wiki chapter synthesis", () => {
			const res = validateMultiLanguageGrounding("wiki", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1970] validates AST grounding across kaioken serve documentation server", () => {
			const res = validateMultiLanguageGrounding("serve", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1971] validates AST grounding across kaioken research web intelligence digest", () => {
			const res = validateMultiLanguageGrounding("research", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1972] validates AST grounding across kaioken skills procedure catalog", () => {
			const res = validateMultiLanguageGrounding("skills", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1973] validates AST grounding across kaioken skillgen task synthesizer", () => {
			const res = validateMultiLanguageGrounding("skillgen", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1974] validates AST grounding across kaioken graph dependency export", () => {
			const res = validateMultiLanguageGrounding("graph", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1975] validates AST grounding across kaioken gitops worktree manager", () => {
			const res = validateMultiLanguageGrounding("gitops", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1976] validates AST grounding across kaioken evals 10-probe test gate", () => {
			const res = validateMultiLanguageGrounding("evals", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1977] validates AST grounding across Python AST grounding probes", () => {
			const res = validateMultiLanguageGrounding("python-ast", fixture);
			expect(res.target).toBe("python-ast");
			expect(res.passed).toBe(true);
		});

		it("[UX-1978] validates AST grounding across Go language syntax tree probes", () => {
			const res = validateMultiLanguageGrounding("go-ast", fixture);
			expect(res.target).toBe("go-ast");
			expect(res.passed).toBe(true);
		});

		it("[UX-1979] validates AST grounding across Rust trait and macro probes", () => {
			const res = validateMultiLanguageGrounding("rust-ast", fixture);
			expect(res.target).toBe("rust-ast");
			expect(res.passed).toBe(true);
		});

		it("[UX-1980] validates AST grounding across TypeScript interface inheritance probes", () => {
			const res = validateMultiLanguageGrounding("typescript-ast", fixture);
			expect(res.target).toBe("typescript-ast");
			expect(res.passed).toBe(true);
			expect(res.validatedSymbols.some((s) => s.name === "BaseService" || s.name === "EngineService")).toBe(true);
		});
	});

	// ========================================================================
	// Theme 3: Adversarial probe benchmark testing non-existent symbol rejection (UX-1981 to UX-2000)
	// ========================================================================
	describe("Theme 3: Adversarial probe benchmark testing non-existent symbol rejection (UX-1981 to UX-2000)", () => {
		let fixture: Fixture;

		it("initializes fixture for adversarial benchmark", async () => {
			fixture = await createFixture();
		});

		it("[UX-1981] tests non-existent symbol rejection on scan", () => {
			const res = runAdversarialRejectionBenchmark("scan", fixture);
			expect(res.passed).toBe(true);
			expect(res.falsePositivesCount).toBe(0);
		});

		it("[UX-1982] tests non-existent symbol rejection on symbols", () => {
			const res = runAdversarialRejectionBenchmark("symbols", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1983] tests non-existent symbol rejection on status", () => {
			const res = runAdversarialRejectionBenchmark("status", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1984] tests non-existent symbol rejection on search", () => {
			const res = runAdversarialRejectionBenchmark("search", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1985] tests non-existent symbol rejection on impact", () => {
			const res = runAdversarialRejectionBenchmark("impact", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1986] tests non-existent symbol rejection on verify", () => {
			const res = runAdversarialRejectionBenchmark("verify", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1987] tests non-existent symbol rejection on plan", () => {
			const res = runAdversarialRejectionBenchmark("plan", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1988] tests non-existent symbol rejection on cards", () => {
			const res = runAdversarialRejectionBenchmark("cards", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1989] tests non-existent symbol rejection on wiki", () => {
			const res = runAdversarialRejectionBenchmark("wiki", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1990] tests non-existent symbol rejection on serve", () => {
			const res = runAdversarialRejectionBenchmark("serve", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1991] tests non-existent symbol rejection on research", () => {
			const res = runAdversarialRejectionBenchmark("research", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1992] tests non-existent symbol rejection on skills", () => {
			const res = runAdversarialRejectionBenchmark("skills", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1993] tests non-existent symbol rejection on skillgen", () => {
			const res = runAdversarialRejectionBenchmark("skillgen", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1994] tests non-existent symbol rejection on graph", () => {
			const res = runAdversarialRejectionBenchmark("graph", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1995] tests non-existent symbol rejection on gitops", () => {
			const res = runAdversarialRejectionBenchmark("gitops", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1996] tests non-existent symbol rejection on evals", () => {
			const res = runAdversarialRejectionBenchmark("evals", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1997] tests non-existent symbol rejection on python-ast", () => {
			const res = runAdversarialRejectionBenchmark("python-ast", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1998] tests non-existent symbol rejection on go-ast", () => {
			const res = runAdversarialRejectionBenchmark("go-ast", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-1999] tests non-existent symbol rejection on rust-ast", () => {
			const res = runAdversarialRejectionBenchmark("rust-ast", fixture);
			expect(res.passed).toBe(true);
		});

		it("[UX-2000] tests non-existent symbol rejection on typescript-ast", () => {
			const res = runAdversarialRejectionBenchmark("typescript-ast", fixture);
			expect(res.passed).toBe(true);
			expect(res.falsePositivesCount).toBe(0);
			expect(res.rejectedCount).toBeGreaterThan(0);
			expect(res.report).toContain("100% Rejection");
		});
	});
});
