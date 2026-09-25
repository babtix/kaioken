import { STRICT_REPAIR_RULES } from "./repair.ts";
import type {
	SuiteRepairContext,
	SuiteRepairPlan,
	VerifySuiteType,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Suite Guidelines Map
// ---------------------------------------------------------------------------

const SUITE_GUIDELINES: Record<VerifySuiteType, { name: string; guidelines: string[]; defaultActions: string[] }> = {
	nodejs: {
		name: "Node.js npm/pnpm/yarn/bun",
		guidelines: [
			"Check module import/export semantics (ESM import vs CJS require).",
			"Verify async/await calls and catch unhandled promise rejections.",
			"Check package.json dependencies and peerDependency version compatibility.",
			"Preserve test setup/teardown and mock lifecycle hooks.",
		],
		defaultActions: [
			"Inspect package dependencies and module resolution.",
			"Fix async/promise rejection or mock teardown in source code.",
			"Re-run verification with native package manager.",
		],
	},
	python: {
		name: "Python pytest & unittest",
		guidelines: [
			"Verify pytest fixture scopes and injected arguments.",
			"Check exception assertions using `pytest.raises` or `assertRaises`.",
			"Align type annotations with runtime values; check PEP-8 compliance.",
			"Check mock patches and ensure mocks are unpatched upon teardown.",
		],
		defaultActions: [
			"Inspect fixture dependencies and test parameterization.",
			"Correct assertion logic or source return value.",
			"Re-run pytest/unittest suite.",
		],
	},
	go: {
		name: "Go go test ./...",
		guidelines: [
			"Check nil pointer dereferences and missing error checks (`if err != nil`).",
			"Verify exported vs unexported symbol visibility (casing).",
			"Check slice boundary indexing and nil map initialization.",
			"Preserve table-driven test structure (`t.Run(...)`).",
		],
		defaultActions: [
			"Inspect error handling returns and pointer safety.",
			"Fix struct initialization or receiver method logic.",
			"Re-run `go test ./...`.",
		],
	},
	rust: {
		name: "Rust cargo test",
		guidelines: [
			"Satisfy borrow checker rules; verify lifetimes and ownership moves.",
			"Ensure `mut` qualifiers match actual mutable variable mutations.",
			"Handle `Result`/`Option` with pattern matching (`match` / `if let`) rather than blind `.unwrap()`.",
			"Ensure all trait bounds and derive macros are correctly satisfied.",
		],
		defaultActions: [
			"Address lifetime and borrowing constraints in source code.",
			"Replace panicking unwrap with safe error handling.",
			"Re-run `cargo test`.",
		],
	},
	deno: {
		name: "Deno test & permissions",
		guidelines: [
			"Check required runtime permissions (`--allow-read`, `--allow-net`, etc.).",
			"Verify URL module imports and import map mappings.",
			"Ensure web standard APIs (`fetch`, `Request`, `Response`) are mocked or permitted.",
			"Preserve Deno.test step lifecycle (`t.step(...)`).",
		],
		defaultActions: [
			"Inspect permission requirements and configuration flags.",
			"Update source logic or Deno permissions config.",
			"Re-run `deno test`.",
		],
	},
	make: {
		name: "Make & Makefile targets",
		guidelines: [
			"Check Makefile target prerequisites and order of execution.",
			"Verify recipe indentation uses strict tab characters (not spaces).",
			"Check shell command exit codes and piped commands.",
			"Ensure environment variables and flags are properly exported.",
		],
		defaultActions: [
			"Inspect failing Makefile recipe command and exit code.",
			"Correct shell command syntax or prerequisite target in Makefile.",
			"Re-run `make <target>`.",
		],
	},
	snapshots: {
		name: "Jest / Vitest Snapshots",
		guidelines: [
			"Inspect the diff carefully: determine whether the snapshot mismatch is an intentional change or regression.",
			"If intentional change: accept update by running the test suite with `-u` (e.g. `npx vitest -u`).",
			"If regression: repair the application component to output the expected snapshot shape.",
			"Never blindly update snapshots without human-verifiable intent.",
		],
		defaultActions: [
			"Compare expected snapshot vs received actual output.",
			"If unintended regression, fix component markup/data in application code.",
			"If intended change, advise updating snapshot with `-u` flag.",
		],
	},
	typescript: {
		name: "TypeScript Compiler (tsc)",
		guidelines: [
			"Narrow types using discrimination properties or type guards instead of `any` casting.",
			"Ensure all required interface/type properties are declared.",
			"Export symbols needed across barrel files and consumer modules.",
			"Preserve strict compiler flags (`strictNullChecks`, `noImplicitAny`).",
		],
		defaultActions: [
			"Locate offending TS error code (e.g. TS2322, TS2339).",
			"Fix type annotation, add missing property, or export required symbol.",
			"Re-run `tsc --noEmit` or type-check script.",
		],
	},
	lint: {
		name: "Lint & Code Style Gates",
		guidelines: [
			"Check if the lint rule is auto-fixable; if so, suggest executing the linter with `--fix`.",
			"Clean up unused imports, dead variables, and formatting inconsistencies.",
			"Do not disable lint rules with inline comments (`// eslint-disable`) unless explicitly authorized.",
			"Align indentation, quote styles, and semicolons to repository config.",
		],
		defaultActions: [
			"If auto-fixable, suggest running lint auto-fix command.",
			"Otherwise, manually fix code formatting or unused symbol violation.",
			"Re-run lint gate.",
		],
	},
	e2e: {
		name: "End-to-End Integration & Smoke Suites",
		guidelines: [
			"Check for race conditions and replace hardcoded timeouts with locator auto-retrying assertions.",
			"Prefer stable accessibility and data-testid locators over fragile DOM paths.",
			"Inspect failure screenshots and trace files listed in the diagnostic output.",
			"Verify backend API mocks and session isolation between tests.",
		],
		defaultActions: [
			"Inspect failed locator and timeout threshold in diagnostic summary.",
			"Inspect attached screenshot/trace artifacts if present.",
			"Adjust locator or wait condition in E2E spec.",
			"Re-run E2E test suite.",
		],
	},
};

// ---------------------------------------------------------------------------
// Suite-Specific Builders
// ---------------------------------------------------------------------------

export function buildNodeJsRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("nodejs", context);
}

export function buildPythonRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("python", context);
}

export function buildGoRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("go", context);
}

export function buildRustRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("rust", context);
}

export function buildDenoRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("deno", context);
}

export function buildMakeRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("make", context);
}

export function buildSnapshotRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("snapshots", context);
}

export function buildTypeScriptRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("typescript", context);
}

export function buildLintRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("lint", context);
}

export function buildE2ERepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	return createSuiteRepairPlan("e2e", context);
}

// ---------------------------------------------------------------------------
// Core Plan Generator
// ---------------------------------------------------------------------------

function createSuiteRepairPlan(suite: VerifySuiteType, context: SuiteRepairContext): SuiteRepairPlan {
	const info = SUITE_GUIDELINES[suite];
	const iteration = context.iteration;
	const maxIterations = context.maxIterations;
	const canProceed = iteration <= maxIterations;

	const trace = context.demangled;
	const diagnosticLines: string[] = [
		`Suite: ${info.name}`,
		`Summary: ${trace.summaryLine}`,
	];

	if (trace.targetFile) {
		diagnosticLines.push(`Target File: ${trace.targetFile}:${trace.line || 1}`);
	}
	if (trace.ruleOrCode) {
		diagnosticLines.push(`Diagnostic Code: ${trace.ruleOrCode}`);
	}
	if (trace.diffSnippet) {
		if (trace.diffSnippet.expected !== undefined) diagnosticLines.push(`  - Expected: ${trace.diffSnippet.expected}`);
		if (trace.diffSnippet.actual !== undefined) diagnosticLines.push(`  + Received: ${trace.diffSnippet.actual}`);
	}
	if (trace.artifactPaths && trace.artifactPaths.length > 0) {
		diagnosticLines.push(`Artifacts: ${trace.artifactPaths.join(", ")}`);
	}

	const diagnosticSummary = diagnosticLines.join("\n");

	const recommendedActions = [...info.defaultActions];
	if (trace.isAutoFixable) {
		recommendedActions.unshift("This rule is auto-fixable; consider running with --fix.");
	}
	if (trace.diffSnippet && suite === "snapshots") {
		recommendedActions.unshift("If the snapshot update is intended, update with -u.");
	}

	const systemPrompt =
		`You are Kaioken's automated verification repair agent specialized for ${info.name}.\n` +
		`A verification gate has failed. Your task is to analyze the failure diagnostics and apply a minimal, surgical fix.\n\n` +
		`SUITE-SPECIFIC GUIDELINES:\n` +
		info.guidelines.map((g) => `- ${g}`).join("\n") +
		`\n\nCRITICAL PROTOCOL RULES:\n` +
		STRICT_REPAIR_RULES.map((r) => `- ${r}`).join("\n");

	const previousNotice =
		context.previousAttempts && context.previousAttempts.length > 0
			? `\n\n### Previous Iterations (${context.previousAttempts.length})\n` +
				context.previousAttempts
					.map((att) => `- Iteration #${att.iteration}: ${att.summary}`)
					.join("\n")
			: "";

	const userPrompt =
		`## Verification Failure Report [Iteration ${iteration} of ${maxIterations}]\n\n` +
		`Command: \`${context.command}\`\n` +
		`Root: \`${context.root}\`\n\n` +
		`### Diagnostic Summary\n` +
		`\`\`\`\n` +
		`${diagnosticSummary}\n` +
		`\`\`\`\n` +
		`${previousNotice}\n\n` +
		`### Recommended Repair Actions\n` +
		recommendedActions.map((a, i) => `${i + 1}. ${a}`).join("\n");

	return {
		suite,
		systemPrompt,
		userPrompt,
		suiteSpecificGuidelines: info.guidelines,
		canProceed,
		iteration,
		maxIterations,
		diagnosticSummary,
		recommendedActions,
	};
}

// ---------------------------------------------------------------------------
// Public Dispatchers
// ---------------------------------------------------------------------------

export function buildSuiteRepairPlan(context: SuiteRepairContext): SuiteRepairPlan {
	switch (context.suite) {
		case "nodejs":
			return buildNodeJsRepairPlan(context);
		case "python":
			return buildPythonRepairPlan(context);
		case "go":
			return buildGoRepairPlan(context);
		case "rust":
			return buildRustRepairPlan(context);
		case "deno":
			return buildDenoRepairPlan(context);
		case "make":
			return buildMakeRepairPlan(context);
		case "snapshots":
			return buildSnapshotRepairPlan(context);
		case "typescript":
			return buildTypeScriptRepairPlan(context);
		case "lint":
			return buildLintRepairPlan(context);
		case "e2e":
			return buildE2ERepairPlan(context);
	}
}

export function feedFailureToRepairLoop(context: SuiteRepairContext): SuiteRepairPlan {
	return buildSuiteRepairPlan(context);
}
