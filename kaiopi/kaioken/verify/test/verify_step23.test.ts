import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
	benchmarkDenoSuite,
	benchmarkE2ESuite,
	benchmarkGoSuite,
	benchmarkLintSuite,
	benchmarkMakeSuite,
	benchmarkNodeJsSuite,
	benchmarkPythonSuite,
	benchmarkRustSuite,
	benchmarkSnapshotSuite,
	benchmarkTypeScriptSuite,
	createDefaultBenchmarkStore,
	demangleDenoStack,
	demangleE2EStack,
	demangleGoStack,
	demangleLintStack,
	demangleMakeStack,
	demangleNodeJsStack,
	demanglePythonStack,
	demangleRustStack,
	demangleSnapshotStack,
	demangleSuiteStack,
	demangleTypeScriptStack,
	evaluateRegression,
	formatAllBenchmarksMarkdown,
	formatBenchmarkReportTerminal,
	formatDemangledTraceTerminal,
	loadBenchmarkStore,
	recordBenchmark,
	saveBenchmarkStore,
	buildDenoRepairPlan,
	buildE2ERepairPlan,
	buildGoRepairPlan,
	buildLintRepairPlan,
	buildMakeRepairPlan,
	buildNodeJsRepairPlan,
	buildPythonRepairPlan,
	buildRustRepairPlan,
	buildSnapshotRepairPlan,
	buildSuiteRepairPlan,
	buildTypeScriptRepairPlan,
	feedFailureToRepairLoop,
	VerifyConfigEditor,
	type SuiteRepairContext,
	type VerifySuiteType,
} from "../src/index.ts";

describe("Step 23: Category 11 — Verification Gates, Native Test Runners & Diagnostics", () => {
	// =========================================================================
	// Group 1: Inline Terminal Stack Trace Demangler (UX-1061 to UX-1070)
	// =========================================================================
	describe("Group 1: Stack Trace Demangler (UX-1061 to UX-1070)", () => {
		it("[UX-1061] demangles Node.js stack trace and cleans internal frames", () => {
			const rawTrace = `
AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
+ actual - expected
+ 42
- 100
    at Context.<anonymous> (/workspace/app/test/calc.test.ts:25:12)
    at processImmediate (node:internal/timers:478:21)
    at runNextTicks (node:internal/process/task_queues:60:5)
    at /workspace/node_modules/mocha/lib/runner.js:963:7
`;
			const trace = demangleNodeJsStack(rawTrace);
			expect(trace.suite).toBe("nodejs");
			expect(trace.targetFile).toBe("/workspace/app/test/calc.test.ts");
			expect(trace.line).toBe(25);
			expect(trace.userFrames.length).toBe(1);
			expect(trace.filteredFramesCount).toBe(3);
			expect(trace.summaryLine).toContain("calc.test.ts:25");

			const formatted = formatDemangledTraceTerminal(trace);
			expect(formatted).toContain("calc.test.ts:25");
			expect(formatted).toContain("3 noisy internal framework frames filtered");
		});

		it("[UX-1062] demangles Python pytest/unittest stack trace", () => {
			const rawTrace = `
FAILED tests/test_api.py::test_create_user - AssertionError: assert 404 == 200
    File "/workspace/app/tests/test_api.py", line 42, in test_create_user
        assert response.status_code == 200
    File "/usr/local/lib/python3.11/site-packages/_pytest/assertion/rewrite.py", line 178, in run
        exec(co, module.__dict__)
E   assert 404 == 200
`;
			const trace = demanglePythonStack(rawTrace);
			expect(trace.suite).toBe("python");
			expect(trace.targetFile).toBe("tests/test_api.py");
			expect(trace.line).toBe(42);
			expect(trace.diffSnippet?.expected).toBe("200");
			expect(trace.diffSnippet?.actual).toBe("404");
			expect(trace.filteredFramesCount).toBe(1);
			expect(trace.userFrames.length).toBe(1);
		});

		it("[UX-1063] demangles Go go test ./... stack trace", () => {
			const rawTrace = `
--- FAIL: TestComputeHash (0.02s)
    hash_test.go:58: Expected hash length 32, got 16
    testing.go:1446: TempDir removed
`;
			const trace = demangleGoStack(rawTrace);
			expect(trace.suite).toBe("go");
			expect(trace.targetFile).toBe("hash_test.go");
			expect(trace.line).toBe(58);
			expect(trace.cleanMessage).toContain("Expected hash length 32");
			expect(trace.userFrames.length).toBe(1);
			expect(trace.filteredFramesCount).toBe(1);
		});

		it("[UX-1064] demangles Rust cargo test failure with demangled symbol", () => {
			const rawTrace = `
test my_crate::tests::test_divide_by_zero ... FAILED
thread 'my_crate::tests::test_divide_by_zero' panicked at 'attempt to divide by zero', src/math.rs:88:9
stack backtrace:
   0: std::panicking::begin_panic
   1: my_crate::tests::test_divide_by_zero::h4c59a35e7df
             at src/math.rs:88:9
   2: core::ops::function::FnOnce::call_once
`;
			const trace = demangleRustStack(rawTrace);
			expect(trace.suite).toBe("rust");
			expect(trace.targetFile).toBe("src/math.rs");
			expect(trace.line).toBe(88);
			expect(trace.cleanMessage).toBe("attempt to divide by zero");
			expect(trace.userFrames.length).toBe(1);
			expect(trace.userFrames[0]?.symbol).toBe("my_crate::tests::test_divide_by_zero");
		});

		it("[UX-1065] demangles Deno test trace and isolates permission requests", () => {
			const rawTrace = `
error: Uncaught (in promise) PermissionDenied: Requires read access to "/etc/hosts", run again with --allow-read
    at Object.readTextFile (ext:core/ops.js:42:15)
    at testFileRead (/workspace/src/io.ts:18:24)
`;
			const trace = demangleDenoStack(rawTrace);
			expect(trace.suite).toBe("deno");
			expect(trace.cleanMessage).toContain("Requires read access");
			expect(trace.cleanMessage).toContain("--allow-read");
			expect(trace.targetFile).toBe("/workspace/src/io.ts");
			expect(trace.line).toBe(18);
			expect(trace.filteredFramesCount).toBe(1);
		});

		it("[UX-1066] demangles Make output and strips directory entering noise", () => {
			const rawTrace = `
make[1]: Entering directory '/workspace/core'
gcc -Wall -o main main.c
main.c:12:5: error: unknown type name 'uint128_t'
make[1]: Leaving directory '/workspace/core'
make: *** [Makefile:22: build] Error 1
`;
			const trace = demangleMakeStack(rawTrace);
			expect(trace.suite).toBe("make");
			expect(trace.targetFile).toBe("main.c");
			expect(trace.line).toBe(12);
			expect(trace.cleanMessage).toContain("unknown type name");
			expect(trace.filteredFramesCount).toBeGreaterThan(0);
		});

		it("[UX-1067] demangles Jest / Vitest snapshot assertion mismatch", () => {
			const rawTrace = `
FAIL src/components/Badge.test.tsx
  ● Snapshot name: \`Badge renders active variant 1\`

    - Snapshot  - 1
    + Received  + 1

    - <span class="badge active">Ready</span>
    + <span class="badge active">Pending</span>

      at src/components/Badge.test.tsx:45:24
`;
			const trace = demangleSnapshotStack(rawTrace);
			expect(trace.suite).toBe("snapshots");
			expect(trace.cleanMessage).toContain("Badge renders active variant 1");
			expect(trace.targetFile).toBe("src/components/Badge.test.tsx");
			expect(trace.line).toBe(45);
			expect(trace.diffSnippet?.expected).toContain("Ready");
			expect(trace.diffSnippet?.actual).toContain("Pending");
		});

		it("[UX-1068] demangles TypeScript compiler tsc diagnostic and cascades", () => {
			const rawTrace = `
src/server.ts(45,15): error TS2339: Property 'port' does not exist on type 'Config'.
src/server.ts(46,20): error TS2345: Argument of type 'undefined' is not assignable to parameter of type 'number'.
`;
			const trace = demangleTypeScriptStack(rawTrace);
			expect(trace.suite).toBe("typescript");
			expect(trace.ruleOrCode).toBe("TS2339");
			expect(trace.targetFile).toBe("src/server.ts");
			expect(trace.line).toBe(45);
			expect(trace.col).toBe(15);
			expect(trace.filteredFramesCount).toBe(1); // secondary error cascade counted
		});

		it("[UX-1069] demangles Lint violation and flags auto-fixable status", () => {
			const rawTrace = `
/workspace/src/utils.ts:18:7 - error: 'unusedVar' is defined but never used [@typescript-eslint/no-unused-vars]
  1 error and 0 warnings potentially fixable with the \`--fix\` option.
`;
			const trace = demangleLintStack(rawTrace);
			expect(trace.suite).toBe("lint");
			expect(trace.targetFile).toBe("/workspace/src/utils.ts");
			expect(trace.line).toBe(18);
			expect(trace.col).toBe(7);
			expect(trace.ruleOrCode).toBe("@typescript-eslint/no-unused-vars");
			expect(trace.isAutoFixable).toBe(true);
		});

		it("[UX-1070] demangles E2E stack trace and isolates timeout and artifacts", () => {
			const rawTrace = `
Error: Timeout 30000ms exceeded while waiting for locator(\`button#checkout\`)
    at CheckoutPage.submitOrder (/workspace/e2e/checkout.spec.ts:34:18)
    at /workspace/node_modules/@playwright/test/lib/worker.js:120:5
  Attachment: screenshot: /workspace/test-results/checkout-failed.png
  Attachment: video: /workspace/test-results/checkout-run.webm
`;
			const trace = demangleE2EStack(rawTrace);
			expect(trace.suite).toBe("e2e");
			expect(trace.cleanMessage).toContain("Timeout 30000ms exceeded");
			expect(trace.cleanMessage).toContain("button#checkout");
			expect(trace.targetFile).toBe("/workspace/e2e/checkout.spec.ts");
			expect(trace.line).toBe(34);
			expect(trace.artifactPaths).toEqual([
				"/workspace/test-results/checkout-failed.png",
				"/workspace/test-results/checkout-run.webm",
			]);
			expect(trace.filteredFramesCount).toBe(1);
		});

		it("unified dispatcher demangleSuiteStack correctly routes all suites", () => {
			const suites: VerifySuiteType[] = [
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

			for (const suite of suites) {
				const trace = demangleSuiteStack("Generic error", suite);
				expect(trace.suite).toBe(suite);
			}
		});
	});

	// =========================================================================
	// Group 2: Automated Repair Protocol Loop (UX-1071 to UX-1080)
	// =========================================================================
	describe("Group 2: Automated Repair Protocol Loop (UX-1071 to UX-1080)", () => {
		function makeContext(suite: VerifySuiteType): SuiteRepairContext {
			return {
				suite,
				root: "/workspace",
				command: "kaio-verify",
				exitCode: 1,
				rawOutput: "error",
				demangled: demangleSuiteStack("fail", suite),
				iteration: 1,
				maxIterations: 5,
			};
		}

		it("[UX-1071] builds Node.js repair plan with module & async guidelines", () => {
			const plan = buildNodeJsRepairPlan(makeContext("nodejs"));
			expect(plan.suite).toBe("nodejs");
			expect(plan.systemPrompt).toContain("Node.js");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("ESM"))).toBe(true);
			expect(plan.recommendedActions.some((a) => a.includes("package"))).toBe(true);
		});

		it("[UX-1072] builds Python repair plan with pytest fixture guidelines", () => {
			const plan = buildPythonRepairPlan(makeContext("python"));
			expect(plan.suite).toBe("python");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("pytest fixture"))).toBe(true);
		});

		it("[UX-1073] builds Go repair plan with pointer and error check guidelines", () => {
			const plan = buildGoRepairPlan(makeContext("go"));
			expect(plan.suite).toBe("go");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("nil pointer"))).toBe(true);
		});

		it("[UX-1074] builds Rust repair plan with borrow checker guidelines", () => {
			const plan = buildRustRepairPlan(makeContext("rust"));
			expect(plan.suite).toBe("rust");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("borrow checker"))).toBe(true);
		});

		it("[UX-1075] builds Deno repair plan with permission flag guidelines", () => {
			const plan = buildDenoRepairPlan(makeContext("deno"));
			expect(plan.suite).toBe("deno");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("permissions"))).toBe(true);
		});

		it("[UX-1076] builds Make repair plan with tab character guidelines", () => {
			const plan = buildMakeRepairPlan(makeContext("make"));
			expect(plan.suite).toBe("make");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("tab characters"))).toBe(true);
		});

		it("[UX-1077] builds Snapshot repair plan with -u update guidance", () => {
			const ctx = makeContext("snapshots");
			ctx.demangled.diffSnippet = { expected: "a", actual: "b" };
			const plan = buildSnapshotRepairPlan(ctx);
			expect(plan.suite).toBe("snapshots");
			expect(plan.recommendedActions.some((a) => a.includes("-u"))).toBe(true);
		});

		it("[UX-1078] builds TypeScript repair plan with type narrowing guidelines", () => {
			const plan = buildTypeScriptRepairPlan(makeContext("typescript"));
			expect(plan.suite).toBe("typescript");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("Narrow types"))).toBe(true);
		});

		it("[UX-1079] builds Lint repair plan with auto-fix recommendations", () => {
			const ctx = makeContext("lint");
			ctx.demangled.isAutoFixable = true;
			const plan = buildLintRepairPlan(ctx);
			expect(plan.suite).toBe("lint");
			expect(plan.recommendedActions.some((a) => a.includes("--fix"))).toBe(true);
		});

		it("[UX-1080] builds E2E repair plan with locator stability guidelines", () => {
			const plan = buildE2ERepairPlan(makeContext("e2e"));
			expect(plan.suite).toBe("e2e");
			expect(plan.suiteSpecificGuidelines.some((g) => g.includes("locator"))).toBe(true);
		});

		it("unified feedFailureToRepairLoop respects maxIterations and halts", () => {
			const ctx = makeContext("nodejs");
			ctx.iteration = 6;
			ctx.maxIterations = 5;
			const plan = feedFailureToRepairLoop(ctx);
			expect(plan.canProceed).toBe(false);
		});
	});

	// =========================================================================
	// Group 3: Test Duration Benchmark & Regression Tracker (UX-1081 to UX-1090)
	// =========================================================================
	describe("Group 3: Benchmark & Duration Regressions (UX-1081 to UX-1090)", () => {
		it("[UX-1081] benchmarks Node.js suite duration and flags regressions", () => {
			const store = createDefaultBenchmarkStore();
			// Initial baseline run
			benchmarkNodeJsSuite(store, 1000, true);
			expect(store.suites.nodejs.baselineDurationMs).toBe(1000);

			// Fast run
			const normal = benchmarkNodeJsSuite(store, 1050, true);
			expect(normal.hasRegression).toBe(false);
			expect(normal.status).toBe("stable");

			// Significant regression (+800ms / +80%)
			const regressed = benchmarkNodeJsSuite(store, 1800, true);
			expect(regressed.hasRegression).toBe(true);
			expect(regressed.status).toBe("regressed");
			expect(regressed.deltaMs).toBe(800);
		});

		it("[UX-1082] benchmarks Python pytest suite duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkPythonSuite(store, 2000, true);
			const report = benchmarkPythonSuite(store, 2100, true);
			expect(report.suite).toBe("python");
			expect(report.hasRegression).toBe(false);
		});

		it("[UX-1083] benchmarks Go test suite duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkGoSuite(store, 500, true);
			const report = benchmarkGoSuite(store, 1200, true);
			expect(report.hasRegression).toBe(true);
		});

		it("[UX-1084] benchmarks Rust cargo test harness duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkRustSuite(store, 4000, true);
			const report = benchmarkRustSuite(store, 4100, true);
			expect(report.hasRegression).toBe(false);
		});

		it("[UX-1085] benchmarks Deno test runner duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkDenoSuite(store, 800, true);
			const report = benchmarkDenoSuite(store, 850, true);
			expect(report.status).toBe("stable");
		});

		it("[UX-1086] benchmarks Make targets duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkMakeSuite(store, 1500, true);
			const report = benchmarkMakeSuite(store, 1600, true);
			expect(report.status).toBe("stable");
		});

		it("[UX-1087] benchmarks Jest/Vitest snapshot suite duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkSnapshotSuite(store, 600, true);
			const report = benchmarkSnapshotSuite(store, 620, true);
			expect(report.hasRegression).toBe(false);
		});

		it("[UX-1088] benchmarks TypeScript compile duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkTypeScriptSuite(store, 3000, true);
			const report = benchmarkTypeScriptSuite(store, 2400, true);
			expect(report.status).toBe("improved");
		});

		it("[UX-1089] benchmarks Lint gates duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkLintSuite(store, 1200, true);
			const report = benchmarkLintSuite(store, 1250, true);
			expect(report.hasRegression).toBe(false);
		});

		it("[UX-1090] benchmarks End-to-End test suite duration", () => {
			const store = createDefaultBenchmarkStore();
			benchmarkE2ESuite(store, 20_000, true);
			const report = benchmarkE2ESuite(store, 35_000, true);
			expect(report.hasRegression).toBe(true);
			expect(report.deltaMs).toBe(15_000);
		});

		it("formats benchmark report in terminal and markdown table", () => {
			const store = createDefaultBenchmarkStore();
			const r1 = benchmarkNodeJsSuite(store, 1000, true);
			const r2 = benchmarkE2ESuite(store, 5000, true);

			const term = formatBenchmarkReportTerminal(r1);
			expect(term).toContain("[nodejs]");

			const md = formatAllBenchmarksMarkdown([r1, r2]);
			expect(md).toContain("| **nodejs** |");
			expect(md).toContain("| **e2e** |");
		});

		it("persists and loads benchmark store to filesystem", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "kaio-bench-"));
			try {
				const store = createDefaultBenchmarkStore();
				benchmarkNodeJsSuite(store, 1234, true);

				const savedPath = await saveBenchmarkStore(tempDir, store);
				expect(savedPath).toContain("verify-duration.json");

				const loaded = await loadBenchmarkStore(tempDir);
				expect(loaded.suites.nodejs.baselineDurationMs).toBe(1234);
				expect(loaded.suites.nodejs.records.length).toBe(1);
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});
	});

	// =========================================================================
	// Group 4: Custom Verification Config Editor (UX-1091 to UX-1100)
	// =========================================================================
	describe("Group 4: Verification Config Editor (UX-1091 to UX-1100)", () => {
		it("[UX-1091] configures Node.js suite in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureNodeJsSuite({ command: "pnpm test", timeoutMs: 30_000 });
			const config = editor.getSuiteConfig("nodejs");
			expect(config?.commands[0]?.command).toBe("pnpm test");
			expect(config?.commands[0]?.timeoutMs).toBe(30_000);
		});

		it("[UX-1092] configures Python suite in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configurePythonSuite({ command: "pytest -m unit", timeoutMs: 40_000 });
			const config = editor.getSuiteConfig("python");
			expect(config?.commands[0]?.command).toBe("pytest -m unit");
		});

		it("[UX-1093] configures Go suite in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureGoSuite({ command: "go test -race ./..." });
			const config = editor.getSuiteConfig("go");
			expect(config?.commands[0]?.command).toBe("go test -race ./...");
		});

		it("[UX-1094] configures Rust cargo suite in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureRustSuite({ command: "cargo test --all-targets" });
			const config = editor.getSuiteConfig("rust");
			expect(config?.commands[0]?.command).toBe("cargo test --all-targets");
		});

		it("[UX-1095] configures Deno suite with permissions in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureDenoSuite({ allowPermissions: ["read", "env"] });
			const config = editor.getSuiteConfig("deno");
			expect(config?.commands[0]?.command).toBe("deno test --allow-read --allow-env");
		});

		it("[UX-1096] configures Make target in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureMakeSuite({ target: "check-all" });
			const config = editor.getSuiteConfig("make");
			expect(config?.commands[0]?.command).toBe("make check-all");
		});

		it("[UX-1097] configures Snapshots suite with update flag in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureSnapshotSuite({ command: "npx vitest run", updateFlag: "-u" });
			const config = editor.getSuiteConfig("snapshots");
			expect(config?.suiteOptions?.updateFlag).toBe("-u");
		});

		it("[UX-1098] configures TypeScript gate in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureTypeScriptSuite({ tsconfig: "tsconfig.build.json" });
			const config = editor.getSuiteConfig("typescript");
			expect(config?.commands[0]?.command).toContain("tsconfig.build.json");
		});

		it("[UX-1099] configures Lint gate in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureLintSuite({ fixFlag: "--fix-dry-run" });
			const config = editor.getSuiteConfig("lint");
			expect(config?.suiteOptions?.autoFixFlag).toBe("--fix-dry-run");
		});

		it("[UX-1100] configures E2E suite in verify editor", () => {
			const editor = new VerifyConfigEditor("/workspace");
			editor.configureE2ESuite({ headless: false, timeoutMs: 240_000 });
			const config = editor.getSuiteConfig("e2e");
			expect(config?.suiteOptions?.headless).toBe(false);
			expect(config?.commands[0]?.timeoutMs).toBe(240_000);
		});

		it("loads, edits, validates, and saves configuration cleanly", async () => {
			const tempDir = await mkdtemp(join(tmpdir(), "kaio-verify-cfg-"));
			try {
				const editor = new VerifyConfigEditor(tempDir);
				editor.configureNodeJsSuite({ command: "npm test" });
				editor.configurePythonSuite({ command: "pytest" });

				expect(editor.listConfiguredSuites()).toEqual(["nodejs", "python"]);

				const validation = editor.validateSuiteConfig("nodejs", editor.getSuiteConfig("nodejs")!);
				expect(validation.valid).toBe(true);

				const savedFile = await editor.save();
				expect(savedFile).toContain("verify.json");

				const editor2 = new VerifyConfigEditor(tempDir);
				await editor2.load();
				expect(editor2.listConfiguredSuites()).toContain("nodejs");
				expect(editor2.listConfiguredSuites()).toContain("python");

				// Remove a suite
				const removed = editor2.removeSuiteConfig("python");
				expect(removed).toBe(true);
				expect(editor2.listConfiguredSuites()).toEqual(["nodejs"]);
			} finally {
				await rm(tempDir, { recursive: true, force: true });
			}
		});
	});
});
